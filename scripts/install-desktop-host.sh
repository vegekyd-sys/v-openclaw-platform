#!/usr/bin/env bash
# Installs the three handoff layers on a Gateway host (run as root). Idempotent.
#
#   layer A  openclaw-desktop.service      Xtigervnc :99 + XFCE, loopback 5900
#            Gateway drop-in               DISPLAY=:99 for the Gateway and its workers
#   layer B  v-desktop-handoff.service     share links, 127.0.0.1:23950 (public via cloudflared) / :23951 (admin)
#   layer C  plugin files under /opt/v-desktop-handoff/plugin (enable it in openclaw.json, see README)
#
# It does NOT touch openclaw.json or cloudflared: those edits are listed at the
# end and need `openclaw config set --dry-run` and a Gateway restart window.
#
#   REPO=/path/to/v-openclaw-platform GATEWAY_UNIT=openclaw-gateway.service \
#   OPENCLAW_USER=openclaw PUBLIC_BASE_URL=https://openclaw.tianyi.live \
#   NODE_BIN=/opt/node-v22.23.1/bin bash scripts/install-desktop-host.sh
set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
GATEWAY_UNIT="${GATEWAY_UNIT:-openclaw-gateway.service}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/$OPENCLAW_USER}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://openclaw.tianyi.live}"
NODE_BIN="${NODE_BIN:-/opt/node-v22.23.1/bin}"
DISPLAY_NUM="${DISPLAY_NUM:-99}"
RFB_PORT="${RFB_PORT:-5900}"
PUBLIC_PORT="${PUBLIC_PORT:-23950}"
ADMIN_PORT="${ADMIN_PORT:-23951}"
# On VLab hosts pass UNIT_PREFIX=vlab- so the units, dirs and ports never look like production ones.
UNIT_PREFIX="${UNIT_PREFIX:-}"
DESKTOP_UNIT="${UNIT_PREFIX}openclaw-desktop.service"
HANDOFF_UNIT="${UNIT_PREFIX}v-desktop-handoff.service"
INSTALL_DIR="${INSTALL_DIR:-/opt/${UNIT_PREFIX}v-desktop-handoff}"
ETC_DIR="${ETC_DIR:-/etc/${UNIT_PREFIX}v-desktop-handoff}"
STATE_DIR="${STATE_DIR:-/var/lib/${UNIT_PREFIX}v-desktop-handoff}"
DESKTOP_STATE="${DESKTOP_STATE:-$OPENCLAW_HOME/.openclaw/desktop}"
TYPEBOX_DIR="${TYPEBOX_DIR:-}"
SKIP_APT="${SKIP_APT:-0}"

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
id "$OPENCLAW_USER" >/dev/null

