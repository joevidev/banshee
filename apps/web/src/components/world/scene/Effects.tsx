"use client"
/* eslint-disable react-hooks/immutability, react-hooks/purity -- three.js buffers are mutated by design */
// Living-office effects: smoke / flames / sparks on broken services, door ring, board pulse + confetti.
// All effects are driven from useFrame + refs (no per-frame React state) and fade in/out smoothly.
import type { OfficeState } from "@banshee/contracts"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useOffice } from "@/lib/office/client"

const RED = "#e5484d"
const tmpC = new THREE.Color()

export function useReducedMotionRef() {
  const r = useRef(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => (r.current = mq.matches)
    on()
    mq.addEventListener?.("change", on)
    return () => mq.removeEventListener?.("change", on)
  }, [])
  return r
}

// ---------------- tiny particle pool rendered as one soft-point draw call ----------------

export type Spawn = { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life: number; size: number; grow?: number; a?: number; grav?: number; drag?: number; color: string }

export class Pool {
  n: number
  age: Float32Array
  life: Float32Array
  vel: Float32Array
  size0: Float32Array
  grow: Float32Array
  a0: Float32Array
  grav: Float32Array
  drag: Float32Array
  pos: Float32Array
  alpha: Float32Array
  size: Float32Array
  col: Float32Array
  cursor = 0
  constructor(n: number) {
    this.n = n
    this.age = new Float32Array(n).fill(9)
    this.life = new Float32Array(n).fill(1)
    this.vel = new Float32Array(n * 3)
    this.size0 = new Float32Array(n)
    this.grow = new Float32Array(n)
    this.a0 = new Float32Array(n)
    this.grav = new Float32Array(n)
    this.drag = new Float32Array(n)
    this.pos = new Float32Array(n * 3)
    this.alpha = new Float32Array(n)
    this.size = new Float32Array(n)
    this.col = new Float32Array(n * 3)
  }
  spawn(s: Spawn) {
    for (let k = 0; k < this.n; k++) {
      const i = (this.cursor + k) % this.n
      if (this.age[i] >= this.life[i]) {
        this.cursor = i + 1
        this.age[i] = 0
        this.life[i] = s.life
        this.pos[i * 3] = s.x
        this.pos[i * 3 + 1] = s.y
        this.pos[i * 3 + 2] = s.z
        this.vel[i * 3] = s.vx ?? 0
        this.vel[i * 3 + 1] = s.vy ?? 0
        this.vel[i * 3 + 2] = s.vz ?? 0
        this.size0[i] = s.size
        this.grow[i] = s.grow ?? 0
        this.a0[i] = s.a ?? 1
        this.grav[i] = s.grav ?? 0
        this.drag[i] = s.drag ?? 0
        tmpC.set(s.color)
        this.col[i * 3] = tmpC.r
        this.col[i * 3 + 1] = tmpC.g
        this.col[i * 3 + 2] = tmpC.b
        return
      }
    }
  }
  step(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0
        this.size[i] = 0
        continue
      }
      this.age[i] += dt
      const k = this.age[i] / this.life[i]
      const d = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[i * 3] *= d
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt
      this.vel[i * 3 + 2] *= d
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      const fadeIn = Math.min(1, k / 0.18)
      this.alpha[i] = this.a0[i] * fadeIn * Math.max(0, 1 - k)
      this.size[i] = Math.max(0.02, this.size0[i] + this.grow[i] * this.age[i])
    }
  }
}

