#!/usr/bin/env bash
# Uploads the 5 secrets the hosted actors need to the Terse project "banshee" (server side secret store).
# Run it yourself:  bash scripts/push-terse-secrets.sh
# Values are read from banshee/.env, written to a temporary 0600 file, imported, then the file is deleted.
# Nothing is printed except the secret NAMES.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
for v in OPENAI_API_KEY RELAY_WORKSPACE_KEY RELAY_BASE_URL BANSHEE_ADMIN_TOKEN; do
  [ -n "${!v:-}" ] || { echo "missing $v in .env"; exit 1; }
done
TMP="$(mktemp)"; chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
{
  echo "OPENAI_API_KEY=$OPENAI_API_KEY"
  echo "RELAY_WORKSPACE_KEY=$RELAY_WORKSPACE_KEY"
  echo "RELAY_BASE_URL=$RELAY_BASE_URL"
  echo "CANDY_SHOP_URL=https://banshee-shop-admin.style.dev"   # public admin of the Freestyle VM shop
  echo "BANSHEE_ADMIN_TOKEN=$BANSHEE_ADMIN_TOKEN"              # token of that VM shop (not dev-token)
} > "$TMP"
# terse reads terse.config.json from the current directory: use the linked actors project
cd "$ROOT/actors"
terse secrets import "$TMP" --overwrite
echo "uploaded: OPENAI_API_KEY RELAY_WORKSPACE_KEY RELAY_BASE_URL CANDY_SHOP_URL BANSHEE_ADMIN_TOKEN"
