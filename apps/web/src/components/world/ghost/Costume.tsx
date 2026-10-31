"use client"
// 3D costumes for the ghosts, built from a few primitive meshes. Placed in the ghost's local space (head top at y ~ 1.3, face towards +z).
import type { ServiceName } from "@banshee/contracts"
import { DoubleSide } from "three"

const INK = "#17171b"
const ORANGE = "#f08a24"
const GLOW = "#ffd98a"

function Dark({ children, ...p }: React.ComponentProps<"mesh">) {
  return (
    <mesh {...p}>
      {children}
      <meshStandardMaterial color={INK} roughness={0.8} />
    </mesh>
  )
}

export function Costume({ service }: { service: ServiceName }) {
  if (service === "payments") return <Witch />
  if (service === "checkout") return <Pumpkin />
  return <Vampire />
}

function Witch() {
  return (
    <group position={[0, 1.2, 0]} rotation={[-0.08, 0, 0.1]}>
      <Dark position={[0, 0, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.04, 28]} />
      </Dark>
      <Dark position={[0, 0.17, 0]}>
        <coneGeometry args={[0.29, 0.36, 20]} />
      </Dark>
      <group position={[0.02, 0.33, 0]} rotation={[0, 0, -0.38]}>
        <Dark position={[0, 0.17, 0]}>
          <coneGeometry args={[0.17, 0.36, 16]} />
        </Dark>
      </group>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.3, 0.32, 0.08, 24]} />
        <meshStandardMaterial color="#f2f2f5" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.07, 0.315]}>
        <boxGeometry args={[0.1, 0.095, 0.03]} />
        <meshStandardMaterial color={ORANGE} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.07, 0.332]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshStandardMaterial color="#f2f2f5" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Pumpkin() {
  const mat = <meshStandardMaterial color={ORANGE} roughness={0.7} emissive={ORANGE} emissiveIntensity={0.12} />
  return (
    <group position={[0, 1.3, 0]}>
      <mesh scale={[0.78, 0.7, 0.78]} position={[0, 0.07, 0]}>
        <sphereGeometry args={[0.27, 20, 14]} />
        {mat}
      </mesh>
      <mesh scale={[0.5, 0.7, 0.78]} position={[0.14, 0.07, 0]}>
        <sphereGeometry args={[0.27, 16, 12]} />
        {mat}
      </mesh>
      <mesh scale={[0.5, 0.7, 0.78]} position={[-0.14, 0.07, 0]}>
        <sphereGeometry args={[0.27, 16, 12]} />
        {mat}
      </mesh>
      <mesh position={[0.01, 0.3, 0]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.03, 0.045, 0.12, 8]} />
        <meshStandardMaterial color="#3a7d44" roughness={0.8} />
      </mesh>
      {/* jack-o'-lantern face */}
      <mesh position={[-0.08, 0.1, 0.205]}>
        <circleGeometry args={[0.045, 3, Math.PI / 2]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} />
      </mesh>
      <mesh position={[0.08, 0.1, 0.205]}>
        <circleGeometry args={[0.045, 3, Math.PI / 2]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.0, 0.215]}>
        <planeGeometry args={[0.2, 0.04]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Vampire() {
  return (
    <group>
      {/* bat ears */}
      <Dark position={[-0.2, 1.36, -0.02]} rotation={[0, 0, 0.32]}>
        <coneGeometry args={[0.1, 0.3, 4]} />
      </Dark>
      <Dark position={[0.2, 1.36, -0.02]} rotation={[0, 0, -0.32]}>
        <coneGeometry args={[0.1, 0.3, 4]} />
      </Dark>
      {/* cape: open half cylinder behind the body */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.42, 0.58, 0.8, 22, 1, true, Math.PI * 0.42, Math.PI * 1.16]} />
        <meshStandardMaterial color={INK} roughness={0.85} side={DoubleSide} />
      </mesh>
      {/* high collar */}
      <Dark position={[-0.27, 0.98, -0.1]} rotation={[0, 0.5, 0.12]} scale={[1, 1, 0.35]}>
        <coneGeometry args={[0.15, 0.42, 4]} />
      </Dark>
      <Dark position={[0.27, 0.98, -0.1]} rotation={[0, -0.5, -0.12]} scale={[1, 1, 0.35]}>
        <coneGeometry args={[0.15, 0.42, 4]} />
      </Dark>
      {/* fangs */}
      <mesh position={[-0.035, 0.74, 0.355]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.014, 0.05, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.035, 0.74, 0.355]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.014, 0.05, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}
