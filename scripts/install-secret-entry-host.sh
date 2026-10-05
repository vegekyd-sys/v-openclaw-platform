#!/usr/bin/env bash
# Installs the v-secret-entry sidecar (apps/v-secret-entry) on a Gateway host. Run as root. Idempotent.
#
#   service       ${UNIT_PREFIX}v-secret-entry.service, files in /opt/${UNIT_PREFIX}v-secret-entry
#                 (the directory vlab-v-parity.mjs compares between V and VLab), config and admin token in
#                 /etc/${UNIT_PREFIX}v-secret-entry, audit in /var/lib/${UNIT_PREFIX}v-secret-entry
#   service env   drop-in with the Gateway's own EnvironmentFiles, config and state paths: the service
#                 calls question.resolve through OpenClaw's CLI transport as the Gateway's user
#   Gateway env   drop-in secret-entry.conf: V_SECRET_ENTRY_ADMIN_URL / V_SECRET_ENTRY_ADMIN_TOKEN_FILE.
#                 Takes effect at the next Gateway start. This script never restarts the Gateway.
#
# Production V (public side on loopback; cloudflared routes https://openclaw.tianyi.live/secret-entry):
#   REPO=/path/to/checkout bash scripts/install-secret-entry-host.sh
# Shared VLab (public side on VLab's tailnet address only; tailnet devices can open the link):
#   REPO=/path/to/checkout UNIT_PREFIX=vlab- GATEWAY_UNIT=openclaw-vlab-production-mirror-v8.service \
#     PUBLIC_BIND=fd7a:115c:a1e0::e539:be40 bash scripts/install-secret-entry-host.sh
# Remove (service, files, both drop-ins; config, token and audit stay):
#   MODE=uninstall [UNIT_PREFIX=... GATEWAY_UNIT=...] bash scripts/install-secret-entry-host.sh
#
# Everything about the Gateway is read from its unit (User, Environment, EnvironmentFiles, ExecStart).
# Each can be overridden (GATEWAY_USER, GATEWAY_CONFIG, GATEWAY_STATE, GATEWAY_HOME, GATEWAY_ENV_FILES
# (newline-separated, "-" prefix = optional), OPENCLAW_DIST, NODE). RENDER_DIR=<dir> only renders the
# files into <dir> (no root, no systemctl, nothing installed); tests use it.
set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE="${MODE:-install}"
UNIT_PREFIX="${UNIT_PREFIX:-}"
GATEWAY_UNIT="${GATEWAY_UNIT:-openclaw-gateway.service}"
UNIT="${UNIT_PREFIX}v-secret-entry.service"
INSTALL_DIR="${INSTALL_DIR:-/opt/${UNIT_PREFIX}v-secret-entry}"
ETC_DIR="${ETC_DIR:-/etc/${UNIT_PREFIX}v-secret-entry}"
STATE_DIR="${STATE_DIR:-/var/lib/${UNIT_PREFIX}v-secret-entry}"
# VLab: keep clear of 23960/23961, which live candidate runs (lab/candidate/live-experience.mjs) use.
if [ -n "$UNIT_PREFIX" ]; then DEFAULT_PUBLIC_PORT=23970; DEFAULT_ADMIN_PORT=23971; else DEFAULT_PUBLIC_PORT=23960; DEFAULT_ADMIN_PORT=23961; fi
PUBLIC_PORT="${PUBLIC_PORT:-$DEFAULT_PUBLIC_PORT}"
ADMIN_PORT="${ADMIN_PORT:-$DEFAULT_ADMIN_PORT}"
PUBLIC_BIND="${PUBLIC_BIND:-127.0.0.1}"
if [ -z "${PUBLIC_BASE_URL:-}" ]; then
  if [ "$PUBLIC_BIND" = 127.0.0.1 ]; then PUBLIC_BASE_URL=https://openclaw.tianyi.live
  elif [[ "$PUBLIC_BIND" == *:* ]]; then PUBLIC_BASE_URL="http://[$PUBLIC_BIND]:$PUBLIC_PORT"
  else PUBLIC_BASE_URL="http://$PUBLIC_BIND:$PUBLIC_PORT"; fi
fi
RENDER_DIR="${RENDER_DIR:-}"
SYSTEMD_DIR="${RENDER_DIR:+$RENDER_DIR/systemd}"; SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

case "$MODE" in install|uninstall) ;; *) echo "MODE must be install or uninstall" >&2; exit 2;; esac
if [ -z "$RENDER_DIR" ]; then [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }; fi

