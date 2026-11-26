#!/usr/bin/env bash
# Temporary root-side fixture on VLab for the tv-mcp-bridge candidate test.
#
#   lab/tv-mcp-bridge-vlab-fixture.sh up     # copy the bridge, start two transient units
#   lab/tv-mcp-bridge-vlab-fixture.sh down   # stop them and remove /run/tv-mcp-cand
#
# The candidate runs as lab-db91-parity, which cannot open Home Assistant's root-only TV
# socket. This starts, as root and only for the test:
#   tv-mcp-cand-bridge  scripts/v-tv-mcp-bridge.mjs on 127.0.0.1:18791 whose upstream is the
#                       real /srv/v-ha-lab/tv-mcp/stdio.py (V reaches the same file over ssh)
#   tv-mcp-cand-relay   a socket relay used ONLY by the baseline phase, so the old shape
#                       (one stdio process per session) can be measured without root:
#                       /run/tv-mcp-cand/stdio-baseline.py is the real stdio.py with the
#                       socket path pointed at the relay.
# Nothing touches the shared Gateway, Home Assistant or its config.
set -euo pipefail
host=${HOST:-vlab}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
case "${1:-}" in
up)
  scp -q "$repo_root/scripts/v-tv-mcp-bridge.mjs" "$host:/tmp/v-tv-mcp-bridge.mjs"
  ssh "$host" bash -s <<EOF
set -euo pipefail
install -d -m 0750 -o root -g lab-db91-parity /run/tv-mcp-cand
install -m 0644 /tmp/v-tv-mcp-bridge.mjs /run/tv-mcp-cand/v-tv-mcp-bridge.mjs && rm -f /tmp/v-tv-mcp-bridge.mjs
umask 027
[ -s /run/tv-mcp-cand/token ] || head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > /run/tv-mcp-cand/token
chgrp lab-db91-parity /run/tv-mcp-cand/token; chmod 0640 /run/tv-mcp-cand/token
sed 's#/srv/v-ha-lab/config/.tv-mcp/mcp.sock#/run/tv-mcp-cand/relay.sock#' /srv/v-ha-lab/tv-mcp/stdio.py > /run/tv-mcp-cand/stdio-baseline.py
chgrp lab-db91-parity /run/tv-mcp-cand/stdio-baseline.py; chmod 0640 /run/tv-mcp-cand/stdio-baseline.py
cat > /run/tv-mcp-cand/relay.py <<'PY'
import os, socket, threading
SRC, DST = "/run/tv-mcp-cand/relay.sock", "/srv/v-ha-lab/config/.tv-mcp/mcp.sock"
if os.path.exists(SRC): os.unlink(SRC)
srv = socket.socket(socket.AF_UNIX); srv.bind(SRC); os.chown(SRC, 0, int(os.environ["GID"])); os.chmod(SRC, 0o660); srv.listen(512)
def pump(a, b):
    try:
        while (d := a.recv(65536)): b.sendall(d)
    except OSError: pass
    finally:
        for s in (a, b):
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass
while True:
    c, _ = srv.accept(); u = socket.socket(socket.AF_UNIX); u.connect(DST)
    threading.Thread(target=pump, args=(c, u), daemon=True).start(); threading.Thread(target=pump, args=(u, c), daemon=True).start()
PY
systemctl stop tv-mcp-cand-relay tv-mcp-cand-bridge 2>/dev/null || true
systemctl reset-failed tv-mcp-cand-relay tv-mcp-cand-bridge 2>/dev/null || true
systemd-run --quiet --unit=tv-mcp-cand-relay -E GID=\$(getent group lab-db91-parity | cut -d: -f3) /usr/bin/python3 -I /run/tv-mcp-cand/relay.py
systemd-run --quiet --unit=tv-mcp-cand-bridge \
  -E TV_MCP_BRIDGE_LISTEN=127.0.0.1:18791 -E TV_MCP_BRIDGE_TOKEN_FILE=/run/tv-mcp-cand/token \
  -E 'TV_MCP_BRIDGE_UPSTREAM=["/usr/bin/python3","-I","/srv/v-ha-lab/tv-mcp/stdio.py"]' \
  $node /run/tv-mcp-cand/v-tv-mcp-bridge.mjs
for i in \$(seq 1 50); do curl -fsS http://127.0.0.1:18791/healthz >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS http://127.0.0.1:18791/healthz; echo
EOF
  ;;
down)
  ssh "$host" 'systemctl stop tv-mcp-cand-relay tv-mcp-cand-bridge 2>/dev/null; systemctl reset-failed tv-mcp-cand-relay tv-mcp-cand-bridge 2>/dev/null; rm -rf /run/tv-mcp-cand; echo down'
  ;;
*) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
