"use client"
// Glass window for the selected spirit: who it is, what it is doing, what it said, and an ASK box.
import type { ServiceName } from "@banshee/contracts"
import { useState } from "react"
import { useOffice } from "@/lib/office/client"
import { GhostBadge } from "./GhostBadge"
import { GlassWindow } from "./GlassWindow"
import "./hud.css"

const ROLE: Record<ServiceName, string> = {
  checkout: "Guards the checkout flow, from cart to paid order.",
  payments: "Guards card payments and the vendor link.",
  inventory: "Guards stock levels and reservations.",
}
const SUGGEST = ["What are you doing?", "What did you see?", "Why?"]
type QA = { q: string; a?: string }

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

export function AgentPanel({ service, onClose }: { service: ServiceName; onClose: () => void }) {
  const office = useOffice()
  const p = office?.agents[service]
  const lines = (office?.chatter ?? []).filter((c) => c.from === `spirit-${service}`).slice(-3).reverse()
  const [qa, setQa] = useState<QA[]>([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const bad = p && p.mood === "alert"

  async function ask(question: string) {
    const q = question.trim().slice(0, 300)
    if (!q || busy) return
    setText("")
    setBusy(true)
    setQa((l) => [...l.slice(-3), { q }])
    let a = "The spirit is out of reach right now. Try again in a moment."
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ service, question: q }) })
      const j = (await r.json()) as { ok?: boolean; text?: string; error?: string }
      a = j.text ?? j.error ?? a
    } catch {}
    setQa((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, a } : x)))
    setBusy(false)
  }

  return (
    <GlassWindow id={`agent-${service}`} title="Spirit" anchor="tr" offset={{ x: 16, y: 76 }} size={{ w: 340 }} onClose={onClose}>
      <div className="ap">
        <div className="ap-hero">
          <GhostBadge service={service} size={64} />
          <div style={{ minWidth: 0 }}>
            <h3>spirit-{service}</h3>
            <p>{ROLE[service]}</p>
            {p && <span className="glass-chip" data-tone={bad ? "bad" : "ok"} style={{ marginTop: 8, boxShadow: "none" }}><span className="dot" />{p.mood}</span>}
          </div>
        </div>

        <div>
          <span className="ap-lab">Doing now</span>
          <div className="ap-doing">{p ? <>{p.activity}<em>@ {p.spot.replace(/_/g, " ")}</em></> : <span className="ap-empty">connecting…</span>}</div>
        </div>

        <div>
          <span className="ap-lab">Last said</span>
          <div className="ap-lines">
            {lines.length ? lines.map((c) => <div key={c.ts + c.text} className="ap-line"><time>{hhmm(c.ts)}</time>{c.text}</div>) : <span className="ap-empty">Quiet so far.</span>}
          </div>
        </div>

        <div>
          <span className="ap-lab">Ask</span>
          <div className="ap-chips">{SUGGEST.map((s) => <button key={s} disabled={busy} onClick={() => ask(s)}>{s}</button>)}</div>
          <form className="ap-form" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
            <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={`Ask spirit-${service}…`} aria-label="Question" />
            <button type="submit" disabled={busy || !text.trim()}>Send</button>
          </form>
          {qa.length > 0 && (
            <div className="ap-qa">
              {qa.map((x, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <div className="ap-q">{x.q}</div>
                  <div className="ap-a">{x.a ?? <span className="ap-typing" aria-label="typing"><i /><i /><i /></span>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassWindow>
  )
}
