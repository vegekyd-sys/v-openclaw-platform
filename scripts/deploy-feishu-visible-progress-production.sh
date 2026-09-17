#!/usr/bin/env bash
# Deploys the configurable Feishu visible-progress runtime list to production V.
#
# Run as root on the production host. Idempotent: a second run detects the
# marker and exits without touching anything.
#
# It refuses to start unless the live files match the exact bytes this change
# was verified against, and it refuses to finish unless the patched files match
# the bytes verified in VLab. A frozen artifact is never copied — the patcher
# runs against production's own bytes, so a file someone else changed since
# verification fails the preflight instead of being silently reverted.
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu}"
PATCHER="${PATCHER:-/tmp/apply-feishu-visible-progress-runtimes-patch.mjs}"
SERVICE="${SERVICE:-openclaw-gateway.service}"
NODE="${NODE:-/opt/node-v22.23.1/bin/node}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-420}"

BUNDLE="$(ls "$PLUGIN_DIR"/dist/monitor.account-*.js 2>/dev/null | grep -v '\.bak' | head -1)"
MANIFEST="$PLUGIN_DIR/openclaw.plugin.json"

EXPECT_BUNDLE_BEFORE="d1ae7eda181500d7cc8dee9009d5290d4c8ff5d598f869a2eaee565e085343ec"
EXPECT_BUNDLE_AFTER="960696ddab71607f6cb6d9a9694da0177a88c1104e6e9378629db5659b7b950d"
EXPECT_MANIFEST_BEFORE="64ae8713cbfe23ef0c2d700d669c450973d09d5764f3b3b287441b0bd885673c"
EXPECT_MANIFEST_AFTER="483c07a0e1a3e077400d56360f57d40468a400fc0628696d4f536f2cd9b7ddf6"

sha() { sha256sum "$1" | cut -d' ' -f1; }
step() { printf '\n== %s\n' "$1"; }

step "Preflight"
[ -f "$BUNDLE" ] || { echo "FAIL: no monitor.account-*.js under $PLUGIN_DIR/dist"; exit 1; }
[ -f "$MANIFEST" ] || { echo "FAIL: no manifest at $MANIFEST"; exit 1; }
[ -f "$PATCHER" ] || { echo "FAIL: patcher not found at $PATCHER"; exit 1; }
echo "bundle:   $BUNDLE"
echo "manifest: $MANIFEST"

if grep -q "feishu-visible-progress-runtimes-v3" "$BUNDLE"; then
  echo "Already deployed (marker present). Nothing to do."
  exit 0
fi

bundle_before="$(sha "$BUNDLE")"
manifest_before="$(sha "$MANIFEST")"
echo "bundle   before: $bundle_before"
echo "manifest before: $manifest_before"
[ "$bundle_before" = "$EXPECT_BUNDLE_BEFORE" ] || { echo "FAIL: live bundle is not the verified baseline; re-verify before deploying"; exit 1; }
[ "$manifest_before" = "$EXPECT_MANIFEST_BEFORE" ] || { echo "FAIL: live manifest is not the verified baseline"; exit 1; }

step "Backup"
stamp="$(date +%Y%m%d-%H%M%S)"
cp -a "$BUNDLE" "$BUNDLE.predeploy-$stamp"
cp -a "$MANIFEST" "$MANIFEST.predeploy-$stamp"
echo "$BUNDLE.predeploy-$stamp"
echo "$MANIFEST.predeploy-$stamp"

step "Patch"
"$NODE" "$PATCHER" "$PLUGIN_DIR"

step "Verify bytes"
bundle_after="$(sha "$BUNDLE")"
manifest_after="$(sha "$MANIFEST")"
echo "bundle   after: $bundle_after"
echo "manifest after: $manifest_after"
[ "$bundle_after" = "$EXPECT_BUNDLE_AFTER" ] || { echo "FAIL: patched bundle does not match the VLab-verified bytes"; exit 1; }
[ "$manifest_after" = "$EXPECT_MANIFEST_AFTER" ] || { echo "FAIL: patched manifest does not match the VLab-verified bytes"; exit 1; }

step "Syntax check"
cp "$BUNDLE" /tmp/feishu-deploy-check.mjs
"$NODE" --check /tmp/feishu-deploy-check.mjs
rm -f /tmp/feishu-deploy-check.mjs
"$NODE" -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$MANIFEST"
echo "both files parse"

step "Restart $SERVICE"
restarts_before="$(systemctl show "$SERVICE" -p NRestarts --value)"
systemctl restart "$SERVICE"
deadline=$(( SECONDS + READY_TIMEOUT_SECONDS ))
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 5
  state="$(systemctl is-active "$SERVICE" || true)"
  if [ "$state" != "active" ] && [ "$state" != "activating" ]; then
    echo "FAIL: service went $state"
    journalctl -u "$SERVICE" --since "-3min" --no-pager | tail -25
    exit 1
  fi
  if journalctl -u "$SERVICE" --since "-5min" --no-pager 2>/dev/null | grep -q "http server listening"; then
    echo "gateway listening after ${SECONDS}s"
    break
  fi
done

step "Health"
systemctl show "$SERVICE" -p ActiveState -p NRestarts
echo "NRestarts before deploy: $restarts_before"
journalctl -u "$SERVICE" --since "-5min" --no-pager 2>/dev/null | grep -iE "feishu.*(WebSocket client started|starting feishu)" | tail -3

cat <<ROLLBACK

== Rollback (both files together, then restart)
cp -a "$BUNDLE.predeploy-$stamp" "$BUNDLE"
cp -a "$MANIFEST.predeploy-$stamp" "$MANIFEST"
systemctl restart $SERVICE
ROLLBACK
