// Walking logic shared by the 3D ghosts: same corridor waypoints as the old office Agent (components/office/layout.ts).
import type { OfficeSpot, ServiceName } from "@banshee/contracts"
import { route, slotFor, type Slot, type XZ } from "../../office/layout"

export const SPEED = 3 // world units / s
/** Heading (atan2(x, z)) towards the isometric camera, which looks from +x +z. */
export const CAM_HEADING = Math.PI / 4
export const BUBBLE_MS = 6000

export type Motion = { pos: XZ; path: XZ[]; slot?: Slot; spot?: OfficeSpot; heading: number; face: XZ; walkT: number }

export function initMotion(service: ServiceName, spot: OfficeSpot): Motion {
  const target = slotFor(service, spot)
  return { pos: [...target.pos], path: [], slot: target, spot, heading: Math.atan2(target.face[0] - target.pos[0], target.face[1] - target.pos[1]), face: target.face, walkT: 0 }
}

/** Mutates m so it walks to the slot of `spot` (no-op when already there). */
export function retarget(m: Motion, service: ServiceName, spot: OfficeSpot) {
  if (m.spot === spot) return
  const target = slotFor(service, spot)
  const fromSlot = m.path.length === 0 ? m.slot : undefined
  m.path = route(m.pos, fromSlot, target)
  m.slot = target
  m.spot = spot
  m.face = target.face
}

/** Advances m by dt seconds; returns whether it is walking. */
export function step(m: Motion, dt: number): boolean {
  const d = Math.min(dt, 0.05)
  let walking = false
  let desired = m.heading
  if (m.path.length) {
    walking = true
    let left = SPEED * d
    while (left > 0 && m.path.length) {
      const [tx, tz] = m.path[0]
      const dx = tx - m.pos[0]
      const dz = tz - m.pos[1]
      const dist = Math.hypot(dx, dz)
      if (dist <= left) {
        m.pos = [tx, tz]
        m.path.shift()
        left -= dist
      } else {
        m.pos = [m.pos[0] + (dx / dist) * left, m.pos[1] + (dz / dist) * left]
        desired = Math.atan2(dx, dz)
        left = 0
      }
    }
  }
  if (!m.path.length) {
    // face the task, but turn up to ~60 degrees towards the isometric camera so the face stays readable
    const faceH = Math.atan2(m.face[0] - m.pos[0], m.face[1] - m.pos[1])
    const toCam = Math.atan2(Math.sin(CAM_HEADING - faceH), Math.cos(CAM_HEADING - faceH))
    desired = faceH + Math.max(-1.1, Math.min(1.1, toCam * 0.5))
  }
  let diff = desired - m.heading
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  m.heading += diff * Math.min(1, d * 10)
  if (walking) m.walkT += d
  return walking
}
