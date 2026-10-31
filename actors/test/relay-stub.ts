// RestRelay against a local stub that mimics the Relaycast REST contract (envelope, 409 on duplicate agent, bearer auth). Run: bun test/relay-stub.ts
import { RestRelay, MirroredRelay, LocalRelay, type TokenStore } from "../src/relay"

const WS_KEY = "ar_ws_stubkey"
const agents = new Map<string, string>() // name -> token
const channels = new Map<string, { agent: string; text: string }[]>()
const members = new Set<string>()
let deletes = 0
const stub = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url)
    const tok = (req.headers.get("authorization") ?? "").replace("Bearer ", "")
    const err = (status: number, code: string) => Response.json({ ok: false, error: { code, message: code } }, { status })
    const agentName = [...agents].find(([, t]) => t === tok)?.[0]
    const p = u.pathname.replace(/^\/v1/, "")
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {}
    if (p === "/agents" && req.method === "POST") {
      if (tok !== WS_KEY) return err(401, "unauthorized")
      if (agents.has(body.name)) return err(409, "agent_already_exists")
      const t = `ar_ag_${crypto.randomUUID()}`
      agents.set(body.name, t)
      return Response.json({ ok: true, data: { id: "1", name: body.name, token: t } }, { status: 201 })
    }
    if (p.startsWith("/agents/") && req.method === "DELETE") {
      if (tok !== WS_KEY) return err(401, "unauthorized")
      deletes++
      agents.delete(decodeURIComponent(p.slice(8)))
      return Response.json({ ok: true, data: {} })
    }
    if (p === "/channels" && req.method === "POST") {
      if (channels.has(body.name)) return err(409, "channel_exists")
      channels.set(body.name, [])
      return Response.json({ ok: true, data: { name: body.name } }, { status: 201 })
    }
    let m = /^\/channels\/([^/]+)\/join$/.exec(p)
    if (m && req.method === "POST") {
      if (!agentName) return err(401, "agent_token_invalid")
      members.add(`${m[1]}|${agentName}`)
      return Response.json({ ok: true, data: {} })
    }
    m = /^\/channels\/([^/]+)\/messages$/.exec(p)
    if (m && req.method === "POST") {
      if (!agentName) return err(401, "agent_token_invalid")
      if (!members.has(`${m[1]}|${agentName}`)) return err(403, "not_member")
      if (!req.headers.get("idempotency-key")) return err(400, "missing idempotency key")
      channels.get(m[1])!.push({ agent: agentName, text: body.text })
      return Response.json({ ok: true, data: { id: "m" } }, { status: 201 })
    }
    if (m && req.method === "GET") return Response.json({ ok: true, data: { messages: (channels.get(m[1]) ?? []).map((x, i) => ({ id: String(i), text: x.text, agent_name: x.agent })) } })
    if (p === "/dm" && req.method === "POST") return agentName ? Response.json({ ok: true, data: {} }, { status: 201 }) : err(401, "agent_token_invalid")
    return err(404, "not_found")
  },
})
let fails = 0
const check = (ok: boolean, what: string) => (console.log(`${ok ? "PASS" : "FAIL"}  ${what}`), ok || fails++)
const saved: Record<string, string> = {}
const store: TokenStore = { load: async () => ({ ...saved }), save: async (n, t) => void (saved[n] = t) }
const base = `http://127.0.0.1:${stub.port}`

const r = new RestRelay({ baseUrl: base, workspaceKey: WS_KEY, store })
await r.createChannel("inc-1")
await r.createChannel("inc-1") // idempotent
check(channels.has("inc-1"), "createChannel creates once and tolerates 409")
await r.post("inc-1", "spirit-checkout", "@spirit-payments did you change anything?")
await r.post("inc-1", "spirit-payments", "yes, deploy 590a9da")
await r.post("inc-1", "spirit-payments", "second message")
check(channels.get("inc-1")!.length === 3 && channels.get("inc-1")![1].agent === "spirit-payments", "post registers identities, joins, posts as the right agent")
check(Object.keys(saved).sort().join() === "spirit-checkout,spirit-payments", "tokens saved to the store")
check((await r.messages("inc-1")).length === 3, "messages() reads the channel back")
await r.dm("spirit-checkout", "spirit-payments", "psst")
check(true, "dm accepted")

// new process, tokens restored from the store: no re-register (a re-register would 409 and delete)
const before = deletes
const r2 = new RestRelay({ baseUrl: base, workspaceKey: WS_KEY, store })
await r2.post("inc-1", "spirit-checkout", "after restart")
check(deletes === before && channels.get("inc-1")!.length === 4, "restart reuses stored tokens")

// new process, tokens lost: 409 -> reclaim (delete + register)
const r3 = new RestRelay({ baseUrl: base, workspaceKey: WS_KEY })
await r3.post("inc-1", "spirit-payments", "tokens lost")
check(deletes === before + 1 && channels.get("inc-1")!.length === 5, "lost token: identity reclaimed, post succeeds")

// stale token held in memory (rotated elsewhere): 401 -> reclaim and retry
const r4 = new RestRelay({ baseUrl: base, workspaceKey: WS_KEY })
await r4.post("inc-1", "spirit-inventory", "hello")
agents.set("spirit-inventory", "ar_ag_rotated") // somebody else re-registered
await r4.post("inc-1", "spirit-inventory", "retry after 401")
check(channels.get("inc-1")!.at(-1)!.text === "retry after 401", "401 agent_token_invalid triggers reclaim and one retry")

// reclaim=false surfaces the conflict
const r5 = new RestRelay({ baseUrl: base, workspaceKey: WS_KEY, reclaim: false })
let threw = false
await r5.post("inc-1", "spirit-checkout", "x").catch(() => (threw = true))
check(threw, "reclaim=false throws on 409")

// mirrored: every message also reaches the sink even when the relay is down
const sunk: string[] = []
const down = new RestRelay({ baseUrl: "http://127.0.0.1:1", workspaceKey: WS_KEY, timeoutMs: 500 })
const errs: string[] = []
const mir = new MirroredRelay(down, async (m) => void sunk.push(m.text), (e) => errs.push(e.message))
await mir.post("inc-9", "spirit-checkout", "relay is down")
check(sunk.length === 1 && errs.length === 1, "MirroredRelay: chatter written, relay failure swallowed")
const loc = new LocalRelay()
const mir2 = new MirroredRelay(loc, async (m) => void sunk.push(m.text))
await mir2.post("inc-1", "spirit-checkout", "local")
check(loc.log.length === 1 && sunk.length === 2, "LocalRelay + sink")
stub.stop(true)
console.log(fails ? `${fails} FAILURE(S)` : "ALL PASSED")
process.exit(fails ? 1 : 0)
