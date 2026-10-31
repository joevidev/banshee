// Runs the shop: starts every service, restarts payments on deploy, exposes the admin API
// that the chaos buttons (faults) and the agents' approved fixes call.
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { spawn, execFileSync, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import type { ChangeEvent, FixAction, ServiceName } from "@banshee/contracts"
import { ADMIN_TOKEN, PORTS, url, postJson, emit, type Proc } from "./shared.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PAY_SRC = path.join(ROOT, "payments-src")
const TSX = path.join(ROOT, "node_modules/.bin/tsx")
const git = (...args: string[]) => execFileSync("git", ["-C", PAY_SRC, ...args]).toString().trim()

const procs = new Map<string, ChildProcess>()
function start(name: Proc | "load") {
  const file = name === "load" ? "src/load.ts" : `src/services/${name}.ts`
  const child = spawn(TSX, [file], { cwd: ROOT, env: process.env, stdio: ["ignore", "inherit", "inherit"] })
  child.on("exit", (code, sig) => { if (procs.get(name) === child) console.log(`[supervisor] ${name} exited ${code ?? sig}`) })
  procs.set(name, child)
}
async function waitHealthy(p: Proc, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(`${url(p)}/_health`)).ok) return true } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
async function restart(p: Proc) {
  const old = procs.get(p)
  procs.delete(p)
  if (old) { old.kill("SIGTERM"); await new Promise((r) => old.once("exit", r)) }
  start(p)
  await waitHealthy(p)
}
const ctl = (p: Proc, flag: string, value: boolean) => postJson(`${url(p)}/_ctl`, { flag, value })

// ---- deploys (real git checkouts of payments-src) -------------------------------------
const deployLog: { ts: number; from: string; to: string }[] = []
async function deploy(service: ServiceName, ref: string): Promise<ChangeEvent> {
  if (service !== "payments") throw new Error("only payments is deployable in this demo")
  const from = git("rev-parse", "--short", "HEAD")
  git("checkout", "-q", ref)
  const to = git("rev-parse", "--short", "HEAD")
  const diff = from === to ? "" : git("diff", from, to).slice(0, 4096)
  await restart("payments")
  const change: ChangeEvent = { service, ts: Date.now(), kind: "deploy", from, to, diff, note: `deploy ${ref}` }
  deployLog.push({ ts: change.ts, from, to })
  await emit({ change })
  return change
}

// ---- admin API ----------------------------------------------------------------------
const app = new Hono()
app.use("/admin/*", async (c, next) => {
  if (c.req.header("x-banshee-token") !== ADMIN_TOKEN) return c.json({ error: "forbidden" }, 403)
  await next()
})
app.post("/admin/deploy", async (c) => {
  const { service, ref } = await c.req.json<{ service: ServiceName; ref: string }>()
  return c.json({ ok: true, change: await deploy(service, ref) })
})
app.post("/admin/fault", async (c) => {
  const { kind, on = true } = await c.req.json<{ kind: "bad_deploy" | "vendor_down" | "slow_inventory"; on?: boolean }>()
  if (kind === "bad_deploy") return c.json({ ok: true, change: await deploy("payments", on ? "v2.3" : "v2.2") })
  if (kind === "vendor_down") await ctl("vendor", "down", on) // external: no change event, payments only sees 503s
  if (kind === "slow_inventory") await ctl("inventory", "slow", on)
  return c.json({ ok: true })
})
app.post("/admin/fix", async (c) => {
  const { action, service, target } = await c.req.json<{ action: FixAction; service: ServiceName; target?: string }>()
  if (action === "rollback") {
    const prev = target ?? deployLog.at(-1)?.from
    if (!prev) return c.json({ error: "no previous deploy to roll back to" }, 409)
    return c.json({ ok: true, change: await deploy(service, prev) })
  }
  if (action === "fallback_on") await ctl("payments", "fallback", true)
  if (action === "cache_on") await ctl("inventory", "cache", true)
  const change: ChangeEvent = { service, ts: Date.now(), kind: "config", note: `${action} enabled` }
  await emit({ change })
  return c.json({ ok: true, change })
})
/** Put everything back to the healthy baseline (between rehearsals). */
app.post("/admin/reset", async (c) => {
  await ctl("vendor", "down", false)
  await ctl("inventory", "slow", false)
  await ctl("inventory", "cache", false)
  await ctl("payments", "fallback", false)
  if (git("rev-parse", "--short", "HEAD") !== git("rev-parse", "--short", "v2.2")) await deploy("payments", "v2.2")
  return c.json({ ok: true })
})
app.get("/admin/state", async (c) => {
  const health: Record<string, unknown> = {}
  for (const p of ["checkout", "payments", "inventory", "vendor"] as Proc[]) {
    try { health[p] = await (await fetch(`${url(p)}/_health`)).json() } catch { health[p] = { ok: false } }
  }
  const stats = await fetch(`${url("checkout")}/stats`).then((r) => r.json()).catch(() => null)
  return c.json({ paymentsVersion: git("rev-parse", "--short", "HEAD"), deployLog, health, stats })
})
// public read-only stats for the war room (no token)
app.get("/stats", async (c) => c.json(await fetch(`${url("checkout")}/stats`).then((r) => r.json()).catch(() => null)))

for (const p of ["vendor", "inventory", "payments", "checkout"] as Proc[]) start(p)
await Promise.all((["vendor", "inventory", "payments", "checkout"] as Proc[]).map((p) => waitHealthy(p)))
if (process.env.BANSHEE_LOAD !== "0") start("load")
serve({ fetch: app.fetch, port: PORTS.supervisor })
console.log(`[supervisor] admin on ${PORTS.supervisor}; payments at ${git("rev-parse", "--short", "HEAD")}`)
const stopAll = () => { for (const c of procs.values()) c.kill("SIGTERM"); process.exit(0) }
process.on("SIGINT", stopAll)
process.on("SIGTERM", stopAll)
