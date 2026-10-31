// Deterministic culprit and fix selection (plan sec. 4). The model never runs here.
import type { ServiceName } from "./contracts.js"
import type { Decision, SpiritEvidence } from "./types.js"

export function decide(evidences: SpiritEvidence[]): Decision {
  const cands = evidences
    .filter((e) => e.hasAnomaly && e.anomaly && e.localCause)
    .sort((a, b) => a.anomaly!.changePointTs - b.anomaly!.changePointTs)
  if (!cands.length) return { reason: "no spirit found a local cause" }
  // earliest change-point with a local cause; ties go to the service nobody inherits from last (deploy beats config beats vendor beats self)
  const rank = { deploy: 0, config: 1, vendor: 2, self: 3 } as const
  const first = cands[0].anomaly!.changePointTs
  const tied = cands.filter((e) => e.anomaly!.changePointTs - first < 1000)
  tied.sort((a, b) => rank[a.localCause!.kind] - rank[b.localCause!.kind])
  const e = tied[0]
  const lc = e.localCause!
  const s = e.service
  if (lc.kind === "vendor") {
    return {
      culprit: { service: "vendor", cause: "card processor returning errors (upstream vendor outage)", ourCode: false, evidence: [lc.summary, `${s} error rate ${pct(e.anomaly!.errorRate)} from ${hhmm(e.anomaly!.changePointTs)}`, ...e.anomaly!.sampleErrors.slice(-1)] },
      fix: { action: "fallback_on", service: "payments" },
      signature: "vendor:vendor",
      owner: "payments",
      changePointTs: e.anomaly!.changePointTs,
      reason: "vendor errors without a deploy or config change",
    }
  }
  if (lc.kind === "deploy") {
    return {
      culprit: { service: s, cause: `bad deploy ${lc.from ?? "?"} -> ${lc.to ?? "?"}`, ourCode: true, evidence: [`deploy ${lc.from}->${lc.to} at ${hhmm(lc.ts)}`, lc.summary, ...e.anomaly!.sampleErrors.slice(-1)] },
      fix: lc.from ? { action: "rollback", service: s, target: lc.from } : undefined,
      signature: `${s}:deploy`,
      owner: s,
      changePointTs: e.anomaly!.changePointTs,
      reason: "deploy in the 60 s before the earliest change-point",
    }
  }
  if (lc.kind === "config") {
    return {
      culprit: { service: s, cause: `config change: ${lc.note ?? "unknown"}`, ourCode: true, evidence: [lc.summary, ...e.anomaly!.sampleErrors.slice(-1)] },
      signature: `${s}:config`,
      owner: s,
      changePointTs: e.anomaly!.changePointTs,
      reason: "config change in the 60 s before the earliest change-point",
    }
  }
  // self: no change anywhere
  const fixFor: Partial<Record<ServiceName, "cache_on">> = { inventory: "cache_on" }
  const a = e.anomaly!
  return {
    culprit: {
      service: s,
      cause: a.kind === "latency" ? `latency spike with no deploy or config change (p95 ${a.p95Ms} ms vs baseline ${Math.round(a.baselineP95Ms)} ms)` : "error spike with no deploy or config change",
      ourCode: true,
      evidence: [lc.summary, `p95 ${a.p95Ms} ms, baseline ${Math.round(a.baselineP95Ms)} ms`, `no deploy or config change on any involved service`],
    },
    fix: fixFor[s] ? { action: fixFor[s]!, service: s } : undefined,
    signature: `${s}:self`,
    owner: s,
    changePointTs: a.changePointTs,
    reason: "earliest change-point, no change event anywhere",
  }
}

const pct = (r: number) => `${Math.round(r * 100)}%`
const hhmm = (ts: number) => new Date(ts).toISOString().slice(11, 19)
