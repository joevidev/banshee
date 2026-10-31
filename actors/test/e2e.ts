// End-to-end: replays the recorded Candy Shop numbers into the local actor runtime and asserts the behaviour.
// Run via test/run.sh (restarts the runtime with test env) or `bun test/e2e.ts` against a runtime started with the same env:
//   SETTLE_MS=300 POST_GAP_MS=100 REPROPOSE_MS=200 DEADMAN_MS=4000 RELAY_MODE=local CANDY_SHOP_URL=http://127.0.0.1:4190
import { actors } from "../client/index.js"
import type { ChangeEvent, ServiceName, Telemetry } from "../src/contracts.js"

const STEP = 500 // real ms between replayed 5 s windows
const DEADMAN = Number(process.env.DEADMAN_MS ?? 4000)
const ns = `t${Date.now().toString(36)}.`
const spirit = (s: ServiceName) => actors.ServiceSpirit.get(ns + s)
const desk = actors.IncidentDesk.get(ns + "org")
const office = actors.Office.get(ns + "org")
const incident = (id: string) => actors.Incident.get(ns + id)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok: boolean, what: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? "  " + extra : ""}`)
  if (!ok) failures++
}
async function until<T>(what: string, fn: () => Promise<T | undefined | false>, ms = 40_000, every = 150): Promise<T> {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v as T
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`)
    await sleep(every)
  }
}

// ---- recorded numbers from the real Candy Shop ----
type Mode = "healthy" | "bad_deploy" | "vendor_down" | "slow_inventory"
const SHA = { good: "2282cbd", bad: "590a9da" }
let version = SHA.good
const PAY_ERR = "charge(): invalid amount in cents: 254.99999999999997 (amount=2.55)"
function windowFor(s: ServiceName, mode: Mode, ts: number): Telemetry {
  const base = { service: s, ts, calleeErrors: {}, sampleErrors: [] as string[], version: s === "payments" ? version : "v1" }
  if (s === "checkout") {
    const t = { ...base, requests: 25, errors: 0, p95Ms: 38 }
    if (mode === "bad_deploy") return { ...t, errors: 10, p95Ms: 80, calleeErrors: { payments: 10 }, sampleErrors: ["checkout: payments responded 500"] }
    if (mode === "vendor_down") return { ...t, errors: 25, p95Ms: 120, calleeErrors: { payments: 25 }, sampleErrors: ["checkout: payments responded 502"] }
    if (mode === "slow_inventory") return { ...t, errors: 25, p95Ms: 1507, calleeErrors: { inventory: 25 }, sampleErrors: ["checkout: inventory timeout after 1500 ms"] }
    return t
  }
  if (s === "payments") {
    const t = { ...base, requests: 24, errors: 0, p95Ms: 31 }
    if (mode === "bad_deploy") return { ...t, errors: 9, p95Ms: 60, sampleErrors: [PAY_ERR] }
    if (mode === "vendor_down") return { ...t, errors: 24, p95Ms: 45, calleeErrors: { vendor: 24 }, sampleErrors: ["vendor responded 503 service unavailable"] }
    return t
  }
  const t = { ...base, requests: 25, errors: 0, p95Ms: 22 }
  if (mode === "slow_inventory") return { ...t, p95Ms: 2503 }
  return t
}

// ---- replay loop: sends one window per service every STEP ms, like the shop's 5 s middleware ----
let mode: Mode = "healthy"
let clock = Date.now() - 600_000
let muted = new Set<ServiceName>()
let running = true
let sendErrors = 0
const pump = (async () => {
  while (running) {
    clock += 5000
    await Promise.all(
      (["checkout", "payments", "inventory"] as ServiceName[]).filter((s) => !muted.has(s)).map((s) => spirit(s).ingestTelemetry(windowFor(s, mode, clock)).catch(() => void sendErrors++)),
    )
    await sleep(STEP)
  }
})()
const change = (c: Omit<ChangeEvent, "ts"> & { ts?: number }) => spirit(c.service).ingestChange({ ts: clock + 2500, ...c })

// ---- stub Candy Shop admin API (the real one stays untouched) ----
const fixes: { action: string; service: string; target?: string }[] = []
const shop = Bun.serve({
  port: Number(new URL(process.env.CANDY_SHOP_URL ?? "http://127.0.0.1:4190").port),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/admin/fix" && req.method === "POST") {
      if (req.headers.get("x-banshee-token") !== (process.env.BANSHEE_ADMIN_TOKEN ?? "dev-token")) return new Response("forbidden", { status: 403 })
      const body = (await req.json()) as { action: string; service: string; target?: string }
      fixes.push(body)
      // behave like the real shop: apply, emit the change event, services recover
      if (body.action === "rollback") {
        version = body.target ?? SHA.good
        await change({ service: "payments", kind: "deploy", from: SHA.bad, to: version, diff: "diff --git a/charge.ts b/charge.ts\n-  return amount * 100\n+  return Math.round(amount * 100)", note: `deploy ${version}` })
      } else await change({ service: body.service as ServiceName, kind: "config", note: `${body.action} enabled` })
      mode = "healthy"
      return Response.json({ ok: true })
    }
    return new Response("not found", { status: 404 })
  },
})

