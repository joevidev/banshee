"use client"
// Floating glass Slack-style feed of what the agents say to each other in Agent Relay channels.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { IncidentState } from "@banshee/contracts"
import { useAllIncidents, useNow, useOffice } from "@/lib/office/client"
import { STEP_TEXT } from "@/components/warroom/incident"
import { GlassWindow } from "./GlassWindow"
import { GhostBadge } from "./GhostBadge"
import { Rich } from "./feed/Rich"
import { buildItems, GENERAL, mergeMessages, serviceOf, typingSpirit, type Item, type Msg } from "./feed/model"
import "./feed.css"

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
const full = (ts: number) => new Date(ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const svc = serviceOf(name)
  if (svc) return <GhostBadge service={svc} size={size} />
  const ini = name.split(/[-_ ]/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  return <span className="fd-human" style={{ width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>
}

function SysIcon({ icon }: { icon: "open" | "cause" | "fix" | "approved" | "done" }) {
  const p = { width: 11, height: 11, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const
  switch (icon) {
    case "open": return <svg {...p}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.4M6 9h0" /></svg>
    case "cause": return <svg {...p}><circle cx="5" cy="5" r="3.2" /><path d="m7.5 7.5 3 3" /></svg>
    case "fix": return <svg {...p}><path d="M2 6h6M6 3l3 3-3 3" /></svg>
    case "approved": return <svg {...p}><circle cx="6" cy="6" r="4.6" /><path d="m4 6.2 1.5 1.5L8.2 4.8" /></svg>
    case "done": return <svg {...p}><path d="m2.5 6.5 2.3 2.3L9.5 3.5" /></svg>
  }
}

function Typing({ who }: { who: string }) {
  return (
    <div className="fd-row fd-typing">
      <Avatar name={who} />
      <div className="fd-body"><span className="fd-dots" aria-label={who + " is typing"}><i /><i /><i /></span><span className="fd-typing-label">{who} is typing</span></div>
    </div>
  )
}

export function FeedPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <FeedWindow onClose={onClose} />
}

function FeedWindow({ onClose }: { onClose: () => void }) {
  const office = useOffice()
  const now = useNow()
  const incidents = useAllIncidents()

  // History we keep even after the server rolls its chatter window over.
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [known, setKnown] = useState<Record<string, IncidentState>>({})
  const chatter = office?.chatter
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsgs((p) => mergeMessages(p, chatter ?? [], incidents))
    setKnown((p) => {
      let ch = false
      const n = { ...p }
      for (const i of incidents) if (p[i.id] !== i) { n[i.id] = i; ch = true }
      return ch ? n : p
    })
  }, [chatter, incidents])

  const channels = useMemo(() => {
    const set = new Map<string, number>() // channel -> last activity
    set.set(GENERAL, 0)
    for (const m of msgs) set.set(m.channel, Math.max(set.get(m.channel) ?? 0, m.ts))
    for (const i of Object.values(known)) set.set(i.relayChannel, Math.max(set.get(i.relayChannel) ?? 0, i.openedAt))
    const inc = [...set.keys()].filter((c) => c !== GENERAL).sort((a, b) => (set.get(b) ?? 0) - (set.get(a) ?? 0))
    return [GENERAL, ...inc]
  }, [msgs, known])
  const incByChannel = useMemo(() => Object.fromEntries(Object.values(known).map((i) => [i.relayChannel, i])), [known])

  // Active channel: user choice wins until a new incident channel appears, then jump to it.
  const [active, setActive] = useState(GENERAL)
  const seenChannels = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!office) return
    const cur = new Set(channels)
    if (seenChannels.current === null) {
      seenChannels.current = cur
      const openNow = channels.find((c) => c !== GENERAL && incByChannel[c] && incByChannel[c].step !== "resolved")
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (openNow) setActive(openNow)
      return
    }
    const prevSeen = seenChannels.current
    const fresh = channels.find((c) => c !== GENERAL && !prevSeen.has(c))
    seenChannels.current = cur
    if (fresh) setActive(fresh)
  }, [channels, office, incByChannel])

  // unread dots
  const [seen, setSeen] = useState<Record<string, number>>({})
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of msgs) c[m.channel] = (c[m.channel] ?? 0) + 1
    return c
  }, [msgs])
  const baselined = useRef(false)
  useEffect(() => {
    // history that was already there when the panel opened is not "unread"
    if (!baselined.current && msgs.length) { baselined.current = true; setSeen(counts); return }
    setSeen((s) => (s[active] === (counts[active] ?? 0) ? s : { ...s, [active]: counts[active] ?? 0 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, counts])

  const inc = incByChannel[active]
  const items = useMemo(() => buildItems(active, msgs, inc), [active, msgs, inc])
  const lastMsg = [...items].reverse().find((i): i is Msg => i.kind === "msg")
  const typing = typingSpirit(lastMsg, !!inc && inc.step !== "resolved" && items[items.length - 1] === lastMsg, now)

  // scrolling
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [pill, setPill] = useState(0)
  const lastLen = useRef(0)
  const lastChan = useRef(active)
  const total = items.length + (typing ? 1 : 0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (lastChan.current !== active) {
      lastChan.current = active
      stick.current = true
      el.scrollTop = el.scrollHeight
      lastLen.current = total
      setPill(0)
      return
    }
    const added = total - lastLen.current
    lastLen.current = total
    if (stick.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: added > 0 && added < 6 ? "smooth" : "auto" })
    } else if (added > 0) setPill((p) => p + added)
  }, [total, active])
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (stick.current) setPill(0)
  }
  const jump = () => {
    const el = scroller.current
    if (!el) return
    stick.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    setPill(0)
  }

  // group consecutive messages of the same author
  const rows = items.map((it, k) => {
    const prev = items[k - 1]
    const grouped = it.kind === "msg" && prev?.kind === "msg" && prev.from === it.from && it.ts - prev.ts < 120_000
    return { it, grouped }
  })

  return (
    <GlassWindow id="feed" title="Agents" anchor="bl" offset={{ x: 16, y: 76 }} size={{ w: 430, h: 520 }} onClose={onClose}>
      <div className="fd-root">
        <nav className="fd-rail" aria-label="Channels">
          {channels.map((c) => {
            const i = incByChannel[c]
            const live = !!i && i.step !== "resolved"
            const unread = c !== active && (counts[c] ?? 0) > (seen[c] ?? 0)
            return (
              <button key={c} className="fd-chan" data-active={c === active} data-unread={unread} onClick={() => setActive(c)}>
                <span className="fd-hash">#</span>
                <span className="fd-chan-name">{c}</span>
                {live && <span className="fd-live" title="incident open" />}
                {unread && <span className="fd-unread" aria-label="unread" />}
              </button>
            )
          })}
        </nav>
        <section className="fd-main">
          <header className="fd-main-head">
            <span className="fd-main-title"># {active}</span>
            {inc ? <span className="fd-step" data-live={inc.step !== "resolved"}>{STEP_TEXT[inc.step]}</span> : <span className="fd-step">Agent Relay</span>}
          </header>
          <div className="fd-scroll" ref={scroller} onScroll={onScroll}>
            {items.length === 0 && <p className="fd-empty">{active === GENERAL ? "Quiet night. The spirits are watching their graphs." : "Nothing here yet."}</p>}
            {rows.map(({ it, grouped }) => <Row key={it.key} it={it} grouped={grouped} />)}
            {typing && <Typing who={typing} />}
          </div>
          {pill > 0 && <button className="fd-newpill" onClick={jump}>New messages ↓</button>}
          <div className="fd-composer">
            <textarea disabled rows={2} placeholder="Agents talk here. Humans approve on the board or from /oncall." aria-label="Composer (read-only)" />
          </div>
        </section>
      </div>
    </GlassWindow>
  )
}

function Row({ it, grouped }: { it: Item; grouped: boolean }) {
  if (it.kind === "sys") {
    return (
      <div className="fd-sys" data-icon={it.icon} title={full(it.ts)}>
        <span className="fd-sys-line" />
        <span className="fd-sys-pill"><SysIcon icon={it.icon} /><span>{it.text}</span></span>
        <span className="fd-sys-line" />
      </div>
    )
  }
  return (
    <div className="fd-row" data-grouped={grouped} title={full(it.ts)}>
      {grouped ? <span className="fd-gtime">{hhmm(it.ts)}</span> : <Avatar name={it.from} />}
      <div className="fd-body">
        {!grouped && (
          <div className="fd-meta">
            <b className="fd-name">{it.from}</b>
            <span className="fd-time">{hhmm(it.ts)}</span>
          </div>
        )}
        <p className="fd-text"><Rich text={it.text} /></p>
      </div>
    </div>
  )
}
