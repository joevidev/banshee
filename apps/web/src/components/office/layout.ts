import type { OfficeSpot, ServiceName } from "@banshee/contracts"

// Floor plan in world units (x right, z towards the camera). Floor spans x [-11, 11], z [-8, 8].
// The camera looks from +x +z, so back walls are z = -8 and x = -11.

export type XZ = [number, number]
export type Slot = { pos: XZ; face: XZ; via?: XZ[] }

export const FLOOR = { minX: -11, maxX: 11, minZ: -8, maxZ: 6.2 }
/** Main aisle every walk passes through. */
export const CORRIDOR_Z = 1.1

export const DESKS: Record<ServiceName, XZ> = { checkout: [-5.5, 3.6], payments: [-1.5, 3.6], inventory: [2.5, 3.6] }
export const RACKS: Record<ServiceName, XZ> = { checkout: [-9.6, -7.1], payments: [-7.7, -7.1], inventory: [-5.8, -7.1] }
export const SERVER_ROOM = { minX: -11, maxX: -4.4, minZ: -8, maxZ: -3.6 }
export const WAR_TABLE: XZ = [3.6, -2.6]
export const DEPLOY_CONSOLE: XZ = [-10.45, -0.4]
export const ARCHIVE: XZ = [-1.6, -7.55]
export const PHONE_BOOTH: XZ = [6.6, -7.0]
export const ONCALL_DOOR: XZ = [9.6, -7.95]
export const VENDOR_BOX: XZ = [14.2, -4.6]

const order: ServiceName[] = ["checkout", "payments", "inventory"]
const i = (s: ServiceName) => order.indexOf(s)

export function slotFor(s: ServiceName, spot: OfficeSpot): Slot {
  switch (spot) {
    case "desk": {
      const [x, z] = DESKS[s]
      return { pos: [x, z + 1.15], face: [x, z], via: [[x + 1.7, CORRIDOR_Z], [x + 1.7, z + 1.15]] }
    }
    case "server_room": {
      const [x, z] = RACKS[s]
      return { pos: [x, z + 1.55], face: [x, z] }
    }
    case "war_room": {
      const [x, z] = WAR_TABLE
      const seats: Slot[] = [
        { pos: [x - 1.25, z + 1.35], face: [x - 0.6, z] },
        { pos: [x + 1.25, z + 1.35], face: [x + 0.6, z] },
        { pos: [x, z - 1.4], face: [x, z], via: [[x + 2.9, CORRIDOR_Z], [x + 2.9, z - 1.4]] },
      ]
      return seats[i(s)]
    }
    case "deploy_console": {
      const [x, z] = DEPLOY_CONSOLE
      const dz = (i(s) - 1) * 0.95
      return { pos: [x + 1.25, z + dz], face: [x, z + dz] }
    }
    case "archive": {
      const [x, z] = ARCHIVE
      const dx = (i(s) - 1) * 1.05
      return { pos: [x + dx, z + 1.3], face: [x + dx, z] }
    }
    case "vendor_phone": {
      const [x, z] = PHONE_BOOTH
      const dx = [-0.95, 0, 0.95][i(s)]
      return { pos: [x + dx, z + 1.35], face: [x, z] }
    }
    case "oncall_door": {
      const [x, z] = ONCALL_DOOR
      const dx = [-0.85, 0, 0.85][i(s)]
      return { pos: [x + dx, z + 1.3], face: [x, z] }
    }
  }
}

/** Waypoints from a point (usually the current slot) to a slot, through the corridor. */
export function route(from: XZ, fromSlot: Slot | undefined, to: Slot): XZ[] {
  const pts: XZ[] = []
  const exit = fromSlot?.via ? [...fromSlot.via].reverse() : []
  pts.push(...exit)
  const last = pts.length ? pts[pts.length - 1] : from
  if (Math.abs(last[1] - CORRIDOR_Z) > 0.05) pts.push([last[0], CORRIDOR_Z])
  const entry = to.via ?? []
  const first = entry.length ? entry[0] : to.pos
  pts.push([first[0], CORRIDOR_Z])
  pts.push(...entry, to.pos)
  // drop consecutive duplicates
  return pts.filter((p, k) => k === 0 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 0.01)
}
