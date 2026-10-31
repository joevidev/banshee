"use client"
/* eslint-disable react-hooks/immutability, react-hooks/purity -- three.js objects are mutated by design */
// Full-screen, navigable isometric world ("the office, night shift"). Owner: scene agent.
import type { AgentPresence, OfficeState, ServiceName } from "@banshee/contracts"
import { SERVICES } from "@banshee/contracts"
import { MapControls, Sparkles } from "@react-three/drei"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react"
import * as THREE from "three"
import { useOffice } from "@/lib/office/client"
import { slotFor } from "../office/layout"
import { emit, WORLD_EVENTS } from "./contracts"
import { GhostAgent } from "./GhostAgent"
import { OverlayCtx } from "./scene/primitives"
import { Bats, Cobweb, KanbanBoard3D, Lights, WarRoomDecor, WorldFloor } from "./scene/Extras"
import { Archive, DeployConsole, Desks, OncallDoor, PhoneBooth, ServerRacks, useSeries, VendorBox, WarRoom } from "./scene/Furniture"
import "./scene/scene.css"

/** Set true to see capsules where GhostAgent renders nothing (stub phase). */
const USE_PLACEHOLDER_AVATARS = false

const TARGET = new THREE.Vector3(-0.1, 0, -4.7)
const BASE_AZ = Math.PI / 4
const POLAR = Math.acos(1 / Math.sqrt(3)) // true isometric elevation
const AZ_RANGE = (35 * Math.PI) / 180
const DIST = 60
const VIEW_W = 29 // world units that fit horizontally at the default framing
const VIEW_H = 19.5
const PAN = { minX: -15, maxX: 11, minZ: -11, maxZ: 5 }
const INIT_POS: [number, number, number] = [TARGET.x + DIST * Math.sin(POLAR) * Math.sin(BASE_AZ), TARGET.y + DIST * Math.cos(POLAR), TARGET.z + DIST * Math.sin(POLAR) * Math.cos(BASE_AZ)]
const RESET_EVENT = "bn:reset-view"

type Goal = { tx: number; tz: number; zoom: number; az: number; polar: number }

function place(cam: THREE.Camera, t: THREE.Vector3, az: number, polar: number) {
  cam.position.set(t.x + DIST * Math.sin(polar) * Math.sin(az), t.y + DIST * Math.cos(polar), t.z + DIST * Math.sin(polar) * Math.cos(az))
}

