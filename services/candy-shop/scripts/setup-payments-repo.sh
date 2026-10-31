#!/usr/bin/env bash
# Creates payments-src: the payments service's own git repo with two real releases.
#   v2.2  good: toMinorUnits rounds to whole cents
#   v2.3  bad:  "perf" change drops Math.round -> 4.35*100 = 434.99999999999994 -> validateCharge throws
# Deploys check out one of these tags and restart payments. Run once: bash scripts/setup-payments-repo.sh
set -euo pipefail
cd "$(dirname "$0")/../payments-src"
[ -d .git ] && { echo "payments-src already set up"; git log --oneline --decorate; exit 0; }
git init -q
git config user.name "Candy Shop Payments"
git config user.email "payments@candyshop.dev"
write() { cat > charge.ts <<TS
// Payments: turn an order total in dollars into minor units (cents) for the card processor.

/** $1 */
export function toMinorUnits(amount: number): number {
  return $2
}

/** The processor only accepts positive whole cents. */
export function validateCharge(cents: number): void {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(\`invalid amount in cents: \${cents}\`)
}
TS
}
write "4.35 -> 435. Rounds to the nearest cent so floating point never reaches the processor." "Math.round(amount * 100)"
git add -A && git commit -q -m "payments v2.2: charge in whole cents" && git tag v2.2
write "4.35 -> 435. Perf: skip Math.round, multiplication is exact enough." "amount * 100"
git add -A && git commit -q -m "payments v2.3: faster toMinorUnits" && git tag v2.3
git checkout -q v2.2
git log --oneline --decorate
