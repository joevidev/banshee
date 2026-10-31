#!/bin/sh
# EXTRA_ENV adds runtime env, e.g. EXTRA_ENV="BANSHEE_FORCE_BRIDGE=1 BANSHEE_BRIDGE_URL=http://127.0.0.1:3300/api/peer" to push every actor-to-actor call through the web bridge.
# Restart the local runtime with fast test timings and a stub shop port, run the e2e, then restart it in normal mode.
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
LOG="${TMPDIR:-/tmp}/banshee-actors.log"; TESTLOG="${TMPDIR:-/tmp}/banshee-actors.test.log"
restart() { L="$LOG"; [ "$1" = "SETTLE_MS=300" ] && L="$TESTLOG"; pkill -f "terse actor dev" 2>/dev/null; pkill -f "durable-actors dev" 2>/dev/null; while pgrep -f "durable-actors dev" >/dev/null; do sleep 1; done; sleep 1; nohup env "$@" terse actor dev > "$L" 2>&1 & sleep 12; }
TESTENV="SETTLE_MS=300 POST_GAP_MS=100 REPROPOSE_MS=200 DEADMAN_MS=4000 RELAY_MODE=local CANDY_SHOP_URL=http://127.0.0.1:4190 BANSHEE_ADMIN_TOKEN=dev-token $EXTRA_ENV"
restart $TESTENV
env $TESTENV bun test/e2e.ts; rc=$?
restart A=1
exit $rc
