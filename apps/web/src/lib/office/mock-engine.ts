// Server-side mock of the Office + Incident actors. A scripted, realistic timeline
// that the projector and the phones share through /api/mock/stream (SSE).
// Chaos and approve API routes drive it; when nobody touches it, it autoplays.

import type {
  AgentPresence,
  FixAction,
  IncidentState,
  IncidentStep,
  OfficeSpot,
  OfficeState,
  ServiceName,
} from "@banshee/contracts"
import { SERVICES } from "@banshee/contracts"
import type { ChaosKind, Snapshot } from "./types"

type Agent = AgentPresence["agent"]
type World = {
  office: OfficeState
  incidents: Record<string, IncidentState>
  counter: number
  /** kind -> first incident id of that kind, for memory recall */
  seen: Partial<Record<ChaosKind, string>>
  active?: {
    id: string
    kind: ChaosKind
    phase: "pre" | "wait" | "post" | "cooldown"
    phaseStart: number
    idx: number
    script: Script
    auto: boolean
    waitSince?: number
    /** set while the reject script plays; restored afterwards */
    afterReject?: Script
  }
  idleSince: number
  manualUntil: number
  autoIdx: number
  nextAmbient: number
  ambient?: { svc: ServiceName; backAt: number }
}

type Ev = { at: number; run: (w: World, inc: IncidentState) => void }
type Script = { pre: Ev[]; post: Ev[]; reject: Ev[] }

const AUTOPLAY_IDLE_MS = 18_000
const AUTO_APPROVE_MS = 9_000
const MANUAL_PAUSE_MS = 180_000
const COOLDOWN_MS = 14_000
const AUTO_SEQUENCE: ChaosKind[] = ["bad_deploy", "vendor_down", "bad_deploy"]

const name = (s: ServiceName): Agent => `spirit-${s}`
const ONCALL = "oncall-joel"

function freshOffice(now: number): OfficeState {
  const agents = {} as OfficeState["agents"]
  for (const s of SERVICES) {
    agents[s] = { agent: name(s), spot: "desk", activity: "watching graphs", mood: "calm", ts: now }
  }
  return {
    health: { checkout: "ok", payments: "ok", inventory: "ok", vendor: "ok" },
    agents,
    openIncidents: [],
    ordersPerMin: 42,
    chatter: [],
  }
}

// ---------- helpers used by scripts ----------
function move(w: World, s: ServiceName, spot: OfficeSpot, activity: string, mood?: AgentPresence["mood"], incidentId?: string) {
  const a = w.office.agents[s]
  w.office.agents[s] = { ...a, spot, activity, mood: mood ?? a.mood, incidentId: incidentId ?? a.incidentId, ts: Date.now() }
}
function say(w: World, from: string, text: string, opts: { to?: string; channel?: string } = {}) {
  const channel = opts.channel ?? w.active?.id ?? "general"
  w.office.chatter = [...w.office.chatter, { ts: Date.now(), from, to: opts.to, channel, text }].slice(-20)
  const inc = w.active ? w.incidents[w.active.id] : undefined
  if (inc && channel === inc.relayChannel) {
    inc.timeline = [...inc.timeline, { ts: Date.now(), who: from, text }]
  }
}
function step(inc: IncidentState, s: IncidentStep) {
  inc.step = s
}
function note(inc: IncidentState, who: string, text: string) {
  inc.timeline = [...inc.timeline, { ts: Date.now(), who, text }]
}

