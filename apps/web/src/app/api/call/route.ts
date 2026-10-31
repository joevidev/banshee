import { SERVICES, type IncidentState, type ServiceName } from "@banshee/contracts"
import { mockEngine } from "@/lib/office/mock-engine"
import { SERVER_SOURCE } from "@/lib/office/server-source"

// On-call phone call: the human talks to the responsible spirit. Read-only. The answer is conversational (1-3 short sentences),
// built from the incident data we hold server-side. An LLM may phrase it (hard 6 s timeout); no key or any error -> deterministic template.
// The ai SDK is not a dependency of apps/web, so the model is reached through a plain fetch to the OpenAI Responses-compatible chat endpoint.
const TIMEOUT_MS = 6000
const hits = new Map<string, number[]>()
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k)
  return arr.length > 30
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "..." : s)

function fixText(f: NonNullable<IncidentState["fix"]>): string {
  if (f.action === "rollback") return `roll ${f.service} back${f.target ? " to " + f.target : ""}`
  if (f.action === "fallback_on") return `turn on the ${f.target ?? "order"} fallback in ${f.service}`
  return `turn on the ${f.target ?? "read cache"} in ${f.service}`
}

function pickIncident(id: string | undefined): IncidentState | undefined {
  try {
    const incs = mockEngine().snapshot().incidents
    if (id && incs[id]) return incs[id]
    return Object.values(incs).sort((a, b) => b.openedAt - a.openedAt)[0]
  } catch {
    return undefined
  }
}

/** Compact, factual view of the incident for the prompt and the template. */
function facts(inc: IncidentState | undefined) {
  if (!inc) return null
  return {
    id: inc.id,
    step: inc.step,
    services: inc.services,
    culprit: inc.culprit ? { service: inc.culprit.service, cause: clip(inc.culprit.cause, 200), ourCode: inc.culprit.ourCode, evidence: inc.culprit.evidence.slice(0, 4).map((e) => clip(e, 160)) } : undefined,
    proposedFix: inc.fix ? { text: fixText(inc.fix), approvedBy: inc.fix.approvedBy, rejected: inc.fix.rejected } : undefined,
    recalledFrom: inc.recalledFrom,
    timeline: inc.timeline.slice(-8).map((t) => `${t.who}: ${clip(t.text, 200)}`),
  }
}

const str = (v: unknown, n: number) => (typeof v === "string" ? clip(v, n) : "")
function fromClient(raw: unknown, id: string | undefined): IncidentState | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, any>
  if (typeof r.id !== "string" || !/^inc-[0-9]+$/.test(r.id) || (id && r.id !== id)) return undefined
  const svcs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is ServiceName => (SERVICES as readonly string[]).includes(x)) : [])
  const c = r.culprit
  const f = r.fix
  return {
    id: r.id,
    step: str(r.step, 30) as IncidentState["step"],
    openedAt: Number(r.openedAt) || Date.now(),
    services: svcs(r.services),
    relayChannel: r.id,
    recalledFrom: typeof r.recalledFrom === "string" ? str(r.recalledFrom, 20) : undefined,
    timeline: (Array.isArray(r.timeline) ? r.timeline : []).slice(-8).map((t: any) => ({ ts: Number(t?.ts) || 0, who: str(t?.who, 40), text: str(t?.text, 200) })),
    culprit: c && typeof c === "object" ? { service: (str(c.service, 20) as ServiceName), cause: str(c.cause, 200), ourCode: !!c.ourCode, evidence: (Array.isArray(c.evidence) ? c.evidence : []).slice(0, 4).map((e: unknown) => str(e, 160)) } : undefined,
    fix: f && typeof f === "object" && ["rollback", "fallback_on", "cache_on"].includes(f.action) && (SERVICES as readonly string[]).includes(f.service) ? { action: f.action, service: f.service, target: typeof f.target === "string" ? str(f.target, 60) : undefined, approvedBy: typeof f.approvedBy === "string" ? str(f.approvedBy, 40) : undefined, rejected: !!f.rejected } : undefined,
  }
}