echo "== packages"
if [ "$SKIP_APT" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y --no-install-recommends tigervnc-standalone-server tigervnc-tools xfce4-session xfwm4 xfce4-panel xfdesktop4 dbus x11-utils x11-xserver-utils novnc >/dev/null
fi
for bin in Xtigervnc tigervncpasswd xfce4-session dbus-daemon xdpyinfo google-chrome; do command -v "$bin" >/dev/null || { echo "missing $bin" >&2; exit 1; }; done
[ -d /usr/share/novnc/core ] || { echo "/usr/share/novnc/core missing" >&2; exit 1; }

echo "== files -> $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rsync -a --delete --exclude tests --exclude node_modules "$REPO/apps/v-desktop-handoff/service/" "$INSTALL_DIR/service/"
rsync -a --delete --exclude tests --exclude node_modules "$REPO/apps/v-desktop-handoff/plugin/" "$INSTALL_DIR/plugin/"
rsync -a --delete "$REPO/apps/v-desktop-handoff/desktop/" "$INSTALL_DIR/desktop/"
chmod 755 "$INSTALL_DIR/desktop/start-desktop.sh"
# The plugin imports typebox; point it at the runtime's copy so nothing is vendored.
TYPEBOX="$TYPEBOX_DIR"
if [ -z "$TYPEBOX" ] && command -v openclaw >/dev/null; then
  TYPEBOX="$(dirname "$(readlink -f "$(command -v openclaw)")")/../node_modules/typebox"
fi
if [ ! -d "$TYPEBOX" ]; then
  TYPEBOX="$(find /opt -maxdepth 6 -type d -path '*openclaw*/node_modules/typebox' 2>/dev/null | head -1)"
fi
[ -d "$TYPEBOX" ] || { echo "typebox not found in the OpenClaw runtime" >&2; exit 1; }
mkdir -p "$INSTALL_DIR/plugin/node_modules"
ln -sfn "$TYPEBOX" "$INSTALL_DIR/plugin/node_modules/typebox"
chown -R root:root "$INSTALL_DIR"

echo "== state, token, config"
install -d -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" "$STATE_DIR" "$DESKTOP_STATE"
install -d -m 750 -o root -g "$OPENCLAW_USER" "$ETC_DIR"
if [ ! -s "$ETC_DIR/admin-token" ]; then
  head -c 32 /dev/urandom | base64 | tr -d '\n=/+' > "$ETC_DIR/admin-token"
  echo >> "$ETC_DIR/admin-token"
fi
chown root:"$OPENCLAW_USER" "$ETC_DIR/admin-token"; chmod 640 "$ETC_DIR/admin-token"
if [ ! -s "$ETC_DIR/config.json" ]; then
  sed -e "s#https://openclaw.tianyi.live#$PUBLIC_BASE_URL#" \
      -e "s#/home/openclaw/.openclaw/desktop#$DESKTOP_STATE#" \
      -e "s#/var/lib/v-desktop-handoff#$STATE_DIR#" -e "s#/etc/v-desktop-handoff#$ETC_DIR#" \
      -e "s#\"publicPort\": 23950#\"publicPort\": $PUBLIC_PORT#" \
      -e "s#\"adminPort\": 23951#\"adminPort\": $ADMIN_PORT#" \
      -e "s#\"port\": 5900#\"port\": $RFB_PORT#" \
      "$REPO/apps/v-desktop-handoff/config.example.json" > "$ETC_DIR/config.json"
fi
chown root:"$OPENCLAW_USER" "$ETC_DIR/config.json"; chmod 640 "$ETC_DIR/config.json"
# Non-root X servers cannot create the socket directory themselves.
echo 'd /tmp/.X11-unix 1777 root root 10d' > /etc/tmpfiles.d/x11-unix.conf
systemd-tmpfiles --create /etc/tmpfiles.d/x11-unix.conf

echo "== units"
GROUP_NAME="$(id -gn "$OPENCLAW_USER")"
sed -e "s#^User=openclaw#User=$OPENCLAW_USER#" -e "s#^Group=openclaw#Group=$GROUP_NAME#" \
    -e "s#/home/openclaw/.openclaw/desktop#$DESKTOP_STATE#g" -e "s#/home/openclaw#$OPENCLAW_HOME#g" \
    -e "s#DESKTOP_DISPLAY=99#DESKTOP_DISPLAY=$DISPLAY_NUM#" -e "s#DESKTOP_RFB_PORT=5900#DESKTOP_RFB_PORT=$RFB_PORT#" \
    -e "s#/opt/v-desktop-handoff#$INSTALL_DIR#g" -e "s#Before=openclaw-gateway.service#Before=$GATEWAY_UNIT#" \
    -e "s#(PRODUCTION - not VLab)#(${UNIT_PREFIX:-PRODUCTION - not VLab})#" \
    "$REPO/systemd/openclaw-desktop.service" > "/etc/systemd/system/$DESKTOP_UNIT"
sed -e "s#^User=openclaw#User=$OPENCLAW_USER#" -e "s#^Group=openclaw#Group=$GROUP_NAME#" -e "s#/home/openclaw#$OPENCLAW_HOME#g" \
    -e "s#/usr/bin/env node#$NODE_BIN/node#" -e "s#/opt/v-desktop-handoff#$INSTALL_DIR#g" -e "s#/etc/v-desktop-handoff#$ETC_DIR#g" \
    -e "s#/var/lib/v-desktop-handoff#$STATE_DIR#g" -e "s#openclaw-desktop.service#$DESKTOP_UNIT#g" \
    -e "s#(PRODUCTION - not VLab)#(${UNIT_PREFIX:-PRODUCTION - not VLab})#" \
    "$REPO/systemd/v-desktop-handoff.service" > "/etc/systemd/system/$HANDOFF_UNIT"
mkdir -p "/etc/systemd/system/$GATEWAY_UNIT.d"
sed -e "s#DISPLAY=:99#DISPLAY=:$DISPLAY_NUM#" "$REPO/systemd/openclaw-gateway.service.d/desktop-display.conf" > "/etc/systemd/system/$GATEWAY_UNIT.d/desktop-display.conf"
systemctl daemon-reload
systemctl enable --now "$DESKTOP_UNIT"
sleep 3
systemctl enable --now "$HANDOFF_UNIT"
sleep 1
systemctl --no-pager --lines=3 status "$DESKTOP_UNIT" "$HANDOFF_UNIT" || true
curl -fsS "http://127.0.0.1:$PUBLIC_PORT/desktop-handoff/healthz" && echo

cat <<EOF

== next (manual, needs a Gateway restart window) ==
1. openclaw.json (validate each with: openclaw config set --dry-run):
   desktop.host = {"enabled": true, "port": $RFB_PORT, "passwordFile": "$DESKTOP_STATE/vncpasswd"}
   browser.defaultProfile = "openclaw"; browser.headless = false   # the managed profile is built in; do not add it under browser.profiles
   browser.extraArgs = ["--window-position=0,0", "--window-size=1280,760"]
   plugins.load.paths += "$INSTALL_DIR/plugin"; plugins.allow += "v-desktop-handoff"
   plugins.entries.v-desktop-handoff = {"enabled": true, "hooks": {"allowConversationAccess": true},
     "config": {"adminUrl": "http://127.0.0.1:$ADMIN_PORT", "adminTokenFile": "$ETC_DIR/admin-token",
                "controlAnywhereActors": ["feishu:ou_<owner open_id>"]}}   # owner may request control from groups; link is DM'd
   Repeat plugins.load.paths / plugins.allow / plugins.entries.v-desktop-handoff, desktop and browser in the
   worker config copy (plugins.entries.vlab-agent-worker-isolation.config.workerConfigPath): the model runs in
   the worker child and only sees tools declared there (candidate run 7 proved this).
2. cloudflared ingress before the catch-all for the Control UI host:
   - hostname: <host>
     path: ^/desktop-handoff(?:/.*)?$
     service: http://127.0.0.1:$PUBLIC_PORT
3. systemctl stop $GATEWAY_UNIT; (write config); systemctl start $GATEWAY_UNIT   # never a hot reload: it drops the worker pool
EOF
