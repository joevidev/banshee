"use client"
// Immersive hero: the live 3D office fills the whole first screen, the headline floats on glass over it,
// and a few glass cards and ghosts drift around it. The office is the real war room on mock data.
import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"

const DESKTOP = { w: 1440, h: 860, src: "/room?source=mock&embed=1" }
const MOBILE = { w: 760, h: 600, src: "/room?source=mock&embed=office" }

function Ghost({ hat = "witch", className = "", style }: { hat?: "witch" | "pumpkin" | "bat"; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 150" className={className} style={style} aria-hidden>
      <ellipse cx="60" cy="144" rx="30" ry="5" fill="rgba(10,10,10,.12)" />
      <path d="M18 70C18 38 36 18 60 18s42 20 42 52v62l-12-9-10 10-10-10-10 10-10-10-10 10-12-10z" fill="#fff" stroke="#0a0a0a" strokeWidth="3.5" strokeLinejoin="round" />
      <ellipse cx="46" cy="64" rx="5" ry="7" fill="#0a0a0a" /><ellipse cx="74" cy="64" rx="5" ry="7" fill="#0a0a0a" />
      <ellipse cx="36" cy="80" rx="6" ry="4" fill="#ffb3c1" opacity=".8" /><ellipse cx="84" cy="80" rx="6" ry="4" fill="#ffb3c1" opacity=".8" />
      <path d="M52 82q8 7 16 0" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
      {hat === "witch" && <g><ellipse cx="60" cy="26" rx="34" ry="8" fill="#0a0a0a" /><path d="M42 26 60 -6l18 32z" fill="#0a0a0a" /><rect x="46" y="18" width="28" height="6" fill="#fff" /></g>}
      {hat === "pumpkin" && <g><ellipse cx="60" cy="20" rx="20" ry="14" fill="#f97316" stroke="#0a0a0a" strokeWidth="3" /><path d="M60 8V0" stroke="#15803d" strokeWidth="4" strokeLinecap="round" /></g>}
      {hat === "bat" && <g fill="#0a0a0a"><path d="M32 30 36 6l16 16zM88 30 84 6 68 22z" /></g>}
    </svg>
  )
}

const glass = "border border-white/70 bg-white/65 shadow-[0_18px_50px_-18px_rgba(10,10,10,0.28)] backdrop-blur-xl"

function Float({ children, className, delay = 0 }: { children: ReactNode; className: string; delay?: number }) {
  return <div className={"hero-float pointer-events-none absolute " + className} style={{ animationDelay: `${delay}s` }}>{children}</div>
}

export function Hero() {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mobile = width > 0 && width < 760
  const v = mobile ? MOBILE : DESKTOP
  const scale = width ? width / v.w : 0
  const stageH = scale ? Math.max(v.h * scale, mobile ? 360 : 640) : mobile ? 360 : 700

  return (
    <section aria-label="Banshee" className="relative isolate overflow-hidden border-b border-line">
      <style>{`
        @keyframes hero-bob { 0%,100% { transform: translateY(0) rotate(var(--r,0deg)) } 50% { transform: translateY(-12px) rotate(var(--r,0deg)) } }
        .hero-float { animation: hero-bob 6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .hero-float { animation: none } }
      `}</style>

      {/* the live office */}
      <div ref={box} className="absolute inset-0 -z-10 bg-[#fafafa]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/office-preview.png" alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        {scale > 0 && (
          <iframe
            key={v.src}
            title="Live office"
            src={v.src}
            tabIndex={-1}
            aria-hidden
            onLoad={() => setLoaded(true)}
            className={"pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-[#fafafa] transition-opacity duration-700 " + (loaded ? "opacity-100" : "opacity-0")}
            style={{ width: v.w, height: v.h, transform: `scale(${scale})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#fafafa]/90 via-[#fafafa]/20 via-35% to-transparent sm:from-[#fafafa]/80 sm:via-[#fafafa]/5" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fafafa] to-transparent" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col justify-center px-5 py-20 sm:px-8" style={{ minHeight: stageH }}>
        <div className={"max-w-[640px] rounded-3xl p-6 sm:p-9 " + glass}>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Haunted Hacks · Y Combinator</p>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[64px]">Your services investigate their own incidents.</h1>
          <p className="mt-5 text-[16px] leading-relaxed text-muted sm:text-[18px]">
            Every production service gets its own durable agent, built on Terse Durable Actors. When something breaks, the agents question each other in real time, find the cause with evidence, and call you on-call: talk to them, then approve the fix from your phone.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/chaos" className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-7 text-[15px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Break production</Link>
            <Link href="/room" className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong bg-white/70 px-7 text-[15px] font-medium text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Watch the war room</Link>
          </div>
        </div>
      </div>

      {/* floating cards and ghosts over the office (desktop) */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
        <Float className="right-[7%] top-[14%]" delay={0}>
          <div className={"flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[12px] text-red " + glass} style={{ borderColor: "rgba(229,72,77,.35)" }}>
            <span className="size-2 animate-pulse rounded-full bg-red" /> payments · degraded
          </div>
        </Float>
        <Float className="right-[24%] top-[36%]" delay={1.2}>
          <div className={"max-w-[250px] rounded-2xl px-4 py-3 text-[13px] leading-snug text-ink " + glass}>
            <div className="mb-1 font-mono text-[10px] text-muted">spirit-checkout</div>
            @payments is this a deploy again?
          </div>
        </Float>
        <Float className="right-[6%] top-[52%]" delay={2.1}>
          <div className={"w-[260px] rounded-2xl p-4 " + glass}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-red">needs you</div>
            <div className="mt-1 text-[15px] font-semibold leading-tight text-ink">payments needs your OK</div>
            <div className="mt-1 text-[12px] text-muted">Roll back payments to bf00054?</div>
            <div className="mt-3 flex gap-2"><span className="flex-1 rounded-xl border border-ink px-3 py-2 text-center text-[12px] font-semibold text-ink">Reject</span><span className="flex-[2] rounded-xl bg-ink px-3 py-2 text-center text-[12px] font-semibold text-white">Approve fix</span></div>
          </div>
        </Float>
        <Float className="bottom-[8%] right-[34%]" delay={0.6}><Ghost hat="witch" className="w-24" /></Float>
        <Float className="right-[40%] top-[8%]" delay={1.8}><Ghost hat="pumpkin" className="w-16 opacity-90" /></Float>
        <Float className="bottom-[14%] right-[3%]" delay={2.6}><Ghost hat="bat" className="w-20" /></Float>
      </div>
    </section>
  )
}