// ---------- scripts ----------
function badDeployScript(recalledFrom?: string): Script {
  const P = "spirit-payments"
  const C = "spirit-checkout"
  const I = "spirit-inventory"
  const recall = !!recalledFrom
  const pre: Ev[] = [
    { at: 0, run: (w) => { w.office.health.payments = "degraded"; w.office.health.checkout = "degraded" } },
    {
      at: 1200,
      run: (w, inc) => {
        step(inc, "detected")
        w.office.openIncidents = [...w.office.openIncidents, inc.id]
        note(inc, C, "checkout error rate 31% (baseline 0.4%)")
        move(w, "checkout", "server_room", "reading error logs", "alert", inc.id)
        say(w, C, "Opening " + inc.id + ". 31% of checkouts failing: 502 from payments on POST /charge.")
      },
    },
    {
      at: 3400,
      run: (w, inc) => {
        w.office.health.payments = "down"
        move(w, "payments", "server_room", "reading error logs", "alert", inc.id)
        say(w, C, "@payments every failure I see is a callee error from you. Are you healthy?", { to: P })
      },
    },
  ]
  if (recall) {
    pre.push(
      {
        at: 5600,
        run: (w, inc) => {
          step(inc, "investigating")
          move(w, "payments", "archive", "reading " + recalledFrom + " postmortem", "busy")
          move(w, "checkout", "war_room", "waiting on payments", "alert")
          say(w, P, "TypeError in charge() again. Checking memory: this looks like " + recalledFrom + ".")
        },
      },
      {
        at: 9000,
        run: (w, inc) => {
          inc.recalledFrom = recalledFrom
          step(inc, "root_cause")
          inc.culprit = {
            service: "payments",
            cause: "Deploy a3f9c1e reintroduced the charge() bug: amounts with cents throw",
            evidence: [
              "Same signature as " + recalledFrom + ": TypeError amount.toFixed in charge()",
              "Deploy a3f9c1e landed 12 s before the first error",
              "Only amounts with cents fail; whole-dollar orders succeed",
            ],
            ourCode: true,
          }
          say(w, P, "Seen in " + recalledFrom + ": same diff, same error. Last time a rollback fixed it in 40 s.")
        },
      },
      {
        at: 11500,
        run: (w, inc) => {
          step(inc, "awaiting_approval")
          inc.fix = { action: "rollback", service: "payments", target: "7c2e8d0" }
          move(w, "payments", "oncall_door", "waiting for approval", "busy")
          move(w, "checkout", "desk", "watching checkout errors", "alert")
          say(w, P, "@oncall-joel roll payments back a3f9c1e → 7c2e8d0 (same fix as " + recalledFrom + ")? Approve on your phone.", { to: ONCALL })
        },
      },
    )
  } else {
    pre.push(
      {
        at: 6000,
        run: (w, inc) => {
          step(inc, "investigating")
          move(w, "checkout", "war_room", "correlating timelines", "alert")
          move(w, "payments", "war_room", "comparing error onset", "alert")
          move(w, "inventory", "war_room", "joining the war room", "busy", inc.id)
          say(w, P, "My errors start at 13:02:41. TypeError in charge(): amount.toFixed is not a function.")
        },
      },
      {
        at: 9200,
        run: (w) => {
          say(w, I, "Inventory clean: p95 41 ms, 0 errors, no deploy in 6 h. Ruling myself out.")
          move(w, "inventory", "war_room", "ruled out, listening", "calm")
        },
      },
      {
        at: 11200,
        run: (w) => {
          move(w, "payments", "deploy_console", "reading deploy history", "busy")
          say(w, C, "@payments anything change on your side before 13:02?", { to: P })
        },
      },
      {
        at: 14200,
        run: (w) => {
          say(w, P, "Deploy a3f9c1e landed 14 s before my first error. The diff touches charge().")
        },
      },
      {
        at: 16500,
        run: (w, inc) => {
          step(inc, "root_cause")
          inc.culprit = {
            service: "payments",
            cause: "Deploy a3f9c1e broke charge() for amounts with cents",
            evidence: [
              "Deploy a3f9c1e at 13:02:27, first error at 13:02:41 (14 s later)",
              "Diff changes charge(): amount parsed as string, .toFixed throws",
              "100% of checkout errors are callee errors from payments",
              "Inventory and vendor healthy over the same window",
            ],
            ourCode: true,
          }
          say(w, C, "Agreed. Root cause is payments deploy a3f9c1e. Checkout is only inheriting the errors.")
        },
      },
      {
        at: 19500,
        run: (w, inc) => {
          step(inc, "awaiting_approval")
          inc.fix = { action: "rollback", service: "payments", target: "7c2e8d0" }
          move(w, "payments", "oncall_door", "waiting for approval", "busy")
          move(w, "checkout", "desk", "watching checkout errors", "alert")
          move(w, "inventory", "desk", "watching graphs", "calm")
          say(w, P, "@oncall-joel proposing rollback of payments a3f9c1e → 7c2e8d0. Approve on your phone.", { to: ONCALL })
        },
      },
    )
  }
  const post: Ev[] = [
    {
      at: 0,
      run: (w, inc) => {
        step(inc, "fixing")
        if (inc.fix) inc.fix = { ...inc.fix, approvedBy: ONCALL, rejected: false }
        say(w, ONCALL, "Approved. Roll it back.", { to: P })
        move(w, "payments", "deploy_console", "rolling back to 7c2e8d0", "busy")
      },
    },
    { at: 3200, run: (w) => { w.office.health.payments = "degraded"; say(w, P, "7c2e8d0 is live. Restarting workers.") } },
    {
      at: 5200,
      run: (w) => {
        w.office.health.payments = "ok"
        w.office.health.checkout = "ok"
        say(w, P, "charge() healthy: 0 errors in the last 10 s.")
      },
    },
    {
      at: 7600,
      run: (w, inc) => {
        step(inc, "resolved")
        inc.resolvedAt = Date.now()
        inc.postmortem =
          "Payments deploy a3f9c1e parsed amounts as strings; charge() threw for amounts with cents. Checkout inherited 502s. Rolled back to 7c2e8d0 after on-call approval."
        say(w, C, "Checkout error rate back to 0.3%. Orders flowing. Closing " + inc.id + ".")
        move(w, "payments", "desk", "writing the postmortem", "done")
        move(w, "checkout", "desk", "watching graphs", "done")
        move(w, "inventory", "desk", "watching graphs", "done")
      },
    },
  ]
  return { pre, post, reject: rejectScript(P, "rollback") }
}

