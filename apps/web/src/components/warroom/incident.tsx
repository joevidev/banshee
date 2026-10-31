"use client"

import type { FixAction, IncidentState, IncidentStep, OfficeState } from "@banshee/contracts"

export const STEPS: { key: IncidentStep; label: string }[] = [
  { key: "detected", label: "Detect" },
  { key: "investigating", label: "Triage" },
  { key: "root_cause", label: "Cause" },
  { key: "awaiting_approval", label: "Approve" },
  { key: "fixing", label: "Fix" },
  { key: "resolved", label: "Done" },
]

export const STEP_TEXT: Record<IncidentStep, string> = {
  detected: "Detected",
  investigating: "Agents investigating",
  root_cause: "Root cause found",
  awaiting_approval: "Waiting for on-call approval",
  fixing: "Applying the fix",
  resolved: "Resolved",
}

export const FIX_TEXT: Record<FixAction, string> = {
  rollback: "Roll back",
  fallback_on: "Turn on fallback",
  cache_on: "Turn on read cache",
}

export function fixSentence(fix: NonNullable<IncidentState["fix"]>) {
  switch (fix.action) {
    case "rollback":
      return `Roll back ${fix.service}` + (fix.target ? ` to ${fix.target}` : "")
    case "fallback_on":
      return `Turn on ${fix.target ?? "the"} fallback in ${fix.service}`
    case "cache_on":
      return `Turn on ${fix.target ?? "read cache"} in ${fix.service}`
  }
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

export function fmtClock(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function Stepper({ step, compact = false }: { step: IncidentStep; compact?: boolean }) {
  const cur = STEPS.findIndex((s) => s.key === step)
  return (
    <ol className="flex w-full items-center gap-1.5">
      {STEPS.map((s, k) => {
        const done = k < cur || step === "resolved"
        const now = k === cur && step !== "resolved"
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className={"h-1 rounded-full " + (done ? "bg-ink" : now ? "bg-ink bn-blink" : "bg-line")} />
            {!compact && (
              <span className={"truncate font-mono text-[10px] uppercase tracking-wider " + (now ? "text-ink" : done ? "text-muted" : "text-faint")}>
                {s.label}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function RecalledBadge({ from }: { from: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink px-1.5 py-0.5 font-mono text-[11px] text-ink">
      [recalled from {from}]
    </span>
  )
}

export function Culprit({ culprit, big = false }: { culprit: NonNullable<IncidentState["culprit"]>; big?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Culprit</span>
        <span className="rounded-full bg-red px-2 py-0.5 font-mono text-[11px] font-medium text-white">{culprit.service}</span>
        <span className="font-mono text-[11px] text-muted">{culprit.ourCode ? "our code" : "not our bug"}</span>
      </div>
      <p className={(big ? "text-lg" : "text-[15px]") + " font-medium leading-snug text-ink"}>{culprit.cause}</p>
      <ul className="flex flex-col gap-1">
        {culprit.evidence.map((e) => (
          <li key={e} className={(big ? "text-sm" : "text-[13px]") + " flex gap-2 leading-snug text-muted"}>
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FixProposal({ fix, step }: { fix: NonNullable<IncidentState["fix"]>; step: IncidentStep }) {
  const state = fix.rejected
    ? { text: "Rejected", cls: "border-red text-red" }
    : fix.approvedBy
      ? { text: `Approved by ${fix.approvedBy}`, cls: "border-ink bg-ink text-white" }
      : step === "awaiting_approval"
        ? { text: "Waiting for approval", cls: "border-ink text-ink bn-blink" }
        : { text: "Proposed", cls: "border-line text-muted" }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Fix</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[14px] font-medium text-ink">{fixSentence(fix)}</span>
        <span className={"rounded-md border px-2 py-0.5 font-mono text-[11px] " + state.cls}>{state.text}</span>
      </div>
    </div>
  )
}

const HEALTH_LABEL = { ok: "ok", degraded: "degraded", down: "down" } as const

export function HealthPill({ name, level }: { name: string; level: OfficeState["health"]["vendor"] }) {
  const bad = level !== "ok"
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px] transition-colors " +
        (bad ? "border-red bg-red-soft text-red" : "border-line bg-card text-ink")
      }
    >
      <span className={"size-1.5 rounded-full " + (bad ? "bg-red bn-blink" : "bg-ink")} />
      {name}
      {bad && <span className="opacity-80">· {HEALTH_LABEL[level]}</span>}
    </span>
  )
}
