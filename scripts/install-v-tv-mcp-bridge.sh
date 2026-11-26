#!/usr/bin/env bash
# Install / switch / roll back the shared Xiaomi TV MCP bridge on V (docs/v-tv-mcp-bridge.md).
#
#   scripts/install-v-tv-mcp-bridge.sh install  [host]   # files + token + unit, start bridge, self-test
#   scripts/install-v-tv-mcp-bridge.sh switch   [host]   # mcp.servers.xiaomi-tv-remote -> url (hot)
#   scripts/install-v-tv-mcp-bridge.sh rollback [host]   # mcp.servers.xiaomi-tv-remote -> stdio (hot)
#   scripts/install-v-tv-mcp-bridge.sh status   [host]
#
# host defaults to v. Nothing here restarts the Gateway: in OpenClaw 9.1 a change under
# `mcp` is a hot reload whose only action is dispose-mcp-runtimes (no plugin reload, so the
# worker pool is not closed). The worker config is derived from the main config by the
# worker plugin (worker-config-derive.mjs, ~5 s, drain-style generation roll), so only the
# main config is written, with OpenClaw's own `openclaw mcp set`.
# DRY_RUN=1 prints the remote commands instead of running them.
set -euo pipefail
cmd=${1:?usage: install-v-tv-mcp-bridge.sh install|switch|rollback|status [host]}
host=${2:-v}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OC_USER=openclaw
OC_HOME=/home/openclaw
DOTENV=$OC_HOME/.openclaw/.env
NODE=/opt/node-v22.23.1/bin/node
PORT=18791

# The entry V runs today (2026-11-26), restored verbatim by rollback.
STDIO_ENTRY='{"enabled":true,"transport":"stdio","command":"/usr/bin/ssh","args":["-o","BatchMode=yes","-o","ConnectTimeout=5","vlab","/usr/bin/python3","-I","/srv/v-ha-lab/tv-mcp/stdio.py"],"connectionTimeoutMs":10000,"requestTimeoutMs":15000,"supportsParallelToolCalls":false,"toolFilter":{"include":["tv_status","tv_command","tv_play","tv_volume","tv_pause","tv_screen"]}}'
URL_ENTRY='{"enabled":true,"transport":"streamable-http","url":"http://127.0.0.1:'$PORT'/mcp","headers":{"Authorization":"Bearer ${V_TV_MCP_TOKEN}"},"connectionTimeoutMs":10000,"requestTimeoutMs":15000,"supportsParallelToolCalls":false,"toolFilter":{"include":["tv_status","tv_command","tv_play","tv_volume","tv_pause","tv_screen"]}}'

