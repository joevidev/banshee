"use client"
// Hand tools built from primitives. Each tool's pivot (origin) is the hand; the tool points along +y.
import type { ServiceName } from "@banshee/contracts"

export type ToolKind = "hammer" | "wrench" | "screwdriver"
export const TOOL_FOR: Record<ServiceName, ToolKind> = { payments: "hammer", checkout: "wrench", inventory: "screwdriver" }
const INK = "#141416"
const STEEL = "#b9bcc6"

/** `spin` group (screwdriver only) rotates around the tool's own axis. */
export function Tool({ kind, spin }: { kind: ToolKind; spin?: React.Ref<import("three").Group> }) {
  if (kind === "hammer") {
    return (
      <group>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.025, 0.03, 0.4, 8]} />
          <meshStandardMaterial color="#8a6a48" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.43, 0]}>
          <boxGeometry args={[0.1, 0.1, 0.24]} />
          <meshStandardMaterial color={INK} roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.43, 0.125]}>
          <boxGeometry args={[0.11, 0.11, 0.02]} />
          <meshStandardMaterial color={STEEL} roughness={0.3} metalness={0.6} />
        </mesh>
      </group>
    )
  }
  if (kind === "wrench") {
    return (
      <group>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.025]} />
          <meshStandardMaterial color={STEEL} roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.47, 0]} rotation={[0, 0, 0.5]}>
          <torusGeometry args={[0.075, 0.03, 6, 14, 4.9]} />
          <meshStandardMaterial color={STEEL} roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      </group>
    )
  }
  return (
    <group ref={spin}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.045, 0.04, 0.2, 10]} />
        <meshStandardMaterial color="#e5484d" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.28, 6]} />
        <meshStandardMaterial color={STEEL} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.035, 0.03, 0.008]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    </group>
  )
}
