import { Freestyle } from "freestyle"
import { readFileSync } from "node:fs"
const { vmId } = JSON.parse(readFileSync("/Users/dianamunozlar/Workspace/jctimana/buivo/hackathons/haunted-hacks-oct31/banshee/.freestyle-web.json", "utf8"))
const root = new Freestyle().vms.ref(vmId).linuxUser("root")
const cmd = process.argv[2]
const r = await root.exec(cmd)
console.log(String((r as any).stdout ?? "").slice(0, 3000), String((r as any).stderr ?? "").slice(0, 1500))
