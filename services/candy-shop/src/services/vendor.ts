// Fake external card processor ("AcmePay"). Not ours: no telemetry, no agent.
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { PORTS } from "../shared.ts"
import { controls } from "./control.ts"

const app = new Hono()
const flags = controls(app, { down: false })
app.post("/v1/authorize", async (c) => {
  if (flags.down) return c.json({ error: "AcmePay: service unavailable" }, 503)
  const { cents } = await c.req.json<{ cents: number }>()
  return c.json({ authorized: true, id: `auth_${Date.now().toString(36)}`, cents })
})
serve({ fetch: app.fetch, port: PORTS.vendor })
console.log(`vendor on ${PORTS.vendor}`)
