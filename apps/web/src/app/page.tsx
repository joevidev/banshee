import type { Metadata } from "next"
import Link from "next/link"
import { EvidenceArt, PhoneArt, PingArt, RelayArt } from "@/components/landing/illustrations"
import { LivePreview } from "@/components/landing/LivePreview"

export const metadata: Metadata = {
  title: "Banshee: services that investigate their own incidents",
  description: "Every production service gets its own agent. When production breaks, the agents question each other, find the cause with evidence, and you approve the fix from your phone.",
}

const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8"
const eyebrow = "font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
const h2 = "mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[40px]"

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="text-ink">
      <path d="M5 21V10a7 7 0 0 1 14 0v11l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="10.5" r="1.1" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1.1" fill="currentColor" />
    </svg>
  )
}

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      {children}
    </Link>
  )
}
function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong bg-card px-6 text-[14px] font-medium text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      {children}
    </Link>
  )
}

const STEPS = [
  { art: <PingArt />, title: "A service pings", body: "Each service sends its numbers to its own agent. When error rate or latency leaves the baseline, that agent opens an incident." },
  { art: <RelayArt />, title: "Agents question each other", body: "They meet in a channel on Agent Relay and ask each other for evidence. Is it you, or are my errors coming from you?" },
  { art: <EvidenceArt />, title: "Root cause, with evidence", body: "The culprit is the earliest change that has a local cause: a deploy, a config change or a vendor error. Code picks it. The model only writes it up." },
  { art: <PhoneArt />, title: "You approve on your phone", body: "On-call gets the evidence and one proposed fix. Approve, and the fix runs. Reject, and nothing changes." },
]

