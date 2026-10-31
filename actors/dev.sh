#!/bin/sh
# Start the local Terse actor runtime on :7100. Extra env (e.g. DEADMAN_MS) is inherited. Reads actors/.env too.
cd "$(dirname "$0")"
export PATH="$HOME/.bun/bin:$PATH"
pkill -f "terse actor dev" 2>/dev/null; pkill -f "durable-actors dev" 2>/dev/null; sleep 1
exec terse actor dev
