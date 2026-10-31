import type { Hono } from "hono"
import { ADMIN_TOKEN } from "../shared.ts"

/** Runtime flags a service exposes to the supervisor (faults and fixes). */
export function controls<T extends Record<string, boolean>>(app: Hono, flags: T): T {
  app.get("/_health", (c) => c.json({ ok: true, flags }))
  app.post("/_ctl", async (c) => {
    if (c.req.header("x-banshee-token") !== ADMIN_TOKEN) return c.json({ error: "forbidden" }, 403)
    const { flag, value } = await c.req.json<{ flag: string; value: boolean }>()
    if (!(flag in flags)) return c.json({ error: `unknown flag ${flag}` }, 400)
    ;(flags as Record<string, boolean>)[flag] = value
    return c.json({ ok: true, flags })
  })
  return flags
}