function Rig({ embed, goalRef, overlay }: { embed: boolean; goalRef: RefObject<((g: Partial<Goal> | "reset") => void) | null>; overlay: HTMLElement | null }) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null)
  const anim = useRef<Goal | null>(null)
  const fit = useRef(0)
  const lastO = useRef(-1)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const f = Math.min(size.width / VIEW_W, size.height / VIEW_H)
    const prev = fit.current
    camera.zoom = prev ? camera.zoom * (f / prev) : f
    fit.current = f
    const c = controls.current
    if (c) {
      c.minZoom = f * 0.7
      c.maxZoom = f * 4.5
    }
    camera.updateProjectionMatrix()
  }, [size, camera])

  useEffect(() => {
    goalRef.current = (g) => {
      const c = controls.current
      const base: Goal = {
        tx: c?.target.x ?? TARGET.x,
        tz: c?.target.z ?? TARGET.z,
        zoom: camera.zoom,
        az: c ? c.getAzimuthalAngle() : BASE_AZ,
        polar: c ? c.getPolarAngle() : POLAR,
      }
      anim.current = g === "reset" ? { tx: TARGET.x, tz: TARGET.z, zoom: fit.current, az: BASE_AZ, polar: POLAR } : { ...base, ...g }
    }
    return () => {
      goalRef.current = null
    }
  }, [goalRef, camera])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const stop = () => (anim.current = null)
    c.addEventListener("start", stop)
    return () => c.removeEventListener("start", stop)
  }, [])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const c = controls.current
    if (embed) {
      const az = BASE_AZ + Math.sin(state.clock.elapsedTime * 0.22) * 0.13
      place(camera, TARGET, az, POLAR)
      camera.lookAt(TARGET)
    } else if (c) {
      const a = anim.current
      if (a) {
        const k = 1 - Math.pow(0.0008, dt)
        const t = c.target
        t.x += (a.tx - t.x) * k
        t.z += (a.tz - t.z) * k
        const az = c.getAzimuthalAngle()
        const pol = c.getPolarAngle()
        camera.zoom += (a.zoom - camera.zoom) * k
        place(camera, t, az + (a.az - az) * k, pol + (a.polar - pol) * k)
        camera.updateProjectionMatrix()
        if (Math.abs(a.tx - t.x) + Math.abs(a.tz - t.z) + Math.abs(a.zoom - camera.zoom) / fit.current + Math.abs(a.az - az) < 0.004) anim.current = null
      }
      // keep the pan inside the office
      const t = c.target
      const cx = Math.min(PAN.maxX, Math.max(PAN.minX, t.x))
      const cz = Math.min(PAN.maxZ, Math.max(PAN.minZ, t.z))
      if (cx !== t.x || cz !== t.z) {
        camera.position.x += cx - t.x
        camera.position.z += cz - t.z
        t.x = cx
        t.z = cz
      }
      c.update()
    }
    // spot labels fade out when zoomed far out
    if (overlay) {
      const ratio = camera.zoom / (fit.current || 1)
      const o = Math.round(Math.min(1, Math.max(0, (ratio - 0.75) / 0.2)) * 20) / 20
      if (o !== lastO.current) {
        lastO.current = o
        overlay.style.setProperty("--bn-label-o", String(o))
      }
    }
  })

  return (
    <MapControls
      ref={controls}
      makeDefault
      enabled={!embed}
      target={TARGET}
      enableDamping
      dampingFactor={0.09}
      screenSpacePanning={false}
      zoomSpeed={0.8}
      rotateSpeed={0.5}
      panSpeed={0.9}
      minAzimuthAngle={BASE_AZ - AZ_RANGE}
      maxAzimuthAngle={BASE_AZ + AZ_RANGE}
      minPolarAngle={POLAR - 0.12}
      maxPolarAngle={POLAR + 0.1}
    />
  )
}

