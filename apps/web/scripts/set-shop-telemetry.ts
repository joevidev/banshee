// Points the Freestyle Candy Shop's telemetry at the web app: sets TELEMETRY_URL in the shop's systemd unit and restarts it.
//   cd apps/web && set -a && . ../../.env && set +a && pnpm exec tsx scripts/set-shop-telemetry.ts
import { Freestyle } from "freestyle"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const { vmId } = JSON.parse(readFileSync(path.join(root, ".freestyle-vm.json"), "utf8")) as { vmId: string }
const { domain } = JSON.parse(readFileSync(path.join(root, ".freestyle-web.json"), "utf8")) as { domain: string }
const url = `https://${domain}/api/ingest`
const vm = new Freestyle().vms.ref(vmId)
const unit = "/etc/systemd/system/candy-shop.service"
const run = async (cmd: string) => {
  const r = await vm.linuxUser("root").exec(cmd)
  if (r.statusCode && r.statusCode !== 0) throw new Error(`${cmd}\n${r.stderr ?? r.stdout}`)
  return r.stdout?.trim() ?? ""
}
await run(`sed -i 's|^Environment=TELEMETRY_URL=.*|Environment=TELEMETRY_URL=${url}|' ${unit} && systemctl daemon-reload && systemctl restart candy-shop`)
console.log(await run(`grep '^Environment=TELEMETRY_URL' ${unit}; systemctl is-active candy-shop`))
