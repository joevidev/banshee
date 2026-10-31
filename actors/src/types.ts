/// <reference types="node" />
import type { IncidentState, ServiceName, FixAction } from "./contracts.js"

/** A spirit's description of the anomaly it saw (what it reports to the IncidentDesk). */
export type AnomalyReport = {
  service: ServiceName
  /** start of the first bad 5 s window (ms epoch) */
  changePointTs: number
  /** end of the first bad window */
  firstBadEnd: number
  windows: number
  kind: "errors" | "latency"
  errorRate: number
  p95Ms: number
  baselineErrorRate: number
  baselineP95Ms: number
  calleeErrors: Record<string, number>
  sampleErrors: string[]
  version: string
}

export type LocalCause = {
  kind: "deploy" | "config" | "vendor" | "self"
  ts: number
  from?: string
  to?: string
  /** one deterministic line describing the diff / cause */
  summary: string
  diff?: string
  note?: string
}

export type Inherited = { callee: string; count: number }

/** Everything a spirit knows about its own anomaly. The model is fed only this. */
export type SpiritEvidence = {
  service: ServiceName
  hasAnomaly: boolean
  anomaly?: AnomalyReport
  localCause?: LocalCause
  inherited?: Inherited
  recentChanges: { ts: number; kind: string; from?: string; to?: string; note?: string }[]
  version: string
  lastTelemetryTs: number
}

export type MemoryEntry = {
  found: boolean
  incidentId?: string
  signature?: string
  culprit?: string
  cause?: string
  fix?: string
  summary?: string
  ts?: number
}

export type Decision = {
  culprit?: NonNullable<IncidentState["culprit"]>
  fix?: NonNullable<IncidentState["fix"]>
  /** culprit's service for memory signature purposes */
  signature?: string
  owner?: ServiceName
  changePointTs?: number
  reason: string
}

export type ApproveResult = { ok: boolean; error?: string; step?: IncidentState["step"] }
export type FixPayload = { action: FixAction; service: ServiceName; target?: string }

export type ChatLine = { ts: number; from: string; to?: string; channel: string; text: string }

export const nsOf = (id: string): string => (id.includes(".") ? id.slice(0, id.lastIndexOf(".") + 1) : "")
export const serviceOf = (id: string): ServiceName => id.slice(id.lastIndexOf(".") + 1) as ServiceName
export const envNum = (name: string, dflt: number): number => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== "" ? v : dflt
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
export const hhmmss = (ts: number) => new Date(ts).toISOString().slice(11, 19)
