"use client"
// A cute, slightly spooky Halloween ghost that walks the office corridors, works at its spot and speaks.
import type { AgentPresence, OfficeSpot, ServiceName } from "@banshee/contracts"
import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useNow, useOffice } from "@/lib/office/client"
import { useOverlay } from "../office/primitives"
import { GhostBadge } from "./GhostBadge"
import { Costume } from "./ghost/Costume"
import { BUBBLE_MS, initMotion, retarget, step, type Motion } from "./ghost/motion"
import "./ghost/ghost.css"

const INK = "#141416"
const RED = "#e5484d"
const FLOAT = 0.3
const BODY_PROFILE: [number, number][] = [
  [0, 0.02], [0.3, 0], [0.4, 0.1], [0.42, 0.35], [0.4, 0.65], [0.38, 0.9], [0.33, 1.12], [0.2, 1.28], [0, 1.33],
]

type Work = "type" | "flashlight" | "phone" | "knock" | "talk" | "none"
const WORK: Record<OfficeSpot, Work> = {
  desk: "type", server_room: "flashlight", war_room: "talk", deploy_console: "type", archive: "type", vendor_phone: "phone", oncall_door: "knock",
}

let shadowTex: THREE.CanvasTexture | null = null
function getShadowTex() {
  if (shadowTex) return shadowTex
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, "rgba(10,10,20,0.34)")
  gr.addColorStop(0.55, "rgba(10,10,20,0.14)")
  gr.addColorStop(1, "rgba(10,10,20,0)")
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  shadowTex = new THREE.CanvasTexture(c)
  return shadowTex
}

/** Ghost body: lathe with a wavy hem that we animate on the CPU (a few dozen vertices). */
function useGhostGeometry() {
  return useMemo(() => {
    const curve = new THREE.SplineCurve(BODY_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)))
    const pts = curve.getPoints(22).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
    const geo = new THREE.LatheGeometry(pts, 28)
    const pos = geo.getAttribute("position") as THREE.BufferAttribute
    const base = Float32Array.from(pos.array as ArrayLike<number>)
    const n = pos.count
    const sway = new Float32Array(n)
    const hem = new Float32Array(n)
    const ang = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = base[i * 3]
      const y = base[i * 3 + 1]
      const z = base[i * 3 + 2]
      ang[i] = Math.atan2(x, z)
      sway[i] = Math.pow(Math.max(0, 1 - y / 0.6), 1.4)
      hem[i] = Math.max(0, 1 - y / 0.16)
    }
    return { geo, pos, base, sway, hem, ang, n }
  }, [])
}

