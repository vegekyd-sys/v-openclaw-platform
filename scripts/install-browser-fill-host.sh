#!/usr/bin/env bash
# Installs the v-browser-fill plugin (apps/v-browser-fill) on a Gateway host. Run as root. Idempotent.
#
#   files    /opt/${UNIT_PREFIX}v-browser-fill/plugin (the directory vlab-v-parity.mjs compares, blocking),
#            owned by root, plus node_modules/typebox -> the Gateway's own typebox (parity skips node_modules)
#   config   NOT touched. Loading the plugin adds a plugins.load path and a new tool, which 9.1 only picks
#            up at a Gateway start; the operator adds it with the Gateway stopped (the Worker config is
#            derived from the main config):
#              openclaw config set plugins.load.paths '[..., "/opt/${UNIT_PREFIX}v-browser-fill/plugin"]' --strict-json
#              openclaw config set plugins.entries.v-browser-fill '{"enabled":true}' --strict-json --merge
#            and to plugins.allow when the config has one.
#
# Production V:  REPO=/path/to/checkout bash scripts/install-browser-fill-host.sh
# Shared VLab:   REPO=/path/to/checkout UNIT_PREFIX=vlab- GATEWAY_UNIT=openclaw-vlab-production-mirror-v8.service \
#                  bash scripts/install-browser-fill-host.sh
# Remove files:  MODE=uninstall [UNIT_PREFIX=...] bash scripts/install-browser-fill-host.sh
set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE="${MODE:-install}"
UNIT_PREFIX="${UNIT_PREFIX:-}"
GATEWAY_UNIT="${GATEWAY_UNIT:-openclaw-gateway.service}"
INSTALL_DIR="${INSTALL_DIR:-/opt/${UNIT_PREFIX}v-browser-fill}"
SRC="$REPO/apps/v-browser-fill/plugin"

case "$MODE" in install|uninstall) ;; *) echo "MODE must be install or uninstall" >&2; exit 2;; esac
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

if [ "$MODE" = uninstall ]; then
  rm -rf "$INSTALL_DIR"
  echo "removed $INSTALL_DIR; remove it from plugins.load.paths / plugins.entries with the Gateway stopped"
  exit 0
fi

# The Gateway's dist, from its unit (drop-ins applied), and the typebox next to it.
DIST="${OPENCLAW_DIST:-$(systemctl show "$GATEWAY_UNIT" -p ExecStart --value | grep -o '/[^ ;]*/dist/index\.js' | head -1 | sed 's#/index\.js$##')}"
[ -n "$DIST" ] && [ -f "$DIST/local-dispatch.runtime.js" ] || { echo "Gateway dist not found (set OPENCLAW_DIST)" >&2; exit 1; }
TYPEBOX="${TYPEBOX_DIR:-$(dirname "$DIST")/node_modules/typebox}"
[ -d "$TYPEBOX" ] || { echo "typebox not found at $TYPEBOX (set TYPEBOX_DIR)" >&2; exit 1; }

STAGE="$(mktemp -d "${INSTALL_DIR}.new-XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
install -d -m 755 "$STAGE/plugin/core" "$STAGE/plugin/node_modules"
install -m 644 "$SRC/index.js" "$SRC/openclaw.plugin.json" "$SRC/package.json" "$STAGE/plugin/"
install -m 644 "$SRC"/core/*.js "$STAGE/plugin/core/"
ln -s "$TYPEBOX" "$STAGE/plugin/node_modules/typebox"
chown -R root:root "$STAGE"
chmod 755 "$STAGE"

# Same bytes as the checkout, or nothing is replaced.
for f in index.js openclaw.plugin.json package.json $(cd "$SRC" && ls core/*.js); do
  cmp -s "$SRC/$f" "$STAGE/plugin/$f" || { echo "staged $f differs from $SRC/$f" >&2; exit 1; }
done

if [ -d "$INSTALL_DIR" ]; then
  BACKUP="${INSTALL_DIR}.bak-$(date +%Y%m%dT%H%M%S)"
  mv "$INSTALL_DIR" "$BACKUP"
  echo "previous install kept at $BACKUP"
fi
mv "$STAGE" "$INSTALL_DIR"
trap - EXIT
echo "installed $INSTALL_DIR/plugin from $(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo unknown) (typebox -> $TYPEBOX)"
echo "load it with the Gateway stopped: plugins.load.paths += $INSTALL_DIR/plugin, plugins.entries.v-browser-fill.enabled=true"
