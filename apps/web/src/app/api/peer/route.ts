import { createHash, timingSafeEqual } from "node:crypto"
import { SERVER_SOURCE } from "@/lib/office/server-source"

// Bridge for actor-to-actor calls. In Terse cloud an actor cannot call a peer with its own credential, so it posts
// {actor, id, method, args} here and this route makes the call with the project API key (BANSHEE_ACTOR_URL / BANSHEE_ACTOR_KEY).
// Locally the actors call each other directly and never come here unless BANSHEE_FORCE_BRIDGE=1.
const ALLOWED: Record<string, readonly string[]> = {
  Office: ["update", "getRelayTokens", "setRelayToken"],
  Incident: ["join", "open", "window"],
  IncidentDesk: ["report", "closed"],
  ServiceSpirit: ["evidence", "attach", "recall", "expectFix", "remember"],
}
const MAX_BODY_BYTES = 256 * 1024
const ID = /^[A-Za-z0-9._-]{1,128}$/

const digest = (s: string) => createHash("sha256").update(s).digest()
function tokenOk(got: string | null): boolean {
  const want = process.env.BANSHEE_ADMIN_TOKEN
  if (!want || got === null) return false
  return timingSafeEqual(digest(got), digest(want))
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

export async function POST(request: Request) {
  if (SERVER_SOURCE !== "live") return json({ error: "not found" }, 404)
  if (!tokenOk(request.headers.get("x-banshee-token"))) return json({ error: "forbidden" }, 403)
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return json({ error: "body too large" }, 413)
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large" }, 413)
  let body: { actor?: unknown; id?: unknown; method?: unknown; args?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: "body must be JSON" }, 400)
  }
  const { actor, id, method, args } = body
  if (typeof actor !== "string" || typeof method !== "string" || typeof id !== "string" || !Array.isArray(args) || args.length > 8) {
    return json({ error: "body must be {actor: string, id: string, method: string, args: unknown[]}" }, 400)
  }
  if (!Object.hasOwn(ALLOWED, actor) || !ALLOWED[actor].includes(method)) return json({ error: `${actor}.${method} is not allowed` }, 400)
  if (!ID.test(id)) return json({ error: "invalid actor id" }, 400)
  const { actors } = await import("@/lib/live/actors")
  try {
    const ref = (actors as unknown as Record<string, { get(id: string): Record<string, (...a: unknown[]) => Promise<unknown>> }>)[actor].get(id)
    const result = await ref[method](...args)
    return json({ result: result ?? null })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