function vendorDownScript(): Script {
  const P = "spirit-payments"
  const C = "spirit-checkout"
  const I = "spirit-inventory"
  const pre: Ev[] = [
    { at: 0, run: (w) => { w.office.health.vendor = "down"; w.office.health.payments = "degraded"; w.office.health.checkout = "degraded" } },
    {
      at: 1200,
      run: (w, inc) => {
        step(inc, "detected")
        w.office.openIncidents = [...w.office.openIncidents, inc.id]
        note(inc, C, "checkout error rate 44% (baseline 0.4%)")
        move(w, "checkout", "server_room", "reading error logs", "alert", inc.id)
        say(w, C, "Opening " + inc.id + ". 44% of checkouts failing at payment.")
      },
    },
    {
      at: 3200,
      run: (w, inc) => {
        move(w, "payments", "server_room", "reading error logs", "alert", inc.id)
        say(w, C, "@payments is this a deploy again?", { to: P })
      },
    },
    {
      at: 5600,
      run: (w, inc) => {
        step(inc, "investigating")
        move(w, "payments", "vendor_phone", "calling the card processor", "busy")
        move(w, "checkout", "war_room", "correlating timelines", "alert")
        move(w, "inventory", "war_room", "joining the war room", "busy", inc.id)
        say(w, P, "No deploy in 3 h and my code is healthy. 100% of my errors are 503s from the card processor.")
      },
    },
    { at: 8800, run: (w) => { say(w, I, "Inventory clean. Ruling myself out."); move(w, "inventory", "war_room", "ruled out, listening", "calm") } },
    {
      at: 11000,
      run: (w, inc) => {
        step(inc, "root_cause")
        inc.culprit = {
          service: "vendor",
          cause: "Card processor returning 503: not our bug",
          evidence: [
            "503 Service Unavailable on 100% of /v1/charges since 13:14:02",
            "No deploy or config change in payments for 3 h",
            "Processor status page: degraded, investigating",
          ],
          ourCode: false,
        }
        say(w, P, "Not our bug: the card processor is down. We can accept orders and charge later.")
      },
    },
    {
      at: 13500,
      run: (w, inc) => {
        step(inc, "awaiting_approval")
        inc.fix = { action: "fallback_on", service: "payments", target: "charge-later" }
        move(w, "payments", "oncall_door", "waiting for approval", "busy")
        move(w, "checkout", "desk", "watching checkout errors", "alert")
        move(w, "inventory", "desk", "watching graphs", "calm")
        say(w, P, "@oncall-joel turn on the charge-later fallback for payments? Approve on your phone.", { to: ONCALL })
      },
    },
  ]
  const post: Ev[] = [
    {
      at: 0,
      run: (w, inc) => {
        step(inc, "fixing")
        if (inc.fix) inc.fix = { ...inc.fix, approvedBy: ONCALL, rejected: false }
        say(w, ONCALL, "Approved. Turn the fallback on.", { to: P })
        move(w, "payments", "deploy_console", "enabling charge-later fallback", "busy")
      },
    },
    {
      at: 3800,
      run: (w) => {
        w.office.health.payments = "ok"
        w.office.health.checkout = "ok"
        say(w, P, "Fallback on. Orders accepted, 212 charges queued for retry.")
      },
    },
    {
      at: 6400,
      run: (w, inc) => {
        step(inc, "resolved")
        inc.resolvedAt = Date.now()
        inc.postmortem = "Card processor returned 503 for all charges. Payments turned on the charge-later fallback; orders kept flowing while the vendor recovered."
        say(w, C, "Orders flowing again. Vendor still down; payments will drain the queue when it is back.")
        move(w, "payments", "vendor_phone", "watching the vendor", "done")
        move(w, "checkout", "desk", "watching graphs", "done")
        move(w, "inventory", "desk", "watching graphs", "done")
      },
    },
  ]
  return { pre, post, reject: rejectScript(P, "fallback_on") }
}

