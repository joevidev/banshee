/// <reference types="node" />
import { Actor, Persisted } from "terse-sdk/actor"
import type { ServiceName } from "./contracts.js"
import { Incident } from "./incident.js"
import { envNum, nsOf, type AnomalyReport } from "./types.js"
import { peer } from "./peer.js"

type OpenRef = { id: string; lastReportMs: number }

/** Singleton "org". No @Interleave: its one-call-at-a-time mailbox serialises open-or-join. */
export class IncidentDesk extends Actor {
  @Persisted counter = 0
  @Persisted open: OpenRef[] = []

  async report(service: ServiceName, anomaly: AnomalyReport): Promise<string> {
    const ns = nsOf(this.id)
    const now = Date.now()
    const joinMs = envNum("JOIN_WINDOW_MS", 20_000)
    const cur = [...this.open].reverse().find((o) => now - o.lastReportMs <= joinMs)
    if (cur) {
      this.open = this.open.map((o) => (o.id === cur.id ? { ...o, lastReportMs: now } : o))
      await peer("Incident", ns + cur.id, "join", [service, anomaly], () => Incident.get(ns + cur.id).join(service, anomaly))
      return cur.id
    }
    this.counter += 1
    const id = `inc-${this.counter}`
    this.open = [...this.open, { id, lastReportMs: now }]
    await peer("Incident", ns + id, "open", [id, service, anomaly], () => Incident.get(ns + id).open(id, service, anomaly))
    return id
  }

  async closed(incidentId: string): Promise<void> {
    this.open = this.open.filter((o) => o.id !== incidentId)
  }

  async state(): Promise<{ counter: number; open: string[] }> {
    return { counter: this.counter, open: this.open.map((o) => o.id) }
  }
}
