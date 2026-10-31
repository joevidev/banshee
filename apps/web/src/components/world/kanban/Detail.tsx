"use client"
import type { IncidentState } from "@banshee/contracts"
import { useState } from "react"
import { postApprove } from "@/lib/office/client"
import { GhostBadge } from "../GhostBadge"
import { isBroken, leadService, STEP_COLUMN } from "./model"

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false })

export function Detail({ inc, onBack }: { inc: IncidentState; onBack: () => void }) {
  const [busy, setBusy] = useState<null | "approve" | "reject">(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<null | "approve" | "reject">(null)
  const broken = isBroken(inc)
  const awaiting = inc.step === "awaiting_approval"

  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject")
    setError(null)
    try {
      const r = await postApprove(inc.id, approve)
      if (!r.ok) setError(r.error ?? "Request failed")
      else setSent(approve ? "approve" : "reject")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="kb-detail">
      <div className="kb-dhead">
        <button className="kb-back" onClick={onBack} aria-label="Back to board">← Board</button>
        <span className="kb-id">{inc.id}</span>
        <span className="kb-stage" data-broken={broken && inc.step !== "resolved"}>{STEP_COLUMN[inc.step]}</span>
        {inc.recalledFrom && <span className="kb-recall" title="The spirit remembered a similar past incident">↺ recalled from {inc.recalledFrom}</span>}
      </div>

      <div className="kb-dtitle">
        <GhostBadge service={leadService(inc)} size={26} />
        <div>{inc.culprit?.cause ?? "Investigating…"}</div>
      </div>

      {inc.culprit && (
        <section className="kb-sec" data-broken={broken && inc.step !== "resolved"}>
          <h4>Culprit · {inc.culprit.service}{inc.culprit.ourCode ? " · our code" : ""}</h4>
          <ul>{inc.culprit.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </section>
      )}

      {inc.fix && (
        <section className="kb-sec">
          <h4>Proposed fix</h4>
          <div className="kb-fix">
            <code>{inc.fix.action}</code> on <b>{inc.fix.service}</b>{inc.fix.target ? <> → <code>{inc.fix.target}</code></> : null}
            {inc.fix.approvedBy && <div className="kb-sub">approved by {inc.fix.approvedBy}</div>}
            {inc.fix.rejected && <div className="kb-sub">rejected</div>}
          </div>
        </section>
      )}

      {awaiting && !inc.fix?.rejected && (
        <div className="kb-approve">
          <button className="kb-btn kb-btn-primary" disabled={!!busy || !!sent} onClick={() => decide(true)}>
            {busy === "approve" ? "Approving…" : sent === "approve" ? "Approved ✓" : "Approve"}
          </button>
          <button className="kb-btn" disabled={!!busy || !!sent} onClick={() => decide(false)}>
            {busy === "reject" ? "Rejecting…" : sent === "reject" ? "Rejected" : "Reject"}
          </button>
          {error && <span className="kb-error" role="alert">{error}</span>}
        </div>
      )}

      <section className="kb-sec">
        <h4>Timeline</h4>
        {inc.timeline.length === 0 && <div className="kb-sub">No entries yet.</div>}
        <ol className="kb-tl">
          {inc.timeline.map((t, i) => (
            <li key={i}>
              <span className="kb-t">{clock(t.ts)}</span>
              <span className="kb-who">{t.who}</span>
              <span className="kb-txt">{t.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