function template(service: ServiceName, q: string, inc: IncidentState | undefined): string {
  const t = q.toLowerCase()
  if (!inc) return "There is no incident open right now, so I have nothing to report. All quiet on my side."
  const c = inc.culprit
  const fix = inc.fix ? fixText(inc.fix) : undefined
  const cause = c ? `${c.service}${c.ourCode ? "" : " (not our code)"}: ${clip(c.cause, 160)}` : "I do not know the root cause yet"
  const ev = c?.evidence?.[0] ? `The evidence: ${clip(c.evidence[0], 160)}.` : ""
  if (/approve|reject|go ahead|do it|yes|no\b/.test(t) && fix) return `The proposal is to ${fix}. Use the Approve fix or Reject buttons and I will act right away.`
  if (/why|reason|how come/.test(t)) return fix ? `Because ${cause}. ${ev} That is why I propose to ${fix}.` : `${cause}.`
  if (/doing|now|status|progress|next/.test(t)) {
    const last = inc.timeline[inc.timeline.length - 1]
    return `Incident ${inc.id} is at step ${inc.step.replace(/_/g, " ")}. ${last ? `My last note: ${clip(last.text, 160)}` : ""}`.trim()
  }
  if (/evidence|proof|saw|see|found|metric/.test(t)) return ev || "I have no evidence on file for this incident yet."
  if (/what happened|report|happened|summary|broke|wrong/.test(t)) return `${inc.id} hit ${inc.services.join(" and ")}. Root cause: ${cause}. ${fix ? `I propose to ${fix}.` : ""}`.trim()
  return `I am spirit-${service}. On ${inc.id}: ${cause}. ${fix ? `Proposed fix: ${fix}.` : ""} Ask me why, or approve it.`
}

async function llm(service: ServiceName, message: string, history: { role: string; text: string }[], f: ReturnType<typeof facts>): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key || process.env.NARRATE_MODE === "template") throw new Error("no key")
  const system =
    `You are spirit-${service}, an on-call SRE agent speaking by phone to the human on-call. Answer in 1 to 3 short plain sentences, no markdown. ` +
    `Use ONLY the incident JSON below. If the answer is not in it, say "I do not know". Never invent facts, numbers or times.\nINCIDENT: ${JSON.stringify(f)}`
  const msgs = [{ role: "system", content: system }, ...history.slice(-8).map((h) => ({ role: h.role === "agent" ? "assistant" : "user", content: clip(String(h.text), 400) })), { role: "user", content: message }]
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.4-mini", messages: msgs, max_completion_tokens: 160 }),
    })
    if (!r.ok) throw new Error("llm " + r.status)
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    const text = j.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error("empty")
    return text.slice(0, 600)
  } finally {
    clearTimeout(timer)
  }
}

/** Live mode: add what the spirit itself knows (read-only ServiceSpirit.status) so answers stay grounded. */
async function liveNote(service: ServiceName): Promise<string | undefined> {
  try {
    const { actors, NS } = await import("@/lib/live/actors")
    const st = await actors.ServiceSpirit.get(NS + service).status()
    return `version ${st.version || "unknown"}, ${st.down ? "telemetry lost" : st.badRun > 0 ? st.badRun + " bad windows in a row" : "windows clean"}`
  } catch {
    return undefined
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (limited(ip)) return json({ ok: false, error: "slow down, the spirits need a moment" }, 429)
  const body = (await request.json().catch(() => null)) as { incidentId?: unknown; service?: unknown; message?: unknown; history?: unknown; incident?: unknown } | null
  const service = body?.service
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (typeof service !== "string" || !(SERVICES as readonly string[]).includes(service)) return json({ ok: false, error: "service must be checkout, payments or inventory" }, 400)
  if (!message || message.length > 400) return json({ ok: false, error: "message must be 1 to 400 characters" }, 400)
  const svc = service as ServiceName
  const incidentId = typeof body?.incidentId === "string" && /^inc-[0-9]+$/.test(body.incidentId) ? body.incidentId : undefined
  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter((h): h is { role: string; text: string } => !!h && typeof (h as { text?: unknown }).text === "string")
    .slice(-8)
  // Incident data lives in the mock engine in mock mode; in live mode the client sends the id and we only add the spirit status.
  // Live mode: the web server holds no incident state, so the client sends the incident it already shows; it is only prompt data (bounded, sanitized).
  const inc = (SERVER_SOURCE === "live" ? undefined : pickIncident(incidentId)) ?? fromClient(body?.incident, incidentId)
  const f = facts(inc)
  try {
    if (SERVER_SOURCE === "live" && !f) {
      const note = await liveNote(svc)
      return json({ ok: true, reply: `I am spirit-${svc}.${note ? " My state: " + note + "." : ""} Use the board for the full incident detail.`, source: "template" })
    }
    const reply = await llm(svc, message, history, f)
    return json({ ok: true, reply, source: "llm" })
  } catch {
    return json({ ok: true, reply: template(svc, message, inc), source: "template" })
  }
}
