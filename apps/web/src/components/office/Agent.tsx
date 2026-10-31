"use client"

import type { AgentPresence, OfficeSpot, OfficeState, ServiceName } from "@banshee/contracts"
import { Edges, Html, Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { useNow } from "@/lib/office/client"
import * as THREE from "three"
import { route, slotFor, type Slot, type XZ } from "./layout"
import { INK, PAPER, RED, useOverlay } from "./primitives"

const SPEED = 3 // units / s
const BUBBLE_MS = 6000

type Chatter = OfficeState["chatter"][number]

type Motion = { pos: XZ; path: XZ[]; slot?: Slot; spot?: OfficeSpot; heading: number; face: XZ; walkT: number }

export function Agent({ service, presence, bubble }: { service: ServiceName; presence: AgentPresence; bubble?: Chatter }) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const motion = useRef<Motion | null>(null)
  const now = useNow()
  const portal = useOverlay()

  // Retarget when the spot changes: build a path through the corridor.
  useEffect(() => {
    const target = slotFor(service, presence.spot)
    const m = motion.current
    if (!m) {
      motion.current = { pos: [...target.pos], path: [], slot: target, spot: presence.spot, heading: Math.atan2(target.face[0] - target.pos[0], target.face[1] - target.pos[1]), face: target.face, walkT: 0 }
      return
    }
    if (m.spot === presence.spot) return
    const fromSlot = m.path.length === 0 ? m.slot : undefined
    m.path = route(m.pos, fromSlot, target)
    m.slot = target
    m.spot = presence.spot
    m.face = target.face
  }, [service, presence.spot])

  const alert = presence.mood === "alert" || presence.mood === "busy"

  useFrame((state, dt) => {
    const m = motion.current
    const g = group.current
    if (!m || !g) return
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
    if (!m.path.length) desired = Math.atan2(m.face[0] - m.pos[0], m.face[1] - m.pos[1])
    // shortest-angle turn
    let diff = desired - m.heading
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    m.heading += diff * Math.min(1, d * 10)
    g.position.set(m.pos[0], 0, m.pos[1])
    g.rotation.y = m.heading
    if (walking) m.walkT += d
    const t = state.clock.elapsedTime
    if (body.current) {
      body.current.position.y = walking ? Math.abs(Math.sin(m.walkT * 9)) * 0.09 : Math.sin(t * 1.6 + service.length) * 0.015
      body.current.rotation.z = walking ? Math.sin(m.walkT * 9) * 0.05 : 0
    }
    if (ring.current && ringMat.current) {
      const s = 1 + 0.12 * Math.sin(t * 4)
      ring.current.scale.set(s, s, s)
      ringMat.current.opacity = 0.35 + 0.25 * Math.sin(t * 4)
    }
  })

  const showBubble = bubble && now > 0 && now - bubble.ts < BUBBLE_MS && now - bubble.ts > -2000
  const self = `spirit-${service}`
  const incoming = bubble && bubble.from !== self

  return (
    <group ref={group}>
      {alert && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[0.52, 0.66, 40]} />
          <meshBasicMaterial ref={ringMat} color={RED} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      )}
      <group ref={body} scale={1.3}>
        {/* body */}
        <mesh position={[0, 0.62, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.6, 6, 16]} />
          <meshStandardMaterial color={PAPER} roughness={0.85} />
          <Outlines thickness={0.045} color={INK} />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <sphereGeometry args={[0.22, 24, 16]} />
          <meshStandardMaterial color={PAPER} roughness={0.85} />
          <Outlines thickness={0.045} color={INK} />
        </mesh>
        {/* eyes: show facing */}
        <mesh position={[-0.075, 1.35, 0.2]}>
          <boxGeometry args={[0.045, 0.07, 0.02]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh position={[0.075, 1.35, 0.2]}>
          <boxGeometry args={[0.045, 0.07, 0.02]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        {/* lanyard badge */}
        <mesh position={[0, 0.85, 0.27]}>
          <boxGeometry args={[0.16, 0.2, 0.02]} />
          <meshStandardMaterial color={PAPER} />
          <Edges color={INK} />
        </mesh>
      </group>
      <Html portal={portal} position={[0, 2.25, 0]} zIndexRange={[60, 20]} style={{ pointerEvents: "none" }}>
        <div className="bn-agent">
          {showBubble && (
            <div key={bubble.ts} className={"bn-bubble" + (incoming ? " bn-bubble--in" : "")}>
              <div className="bn-bubble__body">
                {incoming && <span className="bn-bubble__from">{bubble.from} →</span>}
                <span>{bubble.text}</span>
              </div>
            </div>
          )}
          <div className={"bn-tag" + (alert ? " bn-tag--alert" : "")}>{self}</div>
          <div className="bn-activity">{presence.activity}</div>
        </div>
      </Html>
    </group>
  )
}
