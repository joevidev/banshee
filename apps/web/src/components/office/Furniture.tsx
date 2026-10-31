"use client"

import type { OfficeState, ServiceName } from "@banshee/contracts"
import { SERVICES } from "@banshee/contracts"
import { Edges } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import {
  ARCHIVE,
  DEPLOY_CONSOLE,
  DESKS,
  FLOOR,
  ONCALL_DOOR,
  PHONE_BOOTH,
  RACKS,
  SERVER_ROOM,
  VENDOR_BOX,
  WAR_TABLE,
} from "./layout"
import { Block, INK, PAPER, RED, SpotLabel } from "./primitives"

type Health = OfficeState["health"]
type Level = Health[keyof Health]

/** Rolling per-service error-rate-ish series for the desk monitors, derived from health. */
export type Series = Record<ServiceName, number[]>

export function useSeries(healthRef: RefObject<Health | undefined>): RefObject<Series> {
  const series = useRef<Series>({ checkout: [], payments: [], inventory: [] })
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.4) return
    acc.current = 0
    const h = healthRef.current
    for (const s of SERVICES) {
      const lvl = h?.[s] ?? "ok"
      const base = lvl === "down" ? 0.82 : lvl === "degraded" ? 0.5 : 0.1
      const arr = series.current[s]
      const prev = arr.length ? arr[arr.length - 1] : base
      const next = prev + (base - prev) * 0.35 + (Math.random() - 0.5) * (lvl === "ok" ? 0.06 : 0.14)
      arr.push(Math.min(0.97, Math.max(0.03, next)))
      if (arr.length > 48) arr.shift()
    }
  })
  return series
}

// ---------------- floor and walls ----------------

export function Floor() {
  const w = FLOOR.maxX - FLOOR.minX
  const d = FLOOR.maxZ - FLOOR.minZ
  const cx = (FLOOR.maxX + FLOOR.minX) / 2
  const cz = (FLOOR.maxZ + FLOOR.minZ) / 2
  const sr = SERVER_ROOM
  return (
    <group>
      {/* ground outside the building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -0.21, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#f7f7f7" roughness={1} />
      </mesh>
      <Block position={[cx, -0.1, cz]} size={[w, 0.2, d]} color="#fbfbfb" />
      <gridHelper args={[w, w, "#e6e6e6", "#ececec"]} position={[cx, 0.002, cz]} scale={[1, 1, d / w]} />
      {/* server room floor tile */}
      <Block position={[(sr.minX + sr.maxX) / 2, 0.01, (sr.minZ + sr.maxZ) / 2]} size={[sr.maxX - sr.minX, 0.02, sr.maxZ - sr.minZ]} color="#ececec" shadow={false} />
      {/* back walls */}
      <Block position={[cx, 1.6, FLOOR.minZ - 0.1]} size={[w, 3.2, 0.2]} color="#fdfdfd" />
      <Block position={[FLOOR.minX - 0.1, 1.6, cz]} size={[0.2, 3.2, d]} color="#fdfdfd" />
      {/* server room glass partition */}
      <mesh position={[sr.maxX, 1.2, (sr.minZ + sr.maxZ) / 2 - 0.6]}>
        <boxGeometry args={[0.06, 2.4, sr.maxZ - sr.minZ - 1.2]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.25} />
        <Edges color={INK} />
      </mesh>
      <SpotLabel position={[(sr.minX + sr.maxX) / 2, 3.4, sr.minZ + 0.2]}>server room</SpotLabel>
    </group>
  )
}

// ---------------- desks with live monitors ----------------

