"use client"
/* eslint-disable react-hooks/immutability, react-hooks/purity -- three.js objects are mutated by design */

import type { IncidentStep } from "@banshee/contracts"
import { Edges, Lightformer, Environment } from "@react-three/drei"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useIncident, useLatestIncident, useOffice } from "@/lib/office/client"
import { emit, WORLD_EVENTS } from "../contracts"
import { FLOOR, SERVER_ROOM, WAR_TABLE } from "../../office/layout"
import { Block, EDGE, INK, PUMPKIN, RED, SpotLabel } from "./primitives"

// ---------------- lighting / environment ----------------

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#d8d8e2", 0.7]} />
      <directionalLight
        position={[10, 22, 13]}
        intensity={1.9}
        color="#fff8f0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      {/* cool rim from the opposite side, no shadows */}
      <directionalLight position={[-14, 10, -6]} intensity={0.55} color="#dfe6ff" />
      {/* studio softboxes, rendered once into a tiny cubemap: gives the floor a soft sheen without any download */}
      <Environment resolution={64} frames={1} background={false}>
        <Lightformer form="rect" intensity={2.2} position={[0, 9, 4]} scale={[18, 5, 1]} rotation-x={Math.PI / 2} color="#ffffff" />
        <Lightformer form="rect" intensity={1.2} position={[-10, 5, 6]} scale={[10, 4, 1]} rotation-y={Math.PI / 2} color="#e8eeff" />
        <Lightformer form="rect" intensity={1.0} position={[10, 4, -8]} scale={[10, 4, 1]} rotation-y={-Math.PI / 2} color="#fff3e6" />
      </Environment>
    </>
  )
}

// ---------------- floor, walls, backdrop ----------------

function useRadialFade() {
  return useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 256
    const g = c.getContext("2d")!
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128)
    gr.addColorStop(0, "rgba(250,250,252,1)")
    gr.addColorStop(0.45, "rgba(244,244,247,0.95)")
    gr.addColorStop(1, "rgba(238,238,242,0)")
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

export function WorldFloor({ onReset, onClear }: { onReset: (e: ThreeEvent<MouseEvent>) => void; onClear: () => void }) {
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta <= 4 && e.intersections[0]?.object === e.object) onClear()
  }
  const w = FLOOR.maxX - FLOOR.minX
  const d = FLOOR.maxZ - FLOOR.minZ
  const cx = (FLOOR.maxX + FLOOR.minX) / 2
  const cz = (FLOOR.maxZ + FLOOR.minZ) / 2
  const sr = SERVER_ROOM
  const fade = useRadialFade()
  return (
    <group>
      {/* soft ground that dissolves into the page gradient */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1, -0.22, -1]} onDoubleClick={onReset} onClick={click}>
        <planeGeometry args={[90, 90]} />
        <meshBasicMaterial map={fade} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {/* shadows land here, transparent elsewhere */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1, -0.205, -1]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <shadowMaterial opacity={0.16} />
      </mesh>
      {/* building slab with a soft studio sheen */}
      <mesh position={[cx, -0.1, cz]} receiveShadow onDoubleClick={onReset} onClick={click}>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color="#fcfcfd" roughness={0.32} metalness={0.02} envMapIntensity={0.9} />
        <Edges color="#c4c4cc" />
      </mesh>
      <gridHelper args={[w, w, "#d9d9e2", "#e6e6ec"]} position={[cx, 0.004, cz]} scale={[1, 1, d / w]} />
      {/* server room floor tile */}
      <Block position={[(sr.minX + sr.maxX) / 2, 0.01, (sr.minZ + sr.maxZ) / 2]} size={[sr.maxX - sr.minX, 0.02, sr.maxZ - sr.minZ]} color="#eeeef2" edge="#dcdce2" shadow={false} />
      {/* back walls */}
      <Block position={[cx, 1.6, FLOOR.minZ - 0.1]} size={[w, 3.2, 0.2]} color="#fefefe" edge="#cfcfd6" />
      <Block position={[FLOOR.minX - 0.1, 1.6, cz]} size={[0.2, 3.2, d]} color="#fefefe" edge="#cfcfd6" />
      {/* server room glass partition */}
      <mesh position={[sr.maxX, 1.2, (sr.minZ + sr.maxZ) / 2 - 0.6]}>
        <boxGeometry args={[0.06, 2.4, sr.maxZ - sr.minZ - 1.2]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.22} roughness={0.1} />
        <Edges color={EDGE} />
      </mesh>
      <SpotLabel position={[(sr.minX + sr.maxX) / 2, 3.4, sr.minZ + 0.2]}>server room</SpotLabel>
    </group>
  )
}

