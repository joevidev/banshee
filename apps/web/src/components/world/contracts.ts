// Shared names for the /world UI. Every piece is a client component that reads live data itself with the hooks in
// "@/lib/office/client" (useOffice, useIncident, useLatestIncident, useConnection, useNow), inside <OfficeProvider>.
import type { ServiceName } from "@banshee/contracts"

export type SelectedAgent = ServiceName | null

/** Cross-component events through window CustomEvents, so pieces built in parallel stay decoupled. */
export const WORLD_EVENTS = {
  /** detail: { service: ServiceName }  (a ghost or its desk was clicked in the 3D scene) */
  selectAgent: "bn:select-agent",
  /** detail: {}  (the kanban board object in the 3D scene was clicked) */
  openBoard: "bn:open-board",
  /** detail: { service: ServiceName, x: number, y: number }  focus request, the scene moves the camera to that agent */
  focusAgent: "bn:focus-agent",
} as const

export function emit<T>(name: string, detail: T) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}
