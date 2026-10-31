// Actor-to-actor calls. Locally the runtime lets actors call each other directly. In Terse cloud an actor's own
// credential is rejected for peer calls, so there the actor asks the public web app (/api/peer) to make the call for it
// with the project API key. No imports of actor classes here (they would be circular): callers pass `direct`.
export type PeerActor = "Office" | "Incident" | "IncidentDesk" | "ServiceSpirit"

type Env = Record<string, string | undefined>
const getEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {}

export async function peer<T>(actor: PeerActor, id: string, method: string, args: unknown[], direct: () => Promise<T>): Promise<T> {
  const env = getEnv()
  const controlPlane = env.DURABLE_ACTORS_CONTROL_PLANE_URL ?? ""
  const local = !controlPlane || /(127\.0\.0\.1|localhost|\[::1\])/.test(controlPlane)
  if (local && env.BANSHEE_FORCE_BRIDGE !== "1") return direct()
  const url = env.BANSHEE_BRIDGE_URL || "https://banshee.style.dev/api/peer"
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-banshee-token": env.BANSHEE_ADMIN_TOKEN ?? "" },
    body: JSON.stringify({ actor, id, method, args }),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  let json: { result?: unknown; error?: string } = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* not JSON: fall through to the status check */
  }
  if (!res.ok || json.error) throw new Error(`peer ${actor}.${method} via bridge failed (${res.status}): ${json.error ?? text.slice(0, 200)}`)
  return json.result as T
}
