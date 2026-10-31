"use client"
import type { IncidentState, ServiceName } from "@banshee/contracts"
import { useEffect, useRef } from "react"
import { GhostBadge } from "@/components/world/GhostBadge"
import { useRealtimeCall } from "@/lib/realtime/useRealtimeCall"

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

const Svg = ({ d, className }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
)
const MIC = "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"
const MIC_OFF = "M1 1l22 22M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M19 10v2a7 7 0 0 1-.1 1.2M5 10v2a7 7 0 0 0 11.4 5.4M12 19v3"
const PHONE = "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"

export function CallCard({ incident, service, compact }: { incident?: IncidentState; service: ServiceName; compact?: boolean }) {
  const call = useRealtimeCall({ incident, service })
  const { state, error, muted, seconds, lines, level, pending, resolving } = call
  const live = state === "live"
  const tr = useRef<HTMLDivElement>(null)
  useEffect(() => { tr.current?.scrollTo({ top: tr.current.scrollHeight }) }, [lines])
  const last = lines.slice(-4)

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-16 w-16 flex-none items-center justify-center">
          {live && <span className="absolute inset-0 rounded-full border-2 border-ink/30 bn-pulse" style={{ transform: `scale(${1 + level * 0.45})`, transition: "transform 80ms linear" }} />}
          <GhostBadge service={service} size={compact ? 40 : 48} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-ink">{live ? `On call with spirit-${service}` : "Talk to Banshee"}</div>
          <div className="font-mono text-[12px] text-muted">
            {state === "connecting" ? "connecting…" : live ? `${mmss(seconds)}${muted ? " · muted" : ""}` : "voice, hands-free"}
          </div>
        </div>
      </div>

      {live || state === "connecting" ? (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={call.toggleMute} disabled={!live} aria-label={muted ? "Unmute" : "Mute"} className={"flex h-14 items-center justify-center gap-2 rounded-2xl border text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-40 " + (muted ? "border-ink bg-ink text-white" : "border-line bg-card text-ink")}>
            <Svg d={muted ? MIC_OFF : MIC} /> {muted ? "Unmute" : "Mute"}
          </button>
          <button onClick={call.hangup} aria-label="Hang up" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-red text-[15px] font-semibold text-white transition active:scale-[0.98]">
            <Svg d={PHONE} className="rotate-[135deg]" /> Hang up
          </button>
        </div>
      ) : (
        <button onClick={call.start} className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-ink text-[18px] font-semibold text-white transition active:scale-[0.98]">
          <Svg d={PHONE} /> {state === "error" ? "Try the call again" : "Talk to Banshee"}
        </button>
      )}

      {error && <p role="alert" className="font-mono text-[12px] text-red">{error}</p>}

      {live && last.length > 0 && (
        <div ref={tr} className="flex max-h-32 min-h-0 flex-col gap-1.5 overflow-y-auto text-[13px] leading-snug">
          {last.map((l) => (
            <p key={l.id} className={l.role === "you" ? "text-right text-muted" : "text-ink"}>
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{l.role === "you" ? "you" : "spirit"} </span>
              {l.text}{l.partial ? "…" : ""}
            </p>
          ))}
        </div>
      )}

      {pending && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-t-3xl border border-line bg-card p-5 shadow-2xl" role="dialog" aria-label="Confirm decision">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">the spirit asks you to confirm</span>
          <h2 className="text-[22px] font-semibold leading-tight text-ink">{pending.label}</h2>
          {pending.reason && <p className="text-[14px] text-muted">{pending.reason}</p>}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <button disabled={resolving} onClick={call.cancel} className="h-16 rounded-2xl border border-ink bg-card text-[17px] font-semibold text-ink active:scale-[0.98] disabled:opacity-50">Cancel</button>
            <button disabled={resolving} onClick={call.confirm} className="h-16 rounded-2xl bg-ink text-[19px] font-semibold text-white active:scale-[0.98] disabled:opacity-50">{resolving ? "…" : "Confirm"}</button>
          </div>
        </div>
      )}
    </div>
  )
}