if [ "$MODE" = uninstall ]; then
  systemctl disable --now "$UNIT" 2>/dev/null || true
  rm -f "$SYSTEMD_DIR/$UNIT" "$SYSTEMD_DIR/$GATEWAY_UNIT.d/secret-entry.conf"
  rm -rf "$SYSTEMD_DIR/$UNIT.d" "$INSTALL_DIR"
  systemctl daemon-reload
  echo "removed $UNIT and the Gateway drop-in; restart $GATEWAY_UNIT in a window to drop V_SECRET_ENTRY_* from its environment"
  echo "kept: $ETC_DIR (config, admin token) and $STATE_DIR (audit)"
  exit 0
fi

show() { systemctl show "$GATEWAY_UNIT" -p "$1" --value; }
env_of() { show Environment | tr ' ' '\n' | sed -n "s/^$1=//p" | tail -1; }
GATEWAY_USER="${GATEWAY_USER:-$(show User)}"
[ -n "$GATEWAY_USER" ] || { echo "$GATEWAY_UNIT has no User=" >&2; exit 1; }
GATEWAY_HOME="${GATEWAY_HOME:-$(env_of HOME)}"
GATEWAY_STATE="${GATEWAY_STATE:-$(env_of OPENCLAW_STATE_DIR)}"
GATEWAY_STATE="${GATEWAY_STATE:-$GATEWAY_HOME/.openclaw}"
GATEWAY_CONFIG="${GATEWAY_CONFIG:-$(env_of OPENCLAW_CONFIG_PATH)}"
GATEWAY_CONFIG="${GATEWAY_CONFIG:-$GATEWAY_STATE/openclaw.json}"
EXEC="$(show ExecStart 2>/dev/null || true)"
OPENCLAW_DIST="${OPENCLAW_DIST:-$(printf '%s' "$EXEC" | grep -o '/[^ ;]*/dist/index\.js' | head -1 | sed 's#/index\.js$##')}"
NODE="${NODE:-$(printf '%s' "$EXEC" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -1)}"
if [ -z "${GATEWAY_ENV_FILES+x}" ]; then
  # "/a/b.env (ignore_errors=yes)" -> "-/a/b.env"
  GATEWAY_ENV_FILES="$(show EnvironmentFiles | awk '$1 ~ /^\// { print ($2 == "(ignore_errors=yes)" ? "-" : "") $1 }')"
fi
for v in GATEWAY_HOME GATEWAY_STATE GATEWAY_CONFIG OPENCLAW_DIST NODE; do
  [ -n "${!v}" ] || { echo "cannot determine $v from $GATEWAY_UNIT; set it" >&2; exit 1; }
done
if [ -z "$RENDER_DIR" ]; then
  [ -f "$OPENCLAW_DIST/plugin-sdk/gateway-runtime.js" ] || { echo "$OPENCLAW_DIST/plugin-sdk/gateway-runtime.js missing" >&2; exit 1; }
  [ -x "$NODE" ] || { echo "node $NODE not executable" >&2; exit 1; }
  id "$GATEWAY_USER" >/dev/null
fi
GROUP_NAME="$(id -gn "$GATEWAY_USER" 2>/dev/null || echo "$GATEWAY_USER")"

echo "== files -> ${RENDER_DIR}$INSTALL_DIR (from $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo 'a non-git tree'))"
mkdir -p "${RENDER_DIR}$INSTALL_DIR"
rsync -a --delete --exclude tests --exclude node_modules "$REPO/apps/v-secret-entry/" "${RENDER_DIR}$INSTALL_DIR/"
[ -n "$RENDER_DIR" ] || chown -R root:root "$INSTALL_DIR"

echo "== config, token, state"
mkdir -p "${RENDER_DIR}$ETC_DIR" "${RENDER_DIR}$STATE_DIR"
if [ -z "$RENDER_DIR" ]; then
  install -d -m 750 -o root -g "$GROUP_NAME" "$ETC_DIR"
  install -d -m 700 -o "$GATEWAY_USER" -g "$GROUP_NAME" "$STATE_DIR"