// ---------------- Halloween touches ----------------

function Pumpkin({ position, scale = 1, rotationY = Math.PI / 4 }: { position: [number, number, number]; scale?: number; rotationY?: number }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const seed = useMemo(() => position[0] * 7.3 + position[2] * 3.1, [position])
  useFrame((s) => {
    if (glow.current) glow.current.opacity = 0.82 + Math.sin(s.clock.elapsedTime * 7 + seed) * 0.1 + Math.sin(s.clock.elapsedTime * 3.1 + seed) * 0.06
  })
  const tri = useMemo(() => {
    const sh = new THREE.Shape()
    sh.moveTo(0, 0.07)
    sh.lineTo(-0.06, -0.05)
    sh.lineTo(0.06, -0.05)
    sh.closePath()
    return new THREE.ShapeGeometry(sh)
  }, [])
  return (
    <group position={position} scale={scale} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.17, 0]} scale={[1, 0.82, 1]} castShadow>
        <sphereGeometry args={[0.22, 20, 14]} />
        <meshStandardMaterial color={PUMPKIN} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.37, 0]} rotation={[0, 0, 0.25]}>
        <boxGeometry args={[0.04, 0.09, 0.04]} />
        <meshStandardMaterial color="#4a5a3a" />
      </mesh>
      <group position={[0, 0.18, 0.205]}>
        <mesh geometry={tri} position={[-0.08, 0.06, 0]}>
          <meshBasicMaterial ref={glow} color="#ffe29a" transparent toneMapped={false} />
        </mesh>
        <mesh geometry={tri} position={[0.08, 0.06, 0]}>
          <meshBasicMaterial color="#ffe29a" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.07, 0]}>
          <planeGeometry args={[0.2, 0.04]} />
          <meshBasicMaterial color="#ffe29a" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Candle({ position, h = 0.16 }: { position: [number, number, number]; h?: number }) {
  const flame = useRef<THREE.Mesh>(null)
  const seed = useMemo(() => position[0] * 7.3 + position[2] * 3.1, [position])
  useFrame((s) => {
    if (!flame.current) return
    const t = s.clock.elapsedTime
    flame.current.scale.set(1 + Math.sin(t * 9 + seed) * 0.12, 1 + Math.sin(t * 13 + seed) * 0.2, 1)
  })
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.04, h, 10]} />
        <meshStandardMaterial color="#f6f1e6" roughness={0.8} />
      </mesh>
      <mesh ref={flame} position={[0, h + 0.05, 0]}>
        <coneGeometry args={[0.025, 0.09, 8]} />
        <meshBasicMaterial color="#ffd48a" toneMapped={false} />
      </mesh>
    </group>
  )
}

export function WarRoomDecor() {
  const [x, z] = WAR_TABLE
  return (
    <group position={[x, 0, z]}>
      <Pumpkin position={[-1.25, 0.8, -0.38]} scale={0.8} />
      <Pumpkin position={[1.3, 0.8, 0.3]} scale={0.62} rotationY={Math.PI / 3} />
      <Pumpkin position={[-2.3, 0, -0.9]} scale={1.5} />
      <Candle position={[0.05, 0.8, 0.28]} />
      <Candle position={[0.3, 0.8, 0.1]} h={0.11} />
      <Candle position={[-0.1, 0.8, 0.05]} h={0.2} />
    </group>
  )
}

