// Calls the live-mode route handlers directly (no Next server). Run from apps/web:
//   BANSHEE_SOURCE=live BANSHEE_NS=<ns>. bun routes-test.ts   (actor runtime on :7100, stub shop via CANDY_SHOP_URL)
import { POST as ingest } from "./src/app/api/ingest/route"
import { POST as chaos } from "./src/app/api/chaos/route"
import { POST as approve } from "./src/app/api/approve/route"
const j = async (r: Response) => ({ status: r.status, body: await r.json() })
const req = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
console.log("ingest no token ", await j(await ingest(req({}))))
console.log("ingest bad body ", await j(await ingest(req({ nope: 1 }, { "x-banshee-token": "dev-token" }))))
console.log("ingest telemetry", await j(await ingest(req({ telemetry: { service: "inventory", ts: Date.now(), requests: 25, errors: 0, p95Ms: 20, calleeErrors: {}, sampleErrors: [], version: "v1" } }, { "x-banshee-token": "dev-token" }))))
console.log("ingest change   ", await j(await ingest(req({ change: { service: "payments", ts: Date.now(), kind: "config", note: "route test" } }, { "x-banshee-token": "dev-token" }))))
console.log("approve unknown ", await j(await approve(req({ incidentId: "inc-999", approve: true }))))
console.log("approve bad body", await j(await approve(req({ incidentId: 1 }))))
console.log("chaos bad kind  ", await j(await chaos(req({ kind: "nope" }))))
// the socket route calls next/server connection(), which needs a real Next request; it was checked through the running dev server: GET /api/office/socket -> {url: ws://127.0.0.1:7100/v1/socket?key=...}
