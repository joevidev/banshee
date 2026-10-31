import { SERVICES, type IncidentState } from "@banshee/contracts"
import { mockEngine } from "@/lib/office/mock-engine"
import { SERVER_SOURCE } from "@/lib/office/server-source"
import { DECISION_TOOL, incidentFacts, persona } from "@/lib/realtime/persona"

// Mints a short-lived OpenAI Realtime client secret. The real key stays on the server; only {value, expires_at} is returned.
const hits = new Map<string, number[]>()
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k)
  return arr.length > 10
}

function pickIncident(id: string | undefined): IncidentState | undefined {
  if (SERVER_SOURCE === "live") return undefined
  try {
    const incs = mockEngine().snapshot().incidents
    if (id && incs[id]) return incs[id]
    return Object.values(incs).sort((a, b) => b.openedAt - a.openedAt)[0]
  } catch {
    return undefined
  }
}

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return json({ ok: false, error: "Voice is unavailable: OPENAI_API_KEY is not configured on this server." }, 503)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (limited(ip)) return json({ ok: false, error: "Too many calls, wait a minute." }, 429)
  const body = (await request.json().catch(() => null)) as { incidentId?: unknown; service?: unknown } | null
  const service = typeof body?.service === "string" && (SERVICES as readonly string[]).includes(body.service) ? body.service : undefined
  const incidentId = typeof body?.incidentId === "string" && /^inc-[0-9]+$/.test(body.incidentId) ? body.incidentId : undefined
  const inc = pickIncident(incidentId)
  // In live mode the incident lives in the actor, so the client sends fresh facts right after connecting (see useRealtimeCall).
  const instructions = persona(incidentFacts(inc), service)
  try {
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
          instructions,
          tools: [DECISION_TOOL],
          tool_choice: "auto",
          audio: {
            input: { transcription: { model: "gpt-4o-mini-transcribe", language: "en" } },
            output: { voice: "marin" },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return json({ ok: false, error: `OpenAI refused the voice session (${r.status}).` }, 502)
    const j = (await r.json()) as { value?: string; expires_at?: number }
    if (!j.value) return json({ ok: false, error: "OpenAI returned no client secret." }, 502)
    return json({ ok: true, value: j.value, expires_at: j.expires_at })
  } catch {
    return json({ ok: false, error: "Could not reach OpenAI for the voice session." }, 502)
  }
}
