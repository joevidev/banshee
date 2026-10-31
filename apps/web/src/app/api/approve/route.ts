import { mockEngine } from "@/lib/office/mock-engine"
import { SERVER_SOURCE } from "@/lib/office/server-source"
import type { ApproveResponse } from "@/lib/office/types"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { incidentId?: string; approve?: boolean }
  if (typeof body.incidentId !== "string" || typeof body.approve !== "boolean") {
    return Response.json({ ok: false, error: "body must be {incidentId: string, approve: boolean}" } satisfies ApproveResponse, { status: 400 })
  }
  if (SERVER_SOURCE === "live") {
    const { actors, NS } = await import("@/lib/live/actors")
    try {
      const r = await actors.Incident.get(NS + body.incidentId).approve("oncall-joel", body.approve)
      return Response.json({ ok: r.ok, error: r.error } satisfies ApproveResponse, { status: r.ok ? 200 : 409 })
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message } satisfies ApproveResponse, { status: 502 })
    }
  }
  const res = mockEngine().approve(body.incidentId, body.approve)
  return Response.json(res satisfies ApproveResponse, { status: res.ok ? 200 : 409 })
}
