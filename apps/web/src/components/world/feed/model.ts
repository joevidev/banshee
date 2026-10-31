// Pure helpers for the Slack-style feed: merge chatter + incident timelines, derive system lines, find who is about to answer.
import { SERVICES, type IncidentState, type OfficeState, type ServiceName } from "@banshee/contracts"

export type Msg = { kind: "msg"; key: string; ts: number; from: string; to?: string; channel: string; text: string }
export type Sys = { kind: "sys"; key: string; ts: number; icon: "open" | "cause" | "fix" | "approved" | "done"; text: string }
export type Item = Msg | Sys

export const GENERAL = "general"
const ONCALL = "oncall-joel"

export function serviceOf(author: string): ServiceName | undefined {
  const s = author.replace(/^spirit-/, "").replace(/^@/, "")
  return (SERVICES as readonly string[]).includes(s) ? (s as ServiceName) : undefined
}
/** "spirit-payments" and "@payments" both name the payments spirit. */
export function spiritName(token: string): string | undefined {
  const s = serviceOf(token)
  return s ? `spirit-${s}` : undefined
}

const mk = (channel: string, ts: number, from: string, text: string, to?: string): Msg => ({ kind: "msg", key: `${channel}|${from}|${ts}|${text.length}`, ts, from, to, channel, text })

/** Add new messages (from chatter and incident timelines) to the history we already hold. Same author + text within 3 s counts as one message. */
export function mergeMessages(prev: Msg[], chatter: OfficeState["chatter"], incidents: IncidentState[]): Msg[] {
  const out = prev.slice()
  let changed = false
  const add = (m: Msg) => {
    if (out.some((o) => o.channel === m.channel && o.from === m.from && o.text === m.text && Math.abs(o.ts - m.ts) < 3000)) return
    out.push(m)
    changed = true
  }
  for (const c of chatter) add(mk(c.channel, c.ts, c.from, c.text, c.to))
  for (const inc of incidents) for (const t of inc.timeline) add(mk(inc.relayChannel, t.ts, t.who, t.text))
  if (!changed) return prev
  return out.sort((a, b) => a.ts - b.ts)
}

const SYS_ICON_TEXT = {
  open: (inc: IncidentState) => `${inc.id} opened · ${inc.services.join(", ")} affected`,
} as const

/** Messages of a channel interleaved with system lines (opened, root cause, fix proposed, approved, resolved). */
export function buildItems(channel: string, msgs: Msg[], inc?: IncidentState): Item[] {
  const list = msgs.filter((m) => m.channel === channel)
  if (!inc) return list
  const items: Item[] = list.slice()
  const first = list[0]?.ts ?? inc.openedAt
  items.push({ kind: "sys", key: "s-open", ts: Math.min(inc.openedAt, first) - 1, icon: "open", text: SYS_ICON_TEXT.open(inc) })
  const toOncall = list.find((m) => m.to === ONCALL || m.text.includes("@" + ONCALL))
  if (inc.culprit) {
    const hit = list.find((m) => /root cause|not our bug/i.test(m.text) && (m.ts < (toOncall?.ts ?? Infinity)))
    const ts = hit ? hit.ts + 1 : toOncall ? toOncall.ts - 1 : (list[list.length - 1]?.ts ?? inc.openedAt) + 1
    items.push({ kind: "sys", key: "s-cause", ts, icon: "cause", text: `Root cause: ${inc.culprit.cause}` })
  }
  if (inc.fix && toOncall) {
    items.push({ kind: "sys", key: "s-fix", ts: toOncall.ts + 1, icon: "fix", text: `Fix proposed: ${fixLine(inc.fix)}` })
  }
  if (inc.fix?.approvedBy || inc.fix?.rejected) {
    const ap = list.find((m) => m.from === ONCALL)
    const ts = ap ? ap.ts + 1 : (inc.resolvedAt ?? Date.now()) - 1
    items.push({ kind: "sys", key: "s-appr", ts, icon: "approved", text: inc.fix.rejected ? "Fix rejected by on-call" : `Approved by ${inc.fix.approvedBy}` })
  }
  if (inc.step === "resolved") {
    items.push({ kind: "sys", key: "s-done", ts: (inc.resolvedAt ?? Date.now()) + 1, icon: "done", text: `${inc.id} resolved` })
  }
  return items.sort((a, b) => a.ts - b.ts)
}

function fixLine(fix: NonNullable<IncidentState["fix"]>) {
  const t = fix.target ? ` ${fix.target}` : ""
  switch (fix.action) {
    case "rollback": return `roll back ${fix.service}${fix.target ? " to " + fix.target : ""}`
    case "fallback_on": return `turn on${t || " the"} fallback in ${fix.service}`
    case "cache_on": return `turn on${t || " read cache"} in ${fix.service}`
  }
}

/** The spirit that is about to answer: the last message is a question (or a request) addressed to a spirit. */
export function typingSpirit(last: Msg | undefined, active: boolean, now: number): string | undefined {
  if (!last || !active || !now || now - last.ts > 30_000) return undefined
  const mention = /@([\w-]+)/.exec(last.text)?.[1]
  const target = last.to ?? mention
  const spirit = target ? spiritName(target) : undefined
  if (!spirit || spirit === last.from) return undefined
  if (!last.text.includes("?") && !mention) return undefined
  return spirit
}
