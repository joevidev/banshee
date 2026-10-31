"use client"

import { useState } from "react"
import { Culprit, fixSentence, RecalledBadge } from "@/components/warroom/incident"
import { LiveStep } from "@/components/warroom/Phone"
import { CallCard } from "@/components/oncall/CallCard"
import { Chat } from "@/components/oncall/Chat"
import { Postmortem } from "@/components/oncall/Postmortem"
import { postApprove, useLatestIncident } from "@/lib/office/client"
import { SERVICES, type ServiceName } from "@banshee/contracts"
import "@/components/world/world.css"

type Tab = "incident" | "talk" | "chat"

function leadService(i?: { culprit?: { service: string }; services: ServiceName[] }): ServiceName {
  const c = i?.culprit?.service
  if (c && (SERVICES as readonly string[]).includes(c)) return c as ServiceName
  return i?.services[0] ?? "payments"
}

const ICON: Record<Tab, string> = {
  incident: "M12 3 2 20h20L12 3zm0 6v5m0 3v.5",
  talk: "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.5.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.2.2 2.4.55 3.5a1 1 0 0 1-.25 1z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
}

function StatusPill({ tone, children }: { tone: "ok" | "bad" | "wait"; children: string }) {
  const cls = tone === "ok" ? "border-line text-muted" : tone === "wait" ? "border-red bg-red text-white bn-pulse" : "border-red text-red"
  return <span className={"rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider " + cls}>{children}</span>
}

export function OnCall() {
  const incident = useLatestIncident()
  const [tab, setTab] = useState<Tab>("incident")
  const [busy, setBusy] = useState<"approve" | "reject">()
  const [note, setNote] = useState<string>()

  async function decide(approve: boolean) {
    if (!incident) return
    setBusy(approve ? "approve" : "reject")
    setNote(undefined)
    try {
      const r = await postApprove(incident.id, approve)
      if (!r.ok) setNote(r.error ?? "Something went wrong")
    } catch {
      setNote("Could not reach the server")
    } finally {
      setBusy(undefined)
    }
  }

  const waiting = !!incident && incident.step === "awaiting_approval" && !!incident.fix && !incident.fix.rejected
  const open = !!incident && incident.step !== "resolved"
  const fix = incident?.fix
  const lead = leadService(incident)
  const status = !incident ? <StatusPill tone="ok">all clear</StatusPill> : waiting ? <StatusPill tone="wait">needs you</StatusPill> : open ? <StatusPill tone="bad">investigating</StatusPill> : <StatusPill tone="ok">resolved</StatusPill>

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-background">
      <header className="flex flex-none items-center justify-between px-5 pb-3 pt-5">
        <span className="text-[17px] font-semibold tracking-tight text-ink">Banshee</span>
        {status}
      </header>

      <main className={"min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 " + (waiting ? "pb-44" : "pb-28")}>
        {tab === "incident" && (
          <div className="flex flex-col gap-4">
            {!incident ? (
              <div className="pt-6">
                <h1 className="text-[28px] font-semibold tracking-tight text-ink">All clear.</h1>
                <p className="mt-2 text-[15px] text-muted">Banshee will call you when a fix needs your OK.</p>
              </div>
            ) : (
              <>
                <div>
                  {incident.recalledFrom && <div className="mb-2"><RecalledBadge from={incident.recalledFrom} /></div>}
                  <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
                    {waiting ? `${fix ? fix.service : lead} needs your OK` : open ? "Agents are investigating" : "Fixed. All back to normal."}
                  </h1>
                  {fix && <p className="mt-2 text-[16px] text-ink">{fixSentence(fix)}{waiting ? "?" : ""}</p>}
                  <p className="mt-1 text-[13px] text-muted">affected: {incident.services.join(", ")}</p>
                </div>
                <LiveStep incident={incident} />
                {incident.culprit && (
                  <details className="group rounded-xl border border-line bg-card">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium text-ink">
                      Why? Show the evidence
                      <span className="font-mono text-[12px] text-muted group-open:hidden">open</span>
                    </summary>
                    <div className="border-t border-line p-4"><Culprit culprit={incident.culprit} big /></div>
                  </details>
                )}
                {fix?.approvedBy && <p className="font-mono text-[13px] text-ink">Approved by {fix.approvedBy}. Fix is {incident.step === "resolved" ? "done" : "running"}.</p>}
                {fix?.rejected && <p className="font-mono text-[13px] text-red">Rejected. The spirits are holding.</p>}
                {incident.step === "resolved" && incident.postmortem && <Postmortem text={incident.postmortem} />}
              </>
            )}
          </div>
        )}
        {tab === "talk" && <CallCard incident={incident} service={lead} />}
        {tab === "chat" && <div className="h-full min-h-72"><Chat key={lead} incidentId={incident?.id} incident={incident} service={lead} /></div>}
      </main>

      {waiting && (
        <div className="glass fixed inset-x-4 bottom-24 z-20 mx-auto max-w-md p-3">
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <button disabled={!!busy} onClick={() => decide(false)} className="h-14 rounded-2xl border border-ink bg-white/70 text-[16px] font-semibold text-ink transition active:scale-[0.98] disabled:border-line disabled:text-faint">
              {busy === "reject" ? "…" : "Reject"}
            </button>
            <button disabled={!!busy} onClick={() => decide(true)} className="h-14 rounded-2xl bg-ink text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-faint">
              {busy === "approve" ? "Approving…" : "Approve fix"}
            </button>
          </div>
          {note && <p className="mt-2 font-mono text-[12px] text-red">{note}</p>}
        </div>
      )}

      <nav className="glass fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5" style={{ marginBottom: "env(safe-area-inset-bottom)" }} aria-label="Sections">
        {(["incident", "talk", "chat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-current={tab === t} aria-label={t} className={"flex h-12 min-w-[84px] items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium transition " + (tab === t ? "bg-ink text-white" : "text-ink/70 hover:text-ink")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[t]} /></svg>
            {t === "incident" ? "Incident" : t === "talk" ? "Talk" : "Chat"}
          </button>
        ))}
      </nav>
    </div>
  )
}
