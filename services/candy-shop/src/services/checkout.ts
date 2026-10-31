import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { PORTS, url, postJson } from "../shared.ts"
import { banshee } from "../telemetry.ts"
import { controls } from "./control.ts"
import { CATALOG } from "../catalog.ts"

const app = new Hono()
const gy = banshee({ service: "checkout", version: () => process.env.BANSHEE_VERSION ?? "co-3.1.0" })
app.use(gy.middleware)
controls(app, {})

const stats = { ok: 0, failed: 0, recent: [] as { ts: number; ok: boolean }[] }
function record(ok: boolean) {
  ok ? stats.ok++ : stats.failed++
  const now = Date.now()
  stats.recent.push({ ts: now, ok })
  stats.recent = stats.recent.filter((r) => now - r.ts < 60_000)
}

app.post("/order", async (c) => {
  const { items } = await c.req.json<{ items: { sku: string; qty: number }[] }>()
  const amount = Math.round(
    items.reduce((s, it) => s + (CATALOG.find((p) => p.sku === it.sku)?.price ?? 0) * it.qty, 0) * 100,
  ) / 100
  try {
    const inv = await postJson(`${url("inventory")}/reserve`, { items }, 1500)
    if (!inv.ok) throw Object.assign(new Error(`inventory /reserve ${inv.status}`), { callee: "inventory" })
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError"
    gy.error(timeout ? "inventory /reserve timed out after 1500ms" : (e as Error).message, "inventory")
    record(false)
    return c.json({ error: "inventory unavailable" }, timeout ? 504 : 502)
  }
  try {
    const pay = await postJson(`${url("payments")}/charge`, { amount }, 2000)
    const body = (await pay.json()) as { status?: string; error?: string }
    if (!pay.ok) throw new Error(`payments /charge ${pay.status}: ${body.error ?? ""}`)
    record(true)
    return c.json({ ok: true, amount, payment: body.status })
  } catch (e) {
    gy.error((e as Error).message, "payments")
    record(false)
    return c.json({ error: "payment failed" }, 502)
  }
})

app.get("/stats", (c) => {
  const now = Date.now()
  const last = stats.recent.filter((r) => now - r.ts < 60_000)
  return c.json({ ok: stats.ok, failed: stats.failed, ordersPerMin: last.filter((r) => r.ok).length, failedPerMin: last.filter((r) => !r.ok).length })
})

app.get("/", (c) =>
  c.html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Candy Shop</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono&display=swap" rel="stylesheet">
<style>body{margin:0;font-family:Geist,system-ui;background:#fff;color:#000}main{max-width:720px;margin:0 auto;padding:32px 16px}
h1{font-weight:600;letter-spacing:-.02em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.card{border:1px solid #000;border-radius:12px;padding:16px}.mono{font-family:'Geist Mono',monospace;font-size:13px}
button{font:inherit;background:#000;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;margin-top:8px}
.bad{color:#e5484d}#status{margin:16px 0}</style></head><body><main>
<h1>Candy Shop</h1><div id="status" class="mono">loading…</div><div class="grid">
${CATALOG.map((p) => `<div class="card"><div>${p.name}</div><div class="mono">$${p.price.toFixed(2)}</div><button onclick="buy('${p.sku}')">Buy</button></div>`).join("")}
</div><p id="msg" class="mono"></p></main><script>
async function buy(sku){const r=await fetch('/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:[{sku,qty:1}]})});
const b=await r.json();document.getElementById('msg').innerHTML=r.ok?'Order placed ✓':'<span class="bad">'+(b.error||'failed')+'</span>'}
async function tick(){try{const s=await (await fetch('/stats')).json();document.getElementById('status').innerHTML=
'orders/min <b>'+s.ordersPerMin+'</b> · failed/min <b class="'+(s.failedPerMin?'bad':'')+'">'+s.failedPerMin+'</b> · total '+s.ok}catch{}}
tick();setInterval(tick,2000)</script></body></html>`),
)

serve({ fetch: app.fetch, port: PORTS.checkout })
console.log(`checkout on ${PORTS.checkout}`)
