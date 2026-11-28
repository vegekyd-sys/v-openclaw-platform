#!/usr/bin/env bash
# Remove an installed V from this machine: only what the installer created.
#
#   sudo v-ctl uninstall --dry-run                 list what would be removed, change nothing
#   sudo v-ctl uninstall --yes [--keep-config] [--keep-backups] [--backup-dir DIR | --no-backup]
#
# Order: online backup (v-ctl backup, default into /root/v-uninstall-<time>/, outside every path removed
# below; a failed backup stops here) -> stop and disable the units -> remove units and drop-ins ->
# stop what is left of the service user -> remove /opt/v, /var/lib/v-distro, the desktop's runtime
# dirs, /usr/local/bin/v-ctl, /etc/cron.d/v-backup -> remove the service user with its home
# (~/.openclaw: workspace, memory, sessions; ~/.lark-cli: the owner's Feishu login) -> check that no
# process, port or unit is left.
#   --keep-config   keep /etc/v (install.env, secrets.env, vsync.env ...) for a reinstall; check the
#                   secrets again before reusing them (RUNBOOK, 3.4)
#   --keep-backups  keep /var/backups/v (update snapshots and earlier v-ctl backup archives)
# Left in place: system packages it added (TigerVNC, XFCE, Google Chrome, cloudflared, git ...),
# /etc/default/google-chrome, deployment kits under /opt/v-kit, the Feishu app (nothing to do there),
# and everything on the machine that is not V's.
set -euo pipefail
PREFIX="${V_PREFIX:-/opt/v}"
V_USER="${V_USER:-openclaw}"
YES=0 DRY=0 KEEP_CONFIG=0 KEEP_BACKUPS=0 BACKUP=1 BACKUP_DIR="/root/v-uninstall-$(date +%Y%m%d-%H%M%S)"
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --keep-config) KEEP_CONFIG=1; shift ;;
    --keep-backups) KEEP_BACKUPS=1; shift ;;
    --no-backup) BACKUP=0; shift ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" -eq 0 ] || { echo "uninstall: run as root (sudo)" >&2; exit 1; }
[ "$YES" -eq 1 ] || [ "$DRY" -eq 1 ] || { echo "uninstall: pass --dry-run to see the plan, or --yes to remove V" >&2; exit 2; }

UNITS="openclaw-gateway.service v-memory-indexer.service openclaw-desktop.service v-desktop-handoff.service openclaw-cua-node.service v-cloudflared.service"
V_HOME="$(getent passwd "$V_USER" | cut -d: -f6 || true)"
PORT="$(sed -n 's/^V_GATEWAY_PORT=//p' /etc/v/install.env 2>/dev/null | tail -1)"; PORT="${PORT:-18789}"
PATHS=("$PREFIX" /var/lib/v-distro /var/lib/v-desktop-handoff /tmp/.v-desktop-99 /usr/local/bin/v-ctl /etc/tmpfiles.d/v-x11-unix.conf /etc/cron.d/v-backup)
[ "$KEEP_CONFIG" -eq 1 ] || PATHS+=(/etc/v)
[ "$KEEP_BACKUPS" -eq 1 ] || PATHS+=(/var/backups/v)
for u in $UNITS; do PATHS+=("/etc/systemd/system/$u"); done
PATHS+=(/etc/systemd/system/openclaw-gateway.service.d)
case "$BACKUP_DIR" in "$PREFIX"*|/var/lib/v-distro*|/etc/v*|/var/backups/v*|"${V_HOME:-/nonexistent}"*) echo "uninstall: --backup-dir must be outside what is removed" >&2; exit 2 ;; esac

say() { printf '\n== %s\n' "$*"; }
say "Plan"
for p in "${PATHS[@]}"; do [ -e "$p" ] || [ -L "$p" ] && echo "remove   $p"; done
[ -n "$V_HOME" ] && echo "remove   user $V_USER and its home $V_HOME (workspace, memory, sessions, Feishu login)"
[ "$KEEP_CONFIG" -eq 1 ] && echo "keep     /etc/v"
[ "$KEEP_BACKUPS" -eq 1 ] && echo "keep     /var/backups/v"
if [ "$BACKUP" -eq 1 ]; then echo "backup   first, into $BACKUP_DIR"; else echo "backup   none (--no-backup): the workspace and memory are gone for good"; fi
for u in $UNITS; do systemctl list-unit-files "$u" >/dev/null 2>&1 && systemctl is-active -q "$u" && echo "stop     $u"; done
[ "$DRY" -eq 0 ] || { echo; echo "dry run: nothing changed"; exit 0; }

if [ "$BACKUP" -eq 1 ]; then
  if [ -x "$PREFIX/node/current/bin/node" ] && [ -f "$PREFIX/current/install/lib/vctl.mjs" ]; then
    say "Backup"
    install -d -m 0700 "$BACKUP_DIR"
    "$PREFIX/node/current/bin/node" "$PREFIX/current/install/lib/vctl.mjs" backup --out-dir "$BACKUP_DIR" \
      || { echo "uninstall: backup failed; nothing removed (rerun after fixing it, or pass --no-backup)" >&2; exit 1; }
    ls -l "$BACKUP_DIR"
  else
    echo "uninstall: no installed release to back up with; pass --no-backup to remove anyway" >&2; exit 1
  fi
fi

say "Stop units"
systemctl disable --now $UNITS 2>/dev/null || true
for u in $UNITS; do rm -f "/etc/systemd/system/$u"; done
rm -rf /etc/systemd/system/openclaw-gateway.service.d
systemctl daemon-reload
systemctl reset-failed $UNITS 2>/dev/null || true

say "Stop what is left of $V_USER"
if id "$V_USER" >/dev/null 2>&1; then
  loginctl terminate-user "$V_USER" 2>/dev/null || true
  systemctl stop "user@$(id -u "$V_USER").service" 2>/dev/null || true
  pkill -TERM -u "$V_USER" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -u "$V_USER" >/dev/null || break; sleep 1; done
  pkill -KILL -u "$V_USER" 2>/dev/null || true
fi

say "Remove files"
for p in "${PATHS[@]}"; do rm -rf "$p"; done
if id "$V_USER" >/dev/null 2>&1; then
  crontab -r -u "$V_USER" 2>/dev/null || true
  userdel -r "$V_USER" 2>/dev/null || userdel "$V_USER"
fi
[ -n "$V_HOME" ] && [ "$V_HOME" != / ] && rm -rf "$V_HOME" || true

say "Check"
left=0
id "$V_USER" >/dev/null 2>&1 && { echo "LEFT user $V_USER"; left=1; }
for u in $UNITS; do systemctl is-active -q "$u" 2>/dev/null && { echo "LEFT unit $u active"; left=1; }; done
for p in "$PORT" 23950; do ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN && { echo "LEFT port $p still listening"; left=1; }; done
for p in "${PATHS[@]}"; do [ -e "$p" ] && { echo "LEFT $p"; left=1; }; done
[ -z "$V_HOME" ] || [ ! -e "$V_HOME" ] || { echo "LEFT $V_HOME"; left=1; }
if [ "$left" -eq 0 ]; then echo "V removed"; [ "$BACKUP" -eq 0 ] || echo "backup: $BACKUP_DIR"; else exit 1; fi
