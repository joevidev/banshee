/// <reference types="node" />
import { Actor, Interleave, Persisted, type ActorContext } from "terse-sdk/actor"
import { CALLS, type ChangeEvent, type ServiceName, type Telemetry } from "./contracts.js"
import { isAnomalous, localCauseFor, WINDOW_MS, type Baseline, type ChangeRow } from "./detect.js"
import { narrate } from "./narrate.js"
import { Office } from "./office.js"
import { IncidentDesk } from "./desk.js"
import { Incident } from "./incident.js"
import { envNum, nsOf, serviceOf, type AnomalyReport, type MemoryEntry, type SpiritEvidence } from "./types.js"
import { peer } from "./peer.js"

type Run = {
  startTs: number
  firstEnd: number
  windows: number
  requests: number
  errors: number
  maxP95: number
  kind: "errors" | "latency"
  baselineErrorRate: number
  baselineP95Ms: number
  calleeErrors: Record<string, number>
  sampleErrors: string[]
  version: string
}

const deadmanMs = () => envNum("DEADMAN_MS", 30_000)

/** One per service (actor id = service name, or "<ns>.<service>" in tests). */
export class ServiceSpirit extends Actor {
  @Persisted lastIngestMs = 0
  @Persisted lastTelemetryTs = 0
  @Persisted version = ""
  @Persisted badRun = 0
  @Persisted run: Run | null = null
  /** incident this spirit has reported into and still follows ("" = none) */
  @Persisted episodeIncident = ""
  /** the one change event that is our own approved fix (so it is not mistaken for a cause); until = expiry ms */
  @Persisted expectedFix: { kind: string; to: string; until: number } | null = null
  @Persisted down = false
  @Persisted deadSince = 0
  @Persisted ingested = 0

  constructor(context: ActorContext) {
    super(context)
    this.db.exec("CREATE TABLE IF NOT EXISTS windows (ts INTEGER PRIMARY KEY, requests INTEGER, errors INTEGER, p95 INTEGER, callee TEXT, samples TEXT, version TEXT, bad INTEGER)")
    this.db.exec("CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, fromv TEXT, tov TEXT, diff TEXT, note TEXT, fix INTEGER)")
    this.db.exec("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, signature TEXT, culprit TEXT, cause TEXT, fix TEXT, summary TEXT, ts INTEGER)")
  }

  private async baseline(): Promise<Baseline> {
    const rows = this.db.exec("SELECT requests, errors, p95 FROM windows WHERE bad = 0 AND requests > 0 ORDER BY ts DESC LIMIT 12") as { requests: number; errors: number; p95: number }[]
    if (!rows.length) return { errorRate: 0, p95Ms: 0, n: 0 }
    const er = rows.reduce((s, r) => s + r.errors / r.requests, 0) / rows.length
    const p95 = rows.reduce((s, r) => s + r.p95, 0) / rows.length
    return { errorRate: er, p95Ms: p95, n: rows.length }
  }

  private async changes(): Promise<ChangeRow[]> {
    const rows = this.db.exec("SELECT ts, kind, fromv, tov, diff, note, fix FROM changes ORDER BY ts DESC LIMIT 20") as any[]
    return rows.map((r) => ({ ts: r.ts, kind: r.kind, from: r.fromv ?? undefined, to: r.tov ?? undefined, diff: r.diff ?? undefined, note: r.note ?? undefined, fix: !!r.fix }))
  }

