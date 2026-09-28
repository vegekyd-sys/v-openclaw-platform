#!/usr/bin/env bash
# (Re)create the shared VLab's transient node unit that gives the Gateway its
# `computer` tool (docs/v-remote-browser-handoff-plan.md §13): same user, env and
# node-cua config/state as the 2026-09-27 unit; only the Node binary differs,
# because the 9.6 core requires Node >= 24.16 (engines) and the unit runs the
# instance core (runtime/openclaw/dist/index.js).
#   cua-node-shared-vlab.sh stop | start <node-bin>
set -euo pipefail
test "$(id -u)" = 0
I=/srv/vlab-production-mirror/labs/instances/db91-parity; U=lab-db91-parity; UNIT=vlab-cua-node
case "${1:?stop|start}" in
  stop) systemctl stop $UNIT 2>/dev/null || true; systemctl reset-failed $UNIT 2>/dev/null || true ;;
  start)
    NODE=${2:?node binary}; test -x $NODE
    systemctl is-active --quiet $UNIT && { echo "$UNIT already active"; exit 1; }
    systemctl reset-failed $UNIT 2>/dev/null || true
    systemd-run --unit=$UNIT --uid=$U --working-directory=$I/node-cua \
      --setenv=HOME=$I --setenv=DISPLAY=:99 --setenv=DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/.v-desktop-99/bus \
      --setenv=XDG_RUNTIME_DIR=/tmp/.v-desktop-99/runtime --setenv=OPENCLAW_CONFIG_PATH=$I/node-cua/openclaw.json \
      --setenv=OPENCLAW_STATE_DIR=$I/node-cua/state --setenv=TMPDIR=/tmp --setenv=PATH=$(dirname $NODE):/usr/local/bin:/usr/bin:/bin \
      $NODE $I/runtime/openclaw/dist/index.js node run --host 127.0.0.1 --port 24993 --display-name "VLab CUA X11"
    sleep 3; systemctl is-active $UNIT ;;
  *) echo "stop|start <node-bin>"; exit 1 ;;
esac
