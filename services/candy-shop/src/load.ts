// Steady customer traffic: ~5 orders/s, mixed baskets (some totals have cents, some do not).
import { url, postJson } from "./shared.ts"
import { CATALOG } from "./catalog.ts"

const rate = Number(process.env.BANSHEE_LOAD_RPS ?? 5)
setInterval(() => {
  const n = 1 + Math.floor(Math.random() * 3)
  const items = Array.from({ length: n }, () => ({
    sku: CATALOG[Math.floor(Math.random() * CATALOG.length)].sku,
    qty: 1 + Math.floor(Math.random() * 2),
  }))
  postJson(`${url("checkout")}/order`, { items }, 5000).catch(() => {})
}, 1000 / rate)
console.log(`load: ${rate} orders/s → ${url("checkout")}`)
