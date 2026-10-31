/// <reference types="node" />
// All human-readable text goes through here. The model is fed ONLY the evidence JSON and never chooses the culprit.
// No key / error / > NARRATE_TIMEOUT_MS (8 s) -> templated text built from the same evidence.
import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { envNum, hhmmss } from "./types.js"

export type NarrateKind = "ask" | "answer" | "root_cause" | "proposal" | "applied" | "resolved" | "recalled" | "down" | "postmortem" | "escalated"
export type Narration = { text: string; source: "llm" | "template"; ms: number; error?: string }
type F = Record<string, any>

const clip = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
const pct = (x: number) => `${Math.round(x * 100)}%`
const at = (ts: number) => hhmmss(ts)

/** Templated fallbacks. Same facts the model sees. */
export const templates: Record<NarrateKind, (f: F) => string> = {
  ask: (f) =>
    `@spirit-${f.to} my ${f.anomaly.kind === "latency" ? "latency" : "errors"} started at ${at(f.anomaly.changePointTs)} (${pct(f.anomaly.errorRate)} errors, p95 ${f.anomaly.p95Ms} ms${f.inherited ? `, ${f.inherited.count} of them are responses from ${f.inherited.callee}` : ""}). Did you change anything?`,
  answer: (f) => {
    const e = f.evidence
    if (!e.hasAnomaly) return `@spirit-${f.to} no anomaly here: error rate and p95 are inside my baseline, no deploy or config change in the last minute.`
    const lc = e.localCause
    if (lc?.kind === "deploy") return `@spirit-${f.to} yes. I deployed ${lc.from} -> ${lc.to} at ${at(lc.ts)}, my errors start at ${at(e.anomaly.changePointTs)}. Diff: ${clip(lc.summary)}. Last error: ${clip(e.anomaly.sampleErrors.slice(-1)[0] ?? "n/a")}`
    if (lc?.kind === "config") return `@spirit-${f.to} yes, config change at ${at(lc.ts)}: ${lc.note}. My errors start at ${at(e.anomaly.changePointTs)}.`
    if (lc?.kind === "vendor") return `@spirit-${f.to} no change on my side. My upstream vendor returns errors: ${clip(lc.summary)}. ${pct(e.anomaly.errorRate)} of my requests fail since ${at(e.anomaly.changePointTs)}.`
    if (lc?.kind === "self") return `@spirit-${f.to} no deploy or config change, but my p95 jumped to ${e.anomaly.p95Ms} ms (baseline ${Math.round(e.anomaly.baselineP95Ms)} ms) at ${at(e.anomaly.changePointTs)}.`
    if (e.inherited) return `@spirit-${f.to} no change on my side. My errors are responses from ${e.inherited.callee} (${e.inherited.count} of them) since ${at(e.anomaly.changePointTs)}.`
    return `@spirit-${f.to} I see an anomaly since ${at(e.anomaly.changePointTs)} but no local cause.`
  },
  root_cause: (f) => {
    const c = f.culprit
    return `Root cause: ${c.service}${c.ourCode ? "" : " (not our code)"}: ${c.cause}. Evidence: ${c.evidence.map((x: string) => clip(x, 140)).join(" | ")}. Earliest change-point with a local cause: ${at(f.changePointTs)}.`
  },
  proposal: (f) => {
    const x = f.fix
    const what = x.action === "rollback" ? `roll ${x.service} back to ${x.target}` : x.action === "fallback_on" ? `turn on "accept order, charge later" fallback on ${x.service}` : `turn on the read cache on ${x.service}`
    return `Proposed fix: ${what}.${f.recalled ? ` I remember this: ${f.recalled.incidentId} had the same signature and the same fix worked.` : ""}${f.round > 1 ? ` (re-proposed after a rejection, round ${f.round})` : ""} Waiting for oncall approval.`
  },
  applied: (f) => `Approved by ${f.by}. Applying ${f.fix.action} on ${f.fix.service}; watching the next two telemetry windows.`,
  resolved: (f) => `Recovered: ${f.services.join(", ")} are back under thresholds. Incident ${f.id} resolved ${f.seconds} s after it opened.`,
  recalled: (f) => `I have seen this before: ${f.recalled.incidentId} (${f.recalled.signature}), fix was ${f.recalled.fix}. Skipping the long investigation.`,
  down: (f) => `I am down: no telemetry from ${f.service} for ${Math.round(f.silentMs / 1000)} s.`,
  escalated: (f) => `Escalating ${f.id}: not resolved after ${Math.round(f.afterMs / 1000)} s. Human needed.`,
  postmortem: (f) => {
    const s = f.state
    const c = s.culprit
    return [
      `# Postmortem ${s.id}`,
      `Duration: ${f.seconds} s from detection to recovery. Services affected: ${s.services.join(", ")}.`,
      `Root cause: ${c ? `${c.service} (${c.ourCode ? "our code" : "not our code"}): ${c.cause}` : "unknown"}.`,
      `Evidence: ${(c?.evidence ?? []).join(" | ")}`,
      `Fix: ${s.fix ? `${s.fix.action} on ${s.fix.service}${s.fix.target ? ` to ${s.fix.target}` : ""}, approved by ${s.fix.approvedBy ?? "n/a"}` : "none"}.`,
      s.recalledFrom ? `Memory: matched earlier incident ${s.recalledFrom}.` : `Memory: first occurrence of this signature.`,
      `Timeline:`,
      ...s.timeline.map((t: any) => `- ${at(t.ts)} ${t.who}: ${t.text}`),
    ].join("\n")
  },
}