const VERT = /* glsl */ `
attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
uniform float uScale; varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aColor; gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const FRAG = /* glsl */ `
varying float vA; varying vec3 vC;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`

export function ParticleLayer({ count, position, update }: { count: number; position?: [number, number, number]; update?: (p: Pool, dt: number, t: number) => void }) {
  const reduced = useReducedMotionRef()
  const { pool, geo, mat } = useMemo(() => {
    const pool = new Pool(count)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pool.pos, 3))
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(pool.alpha, 1))
    geo.setAttribute("aSize", new THREE.BufferAttribute(pool.size, 1))
    geo.setAttribute("aColor", new THREE.BufferAttribute(pool.col, 3))
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 30 } }, transparent: true, depthWrite: false })
    return { pool, geo, mat }
  }, [count])
  useEffect(() => () => void (geo.dispose(), mat.dispose()), [geo, mat])
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    if (!reduced.current) update?.(pool, dt, state.clock.elapsedTime)
    pool.step(dt)
    mat.uniforms.uScale.value = (state.camera as THREE.OrthographicCamera).zoom * state.gl.getPixelRatio()
    for (const a of ["position", "aAlpha", "aSize", "aColor"]) (geo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true
  })
  return <points geometry={geo} material={mat} frustumCulled={false} position={position} renderOrder={6} />
}

// ---------------- service fx: smoke, warning light, sparks, flames, recovery pulse ----------------

type Health = OfficeState["health"]
const rnd = (a = 1) => Math.random() * a
const TARGETS = { ok: [0, 0, 0], degraded: [0.55, 0, 1], down: [1, 1, 1] } as const

export function ServiceFx({ svc, healthRef, top = 2.3, spread = 0.45, front = 0.5, lightX = 0.5 }: { svc: keyof Health; healthRef: RefObject<Health | undefined>; top?: number; spread?: number; front?: number; lightX?: number }) {
  const reduced = useReducedMotionRef()
  const st = useRef({ smoke: 0, fire: 0, warn: 0, acc: 0, nextSpark: 1, wasBad: false, sparkle: 0, sparkT: 0, rec: -1 })
  const flames = useRef<THREE.Group>(null)
  const light = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const glowM = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const check = useRef<THREE.Group>(null)
  const checkMat = useRef<THREE.MeshBasicMaterial>(null)
  const outer = useRef<THREE.MeshBasicMaterial>(null)
  const inner = useRef<THREE.MeshBasicMaterial>(null)
  const dimC = useMemo(() => new THREE.Color("#3a3a3a"), [])
  const redC = useMemo(() => new THREE.Color(RED), [])
  const flameXs = useMemo(() => [-spread * 0.6, 0.05, spread * 0.65], [spread])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    const t = state.clock.elapsedTime
    const lvl = healthRef.current?.[svc] ?? "ok"
    const [ts, tf, tw] = TARGETS[lvl]
    const k = reduced.current ? 1 : 1 - Math.exp(-dt / 0.5)
    s.smoke += (ts - s.smoke) * k
    s.fire += (tf - s.fire) * k
    s.warn += (tw - s.warn) * k
    const bad = lvl !== "ok"
    if (s.wasBad && !bad) {
      s.rec = 0
      s.sparkle = 14
    }
    s.wasBad = bad
    // warning light
    const blink = reduced.current ? 1 : Math.sin(t * (lvl === "down" ? 9 : 5)) > 0 ? 1 : 0.15
    if (light.current) light.current.color.copy(dimC).lerp(redC, s.warn * blink)
    if (glow.current) glow.current.opacity = 0.35 * s.warn * blink
    if (glowM.current) glowM.current.visible = s.warn > 0.02
    // flames
    if (flames.current) {
      flames.current.visible = s.fire > 0.02
      flames.current.children.forEach((c, i) => {
        const f = reduced.current ? 0.8 : 0.75 + 0.25 * Math.sin(t * 13 + i * 2.1) + 0.18 * Math.sin(t * 23 + i * 5)
        c.scale.set(s.fire * (0.9 + 0.2 * Math.sin(t * 17 + i)), s.fire * f, s.fire * (0.9 + 0.2 * Math.cos(t * 15 + i)))
        c.rotation.z = reduced.current ? 0 : Math.sin(t * 9 + i * 1.7) * 0.12
      })
    }
    if (outer.current) outer.current.opacity = 0.85 * Math.min(1, s.fire * 1.5)
    if (inner.current) inner.current.opacity = 0.9 * Math.min(1, s.fire * 1.5)
    // recovery pulse (once)
    if (s.rec >= 0) {
      s.rec += dt
      const p = s.rec / 1.6
      if (p >= 1) s.rec = -1
      const q = Math.min(1, p)
      if (ring.current && ringMat.current) {
        ring.current.visible = !reduced.current
        ring.current.scale.setScalar(0.5 + q * 2.4)
        ringMat.current.opacity = 0.6 * (1 - q)
      }
      if (check.current && checkMat.current) {
        check.current.visible = true
        const pop = Math.min(1, q / 0.2)
        check.current.scale.setScalar(pop * (1 - Math.max(0, q - 0.7) / 0.3 * 0.2))
        check.current.position.y = top + 0.9 + q * 0.3
        checkMat.current.opacity = Math.min(1, (1 - q) * 2.5)
      }
    } else {
      if (ring.current) ring.current.visible = false
      if (check.current) check.current.visible = false
    }
  })

  const smokeUpdate = (p: Pool, dt: number) => {
    const s = st.current
    s.acc += dt * s.smoke * 9
    while (s.acc >= 1) {
      s.acc -= 1
      p.spawn({ x: (rnd() - 0.5) * spread * 2, y: top + 0.05, z: (rnd() - 0.5) * 0.5, vx: 0.1 + rnd(0.15), vy: 0.8 + rnd(0.4), vz: 0.04, life: 2.2 + rnd(0.8), size: 0.3, grow: 0.28, a: 0.32, drag: 0.35, color: "#2b2b33" })
    }
  }
  const sparkUpdate = (p: Pool, dt: number) => {
    const s = st.current
    if (s.warn > 0.3) {
      s.nextSpark -= dt
      if (s.nextSpark <= 0) {
        s.nextSpark = (s.fire > 0.5 ? 0.4 : 0.9) + rnd(1.4)
        const cx = (rnd() - 0.5) * spread * 1.6
        const cy = top - 0.4 - rnd(0.8)
        for (let i = 0; i < 5; i++) p.spawn({ x: cx, y: cy, z: front + 0.05, vx: (rnd() - 0.5) * 1.8, vy: 0.4 + rnd(1.4), vz: 0.4 + rnd(1), life: 0.25 + rnd(0.25), size: 0.09, grav: 4, color: i % 2 ? "#ffe2a8" : "#ffffff" })
      }
    }
    if (s.sparkle > 0) {
      s.sparkT -= dt
      if (s.sparkT <= 0) {
        s.sparkT = 0.06
        s.sparkle--
        p.spawn({ x: (rnd() - 0.5) * spread * 2, y: top - 0.6 + rnd(0.8), z: front + 0.1 + rnd(0.2), vy: 0.7 + rnd(0.5), life: 1.1, size: 0.16, grow: -0.08, grav: -0.1, color: s.sparkle % 2 ? "#c9ffe0" : "#ffffff" })
      }
    }
  }

  return (
    <group>
      <ParticleLayer count={26} update={smokeUpdate} />
      <ParticleLayer count={20} update={sparkUpdate} />
      {/* warning light */}
      <mesh position={[lightX, top + 0.1, front - 0.15]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshBasicMaterial ref={light} color="#3a3a3a" toneMapped={false} />
      </mesh>
      <mesh ref={glowM} position={[lightX, top + 0.1, front - 0.15]} visible={false}>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshBasicMaterial ref={glow} color={RED} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* flames */}
      <group ref={flames} position={[0, top, 0]} visible={false}>
        {flameXs.map((x, i) => (
          <group key={i} position={[x, 0, (i - 1) * 0.12]}>
            <mesh position={[0, 0.25, 0]}>
              <coneGeometry args={[0.14, 0.5, 8]} />
              <meshBasicMaterial ref={i === 0 ? outer : undefined} color="#ff4a1c" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.15, 0.02]}>
              <coneGeometry args={[0.075, 0.3, 8]} />
              <meshBasicMaterial ref={i === 0 ? inner : undefined} color="#ffb347" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      {/* recovery: green-white ring on the floor + check */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0.2]} visible={false}>
        <ringGeometry args={[0.55, 0.62, 40]} />
        <meshBasicMaterial ref={ringMat} color="#c9ffe0" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={check} position={[0, top + 0.9, front]} visible={false} rotation={[0, Math.PI / 4, 0]}>
        <mesh position={[-0.09, -0.04, 0]} rotation={[0, 0, -0.78]}>
          <boxGeometry args={[0.1, 0.22, 0.04]} />
          <meshBasicMaterial ref={checkMat} color="#d9ffe9" transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh position={[0.1, 0.04, 0]} rotation={[0, 0, 0.78]}>
          <boxGeometry args={[0.1, 0.42, 0.04]} />
          <meshBasicMaterial color="#d9ffe9" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------- on-call door: ring waves + bobbing phone ----------------

/** Lives in the door's group (door plane faces +z). `amt` ref is the smoothed 0..1 "ringing" level, also used by the door shake. */
export function DoorRing({ waiting, amt }: { waiting: boolean; amt: RefObject<number> }) {
  const reduced = useReducedMotionRef()
  const rings = useRef<THREE.Group>(null)
  const phone = useRef<THREE.Group>(null)
  const w = useRef(waiting)
  useEffect(() => {
    w.current = waiting
  }, [waiting])
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    amt.current += ((w.current ? 1 : 0) - amt.current) * (1 - Math.exp(-dt / 0.35))
    const a = amt.current
    if (rings.current) {
      rings.current.visible = a > 0.02
      rings.current.children.forEach((c, i) => {
        const p = reduced.current ? 0.35 : (t * 0.75 + i / 3) % 1
        const m = c as THREE.Mesh
        m.scale.set(0.6 + p * 2.2, 0.6 + p * 2.2, 1)
        ;(m.material as THREE.MeshBasicMaterial).opacity = a * 0.7 * (1 - p) * (reduced.current ? 0.6 : 1)
      })
    }
    if (phone.current) {
      phone.current.visible = a > 0.02
      phone.current.scale.setScalar(a * 1.9)
      phone.current.position.y = 2.75 + (reduced.current ? 0 : Math.sin(t * 5) * 0.1)
      phone.current.rotation.z = reduced.current ? 0 : Math.sin(t * 28) * 0.16 * (Math.sin(t * 4) > 0 ? 1 : 0.2)
    }
  })
  return (
    <group>
      <group ref={rings} position={[0, 1.15, 0.2]} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <ringGeometry args={[0.55, 0.6, 48]} />
            <meshBasicMaterial color={RED} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={phone} position={[1.35, 2.75, 0.25]} visible={false}>
        <mesh>
          <boxGeometry args={[0.26, 0.46, 0.06]} />
          <meshBasicMaterial color={RED} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0.035]}>
          <boxGeometry args={[0.2, 0.3, 0.01]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.17, 0.045]}>
          <circleGeometry args={[0.025, 8]} />
          <meshBasicMaterial color={RED} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------- incident board: red pulse on open, confetti on resolved ----------------

/** Lives in the board's rotated group; board centre at y = 1.95. */
export function BoardFx({ W, H }: { W: number; H: number }) {
  const office = useOffice()
  const reduced = useReducedMotionRef()
  const open = office?.openIncidents.length ?? -1
  const prev = useRef(-1)
  const pulse = useRef(-1)
  const burst = useRef(0)
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useEffect(() => {
    if (open < 0) return
    if (prev.current >= 0) {
      if (open > prev.current) pulse.current = 0
      else if (open < prev.current) burst.current = 20
    }
    prev.current = open
  }, [open])
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    if (pulse.current >= 0 && mesh.current && mat.current) {
      pulse.current += dt
      const p = pulse.current / 1.4
      const k = reduced.current ? 1 : 1 + p * 0.1
      mesh.current.scale.set(k, k, 1)
      mat.current.opacity = p >= 1 ? 0 : 0.5 * Math.pow(1 - p, 1.5) * (reduced.current ? 1 : 0.6 + 0.4 * Math.sin(p * 20))
      mesh.current.visible = p < 1
      if (p >= 1) pulse.current = -1
    }
  })
  const update = (p: Pool) => {
    while (burst.current > 0) {
      burst.current--
      const a = rnd(Math.PI * 2)
      const sp = 1 + rnd(2)
      p.spawn({ x: (rnd() - 0.5) * W * 0.8, y: 1.95 + (rnd() - 0.2) * H * 0.4, z: 0.2, vx: Math.cos(a) * sp, vy: 1.2 + rnd(1.8), vz: Math.sin(a) * sp * 0.5, life: 1.5 + rnd(0.7), size: 0.12, grav: 2.2, drag: 0.8, a: 0.9, color: ["#ffffff", "#e8e8ff", "#c9c9e6", "#fff3d6"][Math.floor(rnd(4))] })
    }
  }
  return (
    <group>
      <mesh ref={mesh} position={[0, 1.95, -0.08]} visible={false}>
        <planeGeometry args={[W + 0.4, H + 0.4]} />
        <meshBasicMaterial ref={mat} color={RED} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <ParticleLayer count={22} update={update} />
    </group>
  )
}
