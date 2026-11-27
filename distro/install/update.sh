#!/usr/bin/env bash
# Update an installed V to this package (run from the NEW package, unpacked).
#
#   sudo v-distro-<new>/install/update.sh [--registry URL] [--env-file FILE] [--probe] [--no-auto-rollback]
#
# Order: verify -> install the new release next to the old one (service still up)
# -> stop -> snapshot state to /var/backups/v -> switch current -> regenerate
# config and units -> start -> health -> earlier probe sessions still readable
# (and, with --probe, one new real turn). Any failure after the stop puts the old
# release and the snapshot back. Workspace, sessions, memory and secrets are kept.
set -euo pipefail
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${V_PREFIX:-/opt/v}"
REGISTRY="" ENV_FILE="" PROBE=0 AUTO_ROLLBACK=1 SKIP_TOOLS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --registry) REGISTRY="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --probe) PROBE=1; shift ;;
    --skip-tools) SKIP_TOOLS=1; shift ;;
    --no-auto-rollback) AUTO_ROLLBACK=0; shift ;;
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
say() { printf '\n== %s\n' "$*"; }
die() { echo "update: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ -L "$PREFIX/current" ] || die "no installed V at $PREFIX (use install.sh)"
NODE="$PREFIX/node/current/bin/node"
NEW_VCTL=("$NODE" "$PKG_DIR/install/lib/vctl.mjs")

say "Verify package"
"${NEW_VCTL[@]}" verify "$PKG_DIR"
NEW="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PKG_DIR/manifest.json")"
OLD="$(basename "$(readlink "$PREFIX/current")")"
OLD_PREV="$(readlink "$PREFIX/previous" 2>/dev/null || true)"
[ "$NEW" != "$OLD" ] || die "$NEW is already the current release"
NEED_NODE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["node"]["version"])' "$PKG_DIR/runtime/tools.json")"
[ -x "$PREFIX/node/v$NEED_NODE/bin/node" ] || die "this package needs Node $NEED_NODE; run its install.sh instead (it keeps state)"

say "Install $NEW next to $OLD (service keeps running)"
args=(install-release "$PKG_DIR")
[ -z "$REGISTRY" ] || args+=(--registry "$REGISTRY")
[ "$SKIP_TOOLS" -eq 0 ] || args+=(--skip-tools)
"${NEW_VCTL[@]}" "${args[@]}"
[ -z "$ENV_FILE" ] || "${NEW_VCTL[@]}" split-env "$ENV_FILE"
if grep -qx 'V_DESKTOP=1' /etc/v/install.env && ! command -v Xtigervnc >/dev/null; then
  say "Desktop packages (V_DESKTOP=1 is new on this machine)"
  . "$PKG_DIR/install/lib/desktop-packages.sh"
  v_desktop_packages
fi

say "Stop and snapshot"
systemctl stop v-memory-indexer.service 2>/dev/null || true
systemctl stop openclaw-gateway.service
SNAP="/var/backups/v/$(date +%Y%m%d-%H%M%S)-$OLD"
"$NODE" "$PREFIX/current/install/lib/vctl.mjs" snapshot "$SNAP"
"${NEW_VCTL[@]}" fingerprint "$SNAP/fingerprint.json"

rollback() {
  set +e
  echo "update: $1; going back to $OLD with the state snapshot $SNAP" >&2
  systemctl stop openclaw-gateway.service
  "$NODE" "$PREFIX/releases/$OLD/install/lib/vctl.mjs" switch "$OLD"
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" restore "$SNAP"
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" configure
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" units
  systemctl start openclaw-gateway.service
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" health --deadline-ms 600000
  "${NEW_VCTL[@]}" overlay-plugins --restart
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" probe --check-history --history-only
  # Releases before the desktop part have no desktop-services; the units they wrote are enough then.
  "$NODE" "$PREFIX/current/install/lib/vctl.mjs" desktop-services 2>/dev/null || true
  # The failed release must not become the rollback target.
  if [ -n "$OLD_PREV" ]; then ln -sfn "$OLD_PREV" "$PREFIX/previous"; else rm -f "$PREFIX/previous"; fi
  systemctl start v-memory-indexer.service
  echo "update: back on $OLD; $NEW stays installed under $PREFIX/releases for inspection" >&2
  exit 1
}
fail() { if [ "$AUTO_ROLLBACK" -eq 1 ]; then rollback "$1"; else die "$1 (no automatic rollback; run rollback.sh --restore-state $SNAP)"; fi; }

say "Switch to $NEW"
"${NEW_VCTL[@]}" switch "$NEW"
VCTL=("$NODE" "$PREFIX/current/install/lib/vctl.mjs")
ln -sfn "$PREFIX/current/install/v-ctl" /usr/local/bin/v-ctl
"${VCTL[@]}" configure || fail "configure failed"
"${VCTL[@]}" units || fail "units failed"

say "Start"
systemctl start openclaw-gateway.service || fail "start failed"
"${VCTL[@]}" health --deadline-ms 600000 || fail "not healthy"
"${VCTL[@]}" overlay-plugins --restart || fail "could not lay V's plugin bytes over OpenClaw's install"
# Test hook for the rollback path (distro/build/smoke): pretend the new release is unhealthy.
[ "${V_DISTRO_TEST_FAIL:-}" != health ] || fail "injected failure (V_DISTRO_TEST_FAIL=health)"
"${VCTL[@]}" desktop-services || fail "desktop services did not come back"
"${VCTL[@]}" probe --check-history --history-only || fail "earlier sessions are not readable"
"${VCTL[@]}" fingerprint --compare "$SNAP/fingerprint.json" || fail "workspace or databases changed"
if [ "$PROBE" -eq 1 ]; then "${VCTL[@]}" probe --check-history || fail "probe failed"; fi
systemctl start v-memory-indexer.service || echo "warning: memory indexer did not start" >&2
"${VCTL[@]}" install-skills || echo "warning: global skills were not all installed; rerun: v-ctl install-skills" >&2
"${VCTL[@]}" status
say "Updated $OLD -> $NEW. Snapshot kept at $SNAP; rollback.sh goes back."
