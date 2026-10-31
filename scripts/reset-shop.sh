#!/usr/bin/env bash
# Puts the PUBLIC Candy Shop back to its healthy baseline (payments on the good version, all fault switches off).
# Run it before every rehearsal and before recording:  bash scripts/reset-shop.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
code=$(curl -s -m 60 -o /dev/null -w "%{http_code}" -X POST https://banshee-shop-admin.style.dev/admin/reset -H "x-banshee-token: $BANSHEE_ADMIN_TOKEN" -H 'content-type: application/json' -d '{}')
echo "reset -> HTTP $code (200 = ok)"
sleep 12
echo "shop now: $(curl -s -m 10 https://banshee-shop.style.dev/stats)"
