"use client"
// On-call phone call: when an incident reaches awaiting_approval the responsible spirit "calls" the human. Ringing -> answer ->
// the spirit reads a report (speech synthesis + text), the human answers by voice or typing, then approves or rejects for real via /api/approve.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { IncidentState, ServiceName } from "@banshee/contracts"
import { useAllIncidents } from "@/lib/office/client"
import { emit, WORLD_EVENTS } from "./contracts"
import { GlassWindow } from "./GlassWindow"
import { GhostBadge } from "./GhostBadge"
import "./call.css"

type Turn = { role: "agent" | "user"; text: string }
type Phase = "idle" | "ringing" | "incall"

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "..." : s)
function fixText(f: NonNullable<IncidentState["fix"]>): string {
  if (f.action === "rollback") return `roll ${f.service} back${f.target ? " to " + f.target : ""}`
  if (f.action === "fallback_on") return `turn on the ${f.target ?? "order"} fallback in ${f.service}`
  return `turn on the ${f.target ?? "read cache"} in ${f.service}`
}
function callerOf(inc: IncidentState): ServiceName {
  if (inc.fix?.service) return inc.fix.service
  if (inc.culprit && inc.culprit.service !== "vendor") return inc.culprit.service
  return inc.services[0] ?? "payments"
}
function reportOf(inc: IncidentState, now: number): string {
  const c = inc.culprit
  const mins = Math.max(0, Math.round((now - inc.openedAt) / 60000))
  const parts = [`This is spirit-${callerOf(inc)} about ${inc.id}. ${inc.services.join(" and ")} ${inc.services.length > 1 ? "are" : "is"} affected, open for ${mins < 1 ? "under a minute" : mins + " minute" + (mins === 1 ? "" : "s")}.`]
  if (c) parts.push(`Root cause: ${c.service}${c.ourCode ? "" : ", not our code"}. ${clip(c.cause, 180)}.`)
  if (c?.evidence?.[0]) parts.push(`Evidence: ${clip(c.evidence[0], 160)}.`)
  if (inc.recalledFrom) parts.push(`I remember ${inc.recalledFrom}: same signature.`)
  if (inc.fix) parts.push(`I propose to ${fixText(inc.fix)}. Do you approve?`)
  return parts.join(" ")
}