const SYSTEM =
  "You write one message in an on-call incident channel as a service's agent. Use ONLY the facts in the JSON the user sends. " +
  "Never invent numbers, shas, times, services or causes that are not in the JSON. Never pick or change the culprit: if the JSON names one, repeat it. " +
  "The JSON has a `draft` written from the same facts: rewrite it in your own voice as a colleague would say it. Keep every sha, number, time, service name and the @mention exactly as in the draft, add no new facts, drop none that matter. " +
  "Plain text, no markdown, no emojis, at most 3 short sentences (postmortem: keep the draft's markdown structure and sections)."

const ROLE: Record<NarrateKind, string> = {
  ask: "Ask the callee agent whether it changed anything, quoting when your errors started.",
  answer: "Answer the question from your own evidence: a deploy with sha and the diff summary, or 'no change' and what your upstream does.",
  root_cause: "State the root cause with the evidence lines and the earliest change-point time.",
  proposal: "Propose the fix and ask oncall for approval. Mention the remembered incident if `recalled` is present.",
  applied: "Say the approved fix is being applied and that you watch the next two windows.",
  resolved: "Say the services recovered and how many seconds it took.",
  recalled: "Say you remember an earlier incident with the same signature and its fix.",
  down: "Say you stopped receiving telemetry from your service.",
  escalated: "Say the incident is escalated to a human.",
  postmortem: "Write a postmortem: summary, root cause, evidence, fix, timeline, one follow-up action.",
}

/** Epoch-ms fields become HH:MM:SS so the model quotes times as a human would. */
function humanize(v: any, key = ""): any {
  if (typeof v === "number" && /(^ts$|Ts$|End$)/.test(key) && v > 1e12) return hhmmss(v)
  if (Array.isArray(v)) return v.map((x) => humanize(x, key))
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, humanize(x, k)]))
  return v
}

let provider: ReturnType<typeof createOpenAI> | undefined
export const modelName = () => process.env.OPENAI_MODEL || "gpt-5.4-mini"

export async function narrate(kind: NarrateKind, facts: F, opts: { timeoutMs?: number } = {}): Promise<Narration> {
  const t0 = Date.now()
  const fallback = (error?: string): Narration => {
    if (error) console.error(`[narrate] ${kind} fell back to template after ${Date.now() - t0} ms: ${error}`)
    return { text: templates[kind](facts), source: "template", ms: Date.now() - t0, error }
  }
  if (!process.env.OPENAI_API_KEY || process.env.NARRATE_MODE === "template") return fallback("no key")
  const timeoutMs = opts.timeoutMs ?? envNum("NARRATE_TIMEOUT_MS", 8000)
  try {
    provider ??= createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const res = await generateText({
      model: provider(modelName()),
      system: SYSTEM,
      prompt: `${ROLE[kind]}\nfrom: ${facts.from ?? "banshee"}\nfacts: ${JSON.stringify(humanize(facts))}\ndraft: ${templates[kind](facts)}`,
      abortSignal: AbortSignal.timeout(timeoutMs),
      maxOutputTokens: kind === "postmortem" ? 700 : 160,
      providerOptions: { openai: { reasoningEffort: "none", textVerbosity: "low" } },
    })
    const text = res.text.trim()
    if (!text || text.length > 4000) return fallback("empty or too long")
    return { text, source: "llm", ms: Date.now() - t0 }
  } catch (e) {
    return fallback((e as Error).message?.slice(0, 120) ?? "error")
  }
}
