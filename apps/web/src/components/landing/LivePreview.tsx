"use client"

import { useEffect, useRef, useState } from "react"

const DESKTOP = { w: 1440, h: 860, src: "/room?source=mock&embed=1" }
const MOBILE = { w: 760, h: 600, src: "/room?source=mock&embed=office" }

/** Framed, non-interactive preview of the real war room, scaled to fit its container. */
export function LivePreview() {
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

  const v = width && width < 640 ? MOBILE : DESKTOP
  const scale = width ? width / v.w : 0

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.18)]">
        <div className="flex h-9 items-center gap-2 border-b border-line px-4">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 truncate font-mono text-[11px] text-faint">banshee / room</span>
        </div>
        <div ref={box} className="relative w-full overflow-hidden bg-[#fafafa]" style={{ height: scale ? v.h * scale : undefined, aspectRatio: scale ? undefined : "1440 / 860" }}>
          {/* fallback screenshot, covered by the live iframe once it has loaded */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/office-preview.png" alt="The Banshee office: service agents at their desks, the server room and the war room table." className="absolute inset-0 h-full w-full object-cover object-top" />
          {scale > 0 && (
            <iframe
              key={v.src}
              title="Live preview of the Banshee war room"
              src={v.src}
              loading="lazy"
              tabIndex={-1}
              aria-hidden
              onLoad={() => setLoaded(true)}
              className={"pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-[#fafafa] transition-opacity duration-500 " + (loaded ? "opacity-100" : "opacity-0")}
              style={{ width: v.w, height: v.h, transform: `scale(${scale})` }}
            />
          )}
        </div>
      </div>
      <figcaption className="mt-3 px-1 font-mono text-[11px] leading-relaxed text-faint">
        The real war room, running here on mock data. Each person is a service&apos;s agent, walking to the server room, the war room, the deploy console, the archive or the on-call door.
      </figcaption>
    </figure>
  )
}