  /** Middleware push, every 5 s. Anomaly check runs here; healthy services cost one SQLite insert. */
  @Interleave
  async ingestTelemetry(t: Telemetry): Promise<{ bad: boolean; badRun: number; reportedIncident: string }> {
    const now = Date.now()
    const svc = serviceOf(this.id)
    this.lastIngestMs = now
    this.alarm.set(now + deadmanMs()) // dead-man: re-arm the single alarm on every ingest
    this.lastTelemetryTs = t.ts
    this.version = t.version
    this.ingested += 1
    const wasDown = this.down
    if (wasDown) {
      this.down = false
      this.deadSince = 0
    }

    const base = await this.baseline()
    const { bad, kind } = isAnomalous(t, base)
    this.db.exec("INSERT OR REPLACE INTO windows (ts, requests, errors, p95, callee, samples, version, bad) VALUES (?,?,?,?,?,?,?,?)", t.ts, t.requests, t.errors, t.p95Ms, JSON.stringify(t.calleeErrors), JSON.stringify(t.sampleErrors), t.version, bad ? 1 : 0)
    this.db.exec("DELETE FROM windows WHERE ts < ?", t.ts - 200 * WINDOW_MS)

    if (bad) {
      const cur = this.badRun > 0 ? this.run : null
      const callee: Record<string, number> = { ...(cur?.calleeErrors ?? {}) }
      for (const [k, v] of Object.entries(t.calleeErrors)) callee[k] = (callee[k] ?? 0) + (v ?? 0)
      this.run = {
        startTs: cur?.startTs ?? t.ts - WINDOW_MS,
        firstEnd: cur?.firstEnd ?? t.ts,
        windows: (cur?.windows ?? 0) + 1,
        requests: (cur?.requests ?? 0) + t.requests,
        errors: (cur?.errors ?? 0) + t.errors,
        maxP95: Math.max(cur?.maxP95 ?? 0, t.p95Ms),
        kind: cur?.kind ?? kind,
        baselineErrorRate: cur?.baselineErrorRate ?? base.errorRate,
        baselineP95Ms: cur?.baselineP95Ms ?? base.p95Ms,
        calleeErrors: callee,
        sampleErrors: [...(cur?.sampleErrors ?? []), ...t.sampleErrors].slice(-5),
        version: t.version,
      }
      this.badRun += 1
    } else {
      this.badRun = 0
    }

    // scene: health, orders, presence
    const health: Record<string, "ok" | "degraded" | "down"> = { [svc]: bad ? "degraded" : "ok" }
    const patch: Parameters<Office["update"]>[0] = { health }
    if (svc === "checkout") patch.ordersPerMin = Math.round(((t.requests - t.errors) * 60_000) / WINDOW_MS)
    if (svc === "payments") {
      const v = t.calleeErrors["vendor"] ?? 0
      health["vendor"] = t.requests > 0 && v / t.requests > 0.5 ? "down" : v > 0 ? "degraded" : "ok"
    }
    if (wasDown || (bad && this.badRun === 1)) patch.agents = { [svc]: { spot: bad ? "server_room" : "desk", activity: bad ? "reading my error logs" : "watching its graphs", mood: bad ? "alert" : "calm" } }
    await peer("Office", nsOf(this.id) + "org", "update", [patch], () => Office.get(nsOf(this.id) + "org").update(patch))

    // follow the open incident: every window is evidence for its recovery check
    if (this.episodeIncident) {
      try {
        const incId = nsOf(this.id) + this.episodeIncident
        const r = await peer("Incident", incId, "window", [svc, bad], () => Incident.get(incId).window(svc, bad))
        if (r.resolved) this.episodeIncident = ""
      } catch (e) {
        console.error(`[spirit-${svc}] incident window failed: ${(e as Error).message}`)
      }
    }

    // confirmed anomaly: 2 consecutive bad windows -> report once per episode
    let reported = ""
    if (!this.episodeIncident && this.badRun >= 2 && this.run) {
      const r = this.run
      const anomaly: AnomalyReport = {
        service: svc,
        changePointTs: r.startTs,
        firstBadEnd: r.firstEnd,
        windows: r.windows,
        kind: r.kind,
        errorRate: r.requests ? r.errors / r.requests : 0,
        p95Ms: r.maxP95,
        baselineErrorRate: r.baselineErrorRate,
        baselineP95Ms: r.baselineP95Ms,
        calleeErrors: r.calleeErrors,
        sampleErrors: r.sampleErrors,
        version: r.version,
      }
      const deskId = nsOf(this.id) + "org"
      reported = await peer("IncidentDesk", deskId, "report", [svc, anomaly], () => IncidentDesk.get(deskId).report(svc, anomaly))
      this.episodeIncident = reported
    }
    return { bad, badRun: this.badRun, reportedIncident: reported || this.episodeIncident }
  }

  async ingestChange(c: ChangeEvent): Promise<void> {
    const ef = this.expectedFix
    const isFix = !!ef && Date.now() < ef.until && ef.kind === c.kind && (!ef.to || ef.to === c.to)
    if (isFix) this.expectedFix = null
    this.db.exec("INSERT INTO changes (ts, kind, fromv, tov, diff, note, fix) VALUES (?,?,?,?,?,?,?)", c.ts, c.kind, c.from ?? null, c.to ?? null, c.diff ?? null, c.note ?? null, isFix ? 1 : 0)
    if (c.to) this.version = c.to
  }

  /** The incident is about to apply a fix on this service: the next matching change event (deploy to `to`, or a config change) is our own fix, not a cause. */
  async expectFix(kind: "deploy" | "config", to?: string): Promise<void> {
    this.expectedFix = { kind, to: to ?? "", until: Date.now() + 30_000 }
  }

