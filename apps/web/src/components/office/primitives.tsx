"use client"

import { Edges, Html } from "@react-three/drei"
import { createContext, useContext, type ReactNode, type RefObject } from "react"

/** Stable DOM node for every drei <Html>; without it Html remounts its root once the canvas attaches. */
export const OverlayCtx = createContext<RefObject<HTMLElement> | undefined>(undefined)
export const useOverlay = () => useContext(OverlayCtx)

export const INK = "#111111"
export const PAPER = "#ffffff"
export const RED = "#e5484d"

type BlockProps = {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  edge?: string
  rotationY?: number
  shadow?: boolean
  children?: ReactNode
}

/** White box with crisp black outline: the building block of the office. */
export function Block({ position, size, color = PAPER, edge = INK, rotationY = 0, shadow = true, children }: BlockProps) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
      <Edges color={edge} threshold={20} />
      {children}
    </mesh>
  )
}

/** Small uppercase mono label floating in the scene. */
export function SpotLabel({ position, children, tone = "muted" }: { position: [number, number, number]; children: ReactNode; tone?: "muted" | "red" }) {
  const portal = useOverlay()
  return (
    <Html portal={portal} position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className={"bn-spot-label" + (tone === "red" ? " bn-spot-label--red" : "")}>{children}</div>
    </Html>
  )
}
