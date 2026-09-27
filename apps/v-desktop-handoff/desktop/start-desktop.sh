#!/usr/bin/env bash
# Starts a loopback-only TigerVNC display with an XFCE session for the Gateway
# host. Used by systemd (openclaw-desktop.service) and by the VLab candidate
# test. Parameters come from the environment:
#
#   DESKTOP_STATE_DIR  (required) holds the VNC password, dbus socket, runtime dir
#   DESKTOP_DISPLAY    X display number, default 99
#   DESKTOP_RFB_PORT   loopback RFB port, default 5900
#   DESKTOP_GEOMETRY   default 1280x800
#   DESKTOP_DEPTH      default 24
#   DESKTOP_NAME       VNC desktop name, default "V"
#   DESKTOP_NO_SESSION set to 1 to skip XFCE (bare X server, for tests)
#
# The password is generated once (8 chars, VNC's limit), kept in plain text at
# $DESKTOP_STATE_DIR/vnc-password.txt (0600) for the handoff service, and in
# TigerVNC's obfuscated form at $DESKTOP_STATE_DIR/vncpasswd for Xtigervnc only.
# The Gateway's desktop.host.passwordFile must point at the PLAIN TEXT file:
# upstream reads it as utf8 and hands it to noVNC as the VncAuth password. Flags mirror the upstream
# OpenClaw managed desktop (src/gateway/desktop/managed-linux.ts).
set -euo pipefail

: "${DESKTOP_STATE_DIR:?DESKTOP_STATE_DIR is required}"
DESKTOP_DISPLAY="${DESKTOP_DISPLAY:-99}"
DESKTOP_RFB_PORT="${DESKTOP_RFB_PORT:-5900}"
DESKTOP_GEOMETRY="${DESKTOP_GEOMETRY:-1280x800}"
DESKTOP_DEPTH="${DESKTOP_DEPTH:-24}"
DESKTOP_NAME="${DESKTOP_NAME:-V}"

for bin in Xtigervnc tigervncpasswd; do
  command -v "$bin" >/dev/null || { echo "missing $bin (apt install tigervnc-standalone-server tigervnc-tools)" >&2; exit 78; }
done
if [ "${DESKTOP_NO_SESSION:-0}" != "1" ]; then
  for bin in dbus-daemon xfce4-session; do
    command -v "$bin" >/dev/null || { echo "missing $bin (apt install xfce4-session dbus)" >&2; exit 78; }
  done
fi

umask 077
# Unix socket paths are limited to 108 bytes, so the session bus and runtime
# dir live under a short per-display directory rather than the state dir.
DESKTOP_RUN_DIR="${DESKTOP_RUN_DIR:-/tmp/.v-desktop-$DESKTOP_DISPLAY}"
rm -rf "$DESKTOP_RUN_DIR"
mkdir -p "$DESKTOP_STATE_DIR" "$DESKTOP_RUN_DIR/runtime"
chmod 700 "$DESKTOP_STATE_DIR" "$DESKTOP_RUN_DIR" "$DESKTOP_RUN_DIR/runtime"
PASSWORD_FILE="$DESKTOP_STATE_DIR/vnc-password.txt"
VNC_PASSWD="$DESKTOP_STATE_DIR/vncpasswd"
if [ ! -s "$PASSWORD_FILE" ]; then
  head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 8 > "$PASSWORD_FILE"
  echo >> "$PASSWORD_FILE"
fi
chmod 600 "$PASSWORD_FILE"
head -n 1 "$PASSWORD_FILE" | tr -d '\n' | tigervncpasswd -f > "$VNC_PASSWD"
chmod 600 "$VNC_PASSWD"

export DISPLAY=":$DESKTOP_DISPLAY"
export XDG_RUNTIME_DIR="$DESKTOP_RUN_DIR/runtime"
export XDG_CONFIG_HOME="$DESKTOP_STATE_DIR/config"
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=XFCE
export DBUS_SESSION_BUS_ADDRESS="unix:path=$DESKTOP_RUN_DIR/bus"

# A headless desktop must never lock, blank or nag: hide the autostart entries
# that XFCE would otherwise launch (screen lockers, power manager, applets).
mkdir -p "$XDG_CONFIG_HOME/autostart"
for entry in light-locker xfce4-screensaver xfce4-power-manager evolution-alarm-notify nm-applet blueman print-applet xfce4-notifyd at-spi-dbus-bus xdg-user-dirs; do
  printf '[Desktop Entry]\nType=Application\nName=%s\nHidden=true\n' "$entry" > "$XDG_CONFIG_HOME/autostart/$entry.desktop"
done

pids=()
cleanup() {
  trap - EXIT TERM INT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Everything the session spawned (panel, Chrome, dbus children) shares our process group.
  kill -- -$$ 2>/dev/null || true
  rm -rf "$DESKTOP_RUN_DIR"
}
trap cleanup EXIT TERM INT

rm -f "/tmp/.X$DESKTOP_DISPLAY-lock" 2>/dev/null || true
Xtigervnc ":$DESKTOP_DISPLAY" \
  -geometry "$DESKTOP_GEOMETRY" -depth "$DESKTOP_DEPTH" \
  -localhost yes -rfbport "$DESKTOP_RFB_PORT" \
  -SecurityTypes VncAuth -PasswordFile "$VNC_PASSWD" \
  -AlwaysShared -AcceptSetDesktopSize \
  -desktop "$DESKTOP_NAME" -nolisten tcp -ac &
XPID=$!
pids+=("$XPID")

# /tmp/.X11-unix may not exist for a non-root X server (Linux then falls back to
# the abstract socket namespace, which Chrome and xdpyinfo both use), so probe
# the display instead of waiting for the socket file.
display_ready() {
  if command -v xdpyinfo >/dev/null; then
    xdpyinfo -display ":$DESKTOP_DISPLAY" >/dev/null 2>&1
  else
    [ -S "/tmp/.X11-unix/X$DESKTOP_DISPLAY" ]
  fi
}
ready=0
for _ in $(seq 1 80); do
  if display_ready; then
    ready=1
    break
  fi
  if ! kill -0 "$XPID" 2>/dev/null; then
    echo "Xtigervnc exited during startup" >&2
    exit 1
  fi
  sleep 0.25
done
[ "$ready" = 1 ] || { echo "Xtigervnc did not answer on display :$DESKTOP_DISPLAY" >&2; exit 1; }
if command -v xset >/dev/null; then
  xset s off -dpms >/dev/null 2>&1 || true
fi

if [ "${DESKTOP_NO_SESSION:-0}" != "1" ]; then
  dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --print-pid > "$DESKTOP_RUN_DIR/dbus.pid"
  pids+=("$(cat "$DESKTOP_RUN_DIR/dbus.pid")")
  # xfce4-session is the upstream choice; it brings xfwm4, the panel and the desktop.
  xfce4-session &
  pids+=("$!")
fi

echo "desktop ready display=:$DESKTOP_DISPLAY rfbport=$DESKTOP_RFB_PORT geometry=$DESKTOP_GEOMETRY"
wait "$XPID"
