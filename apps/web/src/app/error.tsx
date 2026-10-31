"use client"
// A page that was opened before a deploy can ask for files that no longer exist (stale chunks). Reload once automatically,
// then show a plain retry screen if it still fails.
import { useEffect } from "react"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    let tried = false
    try { tried = sessionStorage.getItem("bn-auto-reload") === "1"; if (!tried) sessionStorage.setItem("bn-auto-reload", "1") } catch {}
    if (!tried) { window.location.reload(); return }
    try { sessionStorage.removeItem("bn-auto-reload") } catch {}
    console.error(error)
  }, [error])
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">Something went wrong.</h1>
      <p className="text-[15px] text-muted">The page lost its connection. Reload to continue.</p>
      <div className="flex gap-3">
        <button onClick={() => window.location.reload()} className="h-12 rounded-full bg-ink px-6 text-[15px] font-medium text-white">Reload</button>
        <button onClick={reset} className="h-12 rounded-full border border-line-strong bg-card px-6 text-[15px] font-medium text-ink">Try again</button>
      </div>
    </div>
  )
}
