// Banshee contracts. Every lane imports from here; change only with a note in 00-status.md.

export const SERVICES = ["checkout", "payments", "inventory"] as const
export type ServiceName = (typeof SERVICES)[number]
/** Who calls whom. vendor = fake card processor (external). */
export const CALLS: Record<ServiceName, (ServiceName | "vendor")[]> = {
  checkout: ["payments", "inventory"],
  payments: ["vendor"],
  inventory: [],
}

/** Service middleware → its ServiceSpirit, every 5 s. */
export type Telemetry = {
  service: ServiceName
  ts: number // ms epoch, end of the 5 s window
  requests: number
  errors: number
  p95Ms: number
  /** errors whose cause was a callee response (5xx / timeout), keyed by callee */
  calleeErrors: Partial<Record<ServiceName | "vendor", number>>
  /** last error lines, max 5 */
  sampleErrors: string[]
  version: string // git short sha currently running
}

/** Deploy script / config / vendor watcher → ServiceSpirit. */
export type ChangeEvent = {
  service: ServiceName
  ts: number
  kind: "deploy" | "config" | "vendor"
  from?: string
  to?: string
  diff?: string // unified diff, trimmed to 4 kB
  note?: string
}

export type IncidentStep =
  | "detected"
  | "investigating"
  | "root_cause"
  | "awaiting_approval"
  | "fixing"
  | "resolved"

export type FixAction = "rollback" | "fallback_on" | "cache_on"

export type TimelineEntry = { ts: number; who: string; text: string }

/** Emittable state of the Incident actor; war room, phones and office render it. */
export type IncidentState = {
  id: string // "inc-1"
  step: IncidentStep
  openedAt: number
  services: ServiceName[]
  timeline: TimelineEntry[]
  culprit?: { service: ServiceName | "vendor"; cause: string; evidence: string[]; ourCode: boolean }
  fix?: { action: FixAction; service: ServiceName; target?: string; approvedBy?: string; rejected?: boolean }
  recalledFrom?: string // id of a past incident the spirit remembered
  resolvedAt?: number
  postmortem?: string
  relayChannel: string // "inc-1"
}

/** Where an agent stands in the isometric office, and what it is doing. */
export type OfficeSpot =
  | "desk" // own desk, idle / watching its graphs
  | "server_room" // its rack: reading its own logs and metrics
  | "war_room" // incident table with the other agents
  | "deploy_console" // reading deploy history / rolling back
  | "vendor_phone" // checking the external card processor
  | "archive" // reading past incidents (memory)
  | "oncall_door" // waiting for the human's approval

export type AgentPresence = {
  agent: `spirit-${ServiceName}`
  spot: OfficeSpot
  activity: string // short, e.g. "reading error logs"
  mood: "calm" | "alert" | "busy" | "done"
  incidentId?: string
  ts: number
}

/** Emittable state of the Office actor (one per org): the scene the 3D office renders. */
export type OfficeState = {
  health: Record<ServiceName | "vendor", "ok" | "degraded" | "down">
  agents: Record<ServiceName, AgentPresence>
  openIncidents: string[]
  ordersPerMin: number
  /** latest relay messages for speech bubbles, newest last, max 20 */
  chatter: { ts: number; from: string; to?: string; channel: string; text: string }[]
}

/** Relay naming conventions. */
export const relay = {
  agentName: (s: ServiceName) => `spirit-${s}` as const,
  channel: (incidentId: string) => incidentId,
  oncall: "oncall-joel",
} as const

/** Chaos buttons judges press on their phones. */
export type ChaosKind = "bad_deploy" | "vendor_down" | "slow_inventory"

// ---- additions by lane B (actors) ----

/** What the Office actor emits as two Emittable fields, `office` and `incidents`. The browser socket to Office "org" receives both. */
export type OfficeSnapshot = {
  office: OfficeState
  /** IncidentState of recent incidents (last 6), keyed by id. Open ones are listed in office.openIncidents. */
  incidents: Record<string, IncidentState>
}

/** Body of POST /api/ingest (x-banshee-token header): exactly one of the two keys. */
export type IngestBody = { telemetry?: Telemetry; change?: ChangeEvent }
