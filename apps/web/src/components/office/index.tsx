"use client"

import dynamic from "next/dynamic"

/** The isometric 3D office. Client-only (WebGL). */
export const Office = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => <div className="bn-canvas-loading">loading office…</div>,
})
