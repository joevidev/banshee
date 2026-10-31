"use client"
// Scene primitives for the world: same API as components/office/primitives, restyled (soft outlines, glass chip labels).
import { Edges, Html } from "@react-three/drei"
import { OverlayCtx, useOverlay } from "../../office/primitives"
import type { ReactNode } from "react"

export { OverlayCtx, useOverlay }
export const INK = "#16161c"
export const EDGE = "#6e6e7a"
export const PAPER = "#ffffff"
export const RED = "#e5484d"
export const PUMPKIN = "#f08a2d"

type BlockProps = {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  edge?: string
  rotationY?: number
  shadow?: boolean
  children?: ReactNode
}

export function Block({ position, size, color = PAPER, edge, rotationY = 0, shadow = true, children }: BlockProps) {
  // keep dark blocks (screens, rack fronts) fully dark; everything else gets a soft grey outline
  const e = edge === INK || edge === "#111111" || !edge ? EDGE : edge
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0} envMapIntensity={0.5} />
      <Edges color={e} threshold={20} />
      {children}
    </mesh>
  )
}

/** Small glass chip floating in the scene; fades out when the camera is zoomed far out (see --bn-label-o set by the rig). */
export function SpotLabel({ position, children, tone = "muted" }: { position: [number, number, number]; children: ReactNode; tone?: "muted" | "red" }) {
  const portal = useOverlay()
  return (
    <Html portal={portal} position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className="glass-chip bn-world-label" data-tone={tone === "red" ? "bad" : "ok"}>
        <span className="dot" />
        {children}
      </div>
    </Html>
  )
}
