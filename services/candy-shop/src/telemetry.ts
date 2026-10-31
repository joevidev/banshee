// One line per service: app.use(banshee({ service: "payments", version }).middleware)
import type { MiddlewareHandler } from "hono"
import type { ServiceName, Telemetry } from "@banshee/contracts"
import { emit } from "./shared.ts"

type Callee = ServiceName | "vendor"

export function banshee(opts: { service: ServiceName; version: () => string; windowMs?: number }) {
  const windowMs = opts.windowMs ?? 5000
  let durations: number[] = []
  let errors = 0
  let calleeErrors: Partial<Record<Callee, number>> = {}
  let sampleErrors: string[] = []

  const middleware: MiddlewareHandler = async (c, next) => {
    if (c.req.path.startsWith("/_")) return next() // control and health routes are not traffic
    const t0 = performance.now()
    await next()
    durations.push(performance.now() - t0)
    if (c.res.status >= 500) errors++
  }

  function error(message: string, callee?: Callee) {
    if (callee) calleeErrors[callee] = (calleeErrors[callee] ?? 0) + 1
    sampleErrors.push(`${new Date().toISOString()} ${message}`)
    if (sampleErrors.length > 5) sampleErrors = sampleErrors.slice(-5)
  }

  const timer = setInterval(() => {
    const sorted = [...durations].sort((a, b) => a - b)
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0
    const telemetry: Telemetry = {
      service: opts.service,
      ts: Date.now(),
      requests: durations.length,
      errors,
      p95Ms: Math.round(p95),
      calleeErrors,
      sampleErrors,
      version: opts.version(),
    }
    durations = []
    errors = 0
    calleeErrors = {}
    sampleErrors = []
    void emit({ telemetry })
  }, windowMs)
  timer.unref?.()

  return { middleware, error }
}