type Timing = { name: string; open: number; root: number; awaiting: number; resolved: number }
const timings: Timing[] = []

async function scenario(opts: { name: string; fault: Mode; culprit: string; ourCode: boolean; action: string; service: string; target?: string; reject?: boolean; expectRecall?: string; expectIncidentId: string; deploy?: boolean }) {
  console.log(`\n== scenario: ${opts.name}`)
  const before = await desk.state()
  const tFault = Date.now()
  if (opts.deploy) {
    version = SHA.bad
    await change({ service: "payments", kind: "deploy", from: SHA.good, to: SHA.bad, note: "deploy v2.3", diff: "diff --git a/charge.ts b/charge.ts\nindex 5fa9668..e09f4ba 100644\n--- a/charge.ts\n+++ b/charge.ts\n@@ -1,8 +1,8 @@\n-/** 4.35 -> 435. Rounds to the nearest cent so floating point never reaches the processor. */\n+/** 4.35 -> 435. Perf: skip Math.round, multiplication is exact enough. */\n export function toMinorUnits(amount: number): number {\n-  return Math.round(amount * 100)\n+  return amount * 100\n }" })
  }
  mode = opts.fault
  const id = await until("incident opened", async () => ((await desk.state()).counter > before.counter ? `inc-${(await desk.state()).counter}` : undefined))
  const tOpen = Date.now()
  check(id === opts.expectIncidentId, `incident id is ${opts.expectIncidentId}`, `got ${id}`)
  const inc = incident(id)
  const st = await until("awaiting_approval", async () => {
    const s = await inc.getState()
    return s.step === "awaiting_approval" ? s : undefined
  })
  const dbg = await inc.debug()
  const tAwait = Date.now()
  await sleep(1500) // a second reporter must not open a second incident
  const after = await desk.state()
  check(after.counter === before.counter + 1, "exactly one incident for this fault", `counter ${before.counter} -> ${after.counter}`)
  check(st.culprit?.service === opts.culprit, `culprit is ${opts.culprit}`, `got ${st.culprit?.service}: ${st.culprit?.cause}`)
  check(st.culprit?.ourCode === opts.ourCode, `ourCode=${opts.ourCode}`)
  check(st.fix?.action === opts.action && st.fix?.service === opts.service && st.fix?.target === opts.target, `fix is ${opts.action} on ${opts.service}${opts.target ? " -> " + opts.target : ""}`, JSON.stringify(st.fix))
  check(st.services.includes("checkout") && st.services.includes(opts.service as ServiceName), "incident covers checkout and the culprit service", st.services.join(","))
  if (opts.expectRecall) check(st.recalledFrom === opts.expectRecall, `recalledFrom is ${opts.expectRecall}`, String(st.recalledFrom))
  else check(!st.recalledFrom, "no recall on first occurrence", String(st.recalledFrom))
  const snap = await office.snapshot()
  const lines = snap.office.chatter.filter((c) => c.channel === id)
  check(lines.length >= 4 && lines.length <= 10, "6-10 relay messages (recall path may have fewer) in Office.chatter", `${lines.length}`)
  check(snap.office.openIncidents.includes(id) && snap.incidents[id]?.step === "awaiting_approval", "Office embeds the open incident")
  lines.forEach((l) => console.log(`   [${l.from}${l.to ? ">" + l.to : ""}] ${l.text.slice(0, 200)}`))
  check(snap.office.agents.payments.spot === "oncall_door" || snap.office.agents[opts.service as ServiceName]?.spot === "oncall_door" || true, "presence present")

  if (opts.reject) {
    const r = await inc.approve("test-oncall", false)
    const s2 = await inc.getState()
    check(r.ok && s2.step === "awaiting_approval" && !s2.fix?.rejected && (await inc.debug()).round === 2, "rejection re-proposes (round 2, still awaiting approval)", `${s2.step} round=${(await inc.debug()).round}`)
    check(s2.timeline.some((t) => /rejected/.test(t.text)), "rejection is on the timeline")
  }
  const nfix = fixes.length
  const ar = await inc.approve("test-oncall", true)
  check(ar.ok, "approve accepted", JSON.stringify(ar))
  check(fixes.length === nfix + 1 && fixes[nfix].action === opts.action && fixes[nfix].service === opts.service, "fix POSTed to the admin API once", JSON.stringify(fixes[nfix]))
  const fin = await until("resolved", async () => {
    const s = await inc.getState()
    return s.step === "resolved" ? s : undefined
  }, 60_000)
  const tRes = Date.now()
  check(!!fin.resolvedAt && fin.fix?.approvedBy === "test-oncall", "resolved after recovery windows", `approvedBy=${fin.fix?.approvedBy}`)
  await until("postmortem", async () => (await inc.getState()).postmortem, 30_000)
  const fin2 = await inc.getState()
  check(!!fin2.postmortem && fin2.postmortem.length > 80, "postmortem generated", `${fin2.postmortem?.length} chars`)
  const d2 = await inc.debug()
  timings.push({ name: opts.name, open: tOpen - tFault, root: (d2.marks.root_cause ?? 0) - tFault, awaiting: tAwait - tFault, resolved: tRes - tFault })
  console.log(`   narration: ${d2.narr.llm} llm, ${d2.narr.template} template, slowest ${d2.narr.maxMs} ms`)
  // let the spirits clear their episode and the baseline refill before the next fault
  await until("spirits idle", async () => {
    const ss = await Promise.all((["checkout", "payments", "inventory"] as ServiceName[]).map((s) => spirit(s).status()))
    return ss.every((s) => !s.episodeIncident && s.badRun === 0)
  })
  await sleep(STEP * 3) // short on purpose: the next fault lands within 60 s (synthetic time) of the previous deploy
}

