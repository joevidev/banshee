#!/usr/bin/env bash
# One-screen check that the public demo is ready:  bash scripts/preflight.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
ok(){ [ "$1" = "$2" ] && echo "OK   $3" || echo "FAIL $3 (got $1)"; }
for p in / /room /chaos /oncall; do ok "$(curl -s -m 20 -o /dev/null -w '%{http_code}' https://banshee.style.dev$p)" 200 "web https://banshee.style.dev$p"; done
s=$(curl -s -m 10 https://banshee-shop.style.dev/stats); echo "shop stats: $s"
python3 - "$s" <<'PY'
import sys,json
d=json.loads(sys.argv[1])
print("OK   shop healthy" if d.get("failedPerMin",99)<5 and d.get("ordersPerMin",0)>200 else "FAIL shop not at baseline: run  bash scripts/reset-shop.sh")
PY
ok "$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST https://banshee.style.dev/api/peer -H 'content-type: application/json' -d '{}')" 403 "bridge rejects calls without token"
n=$(curl -s -m 15 -H "Authorization: Bearer $RELAY_WORKSPACE_KEY" "$RELAY_BASE_URL/v1/channels" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data') or []))" 2>/dev/null)
echo "Agent Relay workspace channels: ${n:-?}"
