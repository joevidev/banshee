"use client"
// Renders the postmortem text (template or model written, markdown-ish) as a readable report:
// header with duration, root cause callout, fix and memory chips, evidence list, timeline, follow-up.
import type { ReactNode } from "react"

type Item = { text: string; time?: string; who?: string }
type Section = { key: string; title: string; paras: string[]; items: Item[] }

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").replace(/^#+\s*/, "").trim()
const LABELS: Record<string, string> = {
  summary: "summary", duration: "duration", "services affected": "services", services: "services", "root cause": "cause", cause: "cause", evidence: "evidence",
  fix: "fix", "fix applied": "fix", memory: "memory", timeline: "timeline", "follow-up": "followup", "follow up": "followup", "follow-up action": "followup", "next step": "followup", "next steps": "followup", action: "followup",
}
const keyOf = (label: string) => LABELS[clean(label).replace(/:$/, "").toLowerCase()]
const TIME = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–:]?\s*/

export function parsePostmortem(raw: string) {
  const sections: Section[] = []
  let title = ""
  let cur: Section | undefined
  const open = (key: string, t: string) => (cur = sections.find((s) => s.key === key) ?? (sections.push({ key, title: t, paras: [], items: [] }), sections[sections.length - 1]))
  for (const line0 of raw.replace(/\r/g, "").split("\n")) {
    const line = line0.trim()
    if (!line) continue
    if (/^#\s/.test(line) && !title && /postmortem/i.test(line)) { title = clean(line); continue }
    const heading = /^#{1,4}\s+(.+)$/.exec(line) ?? /^\*\*([^*]+?)\*\*:?\s*$/.exec(line) ?? /^([A-Za-z][A-Za-z -]{2,24}):\s*$/.exec(line)
    if (heading) { const k = keyOf(heading[1]); open(k ?? "other:" + clean(heading[1]), clean(heading[1]).replace(/:$/, "")); continue }
    const inline = /^\**([A-Za-z][A-Za-z -]{2,24}?)\**:\s*(.+)$/.exec(line.replace(/^[-*•]\s+/, ""))
    if (inline && keyOf(inline[1]) && !/^[-*•]\s/.test(line)) {
      const k = keyOf(inline[1])!
      const s = open(k, clean(inline[1]))
      const v = clean(inline[2])
      if (k === "evidence") v.split(" | ").forEach((e) => e.trim() && s.items.push({ text: e.trim() }))
      else s.paras.push(v)
      continue
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (!cur) open("summary", "Summary")
    const s = cur!
    if (bullet) {
      let text = clean(bullet[1])
      const tm = TIME.exec(text)
      let time: string | undefined, who: string | undefined
      if (tm) { time = tm[1]; text = text.slice(tm[0].length); const w = /^([a-z][\w-]{2,30}):\s+(.*)$/i.exec(text); if (w) { who = w[1]; text = w[2] } }
      s.items.push({ text, time, who })
    } else s.paras.push(clean(line))
  }
  return { title, sections }
}

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d={d} /></svg>
)
const I = {
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  bug: "M12 3 2 20h20L12 3zm0 6v5m0 3v.5",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6 2.6-2.2z",
  brain: "M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5 3 3 0 0 0 2 4 3 3 0 0 0 5 1V5a2 2 0 0 0-3-1zm6 0a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5 3 3 0 0 1-2 4 3 3 0 0 1-5 1",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
}

function Block({ icon, title, tone, children }: { icon: string; title: string; tone?: "red"; children: ReactNode }) {
  return (
    <section className={"rounded-xl border p-4 " + (tone === "red" ? "border-red/30 bg-red/5" : "border-line bg-card")}>
      <h3 className={"mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] " + (tone === "red" ? "text-red" : "text-muted")}>
        <Icon d={icon} /> {title}
      </h3>
      {children}
    </section>
  )
}

export function Postmortem({ text }: { text: string }) {
  const { title, sections } = parsePostmortem(text)
  const get = (k: string) => sections.find((s) => s.key === k)
  const duration = get("duration")?.paras[0]
  const secs = duration ? /(\d+)\s*s\b/.exec(duration)?.[1] : undefined
  const services = get("services")?.paras[0] ?? (duration && /services affected:\s*([^.]+)/i.exec(duration)?.[1])
  const cause = get("cause")
  const evidence = get("evidence")
  const fix = get("fix")
  const memory = get("memory")
  const timeline = get("timeline")
  const follow = get("followup")
  const summary = get("summary")
  const known = new Set(["summary", "duration", "services", "cause", "evidence", "fix", "memory", "timeline", "followup"])
  const extra = sections.filter((s) => !known.has(s.key) && (s.paras.length || s.items.length))
  const id = /inc-\d+/.exec(title || text)?.[0]
  return (
    <article className="flex flex-col gap-3" aria-label="Postmortem">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">Postmortem{id ? ` · ${id}` : ""}</h2>
        {secs && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-ink"><Icon d={I.clock} className="size-3.5" />{secs} s to recover</span>}
        {services && <span className="rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-muted">{String(services).replace(/\.$/, "")}</span>}
      </header>
      {summary && summary.paras.length > 0 && <p className="text-[14px] leading-relaxed text-ink">{summary.paras.join(" ")}</p>}
      {cause && <Block icon={I.bug} title="Root cause" tone="red"><p className="text-[15px] font-medium leading-snug text-ink">{cause.paras.join(" ") || cause.items.map((i) => i.text).join(". ")}</p></Block>}
      {evidence && evidence.items.length > 0 && (
        <Block icon={I.list} title="Evidence">
          <ul className="flex flex-col gap-2">{evidence.items.map((e, i) => <li key={i} className="rounded-lg bg-background px-3 py-2 font-mono text-[12px] leading-snug text-ink break-words">{e.text}</li>)}</ul>
        </Block>
      )}
      {(fix || memory) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fix && <Block icon={I.wrench} title="Fix"><p className="text-[14px] leading-snug text-ink">{fix.paras.join(" ") || fix.items.map((i) => i.text).join(". ")}</p></Block>}
          {memory && <Block icon={I.brain} title="Memory"><p className="text-[14px] leading-snug text-ink">{memory.paras.join(" ") || memory.items.map((i) => i.text).join(". ")}</p></Block>}
        </div>
      )}
      {timeline && timeline.items.length > 0 && (
        <Block icon={I.clock} title="Timeline">
          <ol className="relative ml-1.5 flex flex-col gap-3 border-l border-line pl-4">
            {timeline.items.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-ink" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {t.time && <span className="font-mono text-[12px] tabular-nums text-muted">{t.time}</span>}
                  {t.who && <span className="font-mono text-[11px] font-medium text-ink">{t.who}</span>}
                </div>
                <p className="text-[13px] leading-snug text-ink">{t.text}</p>
              </li>
            ))}
          </ol>
        </Block>
      )}
      {follow && (follow.paras.length > 0 || follow.items.length > 0) && (
        <Block icon={I.flag} title="Follow-up"><p className="text-[14px] leading-snug text-ink">{[...follow.paras, ...follow.items.map((i) => i.text)].join(" ")}</p></Block>
      )}
      {extra.map((s) => (
        <Block key={s.key} icon={I.list} title={s.title}>
          {s.paras.map((p, i) => <p key={i} className="text-[14px] leading-snug text-ink">{p}</p>)}
          {s.items.length > 0 && <ul className="ml-4 list-disc text-[14px] text-ink">{s.items.map((it, i) => <li key={i}>{it.text}</li>)}</ul>}
        </Block>
      ))}
    </article>
  )
}