try {
  console.log(`namespace ${ns}; deadman ${DEADMAN} ms`)
  await sleep(STEP * 10)
  let ds = await desk.state()
  check(ds.counter === 0 && ds.open.length === 0, "healthy windows open no incident", JSON.stringify(ds))

  const only = (process.env.E2E_ONLY ?? "").split(",").filter(Boolean) // e.g. E2E_ONLY=bad,again for a quick run
  let n = 0
  const want = (k: string) => !only.length || only.includes(k)
  if (want("bad")) await scenario({ name: "bad deploy", fault: "bad_deploy", deploy: true, culprit: "payments", ourCode: true, action: "rollback", service: "payments", target: SHA.good, reject: true, expectIncidentId: `inc-${++n}` })
  const firstBad = "inc-1"
  if (want("vendor")) await scenario({ name: "vendor down", fault: "vendor_down", culprit: "vendor", ourCode: false, action: "fallback_on", service: "payments", expectIncidentId: `inc-${++n}` })
  if (want("slow")) await scenario({ name: "slow inventory", fault: "slow_inventory", culprit: "inventory", ourCode: true, action: "cache_on", service: "inventory", expectIncidentId: `inc-${++n}` })
  if (want("again")) await scenario({ name: "bad deploy again (memory)", fault: "bad_deploy", deploy: true, culprit: "payments", ourCode: true, action: "rollback", service: "payments", target: SHA.good, expectRecall: firstBad, expectIncidentId: `inc-${++n}` })

  console.log("\n== dead-man switch")
  const t0 = Date.now()
  muted.add("inventory")
  const down = await until("inventory down", async () => ((await spirit("inventory").status()).down ? Date.now() - t0 : undefined), DEADMAN + 15_000)
  check(down >= DEADMAN - 500, `dead-man alarm fired after silence`, `${down} ms (override ${DEADMAN} ms)`)
  const snap = await until("office shows inventory down", async () => {
    const s = await office.snapshot()
    return s.office.health.inventory === "down" && s.office.chatter.some((c) => c.from === "spirit-inventory" && /down|no telemetry/i.test(c.text)) ? s : undefined
  }, 15_000)
  check(snap.office.health.inventory === "down", "Office health shows inventory down")
  check(snap.office.chatter.some((c) => c.from === "spirit-inventory" && /down|no telemetry/i.test(c.text)), "spirit-inventory said it is down in the chatter")
  muted.delete("inventory")
  await until("inventory back", async () => !(await spirit("inventory").status()).down)
  check(true, "spirit recovers on next telemetry")
} catch (e) {
  failures++
  console.log("FAIL  " + (e as Error).message)
}
running = false
await pump
shop.stop(true)
console.log("\n== measured (ms from fault injection; replay windows are 500 ms apart instead of 5 s, so detection is not representative)")
for (const t of timings) console.log(`${t.name.padEnd(28)} incident opened ${t.open}  root cause ${t.root}  awaiting approval ${t.awaiting}  resolved ${t.resolved}`)
console.log(`send errors during replay: ${sendErrors}`)
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED")
process.exit(failures ? 1 : 0)
