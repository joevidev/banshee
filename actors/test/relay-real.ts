// RestRelay against the REAL Relay workspace (keys from env, never printed). Channel prefix inc-test-. Run: set -a; . ./.env; set +a; bun test/relay-real.ts
import { RestRelay, type TokenStore } from "../src/relay"
import { readFileSync, writeFileSync } from "node:fs"

const file = process.env.RELAY_TEST_TOKENS ?? `${process.env.TMPDIR ?? "/tmp"}/banshee-relay-test-tokens.json`
const store: TokenStore = {
  load: async () => { try { return JSON.parse(readFileSync(file, "utf8")) } catch { return {} } },
  save: async (n, t) => { const cur = await store.load(); writeFileSync(file, JSON.stringify({ ...cur, [n]: t }), { mode: 0o600 }) },
}
if (!process.env.RELAY_WORKSPACE_KEY) throw new Error("RELAY_WORKSPACE_KEY not set")
const relay = new RestRelay({ baseUrl: process.env.RELAY_BASE_URL, workspaceKey: process.env.RELAY_WORKSPACE_KEY, store, log: (m) => console.log("  note:", m) })
const timed = async <T>(label: string, f: () => Promise<T>) => { const t = Date.now(); const v = await f(); console.log(`${label.padEnd(34)} ${Date.now() - t} ms`); return v }
const ch = `inc-test-${Date.now().toString(36)}`
await timed(`createChannel ${ch}`, () => relay.createChannel(ch))
for (const who of ["spirit-checkout", "spirit-payments", "spirit-inventory"]) await timed(`first post as ${who} (register+join)`, () => relay.post(ch, who, `${who} online in ${ch}`))
await timed("post (warm)", () => relay.post(ch, "spirit-checkout", "@spirit-payments my errors started at 20:08:14. Did you change anything?"))
await timed("post (warm)", () => relay.post(ch, "spirit-payments", "@spirit-checkout yes: deploy 2282cbd -> 590a9da at 20:08:17"))
await timed("dm spirit-payments -> spirit-checkout", () => relay.dm("spirit-payments", "spirit-checkout", "dm check")).catch((e) => console.log("dm failed:", e.message))
const msgs = await timed("read back messages", () => relay.messages(ch))
console.log(`read back ${msgs.length} messages in ${ch}:`)
for (const m of msgs) console.log(`  ${(m as any).agent_name ?? (m as any).agentName ?? (m as any).author ?? "?"}: ${String(m.text).slice(0, 90)}`)
const ok = msgs.length >= 5
console.log(ok ? "REAL RELAY OK" : "REAL RELAY: fewer messages than posted")
process.exit(ok ? 0 : 1)
