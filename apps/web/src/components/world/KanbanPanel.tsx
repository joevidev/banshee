"use client"
// Floating glass incident board: columns by IncidentStep, cards slide between columns (FLIP), click a card for the detail view.
import type { IncidentState } from "@banshee/contracts"
import { useLayoutEffect, useRef, useState } from "react"
import { useNow } from "@/lib/office/client"
import { GhostBadge } from "./GhostBadge"
import { GlassWindow } from "./GlassWindow"
import { Detail } from "./kanban/Detail"
import { COLUMNS, fmtElapsed, isBroken, leadService, STEP_COLUMN, useBoardIncidents } from "./kanban/model"
import { SleepyGhost } from "./kanban/Sleepy"
import "./kanban.css"

export { useBoardCounts } from "./kanban/model"

function Elapsed({ inc }: { inc: IncidentState }) {
  const now = useNow()
  const end = inc.resolvedAt ?? now
  return <span className="kb-time">{now || inc.resolvedAt ? fmtElapsed(end - inc.openedAt) : "–:––"}</span>
}

function Card({ inc, onOpen }: { inc: IncidentState; onOpen: () => void }) {
  const broken = isBroken(inc)
  const lead = leadService(inc)
  return (
    <button className="kb-card" data-card-id={inc.id} data-broken={broken} data-done={inc.step === "resolved"} onClick={onOpen}>
      <span className="kb-bar" />
      <div className="kb-card-top">
        <span className="kb-id">{inc.id}</span>
        <Elapsed inc={inc} />
      </div>
      <div className="kb-card-title">{inc.culprit?.cause ?? "Investigating…"}</div>
      <div className="kb-card-foot">
        <div className="kb-chips">
          {inc.services.slice(0, 3).map((s) => <span key={s} className="kb-chip" data-lead={s === lead}>{s}</span>)}
          {inc.services.length > 3 && <span className="kb-chip">+{inc.services.length - 3}</span>}
        </div>
        {lead && <GhostBadge service={lead} size={22} />}
      </div>
    </button>
  )
}

function Board({ list, onOpen }: { list: IncidentState[]; onOpen: (id: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const prev = useRef(new Map<string, { x: number; y: number }>())

  // FLIP: remember each card's position (relative to the scroller content), slide from the old one when it moves column.
  useLayoutEffect(() => {
    const root = scroller.current
    if (!root) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const rb = root.getBoundingClientRect()
    const next = new Map<string, { x: number; y: number }>()
    root.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
      const r = el.getBoundingClientRect()
      const p = { x: r.left - rb.left + root.scrollLeft, y: r.top - rb.top + root.scrollTop }
      next.set(el.dataset.cardId!, p)
      const old = prev.current.get(el.dataset.cardId!)
      if (!old && prev.current.size) el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reduce ? "auto" : "smooth" })
      if (old && (Math.abs(old.x - p.x) > 1 || Math.abs(old.y - p.y) > 1)) {
        el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reduce ? "auto" : "smooth" })
        el.animate([{ transform: `translate(${old.x - p.x}px, ${old.y - p.y}px)` }, { transform: "none" }], { duration: reduce ? 0 : 300, easing: "cubic-bezier(.2,.8,.2,1)" })
      }
    })
    if (!prev.current.size && next.size) {
      // first paint: bring the newest active card into view (else the newest card)
      const el = root.querySelector<HTMLElement>('[data-card-id]:not([data-done="true"])') ?? root.querySelector<HTMLElement>("[data-card-id]")
      el?.scrollIntoView({ inline: "nearest", block: "nearest" })
    }
    prev.current = next
  })

  return (
    <div className="kb-board" ref={scroller}>
      {COLUMNS.map((col) => {
        const cards = list.filter((i) => STEP_COLUMN[i.step] === col)
        return (
          <div key={col} className="kb-col">
            <div className="kb-colhead"><span>{col}</span><span className="kb-count">{cards.length}</span></div>
            <div className="kb-cards">
              {cards.map((i) => <Card key={i.id} inc={i} onOpen={() => onOpen(i.id)} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function KanbanPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useBoardIncidents()
  const [sel, setSel] = useState<string | null>(null)
  if (!open) return null
  const selected = sel ? list.find((i) => i.id === sel) : undefined
  return (
    <GlassWindow id="board" title="Incident board" anchor="tr" offset={{ x: 16, y: 76 }} size={{ w: 540, h: 420 }} onClose={onClose}>
      <div className="kb-root">
        {selected ? (
          <Detail inc={selected} onBack={() => setSel(null)} />
        ) : list.length === 0 ? (
          <div className="kb-empty">
            <SleepyGhost />
            <div className="kb-empty-t">All quiet</div>
            <div className="kb-sub">The spirits are napping. Nothing is on fire.</div>
          </div>
        ) : (
          <Board list={list} onOpen={setSel} />
        )}
      </div>
    </GlassWindow>
  )
}
