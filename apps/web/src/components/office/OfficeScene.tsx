"use client"

import type { OfficeState, ServiceName } from "@banshee/contracts"
import { SERVICES } from "@banshee/contracts"
import { OrbitControls, OrthographicCamera } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react"
import { Agent } from "./Agent"
import { OverlayCtx } from "./primitives"
import { Archive, DeployConsole, Desks, Floor, OncallDoor, PhoneBooth, ServerRacks, useSeries, VendorBox, WarRoom } from "./Furniture"

const TARGET: [number, number, number] = [-1.6, 0, -3.2]
const BASE_AZIMUTH = Math.PI / 4
const POLAR = Math.acos(1 / Math.sqrt(3)) // true isometric elevation (35.26°)
const SWAY = 0.1
const VIEW_W = 28 // world units that must fit horizontally
const VIEW_H = 19.5

type Chatter = OfficeState["chatter"][number]

function latestBubble(chatter: Chatter[], service: ServiceName): Chatter | undefined {
  const me = `spirit-${service}`
  for (let k = chatter.length - 1; k >= 0; k--) {
    const c = chatter[k]
    if (c.from === me) return c
    if (c.to === me && !c.from.startsWith("spirit-")) return c
  }
  return undefined
}

function Rig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const idleSince = useRef(0)
  const size = useThree((s) => s.size)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const cam = get().camera
    cam.zoom = Math.min(size.width / VIEW_W, size.height / VIEW_H)
    cam.updateProjectionMatrix()
  }, [size, get])
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const onStart = () => (idleSince.current = -1)
    const onEnd = () => (idleSince.current = performance.now())
    c.addEventListener("start", onStart)
    c.addEventListener("end", onEnd)
    return () => {
      c.removeEventListener("start", onStart)
      c.removeEventListener("end", onEnd)
    }
  }, [])
  useFrame((state) => {
    const c = controls.current
    if (!c || idleSince.current < 0) return
    if (performance.now() - idleSince.current < 6000) return
    // gentle sway back and forth around the isometric angle
    const want = BASE_AZIMUTH + Math.sin(state.clock.elapsedTime * 0.12) * SWAY * 0.6
    const cur = c.getAzimuthalAngle()
    c.setAzimuthalAngle(cur + (want - cur) * 0.02)
    const p = c.getPolarAngle()
    c.setPolarAngle(p + (POLAR - p) * 0.02)
    c.update()
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.4}
      minAzimuthAngle={BASE_AZIMUTH - SWAY * 2}
      maxAzimuthAngle={BASE_AZIMUTH + SWAY * 2}
      minPolarAngle={POLAR - 0.12}
      maxPolarAngle={POLAR + 0.1}
    />
  )
}

function Scene({ office }: { office?: OfficeState }) {
  const healthRef = useRef<OfficeState["health"] | undefined>(undefined)
  useEffect(() => {
    healthRef.current = office?.health
  }, [office?.health])
  const series = useSeries(healthRef)
  const d = 40
  const camPos: [number, number, number] = [
    TARGET[0] + d * Math.sin(POLAR) * Math.sin(BASE_AZIMUTH),
    TARGET[1] + d * Math.cos(POLAR),
    TARGET[2] + d * Math.sin(POLAR) * Math.cos(BASE_AZIMUTH),
  ]
  const health = office?.health
  const warActive = !!office && Object.values(office.agents).some((a) => a.spot === "war_room") && office.openIncidents.length > 0
  const waiting = !!office && Object.values(office.agents).some((a) => a.spot === "oncall_door")
  return (
    <>
      <OrthographicCamera makeDefault position={camPos} near={0.1} far={200} zoom={30} />
      <Rig />
      <color attach="background" args={["#fafafa"]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#ffffff", "#dcdcdc", 0.8]} />
      <directionalLight
        position={[9, 20, 12]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <Floor />
      <Desks healthRef={healthRef} series={series} />
      <ServerRacks health={health} healthRef={healthRef} />
      <WarRoom active={warActive} />
      <DeployConsole />
      <Archive />
      <PhoneBooth vendor={health?.vendor ?? "ok"} />
      <OncallDoor waiting={waiting} />
      <VendorBox vendor={health?.vendor ?? "ok"} />
      {office &&
        SERVICES.map((s) => <Agent key={s} service={s} presence={office.agents[s]} bubble={latestBubble(office.chatter, s)} />)}
    </>
  )
}

export default function OfficeCanvas({ office }: { office?: OfficeState }) {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const portal = useMemo(() => (overlay ? ({ current: overlay } as RefObject<HTMLElement>) : undefined), [overlay])
  return (
    <div className="relative h-full w-full">
      {portal && (
        <OverlayCtx.Provider value={portal}>
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }} className="bn-canvas">
            <Scene office={office} />
          </Canvas>
        </OverlayCtx.Provider>
      )}
      <div ref={setOverlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  )
}
