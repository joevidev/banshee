import { SERVER_SOURCE } from "@/lib/office/server-source"

// A human message typed into the feed. The web app has no Relay client and exposing an arbitrary actor call here would widen the
// live-mode attack surface, so nothing is forwarded: the message is validated, rate limited, and acknowledged as 'local' (the feed shows it as the user's own entry).
const hits = new Map<string, number[]>()
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k)
  return arr.length > 20
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (limited(ip)) return json({ ok: false, error: "slow down" }, 429)
  const body = (await request.json().catch(() => null)) as { channel?: unknown; text?: unknown; author?: unknown } | null
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const channel = body?.channel
  if (typeof channel !== "string" || !/^inc-[0-9]+$|^general$/.test(channel)) return json({ ok: false, error: "bad channel" }, 400)
  if (text.length < 1 || text.length > 500) return json({ ok: false, error: "text must be 1 to 500 characters" }, 400)
  return json({ ok: true, delivered: "local", mode: SERVER_SOURCE, channel, author: "oncall-joel", ts: Date.now() })
}
