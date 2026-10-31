"use client"
import type { IncidentState, ServiceName } from "@banshee/contracts"
import { useEffect, useRef, useState } from "react"
import { GhostBadge } from "@/components/world/GhostBadge"

type Msg = { id: number; role: "you" | "agent"; text: string }
const SUGGEST = ["What happened?", "Why?", "What did you see?"]

async function ask(path: "call" | "ask", body: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { reply?: string; text?: string; error?: string }
  const t = j.reply ?? j.text
  if (!r.ok || !t) throw new Error(j.error ?? `The spirit did not answer (${r.status}).`)
  return t
}

export function Chat({ incidentId, service, incident }: { incidentId?: string; service: ServiceName; incident?: IncidentState }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string>()
  const list = useRef<HTMLDivElement>(null)
  const n = useRef(0)

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }) }, [msgs, sending])

  async function send(raw: string) {
    const message = raw.trim().slice(0, 400)
    if (!message || sending) return
    setText("")
    setErr(undefined)
    const history = msgs.slice(-8).map((m) => ({ role: m.role === "you" ? "user" : "agent", text: m.text }))
    setMsgs((m) => [...m, { id: ++n.current, role: "you", text: message }])
    setSending(true)
    try {
      let reply: string
      try { reply = await ask("call", { incidentId, service, message, history, incident }) } catch (e) {
        // fallback when /api/call is missing or broken: the older /api/ask endpoint
        try { reply = await ask("ask", { service, question: message }) } catch { throw e }
      }
      setMsgs((m) => [...m, { id: ++n.current, role: "agent", text: reply }])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card" aria-label="Chat with the spirits">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <GhostBadge service={service} size={22} />
        <span className="font-mono text-[12px] font-medium text-ink">spirit-{service}</span>
      </div>
      <div ref={list} data-testid="chat-list" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-3">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-2 text-[13px] text-muted">
            <p>Ask the spirit anything about this incident.</p>
            <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-ink active:scale-[0.98]">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={"max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug " + (m.role === "you" ? "self-end bg-ink text-white" : "self-start bg-background text-ink")}>{m.text}</div>
        ))}
        {sending && <div className="self-start rounded-2xl bg-background px-3 py-2 font-mono text-[12px] text-muted">sending…</div>}
        {err && <p role="alert" className="font-mono text-[12px] text-red">{err}</p>}
      </div>
      <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <input value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={`Message spirit-${service}…`} aria-label="Message" enterKeyHint="send" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-[16px] text-ink outline-none focus:border-ink" />
        <button type="submit" disabled={sending || !text.trim()} className="h-11 rounded-xl bg-ink px-4 text-[15px] font-semibold text-white disabled:bg-line disabled:text-faint">Send</button>
      </form>
    </section>
  )
}
