import { SERVICES, type IngestBody, type ServiceName } from "@banshee/contracts"
import { SERVER_SOURCE } from "@/lib/office/server-source"

// Candy Shop middleware and deploy script -> the service's ServiceSpirit actor.
export async function POST(request: Request) {
  const { ADMIN_TOKEN, NS } = await import("@/lib/live/actors")
  if (request.headers.get("x-banshee-token") !== ADMIN_TOKEN) return Response.json({ ok: false, error: "forbidden" }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as IngestBody
  const service = (body.telemetry?.service ?? body.change?.service) as ServiceName | undefined
  if (!service || !SERVICES.includes(service) || (!body.telemetry && !body.change)) {
    return Response.json({ ok: false, error: "body must be {telemetry} or {change} with a known service" }, { status: 400 })
  }
  if (SERVER_SOURCE !== "live") return Response.json({ ok: true, ignored: "BANSHEE_SOURCE is not live" }, { status: 202 })
  const { actors } = await import("@/lib/live/actors")
  try {
    const spirit = actors.ServiceSpirit.get(NS + service)
    if (body.telemetry) {
      const r = await spirit.ingestTelemetry(body.telemetry)
      return Response.json({ ok: true, ...r })
    }
    await spirit.ingestChange(body.change!)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }
}
