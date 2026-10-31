import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { PORTS, url, postJson } from "../shared.ts"
import { banshee } from "../telemetry.ts"
import { controls } from "./control.ts"

// The charge logic lives in its own git repo (payments-src) and is deployed by checking out a ref.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../payments-src")
const version = execFileSync("git", ["-C", SRC, "rev-parse", "--short", "HEAD"]).toString().trim()
const charge = (await import(path.join(SRC, "charge.ts"))) as {
  toMinorUnits(amount: number): number
  validateCharge(cents: number): void
}

const app = new Hono()
const gy = banshee({ service: "payments", version: () => version })
app.use(gy.middleware)
// fallback = accept the order and charge later when the processor is down
const flags = controls(app, { fallback: false })

app.post("/charge", async (c) => {
  const { amount } = await c.req.json<{ amount: number }>()
  let cents: number
  try {
    cents = charge.toMinorUnits(amount)
    charge.validateCharge(cents)
  } catch (e) {
    gy.error(`charge(): ${(e as Error).message} (amount=${amount})`)
    return c.json({ error: (e as Error).message }, 500)
  }
  try {
    const r = await postJson(`${url("vendor")}/v1/authorize`, { cents }, 1200)
    if (!r.ok) throw new Error(`AcmePay /v1/authorize returned ${r.status}`)
    return c.json({ status: "charged", cents })
  } catch (e) {
    if (flags.fallback) return c.json({ status: "deferred", cents })
    gy.error(`vendor: ${(e as Error).message}`, "vendor")
    return c.json({ error: "card processor unavailable" }, 502)
  }
})
serve({ fetch: app.fetch, port: PORTS.payments })
console.log(`payments ${version} on ${PORTS.payments}`)
