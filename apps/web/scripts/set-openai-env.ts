// Puts OPENAI_API_KEY (from the environment) into a root-only systemd drop-in of the banshee-web VM, then daemon-reload.
// It never prints the key. The next restart of banshee-web (update-freestyle.ts does one) picks it up.
import { Freestyle } from "freestyle"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { vmId } = JSON.parse(readFileSync(path.resolve(WEB, "../../.freestyle-web.json"), "utf8")) as { vmId: string }
const key = process.env.OPENAI_API_KEY ?? ""
if (!/^[A-Za-z0-9_\-]{20,300}$/.test(key)) throw new Error("OPENAI_API_KEY missing or has unexpected characters")

const vm = new Freestyle().vms.ref(vmId)
const root = vm.linuxUser("root")
const r = await root.exec(
  `mkdir -p /etc/systemd/system/banshee-web.service.d && umask 077 && printf '[Service]\\nEnvironment=OPENAI_API_KEY=${key}\\n' > /etc/systemd/system/banshee-web.service.d/openai.conf && chmod 600 /etc/systemd/system/banshee-web.service.d/openai.conf && systemctl daemon-reload && echo drop-in-written && stat -c '%a %U %s bytes' /etc/systemd/system/banshee-web.service.d/openai.conf`,
)
console.log(String((r as { stdout?: string }).stdout ?? "").replaceAll(key, "[key]").trim() || "no output", "| keyLength:", key.length)
