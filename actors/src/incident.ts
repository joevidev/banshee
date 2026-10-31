/// <reference types="node" />
import { Actor, Emittable, Interleave, Persisted } from "terse-sdk/actor"
import { CALLS, type IncidentState, type ServiceName } from "./contracts.js"
import { decide } from "./rootcause.js"
import { narrate, type NarrateKind } from "./narrate.js"
import { Office } from "./office.js"
import { ServiceSpirit } from "./spirit.js"
import { IncidentDesk } from "./desk.js"
import { LocalRelay, MirroredRelay, RestRelay, type RelayClient, type TokenStore } from "./relay.js"
import { envNum, nsOf, sleep, hhmmss, type AnomalyReport, type ApproveResult, type Decision, type MemoryEntry, type SpiritEvidence } from "./types.js"
import { peer } from "./peer.js"

const RECOVERY_WINDOWS = 2

// ---- relay wiring: Rest when a workspace key is configured, otherwise in-memory; always mirrored into Office.chatter ----
let rest: RestRelay | undefined
let local: LocalRelay | undefined
function relayFor(ns: string): RelayClient {
  const orgId = ns + "org"
  const store: TokenStore = {
    load: () => peer("Office", orgId, "getRelayTokens", [], () => Office.get(orgId).getRelayTokens()),
    save: (name, token) => peer("Office", orgId, "setRelayToken", [name, token], () => Office.get(orgId).setRelayToken(name, token)),
  }
  const key = process.env.RELAY_WORKSPACE_KEY
  let inner: RelayClient
  if (key && process.env.RELAY_MODE !== "local") {
    rest ??= new RestRelay({ baseUrl: process.env.RELAY_BASE_URL, workspaceKey: key, store, log: (m) => console.log(m) })
    inner = rest
  } else {
    local ??= new LocalRelay()
    inner = local
  }
  return new MirroredRelay(
    inner,
    (m) => {
      const patch = { chatter: [{ ts: m.ts, from: m.from, to: m.to, channel: m.channel, text: m.text }] }
      return peer("Office", orgId, "update", [patch], () => Office.get(orgId).update(patch))
    },
    (e) => console.error(`[relay] ${e.message}`),
  )
}

const handle = (s: string) => `spirit-${s}`
const fixText = (f: NonNullable<IncidentState["fix"]>) => `${f.action}${f.target ? " " + f.target : ""}`

export class Incident extends Actor {
  @Persisted @Emittable state: IncidentState = { id: "", step: "detected", openedAt: 0, services: [], timeline: [], relayChannel: "" }
  @Persisted started = false
  @Persisted reports: AnomalyReport[] = []
  @Persisted decision: Decision | null = null
  @Persisted recalled: MemoryEntry | null = null
  @Persisted fixAppliedMs = 0
  @Persisted healthy: Record<string, number> = {}
  @Persisted round = 1
  @Persisted marks: Record<string, number> = {}
  @Persisted narr: Record<string, number> = { llm: 0, template: 0, maxMs: 0 }
  @Persisted narrErrors: string[] = []

  private async note(who: string, text: string) {
    this.state = { ...this.state, timeline: [...this.state.timeline, { ts: Date.now(), who, text }] }
  }
  private async mark(k: string) {
    this.marks = { ...this.marks, [k]: Date.now() }
  }
  private async sync() {
    const id = nsOf(this.id) + "org"
    const patch = { incident: this.state }
    await peer("Office", id, "update", [patch], () => Office.get(id).update(patch))
  }
  private async presence(agents: NonNullable<Parameters<Office["update"]>[0]["agents"]>, extra: Omit<Parameters<Office["update"]>[0], "agents" | "incident"> = {}) {
    const id = nsOf(this.id) + "org"
    const patch = { agents, ...extra, incident: this.state }
    await peer("Office", id, "update", [patch], () => Office.get(id).update(patch))
  }
  private async say(from: string, text: string, to?: string) {
    await this.note(from, text)
    const channel = this.state.relayChannel
    await relayFor(nsOf(this.id)).post(channel, from, text)
    void to
    await this.sync()
  }
  private async words(kind: NarrateKind, facts: Record<string, unknown>): Promise<string> {
    const n = await narrate(kind, facts)
    this.narr = { ...this.narr, [n.source]: (this.narr[n.source] ?? 0) + 1, maxMs: Math.max(this.narr.maxMs ?? 0, n.ms) }
    if (n.error) this.narrErrors = [...this.narrErrors, `${kind}: ${n.error} (${n.ms} ms)`].slice(-5)
    return n.text
  }

