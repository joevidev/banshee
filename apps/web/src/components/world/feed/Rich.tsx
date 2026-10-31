"use client"
// Message text: `inline code` and @mentions rendered as soft pills.
import { Fragment } from "react"

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|@[\w-]+)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i} className="fd-code">{p.slice(1, -1)}</code>
        if (/^@[\w-]+$/.test(p)) return <span key={i} className="fd-mention">{p}</span>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}
