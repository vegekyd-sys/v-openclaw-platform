#!/usr/bin/env bash
# Apply what was added to /etc/v/install.env or /etc/v/secrets.env after the install
# (a model key, the Feishu app, V_DESKTOP=1, V_PUBLIC_ORIGIN, CLOUDFLARE_TUNNEL_TOKEN,
# V_NIGHTSHIFT_URL, VOLCENGINE_API_KEY ...):
#
#   sudo v-ctl reconfigure
#
# Installs the system packages a newly enabled part needs, regenerates the config and units,
# restarts the Gateway once, and brings the optional services up. State is not touched.
set -euo pipefail
PREFIX="${V_PREFIX:-/opt/v}"
PKG="$(readlink -f "$PREFIX/current")"
NODE="$PREFIX/node/current/bin/node"
VCTL=("$NODE" "$PKG/install/lib/vctl.mjs")
say() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "reconfigure: run as root (sudo)" >&2; exit 1; }

. "$PKG/install/lib/kit.sh"
KIT="$(v_recorded_kit)"
if [ -n "$KIT" ]; then v_use_kit "$KIT"; fi
DESKTOP=0; grep -qx 'V_DESKTOP=1' /etc/v/install.env && DESKTOP=1
TUNNEL=0; grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.' /etc/v/secrets.env && TUNNEL=1
if [ "$DESKTOP" -eq 1 ] && ! command -v Xtigervnc >/dev/null; then
  say "Desktop packages"
  . "$PKG/install/lib/desktop-packages.sh"; v_desktop_packages
fi
if [ "$TUNNEL" -eq 1 ]; then
  say "cloudflared"
  . "$PKG/install/lib/cloudflared-package.sh"; v_cloudflared_package "$PKG"
fi

say "Configure and units"
"${VCTL[@]}" configure
"${VCTL[@]}" units
[ "$DESKTOP" -eq 0 ] || systemctl enable -q --now openclaw-desktop.service v-desktop-handoff.service

say "Restart the Gateway once"
systemctl restart openclaw-gateway.service
"${VCTL[@]}" health --deadline-ms 600000
"${VCTL[@]}" overlay-plugins --restart
"${VCTL[@]}" desktop-services
if [ "$TUNNEL" -eq 1 ]; then systemctl enable -q v-cloudflared.service; systemctl restart v-cloudflared.service; fi
"${VCTL[@]}" install-skills || echo "warning: global skills were not all installed; rerun: v-ctl install-skills" >&2
# A key added or removed changes the embedding provider; rebuild the memory index (vctl memory-check, #676).
"${VCTL[@]}" memory-check 2>/dev/null || echo "warning: memory index not checked; run: v-ctl memory-check" >&2
"${VCTL[@]}" status
