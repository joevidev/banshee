export function SleepyGhost({ size = 54 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="kb-sleepy">
      <path d="M12 56V30C12 17 21 8 32 8s20 9 20 22v26l-6.5-5-6.5 5-7-5-7 5-6.5-5z" fill="#fff" stroke="#d4d4d4" strokeWidth="1.5" />
      <path d="M22 31q3 3 6 0M36 31q3 3 6 0" stroke="#6b6b6b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="41" rx="2.5" ry="2" fill="#6b6b6b" opacity=".6" />
      <text x="48" y="14" fontSize="9" fill="#9a9a9a" fontFamily="var(--font-geist-mono), monospace" className="kb-z1">z</text>
      <text x="54" y="7" fontSize="7" fill="#b5b5b5" fontFamily="var(--font-geist-mono), monospace" className="kb-z2">z</text>
    </svg>
  )
}
