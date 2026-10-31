import type { IncidentState } from "@banshee/contracts"

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "..." : s)

export function fixText(f: NonNullable<IncidentState["fix"]>): string {
  if (f.action === "rollback") return `roll ${f.service} back${f.target ? " to " + f.target : ""}`
  if (f.action === "fallback_on") return `turn on the ${f.target ?? "order"} fallback in ${f.service}`
  return `turn on the ${f.target ?? "read cache"} in ${f.service}`
}

/** Plain-text facts about an incident; used by the server (session instructions) and the client (live updates). */
export function incidentFacts(inc: IncidentState | undefined | null): string {
  if (!inc) return "There is no open incident right now."
  const lines = [
    `Incident ${inc.id}, step: ${inc.step.replace(/_/g, " ")}.`,
    `Affected services: ${inc.services.join(", ")}.`,
  ]
  if (inc.culprit) {
    lines.push(`Root cause (${inc.culprit.service}${inc.culprit.ourCode ? "" : ", not our code"}): ${clip(inc.culprit.cause, 240)}`)
    inc.culprit.evidence.slice(0, 4).forEach((e, i) => lines.push(`Evidence ${i + 1}: ${clip(e, 200)}`))
  } else lines.push("Root cause: not known yet.")
  if (inc.fix) lines.push(`Proposed fix: ${fixText(inc.fix)}.${inc.fix.approvedBy ? ` Approved by ${inc.fix.approvedBy}.` : ""}${inc.fix.rejected ? " It was rejected." : ""}`)
  else lines.push("No fix proposed yet.")
  if (inc.recalledFrom) lines.push(`The spirits remembered a similar past incident: ${inc.recalledFrom}.`)
  inc.timeline.slice(-6).forEach((t) => lines.push(`Timeline, ${t.who}: ${clip(t.text, 180)}`))
  return lines.join("\n")
}

export function persona(facts: string, service?: string): string {
  const who = service ? `You are spirit-${service}, the Banshee ghost that guards the ${service} service.` : "You are Banshee's on-call agent."
  return (
    `${who} You are speaking by voice to the human on call during a production incident. English only. ` +
    `Tone: warm, calm, a little spooky-friendly, never theatrical. Be concise: 1 to 2 sentences per turn. ` +
    `When the call starts, give a short spoken report first: what broke, which service, the root cause with its evidence, and the proposed fix. ` +
    `Answer questions ONLY from the incident facts below. If the answer is not there, say you do not know. Never invent numbers, times or services. ` +
    `You can never run a fix yourself. ALWAYS ask the human for explicit confirmation before any fix. When the human says yes or no to a fix, call the function request_decision; ` +
    `the human then confirms on screen. After the function result comes back, tell the human the outcome in one sentence.\n\nINCIDENT FACTS:\n${facts}`
  )
}

export const DECISION_TOOL = {
  type: "function",
  name: "request_decision",
  description: "Ask the human on call to approve or reject the proposed fix. The human confirms on screen; nothing runs until they tap Confirm.",
  parameters: {
    type: "object",
    properties: {
      approve: { type: "boolean", description: "true to approve the proposed fix, false to reject it" },
      reason: { type: "string", description: "one short sentence explaining why" },
    },
    required: ["approve", "reason"],
  },
} as const