run() { if [ -n "${DRY_RUN:-}" ]; then printf '[%s] %s\n' "$host" "$1"; else ssh "$host" "$1"; fi; }
# `openclaw` as the Gateway user with the Gateway's config (same binary the Gateway runs).
openclaw_cli() {
  local dist
  dist=$(ssh "$host" "systemctl show openclaw-gateway -p ExecStart --value | grep -o '/[^ ;]*/dist/index.js' | head -1")
  [ -n "$dist" ] || { echo "cannot find the Gateway dist" >&2; exit 1; }
  echo "sudo -n -u $OC_USER env HOME=$OC_HOME OPENCLAW_STATE_DIR=$OC_HOME/.openclaw OPENCLAW_CONFIG_PATH=$OC_HOME/.openclaw/openclaw.json $NODE $dist"
}
selftest() {
  # initialize + tools/list through the bridge with the Gateway's token; read-only.
  run "sudo -n -u $OC_USER $NODE -e '
const fs=require(\"fs\");const t=fs.readFileSync(\"$DOTENV\",\"utf8\").match(/^V_TV_MCP_TOKEN=(.*)\$/m)[1].trim();
const post=(b)=>fetch(\"http://127.0.0.1:$PORT/mcp\",{method:\"POST\",headers:{\"content-type\":\"application/json\",authorization:\"Bearer \"+t},body:JSON.stringify(b)}).then(r=>r.json());
(async()=>{const i=await post({jsonrpc:\"2.0\",id:1,method:\"initialize\",params:{protocolVersion:\"2025-11-25\",capabilities:{},clientInfo:{name:\"install-selftest\",version:\"1\"}}});
const l=await post({jsonrpc:\"2.0\",id:2,method:\"tools/list\"});
if(!i.result||!l.result)throw new Error(JSON.stringify(i.error||l.error));
console.log(\"bridge ok:\",i.result.serverInfo.name+\"@\"+i.result.serverInfo.version,l.result.tools.map(x=>x.name).join(\",\"));})().catch(e=>{console.error(\"bridge self-test failed:\",e.message);process.exit(1)})'"
}

# Back up the main config, run `openclaw mcp set`, then list every changed path: OpenClaw's
# config writer may normalise unrelated keys too (the VLab candidate saw models.providers.*).
mcp_set() {
  local entry=$1 cfg=$OC_HOME/.openclaw/openclaw.json
  run "set -e; stamp=\$(date +%Y%m%d-%H%M%S); sudo cp -p $cfg $cfg.bak-tv-mcp-\$stamp; echo backup: $cfg.bak-tv-mcp-\$stamp
$(openclaw_cli) mcp set xiaomi-tv-remote '$entry'
sudo python3 - $cfg.bak-tv-mcp-\$stamp $cfg <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
def diff(x, y, p=''):
    if isinstance(x, dict) and isinstance(y, dict):
        for k in sorted(set(x) | set(y)): yield from diff(x.get(k), y.get(k), f'{p}.{k}' if p else k)
    elif x != y: yield p
print('changed paths:', *diff(a, b), sep='\n  ')
PY"
}

case "$cmd" in
install)
  stage=$(ssh "$host" mktemp -d)
  trap 'ssh "$host" "rm -rf -- $stage"' EXIT
  scp -q "$repo_root/scripts/v-tv-mcp-bridge.mjs" "$repo_root/systemd/v-tv-mcp-bridge.service" "$host:$stage/"
  run "set -e
stamp=\$(date +%Y%m%d-%H%M%S)
[ -e /opt/v-tv-mcp-bridge/v-tv-mcp-bridge.mjs ] && sudo cp -p /opt/v-tv-mcp-bridge/v-tv-mcp-bridge.mjs /opt/v-tv-mcp-bridge/v-tv-mcp-bridge.mjs.bak-\$stamp || true
sudo install -d -m 0755 /opt/v-tv-mcp-bridge
sudo install -m 0644 -o root -g root $stage/v-tv-mcp-bridge.mjs /opt/v-tv-mcp-bridge/v-tv-mcp-bridge.mjs
sudo install -m 0644 -o root -g root $stage/v-tv-mcp-bridge.service /etc/systemd/system/v-tv-mcp-bridge.service
# Token: generated once into the Gateway's .env (OpenClaw re-reads it on every config load).
if ! sudo grep -q '^V_TV_MCP_TOKEN=' $DOTENV; then
  sudo cp -p $DOTENV $DOTENV.bak-tv-mcp-\$stamp
  tok=\$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')
  printf '\nV_TV_MCP_TOKEN=%s\n' \"\$tok\" | sudo -u $OC_USER tee -a $DOTENV >/dev/null
fi
sudo systemctl daemon-reload
sudo systemctl enable v-tv-mcp-bridge.service
sudo systemctl restart v-tv-mcp-bridge.service
for i in \$(seq 1 25); do curl -fsS http://127.0.0.1:$PORT/healthz >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS http://127.0.0.1:$PORT/healthz; echo"
  selftest
  ;;
switch)
  selftest
  # The running Gateway must already hold V_TV_MCP_TOKEN in its environment (it gets it from
  # ~/.openclaw/.env via systemd EnvironmentFile at start). A token added to .env after the
  # Gateway started is NOT picked up by the Gateway's own MCP client: it sends the literal
  # "Bearer ${V_TV_MCP_TOKEN}" and gets 401 (VLab candidate 42013fad, 2026-11-26). So: install,
  # let the next planned Gateway restart happen, then switch.
  run "pid=\$(systemctl show -p MainPID --value openclaw-gateway); sudo -n grep -qz '^V_TV_MCP_TOKEN=' /proc/\$pid/environ || { echo 'Gateway pid '\$pid' has no V_TV_MCP_TOKEN in its environment: switch after its next restart' >&2; exit 3; }; echo 'Gateway environment has V_TV_MCP_TOKEN'"
  mcp_set "$URL_ENTRY"
  echo "switched; check: journalctl -u openclaw-gateway | grep 'config hot reload applied (mcp' and the worker config's mcp entry (derived within ~10 s)"
  ;;
rollback)
  mcp_set "$STDIO_ENTRY"
  echo "rolled back to per-session stdio; the bridge can stay running (unused) or: sudo systemctl disable --now v-tv-mcp-bridge"
  ;;
status)
  run "systemctl is-active v-tv-mcp-bridge; curl -fsS http://127.0.0.1:$PORT/healthz; echo
for f in $OC_HOME/.openclaw/openclaw.json $OC_HOME/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json; do
  printf '%s: ' \$f; sudo python3 -c 'import json,sys; e=json.load(open(sys.argv[1]))[\"mcp\"][\"servers\"][\"xiaomi-tv-remote\"]; print(e.get(\"transport\"), e.get(\"url\") or e.get(\"command\"))' \$f; done
echo per-session ssh: \$(pgrep -fc '^/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=5 vlab /usr/bin/python3 -I /srv/v-ha-lab/tv-mcp/stdio.py' || true)"
  ;;
*) echo "unknown command $cmd" >&2; exit 2 ;;
esac
