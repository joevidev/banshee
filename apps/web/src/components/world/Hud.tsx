"use client"
// Floating glass HUD: brand + stacked service chips (top-left), stats card (top-right), centered pill dock (bottom).
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useConnection, useCurrentIncident, useLatestIncident, useNow, useOffice, useSourceKind } from "@/lib/office/client"
import "./hud.css"

const noop = () => () => {}
const SERVICES = ["checkout", "payments", "inventory", "vendor"] as const

/** lucide-style inline icons: 24 grid, shown at 16px, stroke 1.75 */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{children}</svg>
}
const I = {
  board: <Icon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></Icon>,
  feed: <Icon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>,
  phone: <Icon><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></Icon>,
  zap: <Icon><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></Icon>,
  reset: <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>,
  ghost: <Icon size={14}><path d="M9 10h.01M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></Icon>,
  orders: <Icon size={14}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></Icon>,
  clock: <Icon size={14}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>,
  incident: <Icon size={14}><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" /><path d="M12 9v4M12 17h.01" /></Icon>,
  source: <Icon size={14}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Icon>,
  chev: <Icon size={14}><path d="m6 15 6-6 6 6" /></Icon>,
}

/** collapsed flag per group, remembered in localStorage (best effort) */
function useCollapsed(id: string): [boolean, () => void] {
  const [c, setC] = useState(false)
  useEffect(() => {
    // Intentional: read the remembered state after hydration so the first client render equals the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem(`bn-hud:${id}`) === "1") setC(true) } catch {}
  }, [id])
  return [c, () => { const n = !c; setC(n); try { localStorage.setItem(`bn-hud:${id}`, n ? "1" : "0") } catch {} }]
}

function Card({ id, label, icon, summary, children }: { id: string; label: string; icon: ReactNode; summary?: ReactNode; children: ReactNode }) {
  const [c, toggle] = useCollapsed(id)
  return (
    <section className="glass hud-card" data-collapsed={c} aria-label={label}>
      <button className="hud-card-head" onClick={toggle} aria-expanded={!c} aria-label={(c ? "Expand " : "Collapse ") + label} title={(c ? "Expand " : "Collapse ") + label}>
        <span className="hud-card-ico">{icon}</span>
        <span className="hud-card-title">{label}</span>
        {c && summary}
        <span className="hud-card-chev">{I.chev}</span>
      </button>
      {!c && <div className="hud-card-body">{children}</div>}
    </section>
  )
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

export function GhostMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 21V10a7 7 0 0 1 14 0v11l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="10.5" r="1.1" fill="#111" /><circle cx="14.5" cy="10.5" r="1.1" fill="#111" />
    </svg>
  )
}

