// Real pass: real Candy Shop (supervisor on :4100, load generator running) -> bridge (same contract as POST /api/ingest) -> actors
// -> real Relay (channel prefix) + real OpenAI. Start the shop with TELEMETRY_URL=http://127.0.0.1:3390/api/ingest BANSHEE_ADMIN_TOKEN=dev-token.
// Start the runtime with RELAY_CHANNEL_PREFIX=inc-test- and BANSHEE_NS is not needed (this script uses namespace "live." for actor ids; the bridge adds it).
import { actors } from "../client/index.js"
import type { IngestBody, ServiceName } from "../src/contracts.js"

const NS = "live" + Date.now().toString(36) + "."
const SHOP = process.env.CANDY_SHOP_URL ?? "http://127.0.0.1:4100"
const H = { "content-type": "application/json", "x-banshee-token": process.env.BANSHEE_ADMIN_TOKEN ?? "dev-token" }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let received = 0
Bun.serve({
  port: 3390,
  async fetch(req) {
    const body = (await req.json()) as IngestBody
    const svc = (body.telemetry?.service ?? body.change?.service) as ServiceName
    const sp = actors.ServiceSpirit.get(NS + svc)
    received++
    if (body.telemetry) return Response.json({ ok: true, ...(await sp.ingestTelemetry(body.telemetry)) })
    await sp.ingestChange(body.change!)
    return Response.json({ ok: true })
  },
})
const desk = actors.IncidentDesk.get(NS + "org")
const office = actors.Office.get(NS + "org")
async function until<T>(what: string, f: () => Promise<T | undefined | false>, ms = 90_000): Promise<T> {
  const t0 = Date.now()
  for (;;) {
    const v = await f().catch(() => undefined)
    if (v) return v as T
    if (Date.now() - t0 > ms) throw new Error("timeout: " + what)
    await sleep(500)
  }
}
const shop = (path: string, body?: unknown) => fetch(SHOP + path, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json())
let fails = 0
const check = (ok: boolean, what: string, extra = "") => (console.log(`${ok ? "PASS" : "FAIL"}  ${what} ${extra}`), ok || fails++)

console.log("reset shop to baseline"); await shop("/admin/reset", {})
console.log("collecting baseline telemetry (6 windows, ~30 s)")
await until("baseline", async () => received >= 18 && (await desk.state()).counter === 0)

async function run(kind: "bad_deploy" | "vendor_down" | "slow_inventory", culprit: string, action: string, expectRecall?: string) {
  console.log(`\n== real fault: ${kind}`)
  const before = (await desk.state()).counter
  const t0 = Date.now()
  await shop("/admin/fault", { kind, on: true })
  const id = await until("incident opened", async () => ((await desk.state()).counter > before ? `inc-${(await desk.state()).counter}` : undefined))
  const tOpen = Date.now()
  const inc = actors.Incident.get(NS + id)
  const st = await until("awaiting approval", async () => { const s = await inc.getState(); return s.step === "awaiting_approval" ? s : undefined })
  const tAwait = Date.now()
  const d = await inc.debug()
  check((await desk.state()).counter === before + 1, "one incident")
  check(st.culprit?.service === culprit && st.fix?.action === action, `culprit ${culprit}, fix ${action}`, `got ${st.culprit?.service}/${st.fix?.action} ${st.fix?.target ?? ""}`)
  if (expectRecall) check(st.recalledFrom === expectRecall, `recalledFrom ${expectRecall}`, String(st.recalledFrom))
  const lines = (await office.snapshot()).office.chatter.filter((c) => c.channel.endsWith(id))
  lines.forEach((l) => console.log(`   [${l.from}${l.to ? ">" + l.to : ""}] ${l.text.slice(0, 220)}`))
  const ar = await inc.approve("live-test", true)
  check(ar.ok, "approve -> real /admin/fix", JSON.stringify(ar))
  const fin = await until("resolved", async () => { const s = await inc.getState(); return s.step === "resolved" ? s : undefined }, 120_000)
  const tRes = Date.now()
  await until("postmortem", async () => (await inc.getState()).postmortem, 30_000)
  const d2 = await inc.debug()
  console.log(`   measured: fault->incident ${tOpen - t0} ms, fault->root cause ${d2.marks.root_cause - t0} ms, fault->awaiting approval ${tAwait - t0} ms, approve->resolved ${tRes - (d2.marks.fixing ?? tAwait)} ms, fault->resolved ${tRes - t0} ms; relay channel ${fin.relayChannel}; narration llm=${d2.narr.llm} template=${d2.narr.template} ${d2.narrErrors.join("; ")}`)
  void d
  await sleep(12_000) // two healthy windows before the next fault
}
try {
  await run("bad_deploy", "payments", "rollback")
  await run("vendor_down", "vendor", "fallback_on")
  await run("slow_inventory", "inventory", "cache_on")
  await shop("/admin/reset", {})
  await sleep(15_000)
  await run("bad_deploy", "payments", "rollback", "inc-1")
} catch (e) { fails++; console.log("FAIL " + (e as Error).message) }
await shop("/admin/reset", {})
console.log(fails ? `${fails} FAILURE(S)` : "ALL PASSED")
process.exit(fails ? 1 : 0)
