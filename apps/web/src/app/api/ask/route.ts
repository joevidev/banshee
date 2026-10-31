import { SERVICES, type ServiceName } from "@banshee/contracts"
import { mockEngine } from "@/lib/office/mock-engine"
import { SERVER_SOURCE } from "@/lib/office/server-source"

// Ask a service's spirit a question. Read-only: live mode calls ServiceSpirit.ask / status / evidence (no state writes,
// no redeploy); mock mode answers from the mock office state with a small keyword template.
const TIMEOUT_MS = 8000
const hits = new Map<string, number[]>()
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k)
  return arr.length > 20
}

const ROLE: Record<ServiceName, string> = {
  checkout: "I guard the checkout flow, from cart to paid order",
  payments: "I guard card payments and the vendor link",
  inventory: "I guard stock levels and reservations",
}

type Snap = { activity?: string; spot?: string; mood?: string; incident?: string; health?: string; lastLine?: string }

function template(service: ServiceName, q: string, s: Snap): string {
  const t = q.toLowerCase()
  const doing = s.activity ? `I am ${s.activity.replace(/^i am /i, "")}${s.spot ? ` (at the ${s.spot.replace(/_/g, " ")})` : ""}.` : "I am at my desk, watching my graphs."
  const bad = s.health && s.health !== "ok"
  if (/why|cause|reason/.test(t))
    return bad
      ? `${doing} My service reads ${s.health}, so I am tracing the cause through recent deploys and the services I call. I will tell the others as soon as I am sure.`
      : `Nothing is wrong on my side right now, so there is no cause to chase. ${ROLE[service]}.`
  if (/see|saw|found|evidence|notice/.test(t))
    return bad
      ? `My error rate and latency left their baseline, and ${s.lastLine ? `my last note was: "${s.lastLine}"` : "I am still collecting evidence"}.`
      : `Only calm windows so far: error rate and latency are at baseline. ${s.lastLine ? `Last I said: "${s.lastLine}"` : ""}`.trim()
  if (/who|what are you|role|guard/.test(t)) return `I am spirit-${service}. ${ROLE[service]}.`
  return `${doing} ${bad ? `My service reads ${s.health}${s.incident ? `, I am on ${s.incident}` : ""}.` : "All quiet on my side."}`
}

function mockSnap(service: ServiceName): Snap {
  try {
    const o = mockEngine().snapshot().office
    const a = o.agents[service]
    const line = [...o.chatter].reverse().find((c) => c.from === `spirit-${service}`)
    return { activity: a?.activity, spot: a?.spot, mood: a?.mood, incident: a?.incidentId, health: o.health[service], lastLine: line?.text }
  } catch {
    return {}
  }
}

async function liveAnswer(service: ServiceName, question: string): Promise<string> {
  const { actors, NS } = await import("@/lib/live/actors")
  const spirit = actors.ServiceSpirit.get(NS + service)
  const [st, ask] = await Promise.all([
    spirit.status(),
    // the spirit's own LLM-backed answer, from its local evidence only (no writes)
    spirit.ask("visitor", question).catch(() => null),
  ])
  const memory = st.memories ? ` I remember ${st.memories} past incident${st.memories === 1 ? "" : "s"}.` : " I have no past incidents on file yet."
  const state = st.down ? "I have lost telemetry and I am treating myself as down." : st.badRun > 0 ? `I have seen ${st.badRun} bad window${st.badRun === 1 ? "" : "s"} in a row${st.episodeIncident ? `, following ${st.episodeIncident}` : ""}.` : "My windows are clean right now."
  if (ask?.text) {
    const clean = ask.text.replace(/^@\S+[\s,:]+/, "").replace(/^./, (c) => c.toUpperCase())
    return `${clean}${/[.!?]$/.test(clean) ? "" : "."}${memory}`.slice(0, 900)
  }
  const ev = ask?.evidence
  const cause = ev?.localCause ? ` My best local cause: ${JSON.stringify(ev.localCause).slice(0, 160)}.` : ""
  return `${state} I am running ${st.version || "an unknown version"}.${cause}${memory}`.slice(0, 900)
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (limited(ip)) return json({ ok: false, error: "slow down, the spirits need a moment" }, 429)
  const body = (await request.json().catch(() => null)) as { service?: unknown; question?: unknown } | null
  const service = body?.service
  const question = typeof body?.question === "string" ? body.question.trim() : ""
  if (typeof service !== "string" || !(SERVICES as readonly string[]).includes(service)) return json({ ok: false, error: "service must be checkout, payments or inventory" }, 400)
  if (!question || question.length > 300) return json({ ok: false, error: "question must be 1 to 300 characters" }, 400)
  const svc = service as ServiceName
  const fallback = `${ROLE[svc]}. I am a little slow to answer right now, ask me again in a moment.`
  try {
    const run = SERVER_SOURCE === "live" ? liveAnswer(svc, question) : Promise.resolve(template(svc, question, mockSnap(svc)))
    const text = await Promise.race([run, new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))])
    return json({ ok: true, from: `spirit-${svc}`, text })
  } catch {
    return json({ ok: true, from: `spirit-${svc}`, text: fallback, fallback: true })
  }
}
