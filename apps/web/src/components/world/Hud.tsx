"use client"
// Floating glass HUD: brand + connection (top-left), service health (top-center), metadata (top-right), dock (bottom-left).
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useConnection, useCurrentIncident, useLatestIncident, useNow, useOffice, useSourceKind } from "@/lib/office/client"
import "./hud.css"

const noop = () => () => {}
const SERVICES = ["checkout", "payments", "inventory", "vendor"] as const

function Chev() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M3 7.5 6 4.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
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

function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [c, toggle] = useCollapsed(id)
  return (
    <div className="glass hud-group" data-collapsed={c}>
      <button className="hud-chev" onClick={toggle} aria-label={(c ? "Expand " : "Collapse ") + label} aria-expanded={!c} title={label}><Chev /></button>
      {c ? <span className="ap-lab" style={{ margin: "0 8px 0 0" }}>{label}</span> : children}
    </div>
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

const I = {
  board: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="3.6" height="11" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="6.4" y="2.5" width="3.6" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="10.8" y="2.5" width="3.2" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>,
  feed: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
  bolt: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
  reset: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
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
    window.addEventListener("pointerdown", h)
    return () => window.removeEventListener("pointerdown", h)
  }, [pop])

  const status = source === "mock" && conn === "open" ? "mock" : `${source} · ${conn}`
  const elapsed = incident ? (incident.resolvedAt ?? now) - incident.openedAt : 0

  return (
    <>
      <div className="hud-top">
        <div className="glass hud-brand">
          <GhostMark />
          <b>Banshee</b>
          <span className="hud-live" data-s={conn}><i />{status}</span>
        </div>

        <Group id="health" label="Services">
          <div className="hud-chips">
            {office
              ? SERVICES.map((s) => {
                  const lvl = office.health[s]
                  return <span key={s} className="glass-chip" data-tone={lvl === "ok" ? "ok" : "bad"}><span className="dot" />{s}{lvl !== "ok" && <> · {lvl}</>}</span>
                })
              : <span className="glass-chip">connecting…</span>}
          </div>
        </Group>

        <Group id="meta" label="Status">
          <div className="hud-meta">
            <div className="hud-kv"><b>{office?.ordersPerMin ?? "–"}</b><span>orders/min</span></div>
            <div className="hud-kv" data-bad={isOpen}>
              <b>{incident ? incident.id : "no incident"}{incident && <> · {incident.step}</>}</b>
              <span>{incident ? (isOpen ? "open" : "resolved") : "all quiet"}</span>
            </div>
            <div className="hud-kv" data-bad={isOpen}><b>{incident && now ? fmt(elapsed) : "00:00"}</b><span>timer</span></div>
            <div className="hud-kv"><b>{conn}</b><span>{source}</span></div>
          </div>
        </Group>
      </div>

      <div className="hud-dock">
        <div className="glass hud-dock-bar">
          <button className="hud-btn" aria-pressed={boardOpen} onClick={onToggleBoard} title="Incident board">{I.board}<span className="lbl">Board</span></button>
          <button className="hud-btn" aria-pressed={feedOpen} onClick={onToggleFeed} title="Agent feed">{I.feed}<span className="lbl">Feed</span>{unread && !feedOpen && <i className="unread" />}</button>
          <div ref={popRef} style={{ position: "relative", display: "flex" }}>
            <button className="hud-btn" aria-pressed={pop} onClick={() => setPop((v) => !v)} title="Break production">{I.bolt}<span className="lbl">Break</span></button>
            {pop && (
              <div className="glass hud-pop">
                <div className="qr">{origin && <QRCodeSVG value={`${origin}/chaos`} size={150} level="M" />}</div>
                <p>Scan and break our production</p>
                <small>{origin}/chaos</small>
              </div>
            )}
          </div>
          <button className="hud-btn" onClick={() => window.dispatchEvent(new CustomEvent("bn:reset-view"))} title="Reset view">{I.reset}<span className="lbl">Reset view</span></button>
        </div>
      </div>
    </>
  )
}
