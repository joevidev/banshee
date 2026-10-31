// Deploys Candy Shop (the "production" judges break) to a real Freestyle VM.
//   node --env-file=../../.env node_modules/.bin/tsx scripts/deploy-freestyle.ts
// Needs FREESTYLE_API_KEY and BANSHEE_ADMIN_TOKEN (strong, not "dev-token"). Optional: TELEMETRY_URL, BANSHEE_SHOP_NAME.
import { Freestyle } from "freestyle"
import { execFileSync } from "node:child_process"
import { openAsBlob, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const NAME = process.env.BANSHEE_SHOP_NAME ?? "banshee-shop"
const token = process.env.BANSHEE_ADMIN_TOKEN
if (!token || token === "dev-token") throw new Error("set a strong BANSHEE_ADMIN_TOKEN first")
const telemetryUrl = process.env.TELEMETRY_URL ?? ""

const tgz = path.join(mkdtempSync(path.join(tmpdir(), "shop-")), "shop.tgz")
execFileSync("tar", ["--no-xattrs", "--exclude=._*", "-czf", tgz, "-C", ROOT, "src", "scripts/setup-payments-repo.sh"], { env: { ...process.env, COPYFILE_DISABLE: "1" } })

const freestyle = new Freestyle()
const firewall = { rules: [{ action: "allow", source: {}, destination: { public: true } }] } as const
console.log("creating VM…")
const { vm, vmId } = await freestyle.vms.create({
  firewall,
  snapshotId: "freestyle/ubuntu-sm",
  slug: NAME,
  idleTimeoutSeconds: null,
})
console.log("vm", vmId)
try {

await vm.fs.writeFile("/srv/shop.tgz", await openAsBlob(tgz))
await vm.fs.writeTextFile(
  "/srv/candy-shop/package.json",
  JSON.stringify({
    name: "candy-shop-prod", private: true, type: "module",
    dependencies: { "@hono/node-server": "^1.19.0", hono: "^4.10.0", tsx: "^4.20.0" },
  }),
)
const run = async (cmd: string) => {
  const r = await vm.linuxUser("root").exec(cmd)
  if (r.statusCode && r.statusCode !== 0) throw new Error(`${cmd}\n${r.stderr ?? r.stdout}`)
  return r.stdout?.trim() ?? ""
}
await run("cd /srv/candy-shop && tar xzf /srv/shop.tgz && npm install --no-audit --no-fund 2>&1 | tail -2")
await run("git config --global user.name banshee && git config --global user.email banshee@example.com && git config --global --add safe.directory '*' && mkdir -p /srv/candy-shop/payments-src && bash /srv/candy-shop/scripts/setup-payments-repo.sh && git -C /srv/candy-shop/payments-src rev-parse --short HEAD")
const nodePath = await run("command -v node")
const nodeDir = path.posix.dirname(nodePath)

await vm.fs.writeTextFile(
  "/etc/systemd/system/candy-shop.service",
  `[Unit]
Description=Banshee Candy Shop
After=network.target

[Service]
WorkingDirectory=/srv/candy-shop
ExecStart=${nodeDir}/node /srv/candy-shop/node_modules/tsx/dist/cli.mjs src/supervisor.ts
Restart=always
Environment=HOME=/root
Environment=PATH=${nodeDir}:/usr/local/bin:/usr/bin:/bin
Environment=BANSHEE_ADMIN_TOKEN=${token}
Environment=TELEMETRY_URL=${telemetryUrl}

[Install]
WantedBy=multi-user.target
`,
)
await vm.linuxUser("root").exec("systemctl daemon-reload && systemctl enable --now candy-shop")

let ready = false
for (let i = 0; i < 40 && !ready; i++) {
  const p = await vm.exec("curl -s -o /dev/null -w '%{http_code}' http://localhost:4101/ || true")
  ready = p.stdout?.trim() === "200"
  if (!ready) await new Promise((r) => setTimeout(r, 1500))
}
if (!ready) throw new Error("shop did not become ready; check: journalctl -u candy-shop")

const shopDomain = `${NAME}.style.dev`
const adminDomain = `${NAME}-admin.style.dev`
await freestyle.tls.rules.create({ action: "allow", domain: shopDomain, source: { public: true }, destination: { vmId, port: 4101 } })
await freestyle.tls.rules.create({ action: "allow", domain: adminDomain, source: { public: true }, destination: { vmId, port: 4100 } })
writeFileSync(path.resolve(ROOT, "../../.freestyle-vm.json"), JSON.stringify({ vmId, shopDomain, adminDomain }, null, 2))
console.log(JSON.stringify({ vmId, shop: `https://${shopDomain}`, admin: `https://${adminDomain}` }))
} catch (e) {
  console.error("deploy failed, deleting the VM so it does not keep running:", (e as Error).message)
  await vm.delete().catch(() => {})
  process.exit(1)
}
