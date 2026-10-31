"use client"

import type { IncidentState } from "@banshee/contracts"
import type { ReactNode } from "react"
import { useNow } from "@/lib/office/client"
import { fmtDuration, STEP_TEXT, Stepper } from "./incident"

export function PhoneShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-background px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight text-ink">Banshee</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{title}</span>
      </header>
      {children}
    </div>
  )
}

export function LiveStep({ incident }: { incident: IncidentState }) {
  const now = useNow()
  const open = incident.step !== "resolved"
  const elapsed = (incident.resolvedAt ?? now) - incident.openedAt
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] font-semibold text-ink">#{incident.id}</span>
        <span className={"font-mono text-[13px] tabular-nums " + (open ? "text-red" : "text-ink")}>{now ? fmtDuration(elapsed) : ""}</span>
      </div>
      <span className="text-lg font-medium text-ink">{STEP_TEXT[incident.step]}</span>
      <Stepper step={incident.step} compact />
    </div>
  )
}
