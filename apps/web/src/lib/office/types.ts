import type { IncidentState, OfficeState } from "@banshee/contracts"

/** Chaos buttons on the phone. Not in @banshee/contracts yet (requested). */
export type ChaosKind = "bad_deploy" | "vendor_down" | "slow_inventory"

export const CHAOS_KINDS: ChaosKind[] = ["bad_deploy", "vendor_down", "slow_inventory"]

/** Everything the screens render: the Office actor state plus the Incident actors it references. */
export type Snapshot = {
  office: OfficeState
  incidents: Record<string, IncidentState>
  /** server clock at send time, used to correct client clock skew */
  serverNow: number
}

export type SourceKind = "mock" | "live"

export type ConnectionStatus = "connecting" | "open" | "closed"

/** A data source the UI subscribes to. Two implementations: mock (SSE from the in-process mock engine) and live (Terse actor WebSocket). */
export interface OfficeSource {
  readonly kind: SourceKind
  start(onSnapshot: (s: Snapshot) => void, onStatus: (s: ConnectionStatus) => void): () => void
}

export type ChaosResponse = { ok: boolean; incidentId?: string; error?: string }
export type ApproveResponse = { ok: boolean; error?: string }