function slowInventoryScript(): Script {
  const C = "spirit-checkout"
  const I = "spirit-inventory"
  const P = "spirit-payments"
  const pre: Ev[] = [
    { at: 0, run: (w) => { w.office.health.inventory = "degraded"; w.office.health.checkout = "degraded" } },
    {
      at: 1400,
      run: (w, inc) => {
        step(inc, "detected")
        w.office.openIncidents = [...w.office.openIncidents, inc.id]
        note(inc, C, "checkout p95 2.9 s (baseline 180 ms), timeouts")
        move(w, "checkout", "server_room", "reading slow traces", "alert", inc.id)
        say(w, C, "Opening " + inc.id + ". Checkout timing out; slow spans point at inventory.")
      },
    },
    {
      at: 4000,
      run: (w, inc) => {
        step(inc, "investigating")
        move(w, "inventory", "server_room", "profiling stock lookups", "alert", inc.id)
        move(w, "payments", "war_room", "joining the war room", "busy", inc.id)
        say(w, C, "@inventory your p95 jumped from 40 ms to 2.5 s. Deploy?", { to: I })
      },
    },
    { at: 7000, run: (w) => { say(w, P, "Payments clean, ruling myself out."); move(w, "payments", "desk", "watching graphs", "calm") } },
    {
      at: 9000,
      run: (w, inc) => {
        move(w, "inventory", "war_room", "explaining the latency", "busy")
        say(w, I, "No deploy anywhere. My DB reads went slow at 13:21; every stock lookup waits 2.5 s.")
        step(inc, "root_cause")
        inc.culprit = {
          service: "inventory",
          cause: "Inventory stock lookups slowed to 2.5 s; checkout times out waiting",
          evidence: ["inventory p95 40 ms → 2.5 s at 13:21:07", "No deploy or config change in the last hour", "checkout timeouts all on GET /stock"],
          ourCode: true,
        }
      },
    },
    {
      at: 12000,
      run: (w, inc) => {
        step(inc, "awaiting_approval")
        inc.fix = { action: "cache_on", service: "inventory", target: "read-cache 30s" }
        move(w, "inventory", "oncall_door", "waiting for approval", "busy")
        move(w, "checkout", "desk", "watching checkout latency", "alert")
        say(w, I, "@oncall-joel turn on the 30 s inventory read cache? Approve on your phone.", { to: ONCALL })
      },
    },
  ]
  const post: Ev[] = [
    {
      at: 0,
      run: (w, inc) => {
        step(inc, "fixing")
        if (inc.fix) inc.fix = { ...inc.fix, approvedBy: ONCALL, rejected: false }
        say(w, ONCALL, "Approved.", { to: I })
        move(w, "inventory", "deploy_console", "enabling read cache", "busy")
      },
    },
    { at: 3500, run: (w) => { w.office.health.inventory = "ok"; w.office.health.checkout = "ok"; say(w, I, "Cache on. Stock lookups at 3 ms.") } },
    {
      at: 6000,
      run: (w, inc) => {
        step(inc, "resolved")
        inc.resolvedAt = Date.now()
        inc.postmortem = "Inventory DB reads slowed to 2.5 s; checkout timed out. Read cache enabled after approval."
        say(w, C, "Checkout p95 back to 190 ms. Closing " + inc.id + ".")
        move(w, "inventory", "desk", "watching graphs", "done")
        move(w, "checkout", "desk", "watching graphs", "done")
      },
    },
  ]
  return { pre, post, reject: rejectScript(I, "cache_on") }
}

