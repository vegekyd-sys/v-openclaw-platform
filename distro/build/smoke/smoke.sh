#!/usr/bin/env bash
# Install / update / rollback smoke test on a disposable test host over ssh.
# Never run the Gateway on a workstation (x86 emulation in Docker took a 24 GB Mac
# down on 2026-11-27, and systemd cannot start services under that emulation anyway).
#
#   distro/build/smoke/smoke.sh <host> install <pkg.tgz> <env-file>   copy, unpack, install.sh --probe
#   distro/build/smoke/smoke.sh <host> update <pkg.tgz>               copy, unpack, update.sh --probe
#   distro/build/smoke/smoke.sh <host> rollback [args]                /opt/v/current/install/rollback.sh
#   distro/build/smoke/smoke.sh <host> uninstall                      remove only what the installer created
#
# SMOKE_ENV='V_DISTRO_TEST_FAIL=health' on update exercises the automatic rollback.
# The env file is copied in with mode 0600 and deleted again right after install.
set -euo pipefail
HOST="$1"; cmd="$2"; shift 2
DIR=/root/v-distro-smoke
case "$cmd" in
  install|update)
    pkg="$1"; base="$(basename "$pkg" .tgz)"
    ssh "$HOST" "mkdir -p $DIR && chmod 700 $DIR"
    scp -q "$pkg" "$HOST:$DIR/$base.tgz"
    ssh "$HOST" "cd $DIR && rm -rf '$base' && tar xzf '$base.tgz'"
    if [ "$cmd" = install ]; then
      scp -q "$2" "$HOST:$DIR/v.env"; ssh "$HOST" "chmod 600 $DIR/v.env"
      set +e; ssh "$HOST" "$DIR/$base/install/install.sh --env-file $DIR/v.env --probe ${SMOKE_ARGS:-}"; rc=$?
      ssh "$HOST" "rm -f $DIR/v.env"; exit $rc
    fi
    ssh "$HOST" "${SMOKE_ENV:-} $DIR/$base/install/update.sh --probe ${SMOKE_ARGS:-}" ;;
  rollback) ssh "$HOST" "/opt/v/current/install/rollback.sh $*" ;;
  uninstall)
    # Only what the installer created. System packages it added (desktop, Google's apt source) stay.
    ssh "$HOST" 'U="openclaw-gateway.service v-memory-indexer.service openclaw-desktop.service v-desktop-handoff.service openclaw-cua-node.service"; systemctl disable --now $U 2>/dev/null; for u in $U; do rm -f /etc/systemd/system/$u; done; rm -f /etc/systemd/system/openclaw-gateway.service.d/v-desktop.conf; rmdir /etc/systemd/system/openclaw-gateway.service.d 2>/dev/null; rm -f /usr/local/bin/v-ctl /etc/tmpfiles.d/v-x11-unix.conf; systemctl daemon-reload; rm -rf /opt/v /etc/v /var/lib/v-distro /var/backups/v /var/lib/v-desktop-handoff /tmp/.v-desktop-99; loginctl terminate-user openclaw 2>/dev/null; systemctl stop "user@$(id -u openclaw 2>/dev/null).service" 2>/dev/null; userdel -r openclaw 2>/dev/null; rm -rf /home/openclaw /home/openclaw.openclaw.replaced-* ; id openclaw 2>/dev/null && echo "user openclaw still present" || echo removed' ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