function drawMonitor(ctx: CanvasRenderingContext2D, service: ServiceName, lvl: Level, data: number[], blink: boolean) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const bad = lvl !== "ok"
  ctx.fillStyle = "#0b0b0b"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = "#ffffff"
  ctx.font = "600 22px ui-monospace, Menlo, monospace"
  ctx.fillText(service, 16, 32)
  ctx.font = "600 18px ui-monospace, Menlo, monospace"
  const label = lvl === "ok" ? "OK" : lvl === "degraded" ? "DEGRADED" : "DOWN"
  ctx.fillStyle = bad ? RED : "#ffffff"
  const tw = ctx.measureText(label).width
  if (!bad || blink) {
    ctx.fillText(label, W - tw - 16, 32)
  }
  // axis
  ctx.strokeStyle = "#2a2a2a"
  ctx.lineWidth = 1
  for (let k = 1; k < 4; k++) {
    const y = 48 + ((H - 60) * k) / 4
    ctx.beginPath()
    ctx.moveTo(16, y)
    ctx.lineTo(W - 16, y)
    ctx.stroke()
  }
  if (data.length > 1) {
    const x0 = 16
    const x1 = W - 16
    const y0 = 48
    const y1 = H - 12
    ctx.beginPath()
    data.forEach((v, k) => {
      const x = x0 + ((x1 - x0) * k) / 47
      const y = y1 - (y1 - y0) * v
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = bad ? RED : "#ffffff"
    ctx.lineWidth = 3
    ctx.stroke()
  }
}

function Monitor({ service, position, healthRef, series }: { service: ServiceName; position: [number, number, number]; healthRef: RefObject<Health | undefined>; series: RefObject<Series> }) {
  const screen = useRef<{ canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useEffect(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 320
    canvas.height = 192
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    screen.current = { canvas, texture }
    if (mat.current) {
      mat.current.map = texture
      mat.current.needsUpdate = true
    }
    return () => texture.dispose()
  }, [])
  const acc = useRef(1)
  useFrame((state, dt) => {
    acc.current += dt
    if (acc.current < 0.25 || !screen.current) return
    acc.current = 0
    const ctx = screen.current.canvas.getContext("2d")
    if (!ctx) return
    const lvl = healthRef.current?.[service] ?? "ok"
    drawMonitor(ctx, service, lvl, series.current[service], Math.floor(state.clock.elapsedTime * 2) % 2 === 0)
    screen.current.texture.needsUpdate = true
  })
  return (
    <group position={position}>
      <Block position={[0, 0.55, 0]} size={[1.5, 0.95, 0.07]} color="#f2f2f2" />
      <mesh position={[0, 0.55, 0.037]}>
        <planeGeometry args={[1.4, 0.84]} />
        <meshBasicMaterial ref={mat} color="#ffffff" toneMapped={false} />
      </mesh>
      <Block position={[0, 0.04, 0]} size={[0.08, 0.1, 0.08]} />
      <Block position={[0, 0.0, 0]} size={[0.4, 0.02, 0.25]} />
    </group>
  )
}

export function Desks({ healthRef, series }: { healthRef: RefObject<Health | undefined>; series: RefObject<Series> }) {
  return (
    <group>
      {SERVICES.map((s) => {
        const [x, z] = DESKS[s]
        return (
          <group key={s}>
            <Block position={[x, 0.74, z]} size={[2.3, 0.06, 0.95]} />
            <Block position={[x - 1.05, 0.36, z]} size={[0.08, 0.72, 0.85]} />
            <Block position={[x + 1.05, 0.36, z]} size={[0.08, 0.72, 0.85]} />
            <Monitor service={s} position={[x, 0.78, z - 0.2]} healthRef={healthRef} series={series} />
            <Block position={[x + 0.7, 0.8, z + 0.15]} size={[0.5, 0.03, 0.2]} />
            {/* chair */}
            <Block position={[x, 0.45, z + 1.0]} size={[0.6, 0.08, 0.55]} color="#f0f0f0" />
            <Block position={[x, 0.75, z + 1.27]} size={[0.6, 0.55, 0.06]} color="#f0f0f0" />
            <SpotLabel position={[x, 0.05, z + 2.0]}>{`desk · ${s}`}</SpotLabel>
          </group>
        )
      })}
    </group>
  )
}

// ---------------- server room racks ----------------

function Leds({ service, healthRef }: { service: ServiceName; healthRef: RefObject<Health | undefined> }) {
  const mats = useRef<THREE.MeshBasicMaterial[]>([])
  const white = useMemo(() => new THREE.Color("#ffffff"), [])
  const red = useMemo(() => new THREE.Color(RED), [])
  const dim = useMemo(() => new THREE.Color("#3a3a3a"), [])
  useFrame((state) => {
    const lvl = healthRef.current?.[service] ?? "ok"
    const t = state.clock.elapsedTime
    mats.current.forEach((m, k) => {
      if (!m) return
      if (lvl === "ok") {
        // calm twinkle
        const on = Math.sin(t * (1.3 + (k % 5) * 0.37) + k * 1.7) > -0.6
        m.color.copy(on ? white : dim)
      } else {
        const fast = lvl === "down" ? 6 : 3
        const on = Math.sin(t * fast + (k % 3)) > 0
        m.color.copy(on ? red : dim)
      }
    })
  })
  const leds: [number, number][] = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 3; c++) leds.push([-0.35 + c * 0.14, 0.45 + r * 0.24])
  return (
    <group>
      {leds.map(([lx, ly], k) => (
        <mesh key={k} position={[lx, ly, 0.47]}>
          <planeGeometry args={[0.07, 0.05]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[k] = m
            }}
            color="#ffffff"
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function ServerRacks({ health, healthRef }: { health?: Health; healthRef: RefObject<Health | undefined> }) {
  return (
    <group>
      {SERVICES.map((s) => {
        const [x, z] = RACKS[s]
        const bad = health && health[s] !== "ok"
        return (
          <group key={s} position={[x, 0, z]}>
            <Block position={[0, 1.15, 0]} size={[1.25, 2.3, 0.9]} />
            <Block position={[0, 1.15, 0.44]} size={[1.05, 2.1, 0.02]} color="#1a1a1a" shadow={false} />
            <Leds service={s} healthRef={healthRef} />
            {/* label plate */}
            <SpotLabel position={[0, 0.05, 0.85]} tone={bad ? "red" : "muted"}>
              {s}
            </SpotLabel>
          </group>
        )
      })}
    </group>
  )
}

// ---------------- war room, console, archive, booth, door, vendor ----------------

export function WarRoom({ active }: { active: boolean }) {
  const [x, z] = WAR_TABLE
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 0.76, 0]} size={[3.4, 0.08, 1.5]} />
      <Block position={[-1.4, 0.37, 0]} size={[0.1, 0.74, 1.2]} />
      <Block position={[1.4, 0.37, 0]} size={[0.1, 0.74, 1.2]} />
      {/* papers on the table */}
      <Block position={[-0.5, 0.81, 0.2]} size={[0.5, 0.01, 0.35]} rotationY={0.2} shadow={false} />
      <Block position={[0.6, 0.81, -0.25]} size={[0.5, 0.01, 0.35]} rotationY={-0.3} shadow={false} />
      {/* incident light above the table */}
      <mesh position={[0, 2.9, 0]}>
        <cylinderGeometry args={[0.5, 0.65, 0.25, 12]} />
        <meshStandardMaterial color={active ? RED : PAPER} emissive={active ? RED : "#000"} emissiveIntensity={active ? 0.6 : 0} />
        <Edges color={INK} threshold={30} />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1, 4]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <SpotLabel position={[0, 3.35, 0]} tone={active ? "red" : "muted"}>
        war room
      </SpotLabel>
    </group>
  )
}