function rejectScript(agent: string, action: FixAction): Ev[] {
  return [
    {
      at: 0,
      run: (w, inc) => {
        if (inc.fix) inc.fix = { ...inc.fix, rejected: true }
        step(inc, "investigating")
        say(w, ONCALL, "Rejected. Hold off.", { to: agent })
        say(w, agent, "Understood, holding " + action.replace("_", " ") + ". Keeping watch; I will propose again with more evidence.")
      },
    },
    {
      at: 7000,
      run: (w, inc) => {
        step(inc, "awaiting_approval")
        if (inc.fix) inc.fix = { ...inc.fix, rejected: false }
        say(w, agent, "@oncall-joel errors still climbing. Same proposal, please approve or reject.", { to: ONCALL })
      },
    },
  ]
}

// ---------- engine ----------
type Listener = (s: Snapshot) => void

class MockEngine {
  w: World
  listeners = new Set<Listener>()
  timer: ReturnType<typeof setInterval>
  lastBroadcast = 0
  dirty = true

  constructor() {
    const now = Date.now()
    this.w = { office: freshOffice(now), incidents: {}, counter: 0, seen: {}, idleSince: now, manualUntil: 0, autoIdx: 0, nextAmbient: now + 6000 }
    this.timer = setInterval(() => this.tick(), 200)
  }

