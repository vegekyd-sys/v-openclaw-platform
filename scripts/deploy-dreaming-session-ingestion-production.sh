#!/usr/bin/env bash
# Deploys the dreaming session-ingestion patch (dev af29163, VLab release
# dreaming-session-ingestion-v1) to production V.
#
# Run as root on the production host with the two verified release files next to
# this script (RELEASE_DIR). Refuses to start unless the live files are the exact
# baseline bytes the patch was built from, refuses to finish unless the copied
# files are the exact bytes accepted on the shared VLab, and restarts the Gateway
# only when RESTART=1 (default). The restart also activates the PR #39 hotset
# pruner already on disk as ExecStartPre.
set -euo pipefail

DIST="${DIST:-/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist}"
RELEASE_DIR="${RELEASE_DIR:-/tmp/dreaming-session-ingestion-v1}"
SERVICE="${SERVICE:-openclaw-gateway.service}"
NODE="${NODE:-/opt/node-v22.23.1/bin/node}"
RESTART="${RESTART:-1}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-600}"

declare -A BEFORE AFTER
BEFORE[memory-core-host-engine-sessions-CAnvQ_5o.js]="0b117c22162dc42db57ea50d6e940ce6a73f759cab05440f101573e722a51de4"
AFTER[memory-core-host-engine-sessions-CAnvQ_5o.js]="697381c0f781baae3a7d622b8156162192f820be6cf781cec0ff37bb08891f48"
BEFORE[dreaming-phases-C5ItPb99.js]="c6dca1a88c2a32eb22b00d55aff978810b6b0f51c30b48c4f1a0e390ddd70dbb"
AFTER[dreaming-phases-C5ItPb99.js]="a72386d36ce5fabdbf3b5efa170efccc1656118fd95a4ff11414a85c0487ba92"
FILES=(memory-core-host-engine-sessions-CAnvQ_5o.js dreaming-phases-C5ItPb99.js)

sha() { sha256sum "$1" | cut -d' ' -f1; }
step() { printf '\n== %s\n' "$1"; }

step "Preflight"
echo "dist: $DIST"
already=0
for f in "${FILES[@]}"; do
  [ -f "$DIST/$f" ] || { echo "FAIL: $DIST/$f missing"; exit 1; }
  [ -f "$RELEASE_DIR/$f" ] || { echo "FAIL: release file $RELEASE_DIR/$f missing"; exit 1; }
  live="$(sha "$DIST/$f")"
  rel="$(sha "$RELEASE_DIR/$f")"
  echo "$f live=$live release=$rel"
  [ "$rel" = "${AFTER[$f]}" ] || { echo "FAIL: release file is not the VLab-accepted bytes"; exit 1; }
  if [ "$live" = "${AFTER[$f]}" ]; then already=$((already + 1)); continue; fi
  [ "$live" = "${BEFORE[$f]}" ] || { echo "FAIL: live $f is neither the verified baseline nor the patched bytes; re-verify before deploying"; exit 1; }
done
if [ "$already" = "${#FILES[@]}" ]; then
  echo "Already deployed (both files are the patched bytes). Nothing to copy."
elif [ "$already" != "0" ]; then
  echo "FAIL: files are in a mixed state; deploy or roll back both together"; exit 1
fi

if [ "$already" = "0" ]; then
  step "Backup"
  stamp="$(date +%Y%m%d-%H%M%S)"
  for f in "${FILES[@]}"; do
    cp -a "$DIST/$f" "$DIST/$f.predeploy-$stamp"
    echo "$DIST/$f.predeploy-$stamp"
  done

  step "Install"
  for f in "${FILES[@]}"; do
    install -m 0644 -o root -g root "$RELEASE_DIR/$f" "$DIST/$f.new"
    mv -f "$DIST/$f.new" "$DIST/$f"
  done

  step "Verify bytes"
  for f in "${FILES[@]}"; do
    after="$(sha "$DIST/$f")"
    echo "$f after=$after"
    [ "$after" = "${AFTER[$f]}" ] || { echo "FAIL: $f does not match the VLab-accepted bytes; rolling back"; for g in "${FILES[@]}"; do cp -a "$DIST/$g.predeploy-$stamp" "$DIST/$g"; done; exit 1; }
  done

  step "Syntax check"
  for f in "${FILES[@]}"; do cp "$DIST/$f" "/tmp/deploy-check-$f"; "$NODE" --check "/tmp/deploy-check-$f"; rm -f "/tmp/deploy-check-$f"; done
  echo "both files parse"
fi

if [ "$RESTART" != "1" ]; then
  echo "RESTART=0: files in place; restart $SERVICE separately to activate."
  exit 0
fi

step "Restart $SERVICE"
restarts_before="$(systemctl show "$SERVICE" -p NRestarts --value)"
started_at="$(date '+%Y-%m-%d %H:%M:%S')"
systemctl restart "$SERVICE"
probe=/tmp/deploy-dreaming-journal.txt
deadline=$(( SECONDS + READY_TIMEOUT_SECONDS ))
listening=0
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 5
  state="$(systemctl is-active "$SERVICE" || true)"
  if [ "$state" != "active" ] && [ "$state" != "activating" ]; then
    echo "FAIL: service went $state"
    journalctl -u "$SERVICE" --since "$started_at" --no-pager | tail -30
    exit 1
  fi
  # Write the journal to a file first: `journalctl | grep -q` under pipefail exits 141 and never matches.
  journalctl -u "$SERVICE" --since "$started_at" --no-pager > "$probe" 2>/dev/null || true
  if grep -q "http server listening" "$probe"; then
    listening=1
    echo "gateway listening after ${SECONDS}s"
    break
  fi
done
[ "$listening" = "1" ] || { echo "FAIL: no 'http server listening' within ${READY_TIMEOUT_SECONDS}s"; tail -30 "$probe"; exit 1; }

channel_deadline=$(( SECONDS + 240 ))
while [ "$SECONDS" -lt "$channel_deadline" ]; do
  journalctl -u "$SERVICE" --since "$started_at" --no-pager > "$probe" 2>/dev/null || true
  if grep -q "WebSocket client started" "$probe"; then
    echo "feishu websocket up after ${SECONDS}s"
    break
  fi
  sleep 5
done

step "Health"
systemctl show "$SERVICE" -p ActiveState -p NRestarts -p MainPID
echo "NRestarts before deploy: $restarts_before"
grep -E "hotset|prune" "$probe" | tail -3 || true
grep -E "memory-core: (created|updated|replaced) managed dreaming cron|managed dreaming cron" "$probe" | tail -3 || true

cat <<ROLLBACK

== Rollback (both files together, then restart)
ls $DIST/*.predeploy-* | tail -2
cp -a $DIST/memory-core-host-engine-sessions-CAnvQ_5o.js.predeploy-<stamp> $DIST/memory-core-host-engine-sessions-CAnvQ_5o.js
cp -a $DIST/dreaming-phases-C5ItPb99.js.predeploy-<stamp> $DIST/dreaming-phases-C5ItPb99.js
systemctl restart $SERVICE
ROLLBACK
