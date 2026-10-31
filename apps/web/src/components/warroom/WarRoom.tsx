"use client"

import type { IncidentState, OfficeState } from "@banshee/contracts"
import { QRCodeSVG } from "qrcode.react"
import { useSyncExternalStore } from "react"
import { Office } from "@/components/office"
import { useConnection, useLatestIncident, useNow, useOffice, useSourceKind } from "@/lib/office/client"
import { Culprit, FixProposal, fmtClock, fmtDuration, HealthPill, RecalledBadge, STEP_TEXT, Stepper } from "./incident"

const noop = () => () => {}
export function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => "")
}

/** `?embed=1` hides the top bar and the QR (used by the landing page preview); `?embed=office` also hides the side column. */
export function useEmbed(): "" | "1" | "office" {
  const q = useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get("embed") ?? "", () => "")
  return q === "office" ? "office" : q ? "1" : ""
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-ink">
        <path d="M5 21V10a7 7 0 0 1 14 0v11l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="9.5" cy="10.5" r="1.1" fill="currentColor" />
        <circle cx="14.5" cy="10.5" r="1.1" fill="currentColor" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight text-ink">Banshee</span>
    </div>
  )
}

function TopBar({ office, incident }: { office?: OfficeState; incident?: IncidentState }) {
  const now = useNow()
  const conn = useConnection()
  const source = useSourceKind()
  const open = incident && incident.step !== "resolved"
  const elapsed = incident ? (incident.resolvedAt ?? now) - incident.openedAt : 0
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-line bg-card px-5">
      <div className="flex items-center gap-5">
        <Wordmark />
        <span className="hidden items-center gap-1.5 font-mono text-[11px] text-faint xl:inline-flex">
          <span className={"size-1.5 rounded-full " + (conn === "open" ? "bg-ink" : "bg-faint bn-blink")} />
          {source} · {conn}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {office ? (
          (["checkout", "payments", "inventory", "vendor"] as const).map((s) => <HealthPill key={s} name={s} level={office.health[s]} />)
        ) : (
          <span className="font-mono text-xs text-faint">connecting…</span>
        )}
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-semibold tabular-nums text-ink">{office?.ordersPerMin ?? "–"}</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">orders/min</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={"font-mono text-[22px] font-semibold tabular-nums " + (open ? "text-red" : "text-ink")}>{incident && now ? fmtDuration(elapsed) : "00:00"}</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{open ? incident.id + " open" : incident ? incident.id + " resolved" : "no incident"}</span>
        </div>
      </div>
    </header>
  )
}

function IncidentCard({ incident }: { incident?: IncidentState }) {
  if (!incident) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Incident</span>
        <p className="text-[15px] font-medium text-ink">All quiet. The spirits are watching their graphs.</p>
        <p className="text-[13px] text-muted">Scan the code below and break production.</p>
      </section>
    )
  }
  const open = incident.step !== "resolved"
  return (
    <section key={incident.id} className={"bn-in flex flex-col gap-4 rounded-xl border bg-card p-5 " + (open ? "border-ink" : "border-line")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-ink">#{incident.relayChannel}</span>
            {open && <span className="rounded-full bg-red px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white bn-pulse">live</span>}
          </div>
          <span className="text-[15px] font-medium text-ink">{STEP_TEXT[incident.step]}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {incident.recalledFrom && <RecalledBadge from={incident.recalledFrom} />}
          <span className="font-mono text-[11px] text-faint">opened {fmtClock(incident.openedAt)}</span>
        </div>
      </div>
      <Stepper step={incident.step} />
      {incident.culprit ? (
        <div className="border-t border-line pt-4">
          <Culprit culprit={incident.culprit} />
        </div>
      ) : (
        <div className="border-t border-line pt-4 font-mono text-[12px] text-muted">
          affected: {incident.services.join(", ")} · looking for the culprit…
        </div>
      )}
      {incident.fix && (
        <div className="border-t border-line pt-4">
          <FixProposal fix={incident.fix} step={incident.step} />
        </div>
      )}
      {incident.postmortem && !open && <p className="border-t border-line pt-4 text-[13px] leading-snug text-muted">{incident.postmortem}</p>}
    </section>
  )
}

function RelayFeed({ office }: { office?: OfficeState }) {
  const chatter = office?.chatter ?? []
  const channel = chatter.length ? chatter[chatter.length - 1].channel : undefined
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Relay</span>
        <span className="font-mono text-[11px] text-faint">{channel ? "#" + channel : ""}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col-reverse gap-2.5 overflow-hidden px-4 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_56px)]">
        {chatter.length === 0 && <span className="font-mono text-[12px] text-faint">no messages yet</span>}
        {[...chatter].reverse().map((c) => {
          const human = !c.from.startsWith("spirit-")
          return (
            <div key={c.ts + c.from} className="bn-in flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2 font-mono text-[11px]">
                <span className={human ? "rounded bg-ink px-1 text-white" : "font-medium text-ink"}>{c.from}</span>
                {c.to && <span className="text-faint">→ {c.to}</span>}
                <span className="ml-auto text-faint tabular-nums">{fmtClock(c.ts)}</span>
              </div>
              <p className="text-[13px] leading-snug text-ink">{c.text}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ChaosQR() {
  const origin = useOrigin()
  const url = origin ? origin + "/chaos" : ""
  return (
    <section className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
      <div className="rounded-md border border-line bg-white p-1.5">{url ? <QRCodeSVG value={url} size={92} level="M" marginSize={0} /> : <div className="size-[92px]" />}</div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-semibold text-ink">Break our production.</span>
        <span className="text-[13px] text-muted">Scan, press a button, watch the spirits get up.</span>
        <span className="truncate font-mono text-[11px] text-faint">{url.replace(/^https?:\/\//, "")}</span>
      </div>
    </section>
  )
}

export function WarRoom() {
  const office = useOffice()
  const latest = useLatestIncident()
  const now = useNow()
  const embed = useEmbed()
  // show the latest incident while open, and for 90 s after it resolved
  const incident = latest && (latest.step !== "resolved" || (latest.resolvedAt && now - latest.resolvedAt < 90_000)) ? latest : undefined
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {!embed && <TopBar office={office} incident={incident} />}
      <main className={"grid min-h-0 flex-1 gap-4 p-4 " + (embed === "office" ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]")}>
        <div className="relative min-h-0 overflow-hidden rounded-xl border border-line bg-[#fafafa]">
          <Office office={office} />
          <div className="pointer-events-none absolute left-4 top-3 font-mono text-[11px] uppercase tracking-wider text-faint">the office · night shift</div>
        </div>
        {embed !== "office" && (
          <aside className="flex min-h-0 flex-col gap-4">
            <IncidentCard incident={incident} />
            <RelayFeed office={office} />
            {!embed && <ChaosQR />}
          </aside>
        )}
      </main>
    </div>
  )
}
