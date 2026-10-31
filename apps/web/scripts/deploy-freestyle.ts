// Deploys the Banshee web app (war room + phones + API routes) to a public Freestyle VM.
//   cd apps/web && set -a && . ../../.env && set +a && pnpm exec tsx scripts/deploy-freestyle.ts
// Needs FREESTYLE_API_KEY, TERSE_ACTOR_URL, TERSE_API_KEY, BANSHEE_ADMIN_TOKEN (the real token of the VM shop).
// Optional: BANSHEE_WEB_DOMAIN (default banshee.style.dev; falls back to banshee-hq.style.dev if taken), SKIP_BUILD=1,
// CANDY_SHOP_URL (default https://banshee-shop-admin.style.dev). Writes ../../.freestyle-web.json.
// Secrets only go into /etc/systemd/system/banshee-web.service on the VM (mode 600); nothing is logged.
import { Freestyle } from "freestyle"
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, openAsBlob, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`set ${k}`)
  return v
}
const token = need("BANSHEE_ADMIN_TOKEN")
if (token === "dev-token") throw new Error("set a strong BANSHEE_ADMIN_TOKEN first")
const actorUrl = need("TERSE_ACTOR_URL")
const actorKey = need("TERSE_API_KEY")
const shopUrl = process.env.CANDY_SHOP_URL ?? "https://banshee-shop-admin.style.dev"
const domains = process.env.BANSHEE_WEB_DOMAIN ? [process.env.BANSHEE_WEB_DOMAIN] : ["banshee.style.dev", "banshee-hq.style.dev"]
const NAME = process.env.BANSHEE_WEB_NAME ?? "banshee-web"
const DIST = ".next-prod"

if (!process.env.SKIP_BUILD) {
  console.log("building (live mode default)…")
  execFileSync("pnpm", ["exec", "next", "build"], {
    cwd: WEB,
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: DIST, NEXT_PUBLIC_DEFAULT_SOURCE: "live" },
  })
}

const work = mkdtempSync(path.join(tmpdir(), "banshee-web-"))
const pkg = path.join(work, "pkg")
cpSync(path.join(WEB, DIST, "standalone"), pkg, { recursive: true, verbatimSymlinks: true })
mkdirSync(path.join(pkg, "apps/web", DIST), { recursive: true })
cpSync(path.join(WEB, DIST, "static"), path.join(pkg, "apps/web", DIST, "static"), { recursive: true })
cpSync(path.join(WEB, "public"), path.join(pkg, "apps/web/public"), { recursive: true })
const tgz = path.join(work, "web.tgz")
execFileSync("tar", ["--no-xattrs", "--exclude=._*", "-czf", tgz, "-C", pkg, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } })

const freestyle = new Freestyle()
const before = await freestyle.vms.list()
console.log("VMs before:", before.vms.map((v) => v.slug ?? v.id).join(", "))
const firewall = { rules: [{ action: "allow" as const, source: {}, destination: { public: true as const } }] }
console.log("creating VM…")
const { vm, vmId } = await freestyle.vms.create({
  firewall,
  snapshotId: "freestyle/ubuntu-sm",
  slug: NAME,
  idleTimeoutSeconds: null,
})
console.log("vm", vmId)
try {
  const run = async (cmd: string) => {
    const r = await vm.linuxUser("root").exec(cmd)
    if (r.statusCode && r.statusCode !== 0) throw new Error(`${cmd}\n${r.stderr ?? r.stdout}`)
    return r.stdout?.trim() ?? ""
  }
  await vm.fs.writeFile("/srv/web.tgz", await openAsBlob(tgz))
  await run("mkdir -p /srv/banshee-web && cd /srv/banshee-web && tar xzf /srv/web.tgz && rm /srv/web.tgz && ls apps/web/server.js")
  const nodePath = await run("command -v node")
  const nodeDir = path.posix.dirname(nodePath)
  console.log("node on VM:", await run("node -v"))

  await vm.fs.writeTextFile(
    "/etc/systemd/system/banshee-web.service",
    `[Unit]
Description=Banshee web app
After=network.target

[Service]
WorkingDirectory=/srv/banshee-web/apps/web
ExecStart=${nodeDir}/node /srv/banshee-web/apps/web/server.js
Restart=always
Environment=HOME=/root
Environment=PATH=${nodeDir}:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=BANSHEE_SOURCE=live
Environment=BANSHEE_ACTOR_URL=${actorUrl}
Environment=BANSHEE_ACTOR_KEY=${actorKey}
Environment=CANDY_SHOP_URL=${shopUrl}
Environment=BANSHEE_ADMIN_TOKEN=${token}

[Install]
WantedBy=multi-user.target
`,
  )
  await run("chmod 600 /etc/systemd/system/banshee-web.service && systemctl daemon-reload && systemctl enable --now banshee-web")

  let ready = false
  for (let i = 0; i < 40 && !ready; i++) {
    const p = await vm.exec("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true")
    ready = p.stdout?.trim() === "200"
    if (!ready) await new Promise((r) => setTimeout(r, 1500))
  }
  if (!ready) throw new Error("web app did not become ready; check: journalctl -u banshee-web")

  let domain = ""
  const errs: string[] = []
  for (const d of domains) {
    try {
      await freestyle.tls.rules.create({ action: "allow", domain: d, source: { public: true }, destination: { vmId, port: 3000 } })
      domain = d
      break
    } catch (e) {
      errs.push(`${d}: ${(e as Error).message}`)
    }
  }
  if (!domain) throw new Error(`no domain available: ${errs.join(" | ")}`)
  if (errs.length) console.log("domain fallback used:", errs.join(" | "))

  let ok = false
  for (let i = 0; i < 60 && !ok; i++) {
    ok = await fetch(`https://${domain}/`).then((r) => r.status === 200).catch(() => false)
    if (!ok) await new Promise((r) => setTimeout(r, 2000))
  }
  if (!ok) throw new Error(`https://${domain}/ did not return 200`)
  writeFileSync(path.resolve(WEB, "../../.freestyle-web.json"), JSON.stringify({ vmId, domain }, null, 2))
  console.log(JSON.stringify({ vmId, url: `https://${domain}` }))
} catch (e) {
  console.error("deploy failed, deleting the VM so it does not keep running:", (e as Error).message)
  await vm.delete().catch(() => {})
  process.exit(1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
const after = await freestyle.vms.list()
console.log("VMs after:", after.vms.map((v) => v.slug ?? v.id).join(", "), `(count ${after.vms.length})`)