export function DeployConsole() {
  const [x, z] = DEPLOY_CONSOLE
  return (
    <group position={[x, 0, z]}>
      <Block position={[0.2, 0.5, 0]} size={[0.8, 1.0, 2.8]} />
      <Block position={[0.05, 1.45, 0]} size={[0.08, 0.9, 2.4]} color="#1a1a1a" />
      {/* terminal lines */}
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} position={[0.1, 1.2 + k * 0.13, -0.4 + (k % 2) * 0.15]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.2 - (k % 3) * 0.3, 0.035]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
      <SpotLabel position={[0.2, 2.25, 0]}>deploy console</SpotLabel>
    </group>
  )
}

export function Archive() {
  const [x, z] = ARCHIVE
  const books: [number, number, number, number][] = []
  for (let shelf = 0; shelf < 4; shelf++) {
    let bx = -1.45
    let n = 0
    while (bx < 1.35) {
      const w = 0.12 + ((shelf * 7 + n * 13) % 5) * 0.03
      const h = 0.36 + ((shelf * 5 + n * 3) % 4) * 0.04
      books.push([bx + w / 2, 0.21 + shelf * 0.58 + h / 2, w, h])
      bx += w + 0.02
      n++
    }
  }
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 1.2, -0.15]} size={[3.1, 2.4, 0.06]} color="#f4f4f4" />
      {[0, 1, 2, 3, 4].map((k) => (
        <Block key={k} position={[0, 0.18 + k * 0.58, 0]} size={[3.1, 0.05, 0.4]} />
      ))}
      <Block position={[-1.55, 1.2, 0]} size={[0.05, 2.4, 0.4]} />
      <Block position={[1.55, 1.2, 0]} size={[0.05, 2.4, 0.4]} />
      {books.map(([bx, by, w, h], k) => (
        <Block key={k} position={[bx, by, 0.02]} size={[w, h, 0.3]} color={k % 4 === 0 ? "#e8e8e8" : PAPER} shadow={false} />
      ))}
      <SpotLabel position={[0, 2.95, 0]}>archive · memory</SpotLabel>
    </group>
  )
}

