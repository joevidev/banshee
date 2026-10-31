"use client"
// Draggable, resizable, collapsible, closable glass window. Rect and collapsed state are remembered per `id` (localStorage, best effort).
// Always clamped to the viewport. Double-click the header to maximize / restore.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

type Anchor = "tl" | "tr" | "bl" | "br"
export type GlassWindowProps = {
  id: string
  title: string
  /** corner of the screen the window is placed against on first open */
  anchor?: Anchor
  /** distance in px from that corner */
  offset?: { x: number; y: number }
  /** preferred default size; clamped to the viewport. Without h the window is content-height until resized. */
  size: { w: number; h?: number }
  children: ReactNode
  onClose?: () => void
  /** start collapsed (header only) */
  defaultCollapsed?: boolean
  /** extra buttons rendered in the header, before collapse/close */
  actions?: ReactNode
}

type Rect = { x: number; y: number; w: number; h: number | null }

let zTop = 30
const key = (id: string) => `bn-win2:${id}`
const MIN_W = 320
const MIN_H = 240
const MARGIN = 8

const vp = () => ({ W: typeof window === "undefined" ? 1440 : window.innerWidth, H: typeof window === "undefined" ? 900 : window.innerHeight })

/** keep size within [min, viewport] and the whole window on screen */
function clampRect(r: Rect, collapsedH = 0): Rect {
  const { W, H } = vp()
  const w = Math.round(Math.min(Math.max(r.w, Math.min(MIN_W, W - 2 * MARGIN)), W - 2 * MARGIN))
  const h = r.h === null ? null : Math.round(Math.min(Math.max(r.h, Math.min(MIN_H, H - 2 * MARGIN)), H - 2 * MARGIN))
  const hh = collapsedH || h || 120
  const x = Math.round(Math.min(Math.max(r.x, MARGIN), Math.max(MARGIN, W - w - MARGIN)))
  const y = Math.round(Math.min(Math.max(r.y, MARGIN), Math.max(MARGIN, H - Math.min(hh, 48) - MARGIN)))
  return { x, y, w, h }
}

function initialRect(anchor: Anchor, offset: { x: number; y: number }, size: { w: number; h?: number }): Rect {
  const { W, H } = vp()
  const w = Math.min(size.w, W - 32)
  // keep clear of the dock (bottom) and of the HUD stacks (top-left services card ends ~y=250)
  const room = anchor === "tl" || anchor === "tr" ? H - offset.y - 76 : H - offset.y - 252
  const h = size.h === undefined ? null : Math.max(Math.min(MIN_H + 60, H - 140), Math.min(size.h, H - 140, room))
  const hh = h ?? 360
  const x = anchor === "tl" || anchor === "bl" ? offset.x : W - w - offset.x
  const y = anchor === "tl" || anchor === "tr" ? offset.y : H - hh - offset.y
  return clampRect({ x, y, w, h })
}

type Edge = "e" | "s" | "se"

export function GlassWindow({ id, title, anchor = "tr", offset = { x: 16, y: 16 }, size, children, onClose, defaultCollapsed = false, actions }: GlassWindowProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [maxed, setMaxed] = useState(false)
  const [z, setZ] = useState(() => ++zTop)
  const el = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const rs = useRef<{ edge: Edge; sx: number; sy: number; r: Rect } | null>(null)
  const prev = useRef<Rect | null>(null)
  const live = useRef({ rect, collapsed, maxed })
  useEffect(() => { live.current = { rect, collapsed, maxed } })

  useEffect(() => {
    let saved: (Partial<Rect> & { c?: boolean }) | null = null
    try { saved = JSON.parse(localStorage.getItem(key(id)) ?? "null") } catch {}
    const base = initialRect(anchor, offset, size)
    const r = saved && typeof saved.x === "number" && typeof saved.y === "number"
      ? clampRect({ x: saved.x, y: saved.y, w: typeof saved.w === "number" ? saved.w : base.w, h: typeof saved.h === "number" ? saved.h : base.h })
      : base
    // Intentional: read the remembered rect after hydration so the first client render equals the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRect(r)
    setCollapsed(saved?.c ?? defaultCollapsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // never let the window end up off-screen when the viewport changes
  useEffect(() => {
    const onResize = () => {
      const { rect: r, maxed: m } = live.current
      if (!r) return
      if (m) { const { W, H } = vp(); setRect({ x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN }) } else setRect(clampRect(r))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const persist = useCallback((r: Rect, c: boolean) => {
    try { localStorage.setItem(key(id), JSON.stringify({ ...r, c })) } catch {}
  }, [id])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".gw-btn")) return
    setZ(++zTop)
    if (!rect || maxed || e.button !== 0) return
    drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !rect) return
    setRect(clampRect({ ...rect, x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, collapsed ? 40 : 0))
  }
  const onUp = () => { if (drag.current && rect) persist(rect, collapsed); drag.current = null }

  const toggleMax = () => {
    if (!rect || collapsed) return
    if (maxed) { setMaxed(false); if (prev.current) { setRect(prev.current); persist(prev.current, collapsed) } return }
    prev.current = rect
    const { W, H } = vp()
    setMaxed(true)
    setRect({ x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN })
  }

  const onResizeDown = (e: React.PointerEvent, edge: Edge) => {
    if (!rect || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setZ(++zTop)
    const h = rect.h ?? el.current?.offsetHeight ?? 360
    rs.current = { edge, sx: e.clientX, sy: e.clientY, r: { ...rect, h } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const s = rs.current
    if (!s) return
    const { W, H } = vp()
    const w = s.edge === "s" ? s.r.w : Math.min(Math.max(s.r.w + e.clientX - s.sx, MIN_W), W - s.r.x - MARGIN)
    const h = s.edge === "e" ? (s.r.h as number) : Math.min(Math.max((s.r.h as number) + e.clientY - s.sy, MIN_H), H - s.r.y - MARGIN)
    setRect({ ...s.r, w: Math.max(w, Math.min(MIN_W, W - 2 * MARGIN)), h })
    if (maxed) setMaxed(false)
  }
  const onResizeUp = () => { if (rs.current && rect) persist(rect, collapsed); rs.current = null }

  if (!rect) return null
  return (
    <div ref={el} className="gw glass" data-collapsed={collapsed} data-maxed={maxed} role="dialog" aria-label={title}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: collapsed ? "auto" : rect.h ?? undefined, maxHeight: `calc(100vh - ${2 * MARGIN}px)`, zIndex: z }}
      onPointerDown={() => setZ(++zTop)}>
      <div className="gw-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest(".gw-btn")) toggleMax() }}>
        <span className="gw-title">{title}</span>
        {actions}
        <button className="gw-btn" aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => { const c = !collapsed; setCollapsed(c); persist(rect, c) }}>{collapsed ? "+" : "–"}</button>
        {onClose && <button className="gw-btn" aria-label="Close" onClick={onClose}>×</button>}
      </div>
      <div className="gw-body">{children}</div>
      {!collapsed && (
        <>
          <div className="gw-rs gw-rs-e" onPointerDown={(e) => onResizeDown(e, "e")} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />
          <div className="gw-rs gw-rs-s" onPointerDown={(e) => onResizeDown(e, "s")} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />
          <div className="gw-rs gw-rs-se" aria-label="Resize" onPointerDown={(e) => onResizeDown(e, "se")} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M9 3 3 9M9 6.5 6.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>
          </div>
        </>
      )}
    </div>
  )
}