  async open(id: string, service: ServiceName, anomaly: AnomalyReport): Promise<void> {
    const now = Date.now()
    this.state = {
      id,
      step: "detected",
      openedAt: now,
      services: [service],
      timeline: [{ ts: now, who: "banshee", text: `${handle(service)} reports ${anomaly.kind} anomaly since ${hhmmss(anomaly.changePointTs)} (${Math.round(anomaly.errorRate * 100)}% errors, p95 ${anomaly.p95Ms} ms)` }],
      relayChannel: (process.env.RELAY_CHANNEL_PREFIX ?? "") + id, // prefix only for rehearsals/tests (e.g. inc-test-); default is exactly inc-N
    }
    this.reports = [anomaly]
    await this.mark("detected")
    this.alarm.set(now + 50) // investigation runs from the alarm so open() returns at once and the Desk mailbox stays free
    await this.presence({ [service]: { spot: "war_room", activity: `opened ${id}`, mood: "alert", incidentId: id } })
  }

  async join(service: ServiceName, anomaly: AnomalyReport): Promise<void> {
    this.reports = [...this.reports, anomaly]
    if (this.state.services.includes(service)) return
    this.state = { ...this.state, services: [...this.state.services, service] }
    await this.note("banshee", `${handle(service)} also reports ${anomaly.kind} anomaly since ${hhmmss(anomaly.changePointTs)}; joined ${this.state.id}`)
    await this.presence({ [service]: { spot: "war_room", activity: `joined ${this.state.id}`, mood: "alert", incidentId: this.state.id } })
  }

  @Interleave
  async onAlarm(): Promise<void> {
    if (this.state.step === "resolved") return
    if (!this.started) {
      this.started = true
      try {
        await this.investigate()
      } catch (e) {
        console.error(`[incident ${this.state.id}] investigation failed: ${(e as Error).stack}`)
        await this.note("banshee", `investigation error: ${(e as Error).message}`)
        await this.sync()
      }
      this.alarm.set(this.state.openedAt + envNum("ESCALATE_MS", 180_000))
      return
    }
    await this.escalate()
  }

