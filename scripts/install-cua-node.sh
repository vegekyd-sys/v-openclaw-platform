#!/usr/bin/env bash
# Installs the on-host computer-use node (see systemd/openclaw-cua-node.service). Run as root.
# Writes the node config (gateway.mode=remote to the local Gateway, cua-computer enabled,
# browser proxy off) without printing the token, installs the unit and starts it.
# Gateway-side config (cua-computer enabled + allowed, tools.alsoAllow computer, both configs)
# and the pairing approvals are separate steps; see docs/v-remote-browser-handoff-plan.md §13.
set -euo pipefail
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/$OPENCLAW_USER}"
GATEWAY_CONFIG="${GATEWAY_CONFIG:-$OPENCLAW_HOME/.openclaw/openclaw.json}"
NODE_DIR="${NODE_DIR:-$OPENCLAW_HOME/.openclaw/node-cua}"
UNIT="${UNIT:-openclaw-cua-node.service}"
install -d -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" "$NODE_DIR" "$NODE_DIR/state"
sudo -u "$OPENCLAW_USER" python3 - "$GATEWAY_CONFIG" "$NODE_DIR/openclaw.json" <<'PY'
import json,sys
c=json.load(open(sys.argv[1])); port=c["gateway"]["port"]; token=c["gateway"]["auth"]["token"]
n={"gateway":{"mode":"remote","remote":{"transport":"direct","url":f"ws://127.0.0.1:{port}","token":token}},
   "browser":{"enabled":False},"nodeHost":{"browserProxy":{"enabled":False}},
   "plugins":{"entries":{"cua-computer":{"enabled":True}}}}
open(sys.argv[2],"w").write(json.dumps(n,indent=2)+"\n"); print("node config written for gateway port", port)
PY
chmod 600 "$NODE_DIR/openclaw.json"
sed -e "s#/home/openclaw#$OPENCLAW_HOME#g" -e "s#^User=openclaw#User=$OPENCLAW_USER#" -e "s#^Group=openclaw#Group=$(id -gn "$OPENCLAW_USER")#" \
    "$REPO/systemd/openclaw-cua-node.service" > "/etc/systemd/system/$UNIT"
systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 3
systemctl --no-pager --lines=3 status "$UNIT" || true
echo "next: openclaw devices list / nodes pending -> nodes approve <id>"
