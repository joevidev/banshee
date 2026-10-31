#!/usr/bin/env bash
# Terminal viewer for the Banshee Agent Relay workspace: channel names and the latest messages. Read-only.
# Run it yourself:  bash scripts/relay-feed.sh        (add a channel name to watch only that one: bash scripts/relay-feed.sh inc-1)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
API="$RELAY_BASE_URL/v1"; AUTH="Authorization: Bearer $RELAY_WORKSPACE_KEY"
python3 - "$API" "$AUTH" "${1:-}" <<'PY'
import sys,json,subprocess
api,auth,only=sys.argv[1],sys.argv[2],sys.argv[3]
def get(path):
    r=subprocess.run(["curl","-s","-m","20","-H",auth,api+path],capture_output=True,text=True)
    try: return json.loads(r.stdout)
    except Exception: return {"ok":False}
chs=get("/channels").get("data") or []
names=[c["name"] for c in chs if isinstance(c,dict) and "name" in c]
print(f"workspace channels ({len(names)}): {', '.join(names) or '-'}")
for n in ([only] if only else names):
    msgs=(get(f"/channels/{n}/messages").get("data") or [])
    msgs=msgs.get("messages",msgs) if isinstance(msgs,dict) else msgs
    print(f"\n#{n}  ({len(msgs)} messages, newest last)")
    for m in list(reversed(msgs))[-12:] if msgs and msgs[0].get("created_at",0)>msgs[-1].get("created_at",0) else msgs[-12:]:
        who=(m.get("agent_name") or m.get("author") or m.get("from") or "?")
        print(f"  {who:18} {str(m.get('text') or m.get('content') or '')[:150]}")
print("\nagents:",", ".join(a.get("name","?") for a in (get("/agents").get("data") or []) if isinstance(a,dict)))
PY