fi
TOKEN="${RENDER_DIR}$ETC_DIR/admin-token"
if [ ! -s "$TOKEN" ]; then
  ( umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$TOKEN"; echo >> "$TOKEN" )
fi
# The Gateway (Worker children included) and the service both read it; both run as the Gateway user.
[ -n "$RENDER_DIR" ] || { chown "$GATEWAY_USER:$GROUP_NAME" "$TOKEN"; chmod 600 "$TOKEN"; }
CONFIG="${RENDER_DIR}$ETC_DIR/config.json"
"${RENDER_NODE:-$NODE}" -e '
  const fs = require("fs");
  const [example, out, publicBind, publicPort, adminPort, base, stateDir, tokenFile, dist] = process.argv.slice(1);
  const c = JSON.parse(fs.readFileSync(example, "utf8"));
  Object.assign(c, { bind: "127.0.0.1", publicBind, publicPort: Number(publicPort), adminPort: Number(adminPort),
    publicBaseUrl: base, stateDir, adminTokenFile: tokenFile, openclawDist: dist });
  fs.writeFileSync(out, JSON.stringify(c, null, 2) + "\n", { mode: 0o640 });
' "$REPO/apps/v-secret-entry/config.example.json" "$CONFIG" "$PUBLIC_BIND" "$PUBLIC_PORT" "$ADMIN_PORT" \
  "$PUBLIC_BASE_URL" "$STATE_DIR" "$ETC_DIR/admin-token" "$OPENCLAW_DIST"
[ -n "$RENDER_DIR" ] || { chown "root:$GROUP_NAME" "$CONFIG"; chmod 640 "$CONFIG"; }

echo "== units"
mkdir -p "$SYSTEMD_DIR/$UNIT.d" "$SYSTEMD_DIR/$GATEWAY_UNIT.d"
sed -e "s#^User=openclaw#User=$GATEWAY_USER#" -e "s#^Group=openclaw#Group=$GROUP_NAME#" \
    -e "s#^Environment=HOME=/home/openclaw\$#Environment=HOME=$GATEWAY_HOME#" \
    -e "s#^Environment=OPENCLAW_STATE_DIR=.*#Environment=OPENCLAW_STATE_DIR=$GATEWAY_STATE#" \
    -e "s#^Environment=OPENCLAW_CONFIG_PATH=.*#Environment=OPENCLAW_CONFIG_PATH=$GATEWAY_CONFIG#" \
    -e "s#/usr/bin/env node#$NODE#" -e "s#/opt/v-secret-entry#$INSTALL_DIR#g" -e "s#/etc/v-secret-entry#$ETC_DIR#g" \
    -e "s#After=network.target openclaw-gateway.service#After=network.target $GATEWAY_UNIT#" \
    -e "s#(PRODUCTION - not VLab)#(${UNIT_PREFIX:-PRODUCTION - not VLab})#" \
    "$REPO/systemd/v-secret-entry.service" > "$SYSTEMD_DIR/$UNIT"
{
  echo "# Rendered by scripts/install-secret-entry-host.sh: the Gateway's own environment files."
  echo "[Service]"
  printf '%s\n' "$GATEWAY_ENV_FILES" | sed -n 's#^\(-\{0,1\}/.*\)$#EnvironmentFile=\1#p'
} > "$SYSTEMD_DIR/$UNIT.d/10-gateway-env.conf"
sed -e "s#http://127.0.0.1:23961#http://127.0.0.1:$ADMIN_PORT#" -e "s#/etc/v-secret-entry/admin-token#$ETC_DIR/admin-token#" \
    "$REPO/systemd/openclaw-gateway.service.d/secret-entry.conf" > "$SYSTEMD_DIR/$GATEWAY_UNIT.d/secret-entry.conf"

if [ -n "$RENDER_DIR" ]; then echo "rendered into $RENDER_DIR"; exit 0; fi

systemctl daemon-reload
systemctl enable "$UNIT" >/dev/null
systemctl restart "$UNIT"
URL_HOST="$PUBLIC_BIND"; [[ "$URL_HOST" == *:* ]] && URL_HOST="[$URL_HOST]"
for _ in $(seq 1 20); do curl -gfsS "http://$URL_HOST:$PUBLIC_PORT/secret-entry/healthz" >/dev/null 2>&1 && break; sleep 0.5; done
curl -gfsS "http://$URL_HOST:$PUBLIC_PORT/secret-entry/healthz" && echo
systemctl --no-pager --lines=3 status "$UNIT" || true

cat <<EOF

== next ==
1. The Gateway reads V_SECRET_ENTRY_* at its next start ($GATEWAY_UNIT.d/secret-entry.conf):
   restart it in a window with the release that needs it (stop -> start; never a config hot reload).
EOF
if [ "$PUBLIC_BIND" = 127.0.0.1 ]; then cat <<EOF
2. cloudflared (/etc/cloudflared/v-dashboard.yml), before the openclaw.tianyi.live catch-all:
     - hostname: openclaw.tianyi.live
       path: ^/secret-entry(?:/.*)?\$
       service: http://127.0.0.1:$PUBLIC_PORT
   cloudflared ingress validate; restart only cloudflared-v-dashboard (not the Gateway).
   Check https://openclaw.tianyi.live/secret-entry/healthz = 200 and that :$ADMIN_PORT is not reachable from outside.
EOF
else echo "2. Links point at $PUBLIC_BASE_URL (reachable from tailnet devices only)."; fi
