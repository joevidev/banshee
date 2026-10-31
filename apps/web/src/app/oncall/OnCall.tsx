"use client"

import { useState } from "react"
import { Culprit, fixSentence, RecalledBadge } from "@/components/warroom/incident"
import { LiveStep, PhoneShell } from "@/components/warroom/Phone"
import { postApprove, useLatestIncident } from "@/lib/office/client"

export function OnCall() {
  const incident = useLatestIncident()
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

  if (!incident) {
    return (
      <PhoneShell title="on-call · oncall-joel">
        <div className="flex flex-col gap-2 pt-10">
          <h1 className="text-[30px] font-semibold tracking-tight text-ink">Nothing needs you.</h1>
          <p className="text-[15px] text-muted">The spirits will page you when they have a fix to approve.</p>
        </div>
      </PhoneShell>
    )
  }

  const waiting = incident.step === "awaiting_approval" && !!incident.fix && !incident.fix.rejected
  const fix = incident.fix
  return (
    <PhoneShell title="on-call · oncall-joel">
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center gap-2">
          {waiting && <span className="rounded-full bg-red px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white bn-pulse">needs you</span>}
          {incident.recalledFrom && <RecalledBadge from={incident.recalledFrom} />}
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink">
          {fix ? fixSentence(fix) + (waiting ? "?" : "") : "Agents are investigating."}
        </h1>
        <p className="text-[14px] text-muted">affected: {incident.services.join(", ")}</p>
      </div>
      <LiveStep incident={incident} />
      {incident.culprit && (
        <div className="rounded-xl border border-line bg-card p-4">
          <Culprit culprit={incident.culprit} big />
        </div>
      )}
      {fix?.approvedBy && <p className="font-mono text-[13px] text-ink">Approved by {fix.approvedBy}. Fix is {incident.step === "resolved" ? "done" : "running"}.</p>}
      {fix?.rejected && <p className="font-mono text-[13px] text-red">Rejected. The spirits are holding.</p>}
      {incident.step === "resolved" && incident.postmortem && <p className="text-[14px] leading-snug text-muted">{incident.postmortem}</p>}
      <div className="sticky bottom-4 mt-auto grid grid-cols-[1fr_2fr] gap-3 pt-2">
        <button
          disabled={!waiting || !!busy}
          onClick={() => decide(false)}
          className="h-16 rounded-2xl border border-ink bg-card text-[17px] font-semibold text-ink transition active:scale-[0.98] disabled:border-line disabled:text-faint"
        >
          {busy === "reject" ? "…" : "Reject"}
        </button>
        <button
          disabled={!waiting || !!busy}
          onClick={() => decide(true)}
          className="h-16 rounded-2xl bg-ink text-[19px] font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-faint"
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
      </div>
      {note && <p className="font-mono text-[12px] text-red">{note}</p>}
    </PhoneShell>
  )
}
