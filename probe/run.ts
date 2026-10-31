import { actors } from "./generated"
const p = actors.Probe.get("p1")
console.log("ping", await p.ping())
console.log("ping", await p.ping())
console.log("net", await p.netCheck().catch((e: Error) => "NETFAIL " + e.message))
await p.arm(3000)
console.log("armed; state", await p.state())
await new Promise((r) => setTimeout(r, 6000))
console.log("after alarm", await p.state())
