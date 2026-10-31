import type { ServiceName } from "@banshee/contracts"

export type Proc = ServiceName | "vendor"
export const PORTS: Record<Proc | "supervisor", number> = {
  supervisor: Number(process.env.BANSHEE_SUPERVISOR_PORT ?? 4100),
  checkout: 4101,
  payments: 4102,
  inventory: 4103,
  vendor: 4104,
}
export const url = (p: Proc) => `http://127.0.0.1:${PORTS[p]}`
export const ADMIN_TOKEN = process.env.BANSHEE_ADMIN_TOKEN ?? "dev-token"
export const TELEMETRY_URL = process.env.TELEMETRY_URL ?? ""

export async function postJson(target: string, body: unknown, timeoutMs = 1500): Promise<Response> {
  return fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", "x-banshee-token": ADMIN_TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** Send telemetry or change events to the agents' ingest endpoint (or stdout if unset). */
export async function emit(payload: { telemetry?: unknown; change?: unknown }): Promise<void> {
  if (!TELEMETRY_URL) {
    console.log(JSON.stringify(payload))
    return
  }
  try {
    await postJson(TELEMETRY_URL, payload, 3000)
  } catch (e) {
    console.error(`[emit] failed: ${(e as Error).message}`)
  }
}