const ROWS: { what: string; real: boolean; detail: string }[] = [
  { what: "Candy Shop services", real: true, detail: "Checkout, payments and inventory run as real HTTP services on a cloud VM, under real traffic from a load generator." },
  { what: "The bad deploy", real: true, detail: "A real git commit with a real bug. The button checks it out on payments and restarts the service. The fix checks out the previous commit." },
  { what: "Error rates, latency, error lines, deploy diffs", real: true, detail: "They come from the running services. Nothing is replayed." },
  { what: "What the agents know", real: true, detail: "Agents only know what their tools return. They are not told which fault was pressed." },
  { what: "The shop itself", real: false, detail: "It is our demo shop, not a customer's production." },
  { what: "The card processor", real: false, detail: "A fake vendor service that we run and can switch off." },
  { what: "The deploy pipeline", real: false, detail: "A script, not CI/CD." },
]

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur-md">
        <div className={wrap + " flex h-14 items-center justify-between"}>
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Banshee</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] text-muted">
            <a href="#how" className="hidden transition-colors hover:text-ink sm:inline">How it works</a>
            <a href="#why" className="hidden transition-colors hover:text-ink sm:inline">Why</a>
            <a href="#real" className="hidden transition-colors hover:text-ink sm:inline">Real vs simulated</a>
            <Link href="/room" className="rounded-full border border-line-strong bg-card px-3.5 py-1.5 font-medium text-ink transition-colors hover:border-ink">War room</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className={wrap + " pb-12 pt-16 sm:pb-16 sm:pt-28"}>
          <p className={eyebrow}>Haunted Hacks · Y Combinator</p>
          <h1 className="mt-5 max-w-4xl text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[72px]">
            Your services investigate their own incidents.
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-[19px]">
            Every production service gets its own agent. When something breaks, the agents question each other, find the cause with evidence, and ask you to approve the fix from your phone.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta href="/chaos">Break production</PrimaryCta>
            <SecondaryCta href="/room">Watch the war room</SecondaryCta>
          </div>
        </section>

        {/* live preview */}
        <section className={wrap + " pb-24 sm:pb-36"} aria-label="Live preview">
          <LivePreview />
        </section>

        {/* how it works */}
        <section id="how" className={wrap + " scroll-mt-16 border-t border-line py-20 sm:py-28"}>
          <p className={eyebrow}>How it works</p>
          <h2 className={h2}>From first error to approved fix, in four steps.</h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col rounded-2xl border border-line bg-card p-5">
                <div className="rounded-lg bg-background px-3 py-4">{s.art}</div>
                <span className="mt-6 font-mono text-[11px] text-faint">0{i + 1}</span>
                <h3 className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* why */}
        <section id="why" className={wrap + " scroll-mt-16 border-t border-line py-20 sm:py-28"}>
          <p className={eyebrow}>Why Durable Actors and Agent Relay</p>
          <h2 className={h2}>An agent that lives with its service needs a place to live, and a way to talk.</h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
              <h3 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink">Terse Durable Actors</h3>
              <dl className="mt-6 flex flex-col gap-6">
                <div>
                  <dt className="text-[17px] font-semibold tracking-tight text-ink">State that survives, and wakes on an alarm</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted">
                    Each agent keeps its service&apos;s deploy history and baseline. It sleeps between telemetry pushes and wakes on a message or an alarm. If its service goes quiet for 30 seconds, it raises the alarm itself.
                  </dd>
                </div>
                <div>
                  <dt className="text-[17px] font-semibold tracking-tight text-ink">Memory of past incidents</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted">
                    The second time the same bad deploy happens, the agent recalls the first incident and proposes the fix at once.
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
              <h3 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink">Agent Relay</h3>
              <dl className="mt-6 flex flex-col gap-6">
                <div>
                  <dt className="text-[17px] font-semibold tracking-tight text-ink">Agents of different owners, talking in channels</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted">
                    Each team owns its service&apos;s agent. When production breaks, a channel opens for the incident and the agents involved question each other in it.
                  </dd>
                </div>
                <div>
                  <dt className="text-[17px] font-semibold tracking-tight text-ink">Humans and their coding agents join the same room</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted">
                    On-call joins from a phone. An engineer&apos;s own Claude Code can join the channel through the Relay MCP and ask the payments agent what it ruled out.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* real vs simulated */}
        <section id="real" className={wrap + " scroll-mt-16 border-t border-line py-20 sm:py-28"}>
          <p className={eyebrow}>Honest scope</p>
          <h2 className={h2}>What is real, what is simulated.</h2>
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-3 font-medium sm:w-[28%]">Part</th>
                  <th className="px-3 py-3 font-medium sm:w-[14%]">Status</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Detail</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.what} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-4 text-[14px] font-medium text-ink">
                      {r.what}
                      <p className="mt-1.5 text-[13px] font-normal leading-relaxed text-muted sm:hidden">{r.detail}</p>
                    </td>
                    <td className="px-3 py-4">
                      <span className={"inline-block rounded-full px-2.5 py-0.5 font-mono text-[11px] " + (r.real ? "bg-ink text-white" : "border border-line-strong text-muted")}>{r.real ? "Real" : "Simulated"}</span>
                    </td>
                    <td className="hidden px-5 py-4 text-[14px] leading-relaxed text-muted sm:table-cell">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* team */}
        <section className={wrap + " border-t border-line py-20 sm:py-28"}>
          <p className={eyebrow}>Team</p>
          <h2 className={h2}>Built by two people.</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {["Joel Timana", "Diana Munoz"].map((n) => (
              <li key={n} className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5">
                <span className="grid size-11 place-items-center rounded-full bg-ink font-mono text-[13px] font-medium text-white">{n.split(" ").map((w) => w[0]).join("")}</span>
                <span className="text-[17px] font-semibold tracking-tight text-ink">{n}</span>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta href="/chaos">Break production</PrimaryCta>
            <SecondaryCta href="/room">Watch the war room</SecondaryCta>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={wrap + " flex flex-col gap-3 py-8 sm:flex-row sm:items-center sm:justify-between"}>
          <div className="flex items-center gap-2.5">
            <Mark size={18} />
            <span className="text-[14px] font-semibold tracking-tight text-ink">Banshee</span>
          </div>
          <p className="font-mono text-[11px] text-muted">Built at Haunted Hacks, Y Combinator, October 31 2026</p>
        </div>
      </footer>
    </div>
  )
}
