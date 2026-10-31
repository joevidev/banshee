"use client"
// Flat 2D avatar of a service ghost in its Halloween costume. Transparent background, readable down to ~20px.
// payments = witch hat, checkout = pumpkin hat, inventory = vampire cape + bat ears.
import type { ServiceName } from "@banshee/contracts"
import { useId } from "react"

const INK = "#141416"
const ORANGE = "#f08a24"

// Head dome top at y=18, wavy hem around y=56..62.
const BODY = "M12 40 C12 26 20 18 32 18 C44 18 52 26 52 40 L52 54 Q45.3 64 38.7 54 Q32 64 25.3 54 Q18.7 64 12 54 Z"

export function GhostBadge({ service, size = 28 }: { service: ServiceName; size?: number }) {
  const uid = useId().replace(/:/g, "")
  const g = `gb-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`spirit-${service}`}
      style={{ display: "inline-block", flex: "none", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9ebf2" />
        </linearGradient>
      </defs>

      {/* behind the body */}
      {service === "inventory" && (
        <g fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M17 36 L9 24 L9.5 36 L3 60 Q10 57 14 60 Q18 63 22 58 L22 40 Z" />
          <path d="M47 36 L55 24 L54.5 36 L61 60 Q54 57 50 60 Q46 63 42 58 L42 40 Z" />
        </g>
      )}

      {/* body */}
      <path d={BODY} fill={`url(#${g})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

      {/* costume under face */}
      {/* face */}
      <ellipse cx="24.5" cy="37" rx="3.4" ry="4.6" fill={INK} />
      <ellipse cx="39.5" cy="37" rx="3.4" ry="4.6" fill={INK} />
      <circle cx="25.6" cy="35.2" r="1.25" fill="#fff" />
      <circle cx="40.6" cy="35.2" r="1.25" fill="#fff" />
      <ellipse cx="18.5" cy="43.5" rx="3.2" ry="2" fill="#ff9aa8" opacity="0.65" />
      <ellipse cx="45.5" cy="43.5" rx="3.2" ry="2" fill="#ff9aa8" opacity="0.65" />
      {service === "inventory" ? (
        <g>
          <path d="M28.5 44 Q32 46.6 35.5 44" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M29.4 44.6 L30.4 48 L31.4 45.2 Z" fill="#fff" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M34.6 44.6 L33.6 48 L32.6 45.2 Z" fill="#fff" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
        </g>
      ) : (
        <path d="M29 44.5 Q32 47 35 44.5" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
      )}

      {/* hats */}
      {service === "payments" && (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M22 21 Q30 18 36 3 Q37 2.5 39 6 Q43 14 44 21 Z" fill={INK} stroke={INK} strokeWidth="1.6" />
          <path d="M22.6 18 Q33 14.6 43.6 18 L44 21 Q33 18 22 21 Z" fill="#fff" stroke={INK} strokeWidth="1.2" />
          <rect x="30.4" y="16.6" width="5.2" height="4.6" rx="1" fill="none" stroke={ORANGE} strokeWidth="1.5" />
          <ellipse cx="33" cy="21.6" rx="19" ry="4" fill={INK} stroke={INK} strokeWidth="1.6" />
        </g>
      )}
      {service === "checkout" && (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M31 11.5 Q31.5 6.5 36 5" fill="none" stroke="#3a7d44" strokeWidth="2.6" />
          <ellipse cx="32" cy="15.5" rx="13.5" ry="8" fill={ORANGE} stroke={INK} strokeWidth="1.8" />
          <path d="M32 7.8 Q27 15.5 32 23.2 M32 7.8 Q37 15.5 32 23.2" fill="none" stroke={INK} strokeWidth="1" opacity="0.4" />
        </g>
      )}
      {service === "inventory" && (
        <g fill={INK} stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
          <path d="M17 26 L15.5 11 L28 19.5 Z" />
          <path d="M47 26 L48.5 11 L36 19.5 Z" />
        </g>
      )}
    </svg>
  )
}
