import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { PORTS } from "../shared.ts"
import { banshee } from "../telemetry.ts"
import { controls } from "./control.ts"

const app = new Hono()
const gy = banshee({ service: "inventory", version: () => process.env.BANSHEE_VERSION ?? "inv-1.4.0" })
app.use(gy.middleware)
// slow = a lock on the stock table; cache = serve reservations from the read cache
const flags = controls(app, { slow: false, cache: false })

const stock = new Map<string, number>([
  ["ghost-gummies", 1e6], ["pumpkin-truffle", 1e6], ["bat-licorice", 1e6], ["witch-brew-cola", 1e6],
])
app.post("/reserve", async (c) => {
  const { items } = await c.req.json<{ items: { sku: string; qty: number }[] }>()
  if (flags.slow && !flags.cache) await new Promise((r) => setTimeout(r, 2500))
  for (const it of items) stock.set(it.sku, (stock.get(it.sku) ?? 0) - it.qty)
  return c.json({ reserved: true })
})
serve({ fetch: app.fetch, port: PORTS.inventory })
console.log(`inventory on ${PORTS.inventory}`)