export function Hud({ boardOpen, feedOpen, onToggleBoard, onToggleFeed }: { boardOpen: boolean; feedOpen: boolean; onToggleBoard: () => void; onToggleFeed: () => void }) {
  const office = useOffice()
  const conn = useConnection()
  const source = useSourceKind()
  const now = useNow()
  const open = useCurrentIncident()
  const latest = useLatestIncident()
  const incident = open ?? latest
  const isOpen = !!incident && incident.step !== "resolved"
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "")
  const [pop, setPop] = useState(false)
  const [ringing, setRinging] = useState(false)

  useEffect(() => {
    const h = (e: Event) => setRinging(!!(e as CustomEvent<{ ringing?: boolean }>).detail?.ringing)
    window.addEventListener("bn:call-ringing", h)
    return () => window.removeEventListener("bn:call-ringing", h)
  }, [])

  // unread dot: new chatter while the feed is closed
  const lastTs = office?.chatter.length ? office.chatter[office.chatter.length - 1].ts : 0
  const seen = useRef<number | null>(null)
  const [unread, setUnread] = useState(false)
  useEffect(() => {
    if (!office) return
    if (seen.current === null || feedOpen) { seen.current = lastTs; setUnread(false); return }
    if (lastTs > seen.current) setUnread(true)
  }, [lastTs, feedOpen, office])

  const popRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    const h = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node)) setPop(false) }
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(false) }
    window.addEventListener("pointerdown", h)
    window.addEventListener("keydown", k)
    return () => { window.removeEventListener("pointerdown", h); window.removeEventListener("keydown", k) }
  }, [pop])

  const status = source === "mock" && conn === "open" ? "mock" : `${source} · ${conn}`
  const elapsed = incident ? (incident.resolvedAt ?? now) - incident.openedAt : 0
  const bad = office ? SERVICES.filter((s) => office.health[s] !== "ok").length : 0

  return (
    <>
      <div className="hud-tl">
        <div className="glass hud-brand">
          <GhostMark />
          <b>Banshee</b>
          <span className="hud-live" data-s={conn}><i />{status}</span>
        </div>
        <Card id="health" label="Services" icon={I.ghost} summary={<span className="hud-sum" data-bad={bad > 0}>{office ? (bad ? `${bad} down` : "all ok") : "…"}</span>}>
          <ul className="hud-svcs">
            {office
              ? SERVICES.map((s) => {
                  const lvl = office.health[s]
                  return <li key={s} className="hud-svc" data-tone={lvl === "ok" ? "ok" : "bad"}><i className="dot" /><span className="hud-ico">{I.ghost}</span><span className="hud-svc-name">{s}</span>{lvl !== "ok" && <em>{lvl}</em>}</li>
                })
              : <li className="hud-svc"><i className="dot" /><span className="hud-svc-name">connecting…</span></li>}
          </ul>
        </Card>
      </div>

      <div className="hud-tr">
        <Card id="meta" label="Status" icon={I.incident} summary={<span className="hud-sum" data-bad={isOpen}>{incident && now ? fmt(elapsed) : "00:00"}</span>}>
          <dl className="hud-rows">
            <div className="hud-row"><dt>{I.orders}orders/min</dt><dd>{office?.ordersPerMin ?? "–"}</dd></div>
            <div className="hud-row" data-bad={isOpen}><dt>{I.incident}incident</dt><dd>{incident ? <>{incident.id} · {incident.step}</> : "all quiet"}</dd></div>
            <div className="hud-row" data-bad={isOpen}><dt>{I.clock}timer</dt><dd>{incident && now ? fmt(elapsed) : "00:00"}</dd></div>
            <div className="hud-row"><dt>{I.source}source</dt><dd>{source} · {conn}</dd></div>
          </dl>
        </Card>
      </div>

      <nav className="hud-dock" aria-label="Banshee controls">
        <div className="glass hud-dock-bar">
          <button className="hud-btn" aria-pressed={boardOpen} aria-label="Incident board" onClick={onToggleBoard} title="Incident board">{I.board}<span className="lbl">Board</span></button>
          <button className="hud-btn" aria-pressed={feedOpen} aria-label="Agent feed" onClick={onToggleFeed} title="Agent feed">{I.feed}<span className="lbl">Feed</span>{unread && !feedOpen && <i className="hud-badge" />}</button>
          <button className="hud-btn" data-ringing={ringing} aria-label={ringing ? "On-call, incoming call" : "On-call"} onClick={() => window.dispatchEvent(new CustomEvent("bn:open-call"))} title="On-call">{I.phone}<span className="lbl">On-call</span>{ringing && <i className="hud-badge hud-badge-ring" />}</button>
          <div ref={popRef} className="hud-popwrap">
            <button className="hud-btn" aria-pressed={pop} aria-expanded={pop} aria-label="Break production" onClick={() => setPop((v) => !v)} title="Break production">{I.zap}<span className="lbl">Break</span></button>
            {pop && (
              <div className="glass hud-pop">
                <div className="qr">{origin && <QRCodeSVG value={`${origin}/chaos`} size={150} level="M" />}</div>
                <p>Scan and break our production</p>
                <small>{origin}/chaos</small>
              </div>
            )}
          </div>
          <span className="hud-sep" aria-hidden />
          <button className="hud-btn" aria-label="Reset view" onClick={() => window.dispatchEvent(new CustomEvent("bn:reset-view"))} title="Reset view">{I.reset}<span className="lbl">Reset view</span></button>
        </div>
      </nav>
    </>
  )
}
