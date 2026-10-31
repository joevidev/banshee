import { mockEngine } from "@/lib/office/mock-engine"
import { SERVER_SOURCE } from "@/lib/office/server-source"
import { CHAOS_KINDS, type ChaosKind, type ChaosResponse } from "@/lib/office/types"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string }
  const kind = body.kind as ChaosKind
  if (!CHAOS_KINDS.includes(kind)) {
    return Response.json({ ok: false, error: "kind must be one of " + CHAOS_KINDS.join(", ") } satisfies ChaosResponse, { status: 400 })
  }
  if (SERVER_SOURCE === "live") {
    // Press the real fault on the Candy Shop, then wait for the IncidentDesk to open the incident so the phone can follow it.
    const { actors, ADMIN_TOKEN, SHOP_URL, NS, ORG } = await import("@/lib/live/actors")
    const desk = actors.IncidentDesk.get(ORG)
    try {
      const before = await desk.state().catch(() => ({ counter: -1, open: [] as string[] }))
      const res = await fetch(`${SHOP_URL}/admin/fault`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-banshee-token": ADMIN_TOKEN },
        body: JSON.stringify({ kind, on: true }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return Response.json({ ok: false, error: `candy shop /admin/fault returned ${res.status}` } satisfies ChaosResponse, { status: 502 })
      const deadline = Date.now() + Number(process.env.BANSHEE_CHAOS_WAIT_MS ?? 30_000)
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700))
        const now = await desk.state().catch(() => undefined)
        if (now && before.counter >= 0 && now.counter > before.counter) return Response.json({ ok: true, incidentId: `inc-${now.counter}` } satisfies ChaosResponse)
      }
      void NS
      return Response.json({ ok: true } satisfies ChaosResponse) // fault is on; the incident has not opened yet
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message } satisfies ChaosResponse, { status: 502 })
    }
  }
  const res = mockEngine().chaos(kind)
  return Response.json(res satisfies ChaosResponse, { status: res.ok ? 200 : 409 })
}
