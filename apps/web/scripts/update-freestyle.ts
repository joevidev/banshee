// In-place update of the banshee-web VM (same VM, same domain and TLS rule): uploads a fresh standalone build,
// keeps the previous one in /srv/banshee-web.prev and restores it if the new one does not come up.
//   cd apps/web && set -a && . ../../.env && set +a && pnpm exec tsx scripts/update-freestyle.ts   (SKIP_BUILD=1 reuses .next-prod)
import { Freestyle } from "freestyle"
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, openAsBlob, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { vmId, domain } = JSON.parse(readFileSync(path.resolve(WEB, "../../.freestyle-web.json"), "utf8")) as { vmId: string; domain: string }
const DIST = ".next-prod"
if (!process.env.SKIP_BUILD) {
  execFileSync("pnpm", ["exec", "next", "build"], { cwd: WEB, stdio: "inherit", env: { ...process.env, NEXT_DIST_DIR: DIST, NEXT_PUBLIC_DEFAULT_SOURCE: "live" } })
}
const work = mkdtempSync(path.join(tmpdir(), "banshee-web-"))
const pkg = path.join(work, "pkg")
cpSync(path.join(WEB, DIST, "standalone"), pkg, { recursive: true, verbatimSymlinks: true })
mkdirSync(path.join(pkg, "apps/web", DIST), { recursive: true })
cpSync(path.join(WEB, DIST, "static"), path.join(pkg, "apps/web", DIST, "static"), { recursive: true })
cpSync(path.join(WEB, "public"), path.join(pkg, "apps/web/public"), { recursive: true })
const tgz = path.join(work, "web.tgz")
execFileSync("tar", ["--no-xattrs", "--exclude=._*", "-czf", tgz, "-C", pkg, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } })

const vm = new Freestyle().vms.ref(vmId)
const run = async (cmd: string) => {
  const r = await vm.linuxUser("root").exec(cmd)
  if (r.statusCode && r.statusCode !== 0) throw new Error(`${cmd}\n${r.stderr ?? r.stdout}`)
  return r.stdout?.trim() ?? ""
}
const healthy = async () => {
  for (let i = 0; i < 30; i++) {
    const p = await vm.exec("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true")
    if (p.stdout?.trim() === "200") return true
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}
try {
  await vm.fs.writeFile("/srv/web.tgz", await openAsBlob(tgz))
  await run("rm -rf /srv/banshee-web.new /srv/banshee-web.prev && mkdir -p /srv/banshee-web.new && cd /srv/banshee-web.new && tar xzf /srv/web.tgz && rm /srv/web.tgz && ls apps/web/server.js")
  await run("systemctl stop banshee-web && mv /srv/banshee-web /srv/banshee-web.prev && mv /srv/banshee-web.new /srv/banshee-web && systemctl start banshee-web")
  if (!(await healthy())) {
    console.error("new build unhealthy, restoring the previous one")
    // only swap back when a previous build really exists; never delete the running tree otherwise
    await run("if [ -d /srv/banshee-web.prev ]; then systemctl stop banshee-web; rm -rf /srv/banshee-web && mv /srv/banshee-web.prev /srv/banshee-web; fi; systemctl start banshee-web")
    throw new Error("update failed; previous build restored: " + (await run("journalctl -u banshee-web -n 5 --no-pager | cut -c1-200").catch(() => "")))
  }
  const ok = await fetch(`https://${domain}/`).then((r) => r.status === 200).catch(() => false)
  console.log("updated", { vmId, domain, publicOk: ok })
} finally {
  rmSync(work, { recursive: true, force: true })
}