export function Cobweb() {
  const geom = useMemo(() => {
    const pts: number[] = []
    const R = 1.7
    const n = 6
    // web on the back wall (z = const), hanging from the corner at x = FLOOR.minX
    const ox = FLOOR.minX + 0.02
    const oy = 3.2
    const ang = (k: number) => (-Math.PI / 2) * (k / n) // 0 .. -90deg: from +x to -y
    for (let k = 0; k <= n; k++) {
      pts.push(ox, oy, 0, ox + Math.cos(ang(k)) * R, oy + Math.sin(ang(k)) * R * 0.9, 0)
    }
    for (let ring = 1; ring <= 4; ring++) {
      const r = (R * ring) / 4.2
      for (let k = 0; k < n; k++) {
        const a0 = ang(k)
        const a1 = ang(k + 1)
        const sag = 0.12 * r
        const mid = (a0 + a1) / 2
        const m: [number, number] = [ox + Math.cos(mid) * (r - sag), oy + Math.sin(mid) * (r - sag) * 0.9]
        pts.push(ox + Math.cos(a0) * r, oy + Math.sin(a0) * r * 0.9, 0, m[0], m[1], 0, m[0], m[1], 0, ox + Math.cos(a1) * r, oy + Math.sin(a1) * r * 0.9, 0)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  return (
    <lineSegments geometry={geom} position={[0, 0, FLOOR.minZ + 0.02]}>
      <lineBasicMaterial color="#a8a8b4" transparent opacity={0.8} />
    </lineSegments>
  )
}

// ---------------- little bats ----------------

function Bat({ r, y, speed, phase, cx, cz }: { r: number; y: number; speed: number; phase: number; cx: number; cz: number }) {
  const g = useRef<THREE.Group>(null)
  const l = useRef<THREE.Mesh>(null)
  const rt = useRef<THREE.Mesh>(null)
  const wing = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.12, 0.16, 0.34, 0.1)
    s.lineTo(0.27, 0.0)
    s.lineTo(0.2, 0.05)
    s.lineTo(0.12, -0.04)
    s.lineTo(0.06, 0.02)
    s.closePath()
    return new THREE.ShapeGeometry(s)
  }, [])
  useFrame((s) => {
    const t = s.clock.elapsedTime * speed + phase
    if (g.current) {
      g.current.position.set(cx + Math.cos(t) * r, y + Math.sin(t * 2.1) * 0.35, cz + Math.sin(t) * r * 0.7)
      g.current.rotation.y = -t - Math.PI / 2 + Math.PI
    }
    const f = Math.sin(s.clock.elapsedTime * 11 + phase) * 0.7
    if (l.current) l.current.rotation.z = f
    if (rt.current) rt.current.rotation.z = -f
  })
  return (
    <group ref={g} scale={1.1}>
      <mesh>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshBasicMaterial color="#26262e" />
      </mesh>
      <mesh ref={l} geometry={wing}>
        <meshBasicMaterial color="#26262e" side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={rt} geometry={wing} scale={[-1, 1, 1]}>
        <meshBasicMaterial color="#26262e" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function Bats() {
  return (
    <group>
      <Bat cx={-1} cz={-2} r={9} y={6.2} speed={0.28} phase={0} />
      <Bat cx={-1} cz={-2} r={7} y={5.4} speed={0.35} phase={2.1} />
      <Bat cx={3} cz={-3} r={6} y={6.8} speed={0.22} phase={4.2} />
    </group>
  )
}

// ---------------- kanban board standing in the world ----------------

const COLS: { key: string; label: string; steps: IncidentStep[] }[] = [
  { key: "detect", label: "Detect", steps: ["detected"] },
  { key: "triage", label: "Triage", steps: ["investigating"] },
  { key: "cause", label: "Cause", steps: ["root_cause"] },
  { key: "approve", label: "Approve", steps: ["awaiting_approval"] },
  { key: "fix", label: "Fix", steps: ["fixing"] },
  { key: "done", label: "Done", steps: ["resolved"] },
]

function Probe({ id, onStep }: { id: string; onStep: (id: string, step: IncidentStep | undefined) => void }) {
  const inc = useIncident(id)
  const step = inc?.step
  useEffect(() => {
    onStep(id, step)
    return () => onStep(id, undefined)
  }, [id, step, onStep])
  return null
}

function drawBoard(canvas: HTMLCanvasElement, counts: number[], hover: boolean) {
  const W = canvas.width
  const H = canvas.height
  const g = canvas.getContext("2d")!
  const font = (typeof document !== "undefined" && getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim()) || "ui-monospace, Menlo, monospace"
  g.clearRect(0, 0, W, H)
  g.font = `600 36px ${font}`
  g.fillStyle = "#2c2c36"
  g.fillText("INCIDENT BOARD", 44, 70)
  const total = counts.slice(0, 5).reduce((a, b) => a + b, 0)
  g.textAlign = "right"
  g.fillStyle = total ? RED : "#9a9aa6"
  g.fillText(total ? `${total} open` : "all clear", W - 44, 70)
  g.textAlign = "left"
  const cw = (W - 88) / 6
  COLS.forEach((c, i) => {
    const x = 44 + i * cw
    g.fillStyle = "rgba(20,20,30,0.07)"
    g.beginPath()
    g.roundRect(x + 6, 110, cw - 12, H - 154, 18)
    g.fill()
    g.font = `600 26px ${font}`
    g.fillStyle = "#44444f"
    g.textAlign = "center"
    g.fillText(c.label, x + cw / 2, 150)
    const n = counts[i]
    for (let k = 0; k < n; k++) {
      const hot = i < 2
      g.fillStyle = hot ? RED : i === 5 ? "#b4b4be" : INK
      g.beginPath()
      g.arc(x + cw / 2, 205 + k * 46, 17, 0, Math.PI * 2)
      g.fill()
      if (hot) {
        g.strokeStyle = "rgba(229,72,77,0.25)"
        g.lineWidth = 6
        g.stroke()
      }
    }
    g.textAlign = "left"
  })
  if (hover) {
    g.strokeStyle = "rgba(20,20,30,0.28)"
    g.lineWidth = 4
    g.beginPath()
    g.roundRect(8, 8, W - 16, H - 16, 28)
    g.stroke()
  }
}

export function KanbanBoard3D({ position = [8.2, 0, -2.3] as [number, number, number] }: { position?: [number, number, number] }) {
  const office = useOffice()
  const latest = useLatestIncident()
  const [steps, setSteps] = useState<Record<string, IncidentStep>>({})
  const onStep = useMemo(
    () => (id: string, step: IncidentStep | undefined) =>
      setSteps((p) => {
        if (p[id] === step) return p
        const n = { ...p }
        if (step) n[id] = step
        else delete n[id]
        return n
      }),
    [],
  )
  const open = office?.openIncidents ?? []
  const counts = useMemo(() => {
    const c = COLS.map(() => 0)
    const ids = new Set(open)
    for (const id of open) {
      const s = steps[id]
      const i = COLS.findIndex((col) => s && col.steps.includes(s))
      if (i >= 0) c[i]++
    }
    if (latest && !ids.has(latest.id) && latest.step === "resolved") c[5]++
    return c
  }, [open, steps, latest])

  const [hover, setHover] = useState(false)
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = 1280
    canvas.height = 640
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
  const key = counts.join(",")
  useEffect(() => {
    if (!tex) return
    const canvas = tex.image as HTMLCanvasElement
    const paint = () => {
      drawBoard(canvas, counts, hover)
      tex.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, key, hover])
  useEffect(() => () => void (document.body.style.cursor = ""), [])

  const W = 3.4
  const H = 1.7
  return (
    <group position={position} rotation={[0, Math.PI / 4, 0]}>
      {open.map((id) => (
        <Probe key={id} id={id} onStep={onStep} />
      ))}
      {/* legs */}
      <Block position={[-W / 2 + 0.1, 0.5, 0]} size={[0.06, 1.0, 0.06]} color="#f2f2f5" />
      <Block position={[W / 2 - 0.1, 0.5, 0]} size={[0.06, 1.0, 0.06]} color="#f2f2f5" />
      <group
        position={[0, 1.0 + H / 2 + 0.1, 0]}
        onClick={(e) => {
          if (e.delta > 4) return
          e.stopPropagation()
          emit(WORLD_EVENTS.openBoard, {})
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ""
        }}
      >
        <mesh castShadow>
          <boxGeometry args={[W, H, 0.06]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={hover ? 0.92 : 0.8} roughness={0.08} envMapIntensity={1.4} emissive="#ffffff" emissiveIntensity={hover ? 0.5 : 0.1} />
          <Edges color={hover ? INK : "#b4b4be"} />
        </mesh>
        {tex && (
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[W, H]} />
            <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        )}
      </group>
      <SpotLabel position={[0, 3.35, 0]} tone={counts.slice(0, 2).some(Boolean) ? "red" : "muted"}>
        incident board
      </SpotLabel>
    </group>
  )
}
