// Deterministic detection and evidence helpers. No I/O, no model. Unit-testable.
import type { Telemetry } from "./contracts.js"
import type { LocalCause, Inherited } from "./types.js"

export const WINDOW_MS = 5000

export type Baseline = { errorRate: number; p95Ms: number; n: number }

/** Plan sec. 4 step 1: error rate > max(5%, 3x baseline) or p95 > 3x baseline and > 300 ms. */
export function isAnomalous(t: Pick<Telemetry, "requests" | "errors" | "p95Ms">, b: Baseline): { bad: boolean; kind: "errors" | "latency" } {
  const rate = t.requests > 0 ? t.errors / t.requests : 0
  const errBad = t.requests > 0 && rate > Math.max(0.05, 3 * b.errorRate)
  const p95Base = Math.max(b.p95Ms, 20)
  const latBad = t.p95Ms > 3 * p95Base && t.p95Ms > 300
  return { bad: errBad || latBad, kind: errBad ? "errors" : "latency" }
}

export type ChangeRow = { ts: number; kind: string; from?: string; to?: string; diff?: string; note?: string; fix: boolean }

/** One deterministic line from a unified diff: file, function, removed -> added code. */
export function summarizeDiff(diff: string | undefined): string {
  if (!diff) return "no diff available"
  const lines = diff.split("\n")
  const file = lines.find((l) => l.startsWith("diff --git"))?.split(" b/")[1] ?? "unknown file"
  const isComment = (s: string) => /^\s*(\/\/|\/\*|\*)/.test(s)
  const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---") && !isComment(l.slice(1)) && l.slice(1).trim())
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++") && !isComment(l.slice(1)) && l.slice(1).trim())
  const fnMatch = lines.map((l) => /function\s+(\w+)/.exec(l)?.[1]).find(Boolean)
  const fn = fnMatch ? `${fnMatch}()` : "code"
  const clip = (s: string) => s.replace(/^[-+]\s*/, "").trim().slice(0, 80)
  if (!removed.length && !added.length) return `${file}: comments only`
  return `${file} ${fn}: \`${removed.map(clip).join(" ; ") || "(nothing)"}\` became \`${added.map(clip).join(" ; ") || "(nothing)"}\``
}

type RunLike = { startTs: number; firstEnd: number; errors: number; calleeErrors: Record<string, number> }

/** Plan sec. 4 steps 2 and 3. */
export function localCauseFor(run: RunLike, changes: ChangeRow[]): { local?: LocalCause; inherited?: Inherited } {
  const window = changes.filter((c) => !c.fix && (c.kind === "deploy" || c.kind === "config") && c.ts >= run.startTs - 60_000 && c.ts <= run.firstEnd)
  const latest = window.sort((a, b) => b.ts - a.ts)[0]
  const callees = Object.entries(run.calleeErrors).sort((a, b) => b[1] - a[1])
  const top = callees[0]
  const calleeTotal = callees.reduce((s, [, n]) => s + n, 0)
  const inherited = top && run.errors > 0 && calleeTotal >= run.errors * 0.5 ? { callee: top[0], count: top[1] } : undefined
  const vendor = run.calleeErrors["vendor"] ?? 0
  // A deploy cannot make a vendor return 503: when most of our errors are vendor responses, the vendor is the local cause even if we deployed recently.
  if (vendor > 0 && vendor >= run.errors * 0.5) {
    return { local: { kind: "vendor", ts: run.startTs, summary: `upstream card processor returned errors for ${vendor} of ${run.errors} failed requests${latest ? "; the recent deploy did not cause them (our own code returned no errors)" : "; no deploy or config change in the 60 s before"}` }, inherited: undefined }
  }
  if (latest) {
    return {
      local: {
        kind: latest.kind as "deploy" | "config",
        ts: latest.ts,
        from: latest.from,
        to: latest.to,
        diff: latest.diff,
        note: latest.note,
        summary: latest.kind === "deploy" ? summarizeDiff(latest.diff) : latest.note ?? "config change",
      },
      inherited,
    }
  }
  if (inherited) return { inherited }
  return { local: { kind: "self", ts: run.startTs, summary: "anomaly in this service with no deploy, config change or failing callee in the 60 s before" } }
}