  private async investigate(): Promise<void> {
    const ns = nsOf(this.id)
    const id = this.state.id
    const relay = relayFor(ns)
    this.state = { ...this.state, step: "investigating" }
    await this.mark("investigating")
    await relay.createChannel(this.state.relayChannel)
    await this.sync()
    await sleep(envNum("SETTLE_MS", 1000)) // let the other spirits' windows land

    // involved = reporters and their (transitive) callees that have a spirit
    const involved = new Set<ServiceName>(this.state.services)
    const queue = [...involved]
    while (queue.length) {
      const s = queue.pop()!
      for (const c of CALLS[s]) if (c !== "vendor" && !involved.has(c)) (involved.add(c), queue.push(c))
    }
    const collect = () => Promise.all([...involved].map((s) => peer("ServiceSpirit", ns + s, "evidence", [], () => ServiceSpirit.get(ns + s).evidence())))
    let evs: SpiritEvidence[] = await collect()
    // a caller's window can land seconds before its callee's (each service has its own 5 s timer): wait for the callee it blames
    const waitUntil = Date.now() + envNum("CALLEE_WAIT_MS", 7000)
    const missing = (e: SpiritEvidence[]) => e.some((x) => x.hasAnomaly && x.inherited && x.inherited.callee !== "vendor" && !e.find((y) => y.service === x.inherited!.callee && y.hasAnomaly)) || !e.some((x) => x.hasAnomaly && x.localCause)
    while (missing(evs) && Date.now() < waitUntil) {
      await sleep(600)
      evs = await collect()
    }
    const services = [...new Set([...this.state.services, ...evs.filter((e) => e.hasAnomaly).map((e) => e.service)])]
    this.state = { ...this.state, services }
    await Promise.all(evs.filter((e) => e.hasAnomaly).map((e) => peer("ServiceSpirit", ns + e.service, "attach", [id], () => ServiceSpirit.get(ns + e.service).attach(id))))

    const decision = decide(evs)
    this.decision = decision
    const owner = decision.owner
    let recalled: MemoryEntry = { found: false }
    if (owner && decision.signature) recalled = await peer("ServiceSpirit", ns + owner, "recall", [decision.signature], () => ServiceSpirit.get(ns + owner).recall(decision.signature!))
    this.recalled = recalled
    if (recalled.found && recalled.incidentId) this.state = { ...this.state, recalledFrom: recalled.incidentId }

    await this.presence(Object.fromEntries(evs.map((e) => [e.service, { spot: e.service === owner && recalled.found ? "archive" : "war_room", activity: e.service === owner && recalled.found ? "recalling past incidents" : "cross-examining in " + id, mood: "busy", incidentId: id }])) as any)

    // script: asker questions the others; everything is generated in parallel (each call has a 4 s cap, then template)
    const withAnomaly = evs.filter((e) => e.hasAnomaly)
    const asker = [...withAnomaly].sort((a, b) => Number(!!b.inherited) - Number(!!a.inherited) || a.anomaly!.changePointTs - b.anomaly!.changePointTs)[0]
    const questioned = recalled.found && owner ? evs.filter((e) => e.service === owner && e.service !== asker?.service) : evs.filter((e) => e.service !== asker?.service)
    type Item = { from: string; to?: string; kind: NarrateKind; facts: Record<string, unknown>; before?: () => Promise<void> }
    const items: Item[] = []
    if (asker) {
      for (const q of questioned) {
        items.push({ from: handle(asker.service), to: q.service, kind: "ask", facts: { from: handle(asker.service), to: q.service, anomaly: asker.anomaly, inherited: asker.inherited } })
        items.push({
          from: handle(q.service), to: asker.service, kind: "answer",
          facts: { from: handle(q.service), to: asker.service, question: "did you change anything?", evidence: q },
          before: async () => {
            const lc = q.localCause?.kind
            await this.presence({ [q.service]: { spot: lc === "vendor" ? "vendor_phone" : lc === "deploy" || lc === "config" ? "deploy_console" : "server_room", activity: lc === "vendor" ? "checking my vendor" : lc ? "reading my deploy history" : "reading my logs", mood: "busy" } })
          },
        })
      }
    }
    const voice = handle(owner ?? asker?.service ?? this.state.services[0])
    if (recalled.found && owner) items.push({ from: handle(owner), kind: "recalled", facts: { from: handle(owner), recalled } })
    if (decision.culprit) items.push({ from: voice, kind: "root_cause", facts: { from: voice, culprit: decision.culprit, changePointTs: decision.changePointTs, reason: decision.reason } })
    if (decision.fix) items.push({ from: voice, kind: "proposal", facts: { from: voice, fix: decision.fix, recalled: recalled.found ? recalled : undefined, round: 1 } })
    const texts = await Promise.all(items.map((i) => this.words(i.kind, i.facts)))

    const gap = envNum("POST_GAP_MS", 300)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === "root_cause") {
        this.state = { ...this.state, step: "root_cause", culprit: decision.culprit }
        await this.mark("root_cause")
      }
      if (it.before) await it.before()
      await this.say(it.from, texts[i], it.to)
      if (it.kind === "proposal") {
        this.state = { ...this.state, step: "awaiting_approval", fix: decision.fix }
        await this.mark("awaiting_approval")
        await this.presence({ [owner ?? asker!.service]: { spot: "oncall_door", activity: "waiting for oncall approval", mood: "alert" } })
      }
      if (i < items.length - 1) await sleep(gap)
    }
    if (!decision.culprit) {
      await this.note("banshee", "no spirit found a local cause; needs a human")
      await this.sync()
    } else if (!decision.fix) {
      await this.note("banshee", "no automatic fix is known for this cause; needs a human")
      await this.sync()
    }
  }

  @Interleave
  async approve(by: string, approve: boolean): Promise<ApproveResult> {
    const s = this.state
    if (s.step !== "awaiting_approval" || !s.fix) return { ok: false, error: `incident is ${s.step}, not awaiting approval`, step: s.step }
    const ns = nsOf(this.id)
    const fix = s.fix
    const owner = (this.decision?.owner ?? fix.service) as ServiceName
    if (!approve) {
      this.state = { ...s, fix: { ...fix, rejected: true } }
      await this.note(by, `rejected the proposed ${fixText(fix)}`)
      await this.sync()
      await sleep(envNum("REPROPOSE_MS", 1200))
      this.round += 1
      const text = await this.words("proposal", { from: handle(owner), fix: { action: fix.action, service: fix.service, target: fix.target }, recalled: this.recalled?.found ? this.recalled : undefined, round: this.round })
      this.state = { ...this.state, step: "awaiting_approval", fix: { action: fix.action, service: fix.service, target: fix.target } }
      await this.say(handle(owner), text)
      return { ok: true, step: this.state.step }
    }
    // claim synchronously so a double tap cannot apply the fix twice
    this.state = { ...s, step: "fixing", fix: { ...fix, approvedBy: by, rejected: undefined } }
    await this.mark("fixing")
    this.fixAppliedMs = 0
    this.healthy = {}
    const text = await this.words("applied", { from: handle(owner), by, fix })
    await this.say(handle(owner), text)
    await this.presence({ [owner]: { spot: fix.action === "rollback" ? "deploy_console" : "server_room", activity: `applying ${fix.action}`, mood: "busy" } })
    try {
      await peer("ServiceSpirit", ns + fix.service, "expectFix", [fix.action === "rollback" ? "deploy" : "config", fix.target], () => ServiceSpirit.get(ns + fix.service).expectFix(fix.action === "rollback" ? "deploy" : "config", fix.target))
      const res = await fetch((process.env.CANDY_SHOP_URL ?? "http://127.0.0.1:4100") + "/admin/fix", {
        method: "POST",
        headers: { "content-type": "application/json", "x-banshee-token": process.env.BANSHEE_ADMIN_TOKEN ?? "dev-token" },
        body: JSON.stringify({ action: fix.action, service: fix.service, target: fix.target }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`candy shop /admin/fix returned ${res.status}`)
    } catch (e) {
      await this.note("banshee", `fix failed to apply: ${(e as Error).message}; back to awaiting approval`)
      this.state = { ...this.state, step: "awaiting_approval", fix: { action: fix.action, service: fix.service, target: fix.target } }
      await this.sync()
      return { ok: false, error: (e as Error).message, step: this.state.step }
    }
    this.fixAppliedMs = Date.now()
    await this.note("banshee", `${fixText(fix)} applied on ${fix.service}; waiting for ${RECOVERY_WINDOWS} healthy windows`)
    await this.sync()
    return { ok: true, step: this.state.step }
  }

  /** Spirits push every telemetry window of an affected service while this incident is open. */
  @Interleave
  async window(service: ServiceName, bad: boolean): Promise<{ resolved: boolean }> {
    if (this.state.step === "resolved") return { resolved: true }
    if (this.state.step !== "fixing" || !this.fixAppliedMs) return { resolved: false }
    this.healthy = { ...this.healthy, [service]: bad ? 0 : (this.healthy[service] ?? 0) + 1 }
    const need = this.state.services
    if (need.every((s) => (this.healthy[s] ?? 0) >= RECOVERY_WINDOWS)) {
      await this.resolve()
      return { resolved: true }
    }
    return { resolved: false }
  }

  private async resolve(): Promise<void> {
    if (this.state.step === "resolved") return
    const ns = nsOf(this.id)
    const now = Date.now()
    this.state = { ...this.state, step: "resolved", resolvedAt: now }
    await this.mark("resolved")
    this.alarm.delete()
    const seconds = Math.round((now - this.state.openedAt) / 1000)
    await this.note("banshee", `recovered: ${this.state.services.join(", ")} under thresholds for ${RECOVERY_WINDOWS} windows`)
    const owner = (this.decision?.owner ?? this.state.services[0]) as ServiceName
    const agents = Object.fromEntries(this.state.services.map((s) => [s, { spot: "desk", activity: "incident resolved", mood: "done", clearIncident: true }])) as any
    const orgPatch = { agents, health: { ...Object.fromEntries(this.state.services.map((s) => [s, "ok"])), ...(this.decision?.culprit?.service === "vendor" ? { vendor: "ok" } : {}) } as any, incident: this.state }
    await peer("Office", ns + "org", "update", [orgPatch], () => Office.get(ns + "org").update(orgPatch))
    await peer("IncidentDesk", ns + "org", "closed", [this.state.id], () => IncidentDesk.get(ns + "org").closed(this.state.id))
    const c = this.state.culprit
    if (c && this.decision?.signature && this.state.fix) {
      const mem = { incidentId: this.state.id, signature: this.decision.signature, culprit: c.service, cause: c.cause, fix: fixText(this.state.fix), summary: c.evidence[1] ?? c.evidence[0] ?? "" }
      await peer("ServiceSpirit", ns + owner, "remember", [mem], () => ServiceSpirit.get(ns + owner).remember(mem))
    }
    const text = await this.words("resolved", { from: handle(owner), id: this.state.id, services: this.state.services, seconds })
    await this.say(handle(owner), text)
    const pm = await this.words("postmortem", { state: { ...this.state, timeline: this.state.timeline }, seconds, marks: this.marks })
    this.state = { ...this.state, postmortem: pm }
    await this.sync()
  }

  private async escalate(): Promise<void> {
    const afterMs = Date.now() - this.state.openedAt
    const owner = (this.decision?.owner ?? this.state.services[0]) as ServiceName
    const text = await this.words("escalated", { from: handle(owner), id: this.state.id, afterMs })
    await this.say(handle(owner), text)
    await this.presence({ [owner]: { spot: "oncall_door", activity: "escalated: human needed", mood: "alert" } })
  }

  async getState(): Promise<IncidentState> {
    return this.state
  }
  async debug(): Promise<{ marks: Record<string, number>; narr: Record<string, number>; narrErrors: string[]; decision: Decision | null; round: number }> {
    return { marks: this.marks, narr: this.narr, narrErrors: this.narrErrors, decision: this.decision, round: this.round }
  }
}
