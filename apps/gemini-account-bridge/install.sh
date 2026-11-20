#!/usr/bin/env bash
# Install or update the Gemini account bridge on V (run as root from a checkout
# of this repository). Idempotent. No secret is created: the bridge admits the
# openclaw Unix user by the owner of the loopback connection.
#
#   sudo bash apps/gemini-account-bridge/install.sh            # install/update + start
#   sudo bash apps/gemini-account-bridge/install.sh --dry-run  # show what would change
#   sudo bash apps/gemini-account-bridge/install.sh --uninstall
#
# Leaves scene-gemini-relay, its login and its port (25986) untouched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_HOME=/srv/vlab/scene-gemini-relay
ROOT=/opt/gemini-account-bridge
UNIT=/etc/systemd/system/gemini-account-bridge.service
DRY=0

case "${1:-}" in
  --dry-run) DRY=1 ;;
  --uninstall)
    systemctl disable --now gemini-account-bridge.service 2>/dev/null || true
    rm -f "$UNIT"; systemctl daemon-reload
    echo "removed unit; kept $ROOT"
    exit 0 ;;
  "") ;;
  *) echo "usage: $0 [--dry-run|--uninstall]" >&2; exit 2 ;;
esac

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
id scene-gemini >/dev/null && id openclaw >/dev/null
[[ -x "$RELAY_HOME/bin/agy" ]] || { echo "missing $RELAY_HOME/bin/agy (relay login lives there)" >&2; exit 1; }
[[ -f "$RELAY_HOME/.gemini/antigravity-cli/antigravity-oauth-token" ]] || { echo "relay has no Antigravity login" >&2; exit 1; }

SHA="$(sha256sum "$HERE/bridge.mjs" | cut -c1-12)"
run() { if [[ $DRY -eq 1 ]]; then echo "would: $*"; else "$@"; fi; }

run install -d -m 755 "$ROOT/$SHA"
run install -m 644 "$HERE/bridge.mjs" "$ROOT/$SHA/bridge.mjs"
run ln -sfn "$ROOT/$SHA" "$ROOT/current"

if ! cmp -s "$HERE/gemini-account-bridge.service" "$UNIT"; then
  run install -m 644 "$HERE/gemini-account-bridge.service" "$UNIT"
  run systemctl daemon-reload
fi
run systemctl enable gemini-account-bridge.service
run systemctl restart gemini-account-bridge.service

if [[ $DRY -eq 0 ]]; then
  for _ in $(seq 1 20); do
    if curl -fsS -m 2 http://127.0.0.1:25990/healthz >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  curl -fsS -m 5 http://127.0.0.1:25990/healthz | head -c 400; echo
fi
