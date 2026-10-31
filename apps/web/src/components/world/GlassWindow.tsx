"use client"
// Draggable, collapsible, closable glass window. Position and collapsed state are remembered per `id` (localStorage, best effort).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

type Anchor = "tl" | "tr" | "bl" | "br"
export type GlassWindowProps = {
  id: string
  title: string
  /** corner of the screen the window is placed against on first open */
  anchor?: Anchor
  /** distance in px from that corner */
  offset?: { x: number; y: number }
  size: { w: number; h?: number }
  children: ReactNode
  onClose?: () => void
  /** start collapsed (header only) */
  defaultCollapsed?: boolean
  /** extra buttons rendered in the header, before collapse/close */
  actions?: ReactNode
}

let zTop = 30
const key = (id: string) => `bn-win:${id}`

function initialPos(anchor: Anchor, offset: { x: number; y: number }, w: number, h: number) {
  const W = typeof window === "undefined" ? 1440 : window.innerWidth
  const H = typeof window === "undefined" ? 900 : window.innerHeight
  const x = anchor === "tl" || anchor === "bl" ? offset.x : W - w - offset.x
  const y = anchor === "tl" || anchor === "tr" ? offset.y : H - h - offset.y
  return { x: Math.max(8, x), y: Math.max(8, y) }
}

export function GlassWindow({ id, title, anchor = "tr", offset = { x: 16, y: 16 }, size, children, onClose, defaultCollapsed = false, actions }: GlassWindowProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [z, setZ] = useState(() => ++zTop)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    let saved: { x: number; y: number; c: boolean } | null = null
    try { saved = JSON.parse(localStorage.getItem(key(id)) ?? "null") } catch {}
    const h = size.h ?? 320
    const p = saved ?? { ...initialPos(anchor, offset, size.w, h), c: defaultCollapsed }
    setPos({ x: Math.min(p.x, window.innerWidth - 60), y: Math.min(p.y, window.innerHeight - 40) })
    setCollapsed(saved ? saved.c : defaultCollapsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const persist = useCallback((p: { x: number; y: number }, c: boolean) => {
    try { localStorage.setItem(key(id), JSON.stringify({ ...p, c })) } catch {}
  }, [id])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".gw-btn")) return
    setZ(++zTop)
    if (!pos) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const x = Math.min(Math.max(e.clientX - drag.current.dx, 4), window.innerWidth - 80)
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 4), window.innerHeight - 40)
    setPos({ x, y })
  }
  const onUp = () => { if (drag.current && pos) persist(pos, collapsed); drag.current = null }

  if (!pos) return null
  return (
    <div className="gw glass" data-collapsed={collapsed} style={{ left: pos.x, top: pos.y, width: size.w, height: collapsed ? "auto" : size.h, maxHeight: "calc(100vh - 24px)", zIndex: z }} onPointerDown={() => setZ(++zTop)}>
      <div className="gw-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <span className="gw-title">{title}</span>
        {actions}
        <button className="gw-btn" aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => { const c = !collapsed; setCollapsed(c); persist(pos, c) }}>{collapsed ? "+" : "–"}</button>
        {onClose && <button className="gw-btn" aria-label="Close" onClick={onClose}>×</button>}
      </div>
      <div className="gw-body">{children}</div>
    </div>
  )
}
