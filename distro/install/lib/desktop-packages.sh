#!/usr/bin/env bash
# System packages for desktop takeover and computer use (V_DESKTOP=1), as root.
# Sourced by install.sh and update.sh; safe to run again.
#
# - The display is Xtigervnc (an X server of its own), so a headless machine needs no Xvfb or GPU.
# - Chrome comes only from Google's own apt repository. The repository key is checked against
#   Google's published signing-key fingerprint before apt trusts it, and apt then verifies the
#   repository's signed Release file and every package's hash with that key alone (signed-by).
#   A chromium or playwright browser already on the machine is never used.
set -euo pipefail

GOOGLE_KEY_URL="https://dl.google.com/linux/linux_signing_key.pub"
# Google Linux package signing key (https://www.google.com/linuxrepositories/).
GOOGLE_KEY_FPR="EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796"
GOOGLE_KEYRING="/usr/share/keyrings/v-distro-google-chrome.gpg"
GOOGLE_LIST="/etc/apt/sources.list.d/v-distro-google-chrome.list"

v_desktop_packages() {
  export DEBIAN_FRONTEND=noninteractive
  [ "$(dpkg --print-architecture)" = amd64 ] || { echo "desktop: Google Chrome for Linux is amd64 only; this host is $(dpkg --print-architecture)" >&2; return 1; }
  apt-get install -y -qq --no-install-recommends gnupg ca-certificates curl >/dev/null
  if [ ! -s "$GOOGLE_KEYRING" ]; then
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL --retry 3 -o "$tmp/key.pub" "$GOOGLE_KEY_URL"
    local fprs; fprs="$(gpg --batch --show-keys --with-colons "$tmp/key.pub" | awk -F: '$1=="fpr"{print $10}')"
    if ! grep -qx "$GOOGLE_KEY_FPR" <<<"$fprs"; then
      rm -rf "$tmp"; echo "desktop: Google's key at $GOOGLE_KEY_URL does not carry fingerprint $GOOGLE_KEY_FPR; refusing it" >&2; return 1
    fi
    # Keep only the checked key in the keyring apt uses for this repository.
    gpg --batch --no-default-keyring --keyring "$tmp/ring.gpg" --import "$tmp/key.pub" 2>/dev/null
    gpg --batch --no-default-keyring --keyring "$tmp/ring.gpg" --export "$GOOGLE_KEY_FPR" > "$GOOGLE_KEYRING"
    chmod 644 "$GOOGLE_KEYRING"
    rm -rf "$tmp"
  fi
  echo "deb [arch=amd64 signed-by=$GOOGLE_KEYRING] https://dl.google.com/linux/chrome/deb/ stable main" > "$GOOGLE_LIST"
  # Tell Google's package not to add or re-enable its own repository entry (its documented switch):
  # a second entry with another key would make apt refuse both.
  printf 'repo_add_once="false"\nrepo_reenable_on_distupgrade="false"\n' > /etc/default/google-chrome
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    tigervnc-standalone-server tigervnc-tools xfce4-session xfwm4 xfce4-panel xfdesktop4 dbus dbus-x11 \
    x11-utils x11-xserver-utils wmctrl xdotool xinput novnc ffmpeg fonts-noto-cjk google-chrome-stable >/dev/null
  rm -f /etc/apt/sources.list.d/google-chrome.list
  for bin in Xtigervnc tigervncpasswd xfce4-session dbus-daemon xdpyinfo google-chrome xdotool; do
    command -v "$bin" >/dev/null || { echo "desktop: $bin missing after install" >&2; return 1; }
  done
  [ -d /usr/share/novnc/core ] || { echo "desktop: /usr/share/novnc/core missing" >&2; return 1; }
  echo "desktop packages ready: $(google-chrome --version)"
}