  /** The incident adopts this spirit (it had an anomaly but did not report first). */
  async attach(incidentId: string): Promise<void> {
    if (!this.episodeIncident) this.episodeIncident = incidentId
  }

  /** Local evidence per plan section 4. Pure read. */
  async evidence(): Promise<SpiritEvidence> {
    const svc = serviceOf(this.id)
    const changes = await this.changes()
    const recentChanges = changes.filter((c) => !c.fix).slice(0, 5).map((c) => ({ ts: c.ts, kind: c.kind, from: c.from, to: c.to, note: c.note }))
    const ev: SpiritEvidence = { service: svc, hasAnomaly: false, recentChanges, version: this.version, lastTelemetryTs: this.lastTelemetryTs }
    const r = this.run
    if (!r || this.badRun === 0) return ev // only a currently running anomaly counts as evidence
    const { local, inherited } = localCauseFor(r, changes)
    ev.hasAnomaly = true
    ev.anomaly = {
      service: svc, changePointTs: r.startTs, firstBadEnd: r.firstEnd, windows: r.windows, kind: r.kind,
      errorRate: r.requests ? r.errors / r.requests : 0, p95Ms: r.maxP95, baselineErrorRate: r.baselineErrorRate, baselineP95Ms: r.baselineP95Ms,
      calleeErrors: r.calleeErrors, sampleErrors: r.sampleErrors, version: r.version,
    }
    if (local) ev.localCause = local
    if (inherited) ev.inherited = inherited
    return ev
  }

  /** Another agent asks this spirit a question during an incident; it answers from its own evidence only. */
  @Interleave
  async ask(from: string, question: string): Promise<{ from: string; text: string; source: string; evidence: SpiritEvidence }> {
    const evidence = await this.evidence()
    const n = await narrate("answer", { from: `spirit-${serviceOf(this.id)}`, to: from.replace(/^spirit-/, ""), question, evidence })
    return { from: `spirit-${serviceOf(this.id)}`, text: n.text, source: n.source, evidence }
  }

  async recall(signature: string): Promise<MemoryEntry> {
    const rows = this.db.exec("SELECT incident_id, signature, culprit, cause, fix, summary, ts FROM memory WHERE signature = ? ORDER BY id DESC LIMIT 1", signature) as any[]
    if (!rows.length) return { found: false }
    const r = rows[0]
    return { found: true, incidentId: r.incident_id, signature: r.signature, culprit: r.culprit, cause: r.cause, fix: r.fix, summary: r.summary, ts: r.ts }
  }

  async remember(e: { incidentId: string; signature: string; culprit: string; cause: string; fix: string; summary: string }): Promise<void> {
    // the incident that explained the earlier changes is over: they are no longer candidates for the next fault
    this.db.exec("UPDATE changes SET fix = 1 WHERE fix = 0")
    this.db.exec("INSERT INTO memory (incident_id, signature, culprit, cause, fix, summary, ts) VALUES (?,?,?,?,?,?,?)", e.incidentId, e.signature, e.culprit, e.cause, e.fix, e.summary, Date.now())
  }

  async status(): Promise<{ service: ServiceName; down: boolean; badRun: number; episodeIncident: string; lastIngestMs: number; ingested: number; version: string; memories: number }> {
    const m = this.db.exec("SELECT COUNT(*) AS n FROM memory") as { n: number }[]
    return { service: serviceOf(this.id), down: this.down, badRun: this.badRun, episodeIncident: this.episodeIncident, lastIngestMs: this.lastIngestMs, ingested: this.ingested, version: this.version, memories: m[0]?.n ?? 0 }
  }

  /** Dead-man's switch: fires deadmanMs after the last telemetry. */
  @Interleave
  async onAlarm(): Promise<void> {
    const silent = Date.now() - this.lastIngestMs
    if (silent < deadmanMs() - 250 || this.down) return
    const svc = serviceOf(this.id)
    this.down = true
    this.deadSince = Date.now()
    const orgId = nsOf(this.id) + "org"
    const downPatch = { health: { [svc]: "down" as const }, agents: { [svc]: { spot: "server_room" as const, activity: "no telemetry: I am down", mood: "alert" as const } } }
    await peer("Office", orgId, "update", [downPatch], () => Office.get(orgId).update(downPatch))
    const n = await narrate("down", { from: `spirit-${svc}`, service: svc, silentMs: silent })
    const chatPatch = { chatter: [{ ts: Date.now(), from: `spirit-${svc}`, channel: "oncall", text: n.text }] }
    await peer("Office", orgId, "update", [chatPatch], () => Office.get(orgId).update(chatPatch))
  }
}