type SR = { start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean }
function recognitionCtor(): (new () => SR) | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function CallPanel() {
  const incidents = useAllIncidents()
  const awaiting = useMemo(() => incidents.filter((i) => i.step === "awaiting_approval").sort((a, b) => b.openedAt - a.openedAt)[0], [incidents])
  const [phase, setPhase] = useState<Phase>("idle")
  const [manual, setManual] = useState(false)
  const [callInc, setCallInc] = useState<string | undefined>()
  const handled = useRef<Set<string>>(new Set())
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [decided, setDecided] = useState<string | undefined>()
  const [speaker, setSpeaker] = useState(true)
  const [listening, setListening] = useState(false)
  const [secs, setSecs] = useState(0)
  const [hasMic, setHasMic] = useState(false)
  const speakerRef = useRef(true)
  const recRef = useRef<SR | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const turnsRef = useRef<Turn[]>([])
  const incRef = useRef<IncidentState | undefined>(undefined)
  useEffect(() => { speakerRef.current = speaker }, [speaker])
  useEffect(() => { turnsRef.current = turns }, [turns])
  useEffect(() => { setHasMic(!!recognitionCtor()) }, [])

  const inc = useMemo(() => incidents.find((i) => i.id === (callInc ?? awaiting?.id)), [incidents, callInc, awaiting])
  useEffect(() => { incRef.current = inc }, [inc])
  const service = inc ? callerOf(inc) : awaiting ? callerOf(awaiting) : "payments"

  // ---- speech out ----
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const speak = useCallback((t: string) => {
    try {
      const ss = window.speechSynthesis
      if (!ss || !speakerRef.current) return
      ss.cancel()
      const u = new SpeechSynthesisUtterance(t)
      if (!voiceRef.current) voiceRef.current = ss.getVoices().find((v) => /^en[-_](US|GB)/i.test(v.lang)) ?? ss.getVoices().find((v) => /^en/i.test(v.lang)) ?? null
      if (voiceRef.current) u.voice = voiceRef.current
      u.lang = voiceRef.current?.lang ?? "en-US"
      u.rate = 1
      ss.speak(u)
    } catch {}
  }, [])
  const hush = useCallback(() => { try { window.speechSynthesis?.cancel() } catch {} }, [])
  const say = useCallback((role: Turn["role"], t: string, voice = role === "agent") => {
    setTurns((p) => [...p, { role, text: t }])
    if (voice) speak(t)
  }, [speak])

  // ---- ringing state ----
  useEffect(() => {
    if (phase === "idle" && awaiting && !handled.current.has(awaiting.id)) {
      setCallInc(awaiting.id)
      setPhase("ringing")
    }
    // the incident moved on while ringing: caller hung up
    if (phase === "ringing" && callInc && !incidents.some((i) => i.id === callInc && i.step === "awaiting_approval")) {
      handled.current.add(callInc)
      setPhase("idle")
    }
  }, [awaiting, phase, callInc, incidents])
  const ringing = phase === "ringing"
  const lastRinging = useRef(false)
  useEffect(() => {
    if (lastRinging.current !== ringing) {
      lastRinging.current = ringing
      emit(WORLD_EVENTS.ringing, { ringing })
      if (ringing) emit(WORLD_EVENTS.focusAgent, { service })
    }
  }, [ringing, service])

  // ---- ring tone (WebAudio, only once the user has interacted with the page) ----
  const gesture = useRef(false)
  useEffect(() => {
    const on = () => { gesture.current = true }
    window.addEventListener("pointerdown", on, { once: true })
    window.addEventListener("keydown", on, { once: true })
    try { if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) gesture.current = true } catch {}
    return () => { window.removeEventListener("pointerdown", on); window.removeEventListener("keydown", on) }
  }, [])
  useEffect(() => {
    if (!ringing) return
    let ctx: AudioContext | null = null
    const beep = (at: number) => {
      if (!ctx) return
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = "sine"
      o.frequency.value = 880
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05, at + 0.02)
      g.gain.linearRampToValueAtTime(0, at + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(at)
      o.stop(at + 0.22)
    }
    const ring = () => {
      try {
        if (!gesture.current) return
        if (!ctx) { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return; ctx = new AC() }
        if (ctx.state === "suspended") void ctx.resume().catch(() => {})
        if (ctx.state !== "running") return
        beep(ctx.currentTime)
        beep(ctx.currentTime + 0.35)
      } catch {}
    }
    ring()
    const t = setInterval(ring, 2000)
    return () => { clearInterval(t); try { void ctx?.close() } catch {} }
  }, [ringing])

  // ---- call lifecycle ----
  const answer = useCallback((target?: IncidentState) => {
    const i = target ?? incRef.current
    if (!i) return
    handled.current.add(i.id)
    setCallInc(i.id)
    setPhase("incall")
    setSecs(0)
    setDecided(undefined)
    setTurns([])
    const report = reportOf(i, Date.now())
    setTurns([{ role: "agent", text: report }])
    speak(report)
  }, [speak])
  const end = useCallback(() => {
    hush()
    try { recRef.current?.stop() } catch {}
    setListening(false)
    if (callInc) handled.current.add(callInc)
    setPhase("idle")
    setManual(false)
    setTurns([])
  }, [callInc, hush])
  const decline = useCallback(() => {
    if (callInc) handled.current.add(callInc)
    setPhase("idle")
    setManual(false)
  }, [callInc])

  useEffect(() => {
    const open = () => {
      const a = incRef.current && incRef.current.step === "awaiting_approval" ? incRef.current : undefined
      if (a && phase !== "incall") answer(a)
      else if (!a) setManual(true)
    }
    window.addEventListener(WORLD_EVENTS.openCall, open)
    return () => window.removeEventListener(WORLD_EVENTS.openCall, open)
  }, [answer, phase])

  useEffect(() => {
    if (phase !== "incall") return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }) }, [turns, busy])
  useEffect(() => () => { try { window.speechSynthesis?.cancel() } catch {} }, [])

  // ---- decisions ----
  const decide = useCallback(async (approve: boolean) => {
    const i = incRef.current
    if (!i || busy) return
    setBusy(true)
    say("user", approve ? "Approve the fix." : "Reject the fix.", false)
    try {
      const r = await fetch("/api/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: i.id, approve }) })
      const j = (await r.json()) as { ok: boolean; error?: string }
      if (j.ok) {
        setDecided(approve ? "approved" : "rejected")
        say("agent", approve ? "Approved. I am applying the fix now and I will watch the next windows." : "Understood, rejected. I will look for another option and call you back.")
      } else say("agent", `The approval did not go through: ${j.error ?? "unknown error"}.`)
    } catch {
      say("agent", "I could not reach the approval service. Try again in a moment.")
    }
    setBusy(false)
  }, [busy, say])

  const send = useCallback(async (raw: string, display?: string) => {
    const msg = raw.trim()
    if (!msg || busy) return
    const i = incRef.current
    if (/^(yes[, ]*)?(please )?(approve|go ahead|do it|confirm)\b/i.test(msg) && i?.step === "awaiting_approval") { void decide(true); return }
    if (/^(no[, ]*)?(please )?(reject|decline|do not|don't|cancel)\b/i.test(msg) && i?.step === "awaiting_approval") { void decide(false); return }
    say("user", display ?? msg, false)
    if (/^(report|what happened)/i.test(msg) && i) { say("agent", reportOf(i, Date.now())); return }
    setBusy(true)
    try {
      const history = turnsRef.current.slice(-8)
      const r = await fetch("/api/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: i?.id, service, message: msg, history, incident: i }) })
      const j = (await r.json()) as { ok?: boolean; reply?: string; error?: string }
      say("agent", j.reply ?? j.error ?? "I did not catch that, say it again?")
    } catch {
      say("agent", "The line is noisy, say that again?")
    }
    setBusy(false)
  }, [busy, decide, say, service])

  const submit = () => { const t = text; setText(""); void send(t) }

  const toggleMic = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    if (listening) { try { recRef.current?.stop() } catch {}; return }
    try {
      hush()
      const r = new Ctor()
      r.lang = "en-US"
      r.interimResults = false
      r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) void send(t) }
      r.onend = () => setListening(false)
      r.onerror = () => setListening(false)
      recRef.current = r
      r.start()
      setListening(true)
    } catch { setListening(false) }
  }

  const live = inc?.step === "awaiting_approval" && !decided
  const mm = String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0")

  if (phase === "idle" && !manual) return null

  if (phase === "ringing") {
    return (
      <GlassWindow key="ring" id="call" title="On-call" anchor="br" offset={{ x: 24, y: 24 }} size={{ w: 340 }} onClose={decline}>
        <div className="cl-ring" role="alert">
          <div className="cl-avatar" data-ring="true"><GhostBadge service={service} size={64} /></div>
          <div className="cl-who">spirit-{service} is calling</div>
          <div className="cl-sub">{inc ? `${inc.id} needs your approval${inc.fix ? ": " + fixText(inc.fix) : ""}` : "Approval needed"}</div>
          <div className="cl-actions">
            <button className="cl-btn cl-decline" onClick={decline}>Decline</button>
            <button className="cl-btn cl-answer" onClick={() => answer()}>Answer</button>
          </div>
        </div>
      </GlassWindow>
    )
  }

  if (phase === "idle") {
    return (
      <GlassWindow key="idle" id="call" title="On-call" anchor="br" offset={{ x: 24, y: 24 }} size={{ w: 300 }} onClose={() => setManual(false)}>
        <div className="cl-idle"><span className="cl-dot" />No incident needs you.</div>
      </GlassWindow>
    )
  }

  return (
    <GlassWindow
      key="call"
      id="call"
      title={`Call with spirit-${service} · ${mm}`}
      anchor="br"
      offset={{ x: 24, y: 24 }}
      size={{ w: 380, h: 540 }}
      onClose={end}
      actions={<button className="gw-btn" aria-label={speaker ? "Mute speaker" : "Unmute speaker"} title={speaker ? "Speaker on" : "Speaker off"} onClick={() => { if (speaker) hush(); setSpeaker((v) => !v) }}>{speaker ? "♪" : "×♪"}</button>}
    >
      <div className="cl-call">
        <div className="cl-head">
          <div className="cl-avatar cl-small"><GhostBadge service={service} size={36} /></div>
          <div className="cl-head-txt"><b>spirit-{service}</b><span>{inc ? `${inc.id} · ${inc.step.replace(/_/g, " ")}` : "no incident"}</span></div>
        </div>
        <div className="cl-log" ref={logRef} aria-live="polite">
          {turns.map((t, k) => (
            <div key={k} className="cl-turn" data-role={t.role}><span>{t.role === "agent" ? `spirit-${service}` : "you"}</span><p>{t.text}</p></div>
          ))}
          {busy && <div className="cl-turn" data-role="agent"><p className="cl-typing"><i /><i /><i /></p></div>}
        </div>
        <div className="cl-chips">
          {["Report", "What are you doing?", "Why this fix?"].map((c) => <button key={c} className="cl-chip" disabled={busy} onClick={() => void send(c)}>{c}</button>)}
          <button className="cl-chip" disabled={busy || !live} onClick={() => void decide(true)}>Approve</button>
          <button className="cl-chip" disabled={busy || !live} onClick={() => void decide(false)}>Reject</button>
        </div>
        <div className="cl-input">
          <input value={text} placeholder={listening ? "Listening..." : "Type to the agent"} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit() }} aria-label="Message to the agent" />
          {hasMic && <button className="cl-mic" data-on={listening} onClick={toggleMic} aria-label="Push to talk" title="Push to talk">{listening ? "●" : "mic"}</button>}
          <button className="cl-send" disabled={busy || !text.trim()} onClick={submit}>Send</button>
        </div>
        <div className="cl-actions">
          <button className="cl-btn cl-decline" disabled={busy || !live} onClick={() => void decide(false)}>Reject</button>
          <button className="cl-btn cl-answer" disabled={busy || !live} onClick={() => void decide(true)}>Approve fix</button>
        </div>
        {decided && <div className="cl-result" data-ok={decided === "approved"}>{decided === "approved" ? "Fix approved. Applying." : "Fix rejected."}</div>}
        <button className="cl-end" onClick={end}>End call</button>
      </div>
    </GlassWindow>
  )
}