export function GhostAgent({ service, presence, selected, onSelect }: { service: ServiceName; presence: AgentPresence; selected: boolean; onSelect: (s: ServiceName) => void }) {
  const root = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const float = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Mesh>(null)
  const armR = useRef<THREE.Mesh>(null)
  const hullL = useRef<THREE.Mesh>(null)
  const hullR = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const selRing = useRef<THREE.Mesh>(null)
  const sparks = useRef<THREE.Group>(null)
  const motion = useRef<Motion | null>(null)
  const lean = useRef(0)
  const hover = useRef(0)
  const hovered = useRef(false)
  const phase = useMemo(() => service.length * 1.7, [service])
  const gh = useGhostGeometry()
  const portal = useOverlay()
  const now = useNow()
  const chatter = useOffice()?.chatter

  const alert = presence.mood === "alert"
  const done = presence.mood === "done"
  const work = WORK[presence.spot]

  if (!motion.current) motion.current = initMotion(service, presence.spot)
  useEffect(() => {
    if (motion.current) retarget(motion.current, service, presence.spot)
  }, [service, presence.spot])
  useEffect(() => () => void (document.body.style.cursor = ""), [])
  // Mount the DOM overlay one tick late: drei <Html> loses its root when mounted during the very first render (React strict mode).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 60)
    return () => clearTimeout(id)
  }, [])

  useFrame((state, dt) => {
    const m = motion.current
    const g = root.current
    if (!m || !g) return
    const walking = step(m, dt)
    const t = state.clock.elapsedTime
    g.position.set(m.pos[0], 0, m.pos[1])
    if (turn.current) turn.current.rotation.y = m.heading

    // hover scale
    hover.current += ((hovered.current ? 1 : 0) - hover.current) * Math.min(1, dt * 12)
    const s = 1.12 * (1 + hover.current * 0.09 + (selected ? 0.03 : 0))
    if (turn.current) turn.current.scale.setScalar(s)

    // alert: quick shake in bursts
    const burst = alert ? (Math.sin(t * 2.4) > -0.2 ? 1 : 0.25) : 0
    const shake = Math.sin(t * 52) * 0.035 * burst
    if (turn.current) turn.current.rotation.z = shake

    // float / bob
    const bob = walking ? Math.abs(Math.sin(m.walkT * 7)) * 0.07 : Math.sin(t * 1.8 + phase) * 0.05
    if (float.current) float.current.position.y = FLOAT + bob
    if (shadow.current) {
      const k = 1 - bob * 1.2
      shadow.current.scale.set(1.25 * k, 1.25 * k, 1)
    }

    // tail sway (lean back while moving, gentle idle sway)
    lean.current += ((walking ? 0.2 : 0) - lean.current) * Math.min(1, dt * 6)
    const { pos, base, sway, hem, ang, n } = gh
    const arr = pos.array as Float32Array
    const wob = walking ? m.walkT * 8 : t * 1.4
    for (let i = 0; i < n; i++) {
      const j = i * 3
      const w = sway[i]
      arr[j] = base[j] + w * Math.sin(wob + phase) * (walking ? 0.07 : 0.018)
      arr[j + 1] = base[j + 1] + hem[i] * 0.1 * (Math.cos(ang[i] * 4 + t * (walking ? 7 : 2.2)) - 0.6)
      arr[j + 2] = base[j + 2] - w * lean.current
    }
    pos.needsUpdate = true

    // blink
    if (eyes.current) eyes.current.scale.y = Math.sin(t * 0.9 + phase * 3) > 0.985 ? 0.12 : 1

    // arms + work animation
    const working = !walking && !m.path.length
    const L = armL.current
    const R = armR.current
    if (L && R) {
      let ly = 0.55, ry = 0.55, lz = 0.1, rz = 0.1, lx = 0.4, rx = 0.4
      const flap = walking ? Math.sin(m.walkT * 8) * 0.06 : Math.sin(t * 1.8 + phase) * 0.015
      ly += flap; ry -= flap
      if (working && work === "type") {
        ly = 0.6 + Math.max(0, Math.sin(t * 15)) * 0.05; ry = 0.6 + Math.max(0, Math.sin(t * 15 + 2.4)) * 0.05
        lz = rz = 0.27; lx = rx = 0.3
      } else if (working && work === "flashlight") {
        ry = 0.72; rz = 0.28; rx = 0.32
      } else if (working && work === "phone") {
        ry = 0.95; rz = 0.12; rx = 0.36
      } else if (working && work === "knock") {
        rz = 0.28 + Math.max(0, Math.sin(t * 9)) * 0.12; ry = 0.72; rx = 0.3
      } else if (working && work === "talk") {
        ry = 0.65 + Math.max(0, Math.sin(t * 3)) * 0.22
      }
      L.position.set(-lx, ly, lz)
      R.position.set(rx, ry, rz)
      hullL.current?.position.copy(L.position)
      hullR.current?.position.copy(R.position)
    }
    if (flash.current) {
      const on = working && work === "flashlight"
      flash.current.visible = on
      if (on) {
        flash.current.rotation.y = Math.sin(t * 1.3) * 0.75
        flash.current.rotation.x = 0.08 + Math.sin(t * 2.1) * 0.05
      }
    }

    // rings
    if (ring.current && ringMat.current) {
      const k = 1 + 0.12 * Math.sin(t * 5)
      ring.current.scale.set(k, k, k)
      ringMat.current.opacity = 0.4 + 0.25 * Math.sin(t * 5)
    }
    if (selRing.current) {
      const k = 1 + 0.03 * Math.sin(t * 2.4)
      selRing.current.scale.set(k, k, k)
    }
    // done sparkles
    if (sparks.current) {
      sparks.current.children.forEach((c, i) => {
        const a = t * 1.6 + i * 2.1
        const p = (t * 0.7 + i * 0.33) % 1
        c.position.set(Math.cos(a) * 0.55, 1.2 + p * 0.7, Math.sin(a) * 0.55)
        const sc = Math.sin(p * Math.PI) * 0.12
        c.scale.setScalar(sc)
        c.rotation.y = t * 3
      })
    }
  })

  // speech bubbles: last 2 lines from or to this agent, fading after 6 s
  const self = `spirit-${service}`
  const lines = useMemo(() => {
    if (!chatter || now <= 0) return []
    const seen = new Set<string>()
    return chatter
      .filter((c) => (c.from === self || c.to === self) && now - c.ts < BUBBLE_MS && now - c.ts > -2000)
      .filter((c) => {
        const k = `${c.ts}-${c.from}-${c.text}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(-2)
  }, [chatter, now, self])

  const tone = alert ? "bad" : "ok"
  return (
    <group ref={root}>
      {/* ground: soft shadow, alert ring, selection ring */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={typeof document === "undefined" ? null : getShadowTex()} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {alert && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.6, 0.72, 48]} />
          <meshBasicMaterial ref={ringMat} color={RED} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {selected && (
        <mesh ref={selRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <ringGeometry args={[0.8, 0.84, 64]} />
          <meshBasicMaterial color={INK} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      <group ref={turn}>
        <group ref={float}>
          {/* click / hover target */}
          <mesh
            position={[0, 0.7, 0]}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(service)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              hovered.current = true
              document.body.style.cursor = "pointer"
            }}
            onPointerOut={() => {
              hovered.current = false
              document.body.style.cursor = ""
            }}
          >
            <cylinderGeometry args={[0.55, 0.55, 1.7, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>

          {/* body */}
          <mesh geometry={gh.geo} castShadow>
            <meshStandardMaterial color="#ffffff" roughness={0.55} emissive="#e4e9ff" emissiveIntensity={0.55} />
          </mesh>
          <mesh geometry={gh.geo} scale={[1.07, 1.03, 1.07]} position={[0, -0.015, 0]}>
            <meshBasicMaterial color={INK} side={THREE.BackSide} />
          </mesh>

          {/* face */}
          <group ref={eyes} position={[0, 0.92, 0]}>
            {[-1, 1].map((sx) => (
              <group key={sx} position={[sx * 0.145, 0, 0.345]} rotation={[0, sx * 0.34, 0]}>
                <mesh scale={[0.072, 0.11, 0.03]}>
                  <sphereGeometry args={[1, 14, 12]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
                <mesh position={[0.018, 0.035, 0.03]}>
                  <sphereGeometry args={[0.024, 8, 8]} />
                  <meshBasicMaterial color="#fff" />
                </mesh>
              </group>
            ))}
          </group>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 0.245, 0.8, 0.285]} rotation={[0, sx * 0.9, 0]}>
              <circleGeometry args={[0.062, 14]} />
              <meshBasicMaterial color="#ff9aa8" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          ))}
          <mesh position={[0, 0.8, 0.382]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.045, 0.011, 6, 14, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>

          {/* arms */}
          {[armL, armR].map((r, i) => (
            <mesh key={i} ref={r} position={[(i ? 1 : -1) * 0.4, 0.55, 0.1]} scale={[0.1, 0.13, 0.1]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.6} emissive="#e4e9ff" emissiveIntensity={0.5} />
            </mesh>
          ))}
          {[armL, armR].map((r, i) => (
            <mesh key={`h${i}`} ref={r === armL ? hullL : hullR} scale={[0.12, 0.15, 0.12]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshBasicMaterial color={INK} side={THREE.BackSide} />
            </mesh>
          ))}

          {/* flashlight sweep (server room) */}
          <group ref={flash} position={[0.3, 0.72, 0.28]} visible={false}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.045, 0.16, 8]} />
              <meshStandardMaterial color={INK} />
            </mesh>
            <mesh position={[0, 0, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.28, 1.2, 16, 1, true]} />
              <meshBasicMaterial color="#fff6d6" transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          </group>

          <Costume service={service} />
        </group>
      </group>

      {/* done sparkles */}
      {done && (
        <group ref={sparks} position={[0, FLOAT, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i}>
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial color="#ffe6a3" toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}

      {/* name tag, activity, speech bubbles */}
      {ready && <Html portal={portal} position={[0, service === "payments" ? 2.55 : 2.1, 0]} zIndexRange={[60, 20]} style={{ pointerEvents: "none" }}>
        <div className="gh-stack" data-selected={selected}>
          {lines.length > 0 && (
            <div className="gh-bubbles">
              {lines.map((c) => (
                <div key={`${c.ts}-${c.from}-${c.text}`} className="gh-bubble" style={{ animationDelay: `0s, ${Math.max(0, BUBBLE_MS - 600 - (now - c.ts))}ms` }}>
                  {c.from !== self && <b>{c.from.replace("spirit-", "")} →</b>}
                  {c.text}
                </div>
              ))}
            </div>
          )}
          <div className="glass-chip gh-name" data-tone={tone} data-selected={selected}>
            <GhostBadge service={service} size={18} />
            {self}
          </div>
          <div className="glass-chip gh-act" data-tone={alert ? "bad" : undefined}>{presence.activity}</div>
        </div>
      </Html>}
    </group>
  )
}
