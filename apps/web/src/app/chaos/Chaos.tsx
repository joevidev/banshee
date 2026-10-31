"use client"

import { useState } from "react"
import { Culprit, FixProposal } from "@/components/warroom/incident"
import { LiveStep, PhoneShell } from "@/components/warroom/Phone"
import { postChaos, useIncident, useOffice } from "@/lib/office/client"
import type { ChaosKind } from "@/lib/office/types"

const BUTTONS: { kind: ChaosKind; label: string; sub: string; big: boolean }[] = [
  { kind: "bad_deploy", label: "Bad deploy", sub: "ship a broken commit to payments", big: true },
  { kind: "vendor_down", label: "Card processor down", sub: "the external vendor starts failing", big: true },
  { kind: "slow_inventory", label: "Slow inventory", sub: "+2.5 s on every stock lookup", big: false },
]

export function Chaos() {
  const [incidentId, setIncidentId] = useState<string>()
  const [busy, setBusy] = useState<ChaosKind>()
  const [note, setNote] = useState<string>()
  const incident = useIncident(incidentId)
  const office = useOffice()

  async function press(kind: ChaosKind) {
    setBusy(kind)
    setNote(undefined)
    try {
      const r = await postChaos(kind)
      if (r.incidentId) setIncidentId(r.incidentId)
      if (!r.ok) setNote(r.error ?? "Something went wrong")
    } catch {
      setNote("Could not reach the server")
    } finally {
      setBusy(undefined)
    }
  }

  const done = incident?.step === "resolved"
  if (incident) {
    return (
      <PhoneShell title="chaos">
        <div className="bn-in flex flex-col gap-2 pt-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-red">{done ? "it is fixed" : "incident open"}</span>
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-tight text-ink">{done ? "They fixed it." : "You broke production."}</h1>
          <p className="text-[15px] text-muted">{done ? "Look at the big screen for the postmortem." : "Look at the big screen: the spirits are getting up."}</p>
        </div>
        {note && <p className="font-mono text-[12px] text-muted">{note}</p>}
        <LiveStep incident={incident} />
        {incident.culprit && (
          <div className="rounded-xl border border-line bg-card p-4">
            <Culprit culprit={incident.culprit} />
          </div>
        )}
        {incident.fix && (
          <div className="rounded-xl border border-line bg-card p-4">
            <FixProposal fix={incident.fix} step={incident.step} />
          </div>
        )}
        {done && (
          <button onClick={() => setIncidentId(undefined)} className="h-14 rounded-xl border border-ink text-[16px] font-medium text-ink active:scale-[0.98]">
            Break it again
          </button>
        )}
      </PhoneShell>
    )
  }

  return (
    <PhoneShell title="chaos">
      <div className="flex flex-col gap-2 pt-4">
        <h1 className="text-[34px] font-semibold leading-[1.05] tracking-tight text-ink">Break our production.</h1>
        <p className="text-[15px] text-muted">Real services, real fault. Press one and watch the big screen.</p>
      </div>
      <div className="flex flex-col gap-3">
        {BUTTONS.map((b) => (
          <button
            key={b.kind}
            disabled={!!busy}
            onClick={() => press(b.kind)}
            className={
              "flex flex-col items-start justify-center gap-1 rounded-2xl px-6 text-left transition active:scale-[0.98] disabled:opacity-60 " +
              (b.big ? "h-32 bg-ink text-white" : "h-20 border border-ink bg-card text-ink")
            }
          >
            <span className={(b.big ? "text-[26px]" : "text-[19px]") + " font-semibold tracking-tight"}>{busy === b.kind ? "Breaking…" : b.label}</span>
            <span className={"font-mono text-[12px] " + (b.big ? "text-white/60" : "text-muted")}>{b.sub}</span>
          </button>
        ))}
      </div>
      {note && <p className="font-mono text-[12px] text-red">{note}</p>}
      {office && office.openIncidents.length > 0 && !note && (
        <p className="font-mono text-[12px] text-muted">{office.openIncidents[office.openIncidents.length - 1]} is open right now.</p>
      )}
    </PhoneShell>
  )
}