function Capsule({ presence }: { presence: AgentPresence }) {
  const g = useRef<THREE.Group>(null)
  const service = presence.agent.replace("spirit-", "") as ServiceName
  const slot = slotFor(service, presence.spot)
  useFrame(() => {
    if (!g.current) return
    g.current.position.x += (slot.pos[0] - g.current.position.x) * 0.05
    g.current.position.z += (slot.pos[1] - g.current.position.z) * 0.05
  })
  return (
    <group ref={g} position={[slot.pos[0], 0, slot.pos[1]]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.6, 6, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

function Scene({
  office,
  embed,
  selected,
  onSelect,
  onClear,
  goalRef,
  overlay,
}: {
  office?: OfficeState
  embed: boolean
  selected: ServiceName | null
  onSelect: (s: ServiceName) => void
  onClear: () => void
  goalRef: RefObject<((g: Partial<Goal> | "reset") => void) | null>
  overlay: HTMLElement | null
}) {
  const healthRef = useRef<OfficeState["health"] | undefined>(undefined)
  useEffect(() => {
    healthRef.current = office?.health
  }, [office?.health])
  const series = useSeries(healthRef)
  const health = office?.health
  const warActive = !!office && Object.values(office.agents).some((a) => a.spot === "war_room") && office.openIncidents.length > 0
  const waiting = !!office && Object.values(office.agents).some((a) => a.spot === "oncall_door")

  const reset = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    goalRef.current?.("reset")
  }, [goalRef])
  const focus = useCallback(
    (s: ServiceName) => {
      const p = office?.agents[s]
      if (!p) return
      const [x, z] = slotFor(s, p.spot).pos
      goalRef.current?.({ tx: x, tz: z, zoom: Math.min(window.innerWidth / 9, window.innerHeight / 6.5) })
    },
    [office, goalRef],
  )
  // focus request from the UI
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  }, [focus])
  useEffect(() => {
    const onFocus = (e: Event) => {
      const s = (e as CustomEvent<{ service: ServiceName }>).detail?.service
      if (s) focusRef.current(s)
    }
    const onReset = () => goalRef.current?.("reset")
    window.addEventListener(WORLD_EVENTS.focusAgent, onFocus)
    window.addEventListener(RESET_EVENT, onReset)
    return () => {
      window.removeEventListener(WORLD_EVENTS.focusAgent, onFocus)
      window.removeEventListener(RESET_EVENT, onReset)
    }
  }, [goalRef])

  return (
    <>
      <Rig embed={embed} goalRef={goalRef} overlay={overlay} />
      <Lights />
      <WorldFloor onReset={reset} onClear={onClear} />
      <Desks healthRef={healthRef} series={series} />
      <ServerRacks health={health} healthRef={healthRef} />
      <WarRoom active={warActive} />
      <WarRoomDecor />
      <DeployConsole />
      <Archive />
      <PhoneBooth vendor={health?.vendor ?? "ok"} />
      <OncallDoor waiting={waiting} />
      <VendorBox vendor={health?.vendor ?? "ok"} />
      <Cobweb />
      <KanbanBoard3D />
      <Bats />
      <Sparkles count={36} scale={[24, 4.5, 16]} position={[-0.5, 2.4, -1.5]} size={2.6} speed={0.25} opacity={0.55} color="#8f8fa0" noise={0.6} />
      {office &&
        SERVICES.map((s) => (
          <group
            key={s}
            onDoubleClick={(e) => {
              if (embed) return
              e.stopPropagation()
              focus(s)
            }}
          >
            {USE_PLACEHOLDER_AVATARS && <Capsule presence={office.agents[s]} />}
            <GhostAgent service={s} presence={office.agents[s]} selected={selected === s} onSelect={onSelect} />
          </group>
        ))}
    </>
  )
}

export function WorldScene({ embed = false }: { embed?: boolean }) {
  const office = useOffice()
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const portal = useMemo(() => (overlay ? ({ current: overlay } as RefObject<HTMLElement>) : undefined), [overlay])
  const [selected, setSelected] = useState<ServiceName | null>(null)
  const goalRef = useRef<((g: Partial<Goal> | "reset") => void) | null>(null)

  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<{ service: ServiceName }>).detail?.service
      if (s) setSelected(s)
    }
    window.addEventListener(WORLD_EVENTS.selectAgent, on)
    return () => window.removeEventListener(WORLD_EVENTS.selectAgent, on)
  }, [])
  const onSelect = useCallback((s: ServiceName) => emit(WORLD_EVENTS.selectAgent, { service: s }), [])
  const onClear = useCallback(() => setSelected(null), [])

  return (
    <div className="world-canvas bn-world-canvas" data-embed={embed} style={embed ? { pointerEvents: "none" } : undefined}>
      {portal && (
        <OverlayCtx.Provider value={portal}>
          <Canvas
            shadows
            orthographic
            camera={{ position: INIT_POS, near: 0.1, far: 220, zoom: 30 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMappingExposure: 1.12 }}
            onPointerMissed={(e) => {
              if (embed) return
              // a plain click (not the end of a drag) on empty space clears the selection
              if ((e as MouseEvent).detail >= 1) onClear()
            }}
          >
            <Scene office={office} embed={embed} selected={selected} onSelect={onSelect} onClear={onClear} goalRef={goalRef} overlay={overlay} />
          </Canvas>
        </OverlayCtx.Provider>
      )}
      <div ref={setOverlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  )
}
