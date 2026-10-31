"use client"
// Board data: every incident of the current snapshot (newest first), capped to the latest MAX.
import type { IncidentState, IncidentStep } from "@banshee/contracts"
import { useAllIncidents } from "@/lib/office/client"

export const COLUMNS = ["Detect", "Triage", "Cause", "Approve", "Fix", "Done"] as const
export type Column = (typeof COLUMNS)[number]

export const STEP_COLUMN: Record<IncidentStep, Column> = {
  detected: "Detect",
  investigating: "Triage",
  root_cause: "Cause",
  awaiting_approval: "Approve",
  fixing: "Fix",
  resolved: "Done",
}

const MAX = 12

export function useBoardIncidents(): IncidentState[] {
  return useAllIncidents().slice(0, MAX)
}

export function useBoardCounts(): Record<Column, number> {
  const list = useBoardIncidents()
  const out = { Detect: 0, Triage: 0, Cause: 0, Approve: 0, Fix: 0, Done: 0 } as Record<Column, number>
  for (const i of list) out[STEP_COLUMN[i.step]]++
  return out
}

export const isBroken = (i: IncidentState) => !!i.culprit && (i.culprit.ourCode || i.culprit.service === "vendor")
export const leadService = (i: IncidentState) => (i.culprit && i.culprit.service !== "vendor" ? i.culprit.service : i.services[0])

export function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
