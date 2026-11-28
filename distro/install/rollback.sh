#!/usr/bin/env bash
# Go back to the previous release (/opt/v/previous).
#
#   sudo /opt/v/current/install/rollback.sh [--restore-state DIR | --latest-snapshot]
#
# Same OpenClaw schema on both releases: code only, conversations since the
# update are kept. Different schema: refused unless a state snapshot is given,
# because the newer release may have migrated the databases.
set -euo pipefail
PREFIX="${V_PREFIX:-/opt/v}"
RESTORE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --restore-state) RESTORE="$2"; shift 2 ;;
    --latest-snapshot) RESTORE="$(ls -1d /var/backups/v/*/ 2>/dev/null | sort | tail -1)"; RESTORE="${RESTORE%/}"; [ -n "$RESTORE" ] || { echo "no snapshot under /var/backups/v" >&2; exit 1; }; shift ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
die() { echo "rollback: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
NODE="$PREFIX/node/current/bin/node"
# This script's own release (resolved now: the current symlink moves below).
SELF_VCTL="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/vctl.mjs"
CHECK="$("$NODE" "$PREFIX/current/install/lib/vctl.mjs" rollback-check)"
echo "$CHECK"
PREV="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["previous"])' "$CHECK")"
CODE_ONLY="$(python3 -c 'import json,sys; print(int(json.loads(sys.argv[1])["codeOnly"]))' "$CHECK")"
if [ "$CODE_ONLY" -eq 0 ] && [ -z "$RESTORE" ]; then
  die "the two releases use different OpenClaw schemas; pass --restore-state <snapshot> (see /var/backups/v)"
fi
systemctl stop v-memory-indexer.service 2>/dev/null || true
systemctl stop openclaw-gateway.service
FP="/var/lib/v-distro/rollback-fingerprint.json"
"$NODE" "$SELF_VCTL" fingerprint "$FP"
"$NODE" "$PREFIX/releases/$PREV/install/lib/vctl.mjs" switch "$PREV"
VCTL=("$NODE" "$PREFIX/current/install/lib/vctl.mjs")
[ -z "$RESTORE" ] || "${VCTL[@]}" restore "$RESTORE"
"${VCTL[@]}" configure
"${VCTL[@]}" units
ln -sfn "$PREFIX/current/install/v-ctl" /usr/local/bin/v-ctl
systemctl start openclaw-gateway.service
"${VCTL[@]}" health --deadline-ms 600000
"$NODE" "$SELF_VCTL" overlay-plugins --restart
"${VCTL[@]}" probe --check-history --history-only
[ -n "$RESTORE" ] || "$NODE" "$SELF_VCTL" fingerprint --compare "$FP"
# The workspace's system files go back with the code (the newer vctl knows how; the older may not).
"$NODE" "$SELF_VCTL" workspace-update --target "$PREFIX/current" || echo "warning: workspace not rolled back; run: v-ctl workspace-update" >&2
"${VCTL[@]}" desktop-services 2>/dev/null || "$NODE" "$SELF_VCTL" desktop-services || true
systemctl start v-memory-indexer.service || true
"${VCTL[@]}" status
echo "rolled back to $PREV"
