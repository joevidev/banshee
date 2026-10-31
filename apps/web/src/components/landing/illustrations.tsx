const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label={label} className="h-auto w-full text-ink">
      {children}
    </svg>
  )
}

/** 1. A service pings: three services, one starts failing. */
export function PingArt() {
  return (
    <Frame label="Three services; payments shows an error spike">
      {[
        { x: 14, n: "checkout", bad: false },
        { x: 74, n: "payments", bad: true },
        { x: 134, n: "inventory", bad: false },
      ].map((s) => (
        <g key={s.n}>
          <rect x={s.x} y={30} width={52} height={50} rx={6} {...S} stroke={s.bad ? "var(--red)" : "currentColor"} />
          <path d={`M${s.x + 8} 66 h8 l4 -10 l6 16 l4 -10 h14`} {...S} stroke={s.bad ? "var(--red)" : "currentColor"} />
          <circle cx={s.x + 44} cy={39} r={3} fill={s.bad ? "var(--red)" : "currentColor"} />
          <text x={s.x + 26} y={97} textAnchor="middle" fontSize={8} fontFamily="var(--font-geist-mono)" fill="var(--muted)">
            {s.n}
          </text>
        </g>
      ))}
      <path d="M100 22 v-8 M92 20 l-4 -5 M108 20 l4 -5" {...S} stroke="var(--red)" />
    </Frame>
  )
}

/** 2. Agents question each other on Relay. */
export function RelayArt() {
  return (
    <Frame label="Three agents asking each other questions in a channel">
      <rect x={8} y={8} width={184} height={94} rx={8} {...S} strokeDasharray="3 4" stroke="var(--line-strong)" />
      <text x={16} y={20} fontSize={8} fontFamily="var(--font-geist-mono)" fill="var(--faint)">
        #inc-1
      </text>
      {[
        { x: 40, y: 72 },
        { x: 100, y: 44 },
        { x: 160, y: 72 },
      ].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={11} {...S} fill="var(--card)" />
          <circle cx={p.x} cy={p.y - 3} r={3} {...S} />
          <path d={`M${p.x - 6} ${p.y + 7} a6 5 0 0 1 12 0`} {...S} />
        </g>
      ))}
      <path d="M50 64 L90 48" {...S} />
      <path d="M86 49 l5 -1 l-3 4" {...S} />
      <path d="M150 64 L110 48" {...S} />
      <path d="M114 49 l-5 -1 l3 4" {...S} />
      <path d="M54 80 H146" {...S} strokeDasharray="2 4" />
      <path d="M142 77 l5 3 l-5 3" {...S} />
    </Frame>
  )
}

/** 3. Deterministic root cause with evidence. */
export function EvidenceArt() {
  return (
    <Frame label="A timeline where a deploy comes seconds before the first error">
      <path d="M14 78 H186" {...S} stroke="var(--line-strong)" />
      <path d="M14 66 H80 L86 66 L92 38 L98 54 L104 30 L110 50 H186" {...S} stroke="var(--red)" />
      <path d="M72 78 V22" {...S} strokeDasharray="2 3" />
      <rect x={52} y={12} width={40} height={14} rx={3} fill="var(--ink)" />
      <text x={72} y={22} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-geist-mono)" fill="#fff">
        deploy
      </text>
      <path d="M14 94 h46 M14 101 h30" {...S} stroke="var(--faint)" />
      <path d="M118 94 l4 4 l8 -8" {...S} />
      <text x={136} y={98} fontSize={7.5} fontFamily="var(--font-geist-mono)" fill="var(--muted)">
        cause
      </text>
    </Frame>
  )
}

/** 4. You approve on your phone. */
export function PhoneArt() {
  return (
    <Frame label="A phone with an approve button">
      <rect x={72} y={6} width={56} height={98} rx={9} {...S} />
      <path d="M92 12 h16" {...S} stroke="var(--line-strong)" />
      <path d="M80 30 h40 M80 38 h28" {...S} stroke="var(--faint)" />
      <rect x={80} y={52} width={40} height={14} rx={4} fill="var(--ink)" />
      <text x={100} y={62} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-geist-mono)" fill="#fff">
        Approve
      </text>
      <rect x={80} y={72} width={40} height={14} rx={4} {...S} />
      <text x={100} y={82} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-geist-mono)" fill="var(--muted)">
        Reject
      </text>
      <path d="M40 60 l-8 0 M36 56 l-4 4 l4 4" {...S} stroke="var(--faint)" />
      <path d="M150 52 a14 14 0 0 1 14 14 M150 42 a24 24 0 0 1 24 24" {...S} stroke="var(--faint)" />
    </Frame>
  )
}