export function PhoneBooth({ vendor }: { vendor: Level }) {
  const [x, z] = PHONE_BOOTH
  const bad = vendor !== "ok"
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 1.25, -0.6]} size={[1.5, 2.5, 0.06]} color="#f6f6f6" />
      <Block position={[-0.75, 1.25, 0]} size={[0.06, 2.5, 1.2]} color="#f6f6f6" />
      <Block position={[0.75, 1.25, 0]} size={[0.06, 2.5, 1.2]} color="#f6f6f6" />
      <Block position={[0, 2.53, 0]} size={[1.6, 0.08, 1.3]} />
      <Block position={[0, 1.4, -0.52]} size={[0.35, 0.5, 0.12]} color={bad ? RED : PAPER} />
      <Block position={[0.1, 1.45, -0.44]} size={[0.07, 0.3, 0.07]} color={INK} />
      <SpotLabel position={[0, 3.0, 0]} tone={bad ? "red" : "muted"}>
        vendor phone
      </SpotLabel>
    </group>
  )
}

export function OncallDoor({ waiting }: { waiting: boolean }) {
  const [x, z] = ONCALL_DOOR
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((state) => {
    if (!lamp.current) return
    const on = waiting && Math.sin(state.clock.elapsedTime * 4) > 0
    lamp.current.emissiveIntensity = on ? 0.9 : 0
  })
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 1.15, 0.05]} size={[1.3, 2.3, 0.12]} color="#fafafa" />
      <Block position={[0, 1.12, 0.12]} size={[1.1, 2.15, 0.04]} />
      <Block position={[0.4, 1.1, 0.17]} size={[0.06, 0.18, 0.06]} color={INK} />
      <mesh position={[0, 2.55, 0.15]}>
        <boxGeometry args={[0.7, 0.18, 0.06]} />
        <meshStandardMaterial ref={lamp} color={waiting ? RED : PAPER} emissive={RED} emissiveIntensity={0} />
        <Edges color={INK} />
      </mesh>
      <SpotLabel position={[0, 3.05, 0.2]} tone={waiting ? "red" : "muted"}>
        on-call
      </SpotLabel>
    </group>
  )
}

export function VendorBox({ vendor }: { vendor: Level }) {
  const [x, z] = VENDOR_BOX
  const bad = vendor !== "ok"
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((state) => {
    if (!mat.current) return
    mat.current.emissiveIntensity = bad ? 0.25 + 0.25 * Math.sin(state.clock.elapsedTime * 5) : 0
  })
  const [bx, bz] = PHONE_BOOTH
  // cable: booth -> outside wall -> vendor box, along the ground
  const cable = useMemo(() => {
    const pts = [new THREE.Vector3(bx + 0.75, 0.03, bz), new THREE.Vector3(FLOOR.maxX + 0.5, 0.03, bz), new THREE.Vector3(FLOOR.maxX + 0.5, -0.17, z), new THREE.Vector3(x - 1, -0.17, z)]
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(geom, new THREE.LineDashedMaterial({ color: "#9a9a9a", dashSize: 0.2, gapSize: 0.12 }))
    line.computeLineDistances()
    return line
  }, [bx, bz, x, z])
  useEffect(() => {
    ;(cable.material as THREE.LineDashedMaterial).color.set(bad ? RED : "#9a9a9a")
  }, [cable, bad])
  return (
    <group>
      <primitive object={cable} />
      <group position={[x, -0.2, z]}>
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.9, 1.8, 1.9]} />
          <meshStandardMaterial ref={mat} color={bad ? "#fde8e8" : PAPER} emissive={RED} emissiveIntensity={0} />
          <Edges color={bad ? RED : INK} />
        </mesh>
        <Block position={[0, 1.86, 0]} size={[1.4, 0.12, 1.4]} color={bad ? "#fde8e8" : PAPER} edge={bad ? RED : INK} />
        <SpotLabel position={[0, 2.6, 0]} tone={bad ? "red" : "muted"}>
          {bad ? "card processor · down" : "card processor"}
        </SpotLabel>
      </group>
    </group>
  )
}