  snapshot(): Snapshot {
    return { office: this.w.office, incidents: this.w.incidents, serverNow: Date.now() }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  private emit() {
    const s = JSON.parse(JSON.stringify(this.snapshot())) as Snapshot
    for (const l of this.listeners) l(s)
    this.lastBroadcast = Date.now()
    this.dirty = false
  }

  chaos(kind: ChaosKind, auto = false): { ok: boolean; incidentId?: string; error?: string } {
    const w = this.w
    if (!auto) w.manualUntil = Date.now() + MANUAL_PAUSE_MS
    if (w.active && w.active.phase !== "cooldown") {
      return { ok: false, incidentId: w.active.id, error: "An incident is already in progress: " + w.active.id }
    }
    if (w.active) this.finishCooldown()
    w.ambient = undefined
    for (const s of SERVICES) if (w.office.agents[s].spot !== "desk") move(w, s, "desk", "watching graphs", "calm")
    // Vendor may still be down from a previous vendor incident; a new incident starts from a clean slate.
    w.office.health = { checkout: "ok", payments: "ok", inventory: "ok", vendor: "ok" }
    const id = "inc-" + ++w.counter
    const recalledFrom = kind === "bad_deploy" ? w.seen.bad_deploy : undefined
    if (!w.seen[kind]) w.seen[kind] = id
    const script = kind === "bad_deploy" ? badDeployScript(recalledFrom) : kind === "vendor_down" ? vendorDownScript() : slowInventoryScript()
    const services: ServiceName[] = kind === "slow_inventory" ? ["checkout", "inventory"] : ["checkout", "payments"]
    w.incidents[id] = { id, step: "detected", openedAt: Date.now(), services, timeline: [], relayChannel: id }
    w.active = { id, kind, phase: "pre", phaseStart: Date.now(), idx: 0, script, auto }
    this.dirty = true
    this.tick()
    return { ok: true, incidentId: id }
  }

  approve(incidentId: string, approve: boolean, auto = false): { ok: boolean; error?: string } {
    const w = this.w
    if (!auto) w.manualUntil = Date.now() + MANUAL_PAUSE_MS
    const a = w.active
    if (!a || a.id !== incidentId) return { ok: false, error: "No open incident " + incidentId }
    if (a.phase !== "wait") return { ok: false, error: "Incident " + incidentId + " is not waiting for approval" }
    if (!approve) {
      a.afterReject = a.script
      a.script = { pre: [], post: a.script.reject, reject: a.script.reject }
    }
    a.phase = "post"
    a.phaseStart = Date.now()
    a.idx = 0
    this.dirty = true
    if (!auto) this.tick()
    return { ok: true }
  }

  private finishCooldown() {
    const w = this.w
    if (!w.active) return
    const id = w.active.id
    w.office.openIncidents = w.office.openIncidents.filter((x) => x !== id)
    for (const s of SERVICES) {
      const a = w.office.agents[s]
      w.office.agents[s] = { ...a, mood: "calm", activity: a.spot === "desk" ? "watching graphs" : a.activity, incidentId: undefined, ts: Date.now() }
    }
    w.active = undefined
    w.idleSince = Date.now()
  }

  tick() {
    const w = this.w
    const now = Date.now()
    const a = w.active
    if (a) {
      const list = a.phase === "pre" ? a.script.pre : a.phase === "post" ? a.script.post : []
      const inc = w.incidents[a.id]
      while (a.idx < list.length && now - a.phaseStart >= list[a.idx].at) {
        list[a.idx].run(w, inc)
        a.idx++
        this.dirty = true
      }
      if (a.phase === "pre" && a.idx >= list.length) {
        a.phase = "wait"
        a.waitSince = now
      } else if (a.phase === "post" && a.idx >= list.length) {
        if (a.afterReject) {
          // reject flow finished: back to waiting for approval with the original script
          a.script = a.afterReject
          a.afterReject = undefined
          a.phase = "wait"
          a.waitSince = now
        } else {
          a.phase = "cooldown"
          a.phaseStart = now
        }
      } else if (a.phase === "wait" && a.auto && now - (a.waitSince ?? now) > AUTO_APPROVE_MS) {
        this.approve(a.id, true, true)
      } else if (a.phase === "cooldown" && now - a.phaseStart > COOLDOWN_MS) {
        this.finishCooldown()
        this.dirty = true
      }
    } else {
      this.ambientTick(now)
      if (now > w.manualUntil && now - w.idleSince > AUTOPLAY_IDLE_MS) {
        const kind = AUTO_SEQUENCE[w.autoIdx++ % AUTO_SEQUENCE.length]
        this.chaos(kind, true)
      }
    }
    this.updateOrders()
    if (this.dirty || now - this.lastBroadcast > 1000) this.emit()
  }

  private ambientTick(now: number) {
    const w = this.w
    if (w.ambient && now > w.ambient.backAt) {
      move(w, w.ambient.svc, "desk", "watching graphs", "calm")
      w.ambient = undefined
      this.dirty = true
    } else if (!w.ambient && now > w.nextAmbient) {
      const svc = SERVICES[Math.floor(Math.random() * SERVICES.length)]
      const options: [OfficeSpot, string][] = [
        ["server_room", "checking disk and memory"],
        ["archive", "re-reading old postmortems"],
        ["deploy_console", "reviewing today's deploys"],
      ]
      const [spot, activity] = options[Math.floor(Math.random() * options.length)]
      move(w, svc, spot, activity, "calm")
      w.ambient = { svc, backAt: now + 9000 }
      w.nextAmbient = now + 16000 + Math.random() * 6000
      this.dirty = true
    }
  }

  private updateOrders() {
    const h = this.w.office.health
    let base = 42
    if (h.checkout === "down") base = 2
    else if (h.checkout === "degraded") base = h.payments === "down" || h.vendor === "down" ? 9 : 23
    const cur = this.w.office.ordersPerMin
    const target = base + (Math.random() - 0.5) * (base > 30 ? 6 : 3)
    this.w.office.ordersPerMin = Math.max(0, Math.round(cur + (target - cur) * 0.08))
  }
}

const g = globalThis as unknown as { __bansheeMockEngine?: MockEngine }
export function mockEngine(): MockEngine {
  if (!g.__bansheeMockEngine) g.__bansheeMockEngine = new MockEngine()
  return g.__bansheeMockEngine
}
