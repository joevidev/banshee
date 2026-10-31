"use client"
// OpenAI Realtime over WebRTC. The server mints an ephemeral key (/api/realtime/session); the browser talks to OpenAI directly.
// The model can only REQUEST a decision (function tool). Nothing runs until the human taps Confirm in the UI.
import type { IncidentState } from "@banshee/contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import { postApprove } from "@/lib/office/client"
import { fixText, incidentFacts } from "./persona"

export type CallState = "idle" | "connecting" | "live" | "error"
export type Line = { id: string; role: "you" | "agent"; text: string; partial?: boolean }
export type Pending = { callId: string; approve: boolean; reason: string; label: string }

type Opts = { incident?: IncidentState; service?: string }
type Ev = { type: string; [k: string]: unknown }

export function useRealtimeCall({ incident, service }: Opts) {
  const [state, setState] = useState<CallState>("idle")
  const [error, setError] = useState<string>()
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [level, setLevel] = useState(0)
  const [pending, setPending] = useState<Pending>()
  const [resolving, setResolving] = useState(false)

  const pc = useRef<RTCPeerConnection | null>(null)
  const dc = useRef<RTCDataChannel | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const actx = useRef<AudioContext | null>(null)
  const raf = useRef<number>(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const seen = useRef(new Set<string>())
  const incRef = useRef(incident)
  incRef.current = incident
  const sigSent = useRef("")

  const send = useCallback((ev: Ev) => {
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify(ev))
  }, [])

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current)
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    try { dc.current?.close() } catch {}
    try { pc.current?.getSenders().forEach((s) => s.track?.stop()) } catch {}
    try { pc.current?.close() } catch {}
    mic.current?.getTracks().forEach((t) => t.stop())
    if (audio.current) { audio.current.srcObject = null; audio.current.remove() }
    void actx.current?.close().catch(() => {})
    pc.current = dc.current = mic.current = audio.current = actx.current = null
    setLevel(0)
    setMuted(false)
    setPending(undefined)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const hangup = useCallback(() => { cleanup(); setState("idle"); setSeconds(0) }, [cleanup])

  const upsert = useCallback((id: string, role: Line["role"], text: string, partial: boolean, append: boolean) => {
    setLines((l) => {
      const i = l.findIndex((x) => x.id === id)
      if (i < 0) return [...l, { id, role, text, partial }]
      const n = l.slice()
      n[i] = { ...n[i], text: append ? n[i].text + text : text, partial }
      return n
    })
  }, [])

  const onEvent = useCallback((ev: Ev) => {
    const id = String(ev.item_id ?? ev.response_id ?? ev.event_id ?? Math.random())
    switch (ev.type) {
      case "response.output_audio_transcript.delta":
        upsert("a-" + id, "agent", String(ev.delta ?? ""), true, true)
        break
      case "response.output_audio_transcript.done":
        upsert("a-" + id, "agent", String(ev.transcript ?? ""), false, false)
        break
      case "conversation.item.input_audio_transcription.completed":
        if (String(ev.transcript ?? "").trim()) upsert("u-" + id, "you", String(ev.transcript).trim(), false, false)
        break
      case "response.done": {
        const out = ((ev.response as { output?: Record<string, unknown>[] } | undefined)?.output ?? [])
        for (const it of out) {
          if (it.type !== "function_call" || it.name !== "request_decision") continue
          const callId = String(it.call_id)
          if (seen.current.has(callId)) continue
          seen.current.add(callId)
          let a: { approve?: boolean; reason?: string } = {}
          try { a = JSON.parse(String(it.arguments ?? "{}")) } catch {}
          const fix = incRef.current?.fix
          const approve = a.approve === true
          setPending({ callId, approve, reason: String(a.reason ?? ""), label: fix ? (approve ? "Approve: " : "Reject: ") + fixText(fix) + "?" : approve ? "Approve the fix?" : "Reject the fix?" })
        }
        break
      }
      case "error":
        setError(String((ev.error as { message?: string } | undefined)?.message ?? "Realtime error"))
        break
    }
  }, [upsert])

  const answer = useCallback(async (confirmed: boolean) => {
    const p = pending
    if (!p) return
    setResolving(true)
    let output = confirmed ? "confirmed by the human" : "cancelled by the human"
    const inc = incRef.current
    if (confirmed && inc) {
      try {
        const r = await postApprove(inc.id, p.approve)
        output = r.ok ? (p.approve ? "confirmed by the human; fix approved and now running" : "confirmed by the human; fix rejected") : "the human confirmed but the server refused: " + (r.error ?? "unknown error")
      } catch { output = "the human confirmed but the server could not be reached" }
    }
    send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: p.callId, output } })
    send({ type: "response.create" })
    setPending(undefined)
    setResolving(false)
  }, [pending, send])

  const start = useCallback(async () => {
    if (state === "connecting" || state === "live") return
    setError(undefined)
    setState("connecting")
    setLines([])
    setSeconds(0)
    seen.current.clear()
    sigSent.current = ""
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the microphone (needs https or localhost).")
      const s = await fetch("/api/realtime/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId: incRef.current?.id, service }) })
      const sj = (await s.json().catch(() => ({}))) as { value?: string; error?: string }
      if (!s.ok || !sj.value) throw new Error(sj.error ?? `Voice session failed (${s.status}).`)
      let stream: MediaStream
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) {
        throw new Error("Microphone blocked: " + ((e as Error).name === "NotAllowedError" ? "allow microphone access for this site." : (e as Error).message))
      }
      mic.current = stream
      const conn = new RTCPeerConnection()
      pc.current = conn
      const el = document.createElement("audio")
      el.autoplay = true
      document.body.appendChild(el)
      audio.current = el
      conn.ontrack = (e) => {
        el.srcObject = e.streams[0]
        try {
          const ctx = new AudioContext()
          actx.current = ctx
          const an = ctx.createAnalyser()
          an.fftSize = 256
          ctx.createMediaStreamSource(e.streams[0]).connect(an)
          const buf = new Uint8Array(an.frequencyBinCount)
          const tick = () => {
            an.getByteTimeDomainData(buf)
            let peak = 0
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
            setLevel(Math.min(1, peak / 64))
            raf.current = requestAnimationFrame(tick)
          }
          tick()
        } catch {}
      }
      stream.getTracks().forEach((t) => conn.addTrack(t, stream))
      const ch = conn.createDataChannel("oai-events")
      dc.current = ch
      ch.onmessage = (m) => { try { onEvent(JSON.parse(m.data)) } catch {} }
      ch.onopen = () => {
        setState("live")
        timer.current = setInterval(() => setSeconds((n) => n + 1), 1000)
        const inc = incRef.current
        sigSent.current = JSON.stringify([inc?.id, inc?.step, inc?.fix, !!inc?.culprit])
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "[Current incident facts, use these]\n" + incidentFacts(inc) + "\nStart the call now with your short spoken report." }] } })
        send({ type: "response.create" })
      }
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed" || conn.connectionState === "disconnected") { setError("The voice connection dropped."); cleanup(); setState("error") }
      }
      const offer = await conn.createOffer()
      await conn.setLocalDescription(offer)
      const r = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", body: offer.sdp, headers: { authorization: `Bearer ${sj.value}`, "content-type": "application/sdp" } })
      if (!r.ok) throw new Error(`OpenAI rejected the call (${r.status}).`)
      await conn.setRemoteDescription({ type: "answer", sdp: await r.text() })
    } catch (e) {
      cleanup()
      setError((e as Error).message || "Could not start the call.")
      setState("error")
    }
  }, [state, service, onEvent, send, cleanup])

  // Keep the model's facts fresh when the incident changes during the call.
  const sig = JSON.stringify([incident?.id, incident?.step, incident?.fix, !!incident?.culprit])
  useEffect(() => {
    if (state !== "live" || sig === sigSent.current) return
    sigSent.current = sig
    send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "[Incident update, use these facts from now on]\n" + incidentFacts(incRef.current) }] } })
  }, [sig, state, send])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      mic.current?.getAudioTracks().forEach((t) => (t.enabled = m))
      return !m
    })
  }, [])

  return { state, error, muted, seconds, lines, level, pending, resolving, start, hangup, toggleMute, confirm: () => answer(true), cancel: () => answer(false) }
}
