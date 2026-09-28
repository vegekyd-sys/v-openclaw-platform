#!/usr/bin/env bash
# (Re)create the shared VLab's transient node unit that gives the Gateway its
# `computer` tool (docs/v-remote-browser-handoff-plan.md §13): same user, env and
# node-cua config/state as the 2026-09-27 unit; only the Node binary differs,
# because the 9.6 core requires Node >= 24.16 (engines) and the unit runs the
# instance core (runtime/openclaw/dist/index.js).
#   cua-node-shared-vlab.sh stop | start <node-bin> | fit-91-state <backup dir>
# fit-91-state (rollback to 9.1, unit stopped): 9.6 migrates node-cua/state's
# openclaw.sqlite to schema 18 on its first node start, and 9.1 (schema 15) then refuses
# to start ("uses newer schema version 18"). Restores <backup dir>/node-cua-state when the
# upgrade saved one; otherwise builds a fresh schema-15 database with 9.1 and copies the
# node's device identity, its node device token and nodeHost.config (same table layout
# in 9.1 and 9.6), so the restored 9.1 Gateway state still recognises the paired node.
# The 9.6 state is kept as <backup dir>/node-cua-state-9.6-rolledback-<ts>.
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
  fit-91-state)
    B=${2:?backup dir}; S=$I/node-cua/state; DB=$S/state/openclaw.sqlite
    N22=/opt/vlab/node-v22.23.1-linux-x64/bin/node; TS=$(date +%Y%m%dT%H%M%S)
    systemctl is-active --quiet $UNIT && { echo "$UNIT is active; stop it first"; exit 1; }
    grep -q '"version": "2026.9.1"' $I/runtime/openclaw/package.json || { echo "core is not 9.1"; exit 1; }
    v=$(python3 -c "import sqlite3,sys;print(sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True).execute('pragma user_version').fetchone()[0])" $DB)
    if [ "$v" -le 15 ]; then echo "node-cua state schema $v; nothing to do"; exit 0; fi
    cp -a $S $B/node-cua-state-9.6-rolledback-$TS
    if [ -d $B/node-cua-state ]; then
      rm -rf $S; cp -a $B/node-cua-state $S; chown -R $U: $S; echo "node-cua state restored from $B/node-cua-state"; exit 0
    fi
    T=$(mktemp -d /tmp/cua91-fresh-XXXX); chown $U: $T; install -o $U -g $U -m 600 $I/node-cua/openclaw.json $T/openclaw.json
    # Port 1: the fresh identity never reaches the Gateway (no pairing request).
    (cd $T && runuser -u $U -- env HOME=$T OPENCLAW_CONFIG_PATH=$T/openclaw.json OPENCLAW_STATE_DIR=$T/state TMPDIR=$T \
      timeout 25 $N22 $I/runtime/openclaw/dist/index.js node run --host 127.0.0.1 --port 1 --display-name fresh-schema-probe >/dev/null 2>&1) || true
    python3 - $T/state/state/openclaw.sqlite $B/node-cua-state-9.6-rolledback-$TS/state/openclaw.sqlite <<'PY'
import sqlite3, sys
new, old = sys.argv[1:]
n = sqlite3.connect(new); n.execute("attach database ? as o", (f"file:{old}?mode=ro",))
assert n.execute("pragma user_version").fetchone()[0] == 15, "fresh database is not schema 15"
with n:
    for t in ("device_identities", "device_auth_tokens"):
        n.execute(f"delete from {t}"); n.execute(f"insert into {t} select * from o.{t}")
    n.execute("delete from config_machine_state where state_key='nodeHost.config'")
    n.execute("insert into config_machine_state select * from o.config_machine_state where state_key='nodeHost.config'")
    n.execute("delete from config_health_entries")
n.execute("detach database o"); n.execute("pragma wal_checkpoint(TRUNCATE)")
assert n.execute("pragma integrity_check").fetchone()[0] == "ok"
print("fresh schema-15 node database: identities", n.execute("select count(*) from device_identities").fetchone()[0],
      "tokens", n.execute("select count(*) from device_auth_tokens").fetchone()[0])
PY
    rm -f $DB $DB-wal $DB-shm; install -o $U -g $U -m 600 $T/state/state/openclaw.sqlite $DB; rm -rf $T ;;
  *) echo "stop|start <node-bin>|fit-91-state <backup dir>"; exit 1 ;;
esac
