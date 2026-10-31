#!/usr/bin/env bash
# Gives the hosted actors the credential they need to call each other (actor -> actor) inside Terse cloud.
# The SDK reads DURABLE_ACTORS_API_KEY from the sandbox env; we store your Terse API key under that name.
# Run it yourself:  bash scripts/push-terse-key.sh
# The value is read from banshee/.env (TERSE_API_KEY), written to a temporary 0600 file, imported, then deleted.
# Only the secret NAME is printed.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
[ -n "${TERSE_API_KEY:-}" ] || { echo "missing TERSE_API_KEY in .env"; exit 1; }
TMP="$(mktemp)"; chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
echo "DURABLE_ACTORS_API_KEY=$TERSE_API_KEY" > "$TMP"
cd "$ROOT/actors"
terse secrets import "$TMP" --overwrite
echo "uploaded: DURABLE_ACTORS_API_KEY"
