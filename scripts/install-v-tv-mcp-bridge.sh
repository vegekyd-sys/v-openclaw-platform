#!/usr/bin/env bash
# Install / switch / roll back the shared Xiaomi TV MCP bridge on V (docs/v-tv-mcp-bridge.md).
#
#   scripts/install-v-tv-mcp-bridge.sh install  [host]   # files + token + unit, start bridge, self-test
#   scripts/install-v-tv-mcp-bridge.sh plan     [host]   # switch checks + dry run on a config copy; writes nothing
#   scripts/install-v-tv-mcp-bridge.sh switch   [host]   # mcp.servers.xiaomi-tv-remote -> url (hot)
#   scripts/install-v-tv-mcp-bridge.sh rollback [host]   # back to the entry archived by switch (hot)
#   scripts/install-v-tv-mcp-bridge.sh status   [host]
#
# host defaults to v. Nothing here restarts the Gateway: in OpenClaw 9.1 a change under
# `mcp` is a hot reload whose only action is dispose-mcp-runtimes (no plugin reload, so the
# worker pool is not closed). It does drop every session's MCP runtime, so switch while V is
# idle. The worker config is derived from the main config by the worker plugin
# (worker-config-derive.mjs, ~5 s, drain-style generation roll), so only the main config is
# written. switch/rollback/plan run scripts/v-tv-mcp-switch.mjs on V as root (staged fresh
# from this checkout each time): token check by sha256 against the running Gateway, bridge
# self-test, current-entry assertion + archive, and `openclaw config set` tried on a copy
# first (aborts if anything outside the entry would change).
# DRY_RUN=1 prints the remote commands instead of running them.
set -euo pipefail
cmd=${1:?usage: install-v-tv-mcp-bridge.sh install|plan|switch|rollback|status [host]}
host=${2:-v}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OC_USER=openclaw
OC_HOME=/home/openclaw
DOTENV=$OC_HOME/.openclaw/.env
NODE=/opt/node-v22.23.1/bin/node
PORT=18791

run() { if [ -n "${DRY_RUN:-}" ]; then printf '[%s] %s\n' "$host" "$1"; else ssh "$host" "$1"; fi; }
# Copy the bridge module and the switch helper to a fresh directory on the host.
stage() {
  if [ -n "${DRY_RUN:-}" ]; then stage=/tmp/STAGE; return; fi
  stage=$(ssh "$host" mktemp -d)
  trap 'ssh "$host" "rm -rf -- $stage"' EXIT
  scp -q "$repo_root/scripts/v-tv-mcp-bridge.mjs" "$repo_root/scripts/v-tv-mcp-switch.mjs" "$repo_root/systemd/v-tv-mcp-bridge.service" "$host:$stage/"
}
# The helper, as root, with the Gateway's pid and the Gateway's own OpenClaw build.
helper() {
  local sub=$1; shift
  run "set -e
pid=\$(systemctl show -p MainPID --value openclaw-gateway)
dist=\$(systemctl show openclaw-gateway -p ExecStart --value | grep -o '/[^ ;]*/dist/index.js' | head -1)
[ -n \"\$dist\" ] || { echo 'cannot find the Gateway dist' >&2; exit 1; }
sudo -n $NODE $stage/v-tv-mcp-switch.mjs $sub --gateway-pid \"\$pid\" --cli \"[\\\"$NODE\\\",\\\"\$dist\\\"]\" --url http://127.0.0.1:$PORT/mcp $*"
}

case "$cmd" in
install)
  stage
  run "set -e
stamp=\$(date +%Y%m%d-%H%M%S)
for f in v-tv-mcp-bridge.mjs v-tv-mcp-switch.mjs; do [ -e /opt/v-tv-mcp-bridge/\$f ] && sudo cp -p /opt/v-tv-mcp-bridge/\$f /opt/v-tv-mcp-bridge/\$f.bak-\$stamp || true; done
sudo install -d -m 0755 /opt/v-tv-mcp-bridge
sudo install -m 0644 -o root -g root $stage/v-tv-mcp-bridge.mjs $stage/v-tv-mcp-switch.mjs /opt/v-tv-mcp-bridge/
sudo install -m 0644 -o root -g root $stage/v-tv-mcp-bridge.service /etc/systemd/system/v-tv-mcp-bridge.service
# Token: generated once into the Gateway's .env. The Gateway only sees it after its next
# restart; switch refuses until then (and if the values ever differ).
if ! sudo grep -q '^V_TV_MCP_TOKEN=' $DOTENV; then
  sudo cp -p $DOTENV $DOTENV.bak-tv-mcp-\$stamp
  tok=\$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')
  printf '\nV_TV_MCP_TOKEN=%s\n' \"\$tok\" | sudo -u $OC_USER tee -a $DOTENV >/dev/null
fi
sudo systemctl daemon-reload
sudo systemctl enable v-tv-mcp-bridge.service
sudo systemctl restart v-tv-mcp-bridge.service
for i in \$(seq 1 25); do curl -fsS http://127.0.0.1:$PORT/healthz >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS http://127.0.0.1:$PORT/healthz; echo
sudo -n $NODE /opt/v-tv-mcp-bridge/v-tv-mcp-switch.mjs selftest --url http://127.0.0.1:$PORT/mcp"
  ;;
plan)
  stage
  helper switch --dry-run
  ;;
switch)
  stage
  helper switch
  echo "switched; check: journalctl -u openclaw-gateway | grep 'config hot reload applied (mcp' and the worker config's mcp entry (derived within ~10 s)"
  ;;
rollback)
  stage
  helper rollback
  echo "rolled back; the bridge can stay running (unused) or: sudo systemctl disable --now v-tv-mcp-bridge"
  ;;
status)
  stage
  helper show
  run "systemctl is-active v-tv-mcp-bridge || true; curl -fsS http://127.0.0.1:$PORT/healthz || true; echo
w=$OC_HOME/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
printf 'worker config: '; sudo python3 -c 'import json,sys; e=json.load(open(sys.argv[1]))[\"mcp\"][\"servers\"][\"xiaomi-tv-remote\"]; print(e.get(\"transport\"), e.get(\"url\") or e.get(\"command\"))' \$w
echo per-session ssh: \$(pgrep -fc '^/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=5 vlab /usr/bin/python3 -I /srv/v-ha-lab/tv-mcp/stdio.py' || true)"
  ;;
*) echo "unknown command $cmd" >&2; exit 2 ;;
esac
