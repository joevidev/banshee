import { Actor, Emittable, Persisted } from "terse-sdk/actor"
import { SERVICES, type AgentPresence, type IncidentState, type OfficeState, type ServiceName } from "./contracts.js"
import type { ChatLine } from "./types.js"

const initial = (): OfficeState => ({
  health: { checkout: "ok", payments: "ok", inventory: "ok", vendor: "ok" },
  agents: Object.fromEntries(
    SERVICES.map((s) => [s, { agent: `spirit-${s}`, spot: "desk", activity: "watching its graphs", mood: "calm", ts: Date.now() } satisfies AgentPresence]),
  ) as OfficeState["agents"],
  openIncidents: [],
  ordersPerMin: 0,
  chatter: [],
})

export type OfficePatch = {
  agents?: Partial<Record<ServiceName, { spot?: AgentPresence["spot"]; activity?: string; mood?: AgentPresence["mood"]; incidentId?: string; clearIncident?: boolean }>>
  health?: Partial<OfficeState["health"]>
  ordersPerMin?: number
  chatter?: ChatLine[]
  incident?: IncidentState
}

/**
 * The scene. One per org ("org"). Browsers open a socket to this actor and receive two Emittable
 * fields: `office` (OfficeState) and `incidents` (recent IncidentState by id). Never calls other actors.
 */
export class Office extends Actor {
  @Persisted @Emittable office: OfficeState = initial()
  @Persisted @Emittable incidents: Record<string, IncidentState> = {}
  /** Relay agent tokens (not emitted). Tokens are shown once by Relay, so they must be kept. */
  @Persisted relayTokens: Record<string, string> = {}

  async update(p: OfficePatch): Promise<void> {
    const o = this.office
    const now = Date.now()
    let agents = o.agents
    if (p.agents) {
      agents = { ...o.agents }
      for (const [s, patch] of Object.entries(p.agents) as [ServiceName, NonNullable<OfficePatch["agents"]>[ServiceName]][]) {
        if (!patch) continue
        const cur = agents[s]
        const next: AgentPresence = { ...cur, spot: patch.spot ?? cur.spot, activity: patch.activity ?? cur.activity, mood: patch.mood ?? cur.mood, ts: now }
        if (patch.incidentId) next.incidentId = patch.incidentId
        if (patch.clearIncident) delete next.incidentId
        agents[s] = next
      }
    }
    let incidents = this.incidents
    let openIncidents = o.openIncidents
    if (p.incident) {
      if (p.incident.step === "resolved") {
        // everybody who was pulled into this incident goes back to their desk
        agents = { ...agents }
        for (const [k, a] of Object.entries(agents) as [ServiceName, AgentPresence][]) {
          if (a.incidentId === p.incident.id) {
            const { incidentId: _gone, ...rest } = a
            void _gone
            agents[k] = { ...rest, spot: "desk", activity: "incident resolved", mood: "done", ts: now }
          }
        }
      }
      incidents = { ...incidents, [p.incident.id]: p.incident }
      const ids = Object.keys(incidents).sort((a, b) => incidents[a].openedAt - incidents[b].openedAt)
      for (const old of ids.slice(0, Math.max(0, ids.length - 6))) delete incidents[old]
      openIncidents = Object.values(incidents).filter((i) => i.step !== "resolved").sort((a, b) => a.openedAt - b.openedAt).map((i) => i.id)
      this.incidents = incidents
    }
    this.office = {
      health: { ...o.health, ...(p.health ?? {}) },
      agents,
      openIncidents,
      ordersPerMin: p.ordersPerMin ?? o.ordersPerMin,
      chatter: p.chatter ? [...o.chatter, ...p.chatter].slice(-20) : o.chatter,
    }
  }

  async snapshot(): Promise<{ office: OfficeState; incidents: Record<string, IncidentState> }> {
    return { office: this.office, incidents: this.incidents }
  }

  async getRelayTokens(): Promise<Record<string, string>> {
    return this.relayTokens
  }
  async setRelayToken(name: string, token: string): Promise<void> {
    this.relayTokens = { ...this.relayTokens, [name]: token }
  }
}
