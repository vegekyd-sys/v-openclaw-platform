#!/usr/bin/env bash
# Install V from this unpacked v-distro package onto a clean Ubuntu 24.04 host.
#
#   tar xzf v-distro-<ver>.tgz
#   sudo v-distro-<ver>/install/install.sh --env-file ./v.env [options]
#
# Options:
#   --env-file FILE       KEY=VALUE inputs (install/v.env.example). Required on first install.
#   --registry URL        npm registry, e.g. https://registry.npmmirror.com (mainland China)
#   --node-mirror URL     base URL holding node-v<ver>-linux-<arch>.tar.xz (default: tools.json mirrors in order)
#   --node-tarball FILE   use this Node tarball instead of downloading (checked against tools.json)
#   --skip-apt            do not apt-get the system packages (already present)
#   --skip-tools          do not install codex / makaron-cli / lark-cli
#   --no-start            install and configure, but do not start the services
#   --probe               after start, run one real model -> exec -> reply turn (uses the model key)
#   --vsync-env FILE      the VSync identity file the Portal issued for this machine (NEXUS_VSYNC_*)
#
# Optional parts are switched on in the env file: V_DESKTOP=1 (desktop takeover and computer use),
# VOLCENGINE_API_KEY (voice-message transcription). See install/v.env.example.
#
# Re-running is safe: an installed release is re-verified, never rebuilt, and an
# existing workspace or state is never overwritten. To move to a new package, use
# that package's install/update.sh.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${V_PREFIX:-/opt/v}"
V_USER="${V_USER:-openclaw}"
V_HOME="${V_HOME:-/home/openclaw}"
ENV_FILE="" REGISTRY="" NODE_MIRROR="" NODE_TARBALL="" SKIP_APT=0 SKIP_TOOLS=0 START=1 PROBE=0 VSYNC_ENV=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    --node-mirror) NODE_MIRROR="$2"; shift 2 ;;
    --node-tarball) NODE_TARBALL="$2"; shift 2 ;;
    --skip-apt) SKIP_APT=1; shift ;;
    --skip-tools) SKIP_TOOLS=1; shift ;;
    --no-start) START=0; shift ;;
    --probe) PROBE=1; shift ;;
    --vsync-env) VSYNC_ENV="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
die() { echo "install: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ -f "$PKG_DIR/manifest.json" ] || die "no manifest.json next to install/ (run from an unpacked package)"
if [ -z "$ENV_FILE" ] && [ ! -f /etc/v/install.env ]; then die "--env-file is required on the first install"; fi
[ -z "$ENV_FILE" ] || [ -f "$ENV_FILE" ] || die "env file $ENV_FILE not found"
command -v systemctl >/dev/null || die "systemd is required"

. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
  echo "warning: tested on Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}" >&2
fi
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) die "unsupported architecture $(uname -m)" ;;
esac

say "System packages"
if [ "$SKIP_APT" -eq 0 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils git python3 tar gzip procps >/dev/null
fi
for bin in curl xz git python3 tar; do command -v "$bin" >/dev/null || die "$bin is missing"; done

say "Node"
# tools.json is plain JSON; read the few fields with python3 (Node is not here yet).
read -r NODE_VERSION NODE_FILE NODE_SHA < <(python3 - "$PKG_DIR/runtime/tools.json" "$NODE_ARCH" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))["node"]
a = t["linux-" + sys.argv[2]]
print(t["version"], a["file"], a["sha256"])
PY
)
NODE_DIR="$PREFIX/node/v$NODE_VERSION"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  if [ -n "$NODE_TARBALL" ]; then
    cp "$NODE_TARBALL" "$tmp/$NODE_FILE"
  else
    mirrors="$NODE_MIRROR"
    [ -n "$mirrors" ] || mirrors="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["node"]["mirrors"]))' "$PKG_DIR/runtime/tools.json")"
    ok=0
    for m in $mirrors; do
      echo "downloading ${m%/}/$NODE_FILE"
      if curl -fsSL --retry 3 --connect-timeout 15 -o "$tmp/$NODE_FILE" "${m%/}/$NODE_FILE"; then ok=1; break; fi
    done
    [ "$ok" -eq 1 ] || die "could not download $NODE_FILE (try --node-mirror or --node-tarball)"
  fi
  echo "$NODE_SHA  $tmp/$NODE_FILE" | sha256sum -c --quiet - || die "$NODE_FILE sha256 mismatch"
  mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/$NODE_FILE" -C "$NODE_DIR" --strip-components=1 --no-same-owner
fi
ln -sfn "v$NODE_VERSION" "$PREFIX/node/current"
NODE="$PREFIX/node/current/bin/node"
"$NODE" --version
VCTL=("$NODE" "$PKG_DIR/install/lib/vctl.mjs")

say "Verify package"
"${VCTL[@]}" verify "$PKG_DIR"
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PKG_DIR/manifest.json")"

say "Service user"
if ! id -u "$V_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$V_HOME" --shell /bin/bash "$V_USER"
fi
install -d -m 0750 -o "$V_USER" -g "$V_USER" "$V_HOME/.openclaw"
install -d -m 0755 /var/lib/v-distro
install -d -m 0700 /var/lib/v-distro/probes /var/backups/v

say "Inputs"
if [ -n "$ENV_FILE" ]; then "${VCTL[@]}" split-env "$ENV_FILE"; fi
# Agent-side npm installs (and OpenClaw's own plugin installs) use the same registry.
if [ -n "$REGISTRY" ] && ! grep -q '^V_NPM_REGISTRY=' /etc/v/install.env; then echo "V_NPM_REGISTRY=$REGISTRY" >> /etc/v/install.env; fi
if [ -n "$VSYNC_ENV" ]; then "${VCTL[@]}" vsync-env "$VSYNC_ENV"; fi
DESKTOP=0; grep -qx 'V_DESKTOP=1' /etc/v/install.env && DESKTOP=1
if [ "$DESKTOP" -eq 1 ] && [ "$SKIP_APT" -eq 0 ]; then
  say "Desktop packages (TigerVNC, XFCE, Google Chrome from Google's signed apt repository)"
  . "$PKG_DIR/install/lib/desktop-packages.sh"
  v_desktop_packages
fi

say "Release $VERSION (npm ci, overlays, tools)"
args=(install-release "$PKG_DIR")
[ -z "$REGISTRY" ] || args+=(--registry "$REGISTRY")
[ "$SKIP_TOOLS" -eq 0 ] || args+=(--skip-tools)
"${VCTL[@]}" "${args[@]}"
"${VCTL[@]}" switch "$VERSION"
VCTL=("$NODE" "$PREFIX/current/install/lib/vctl.mjs")
ln -sfn "$PREFIX/current/install/v-ctl" /usr/local/bin/v-ctl

say "Configure"
"${VCTL[@]}" configure
"${VCTL[@]}" seed-workspace
"${VCTL[@]}" units
systemctl enable -q openclaw-gateway.service v-memory-indexer.service

if [ "$START" -eq 0 ]; then
  say "Installed $VERSION (not started): systemctl start openclaw-gateway"
  exit 0
fi

say "Start"
# The display comes first: the Gateway's browser tool opens Chrome on it.
[ "$DESKTOP" -eq 0 ] || systemctl enable -q --now openclaw-desktop.service v-desktop-handoff.service
systemctl restart openclaw-gateway.service
"${VCTL[@]}" health --deadline-ms 600000
"${VCTL[@]}" overlay-plugins --restart
# The real-time indexer never runs a full index itself (V's rule); build the first one now.
"$PREFIX/current/install/v-ctl" openclaw memory index --agent "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["agentId"])' "$PREFIX/current/manifest.json")" || echo "warning: first memory index failed; run: v-ctl openclaw memory index --agent makaron" >&2
systemctl restart v-memory-indexer.service || echo "warning: memory indexer did not start; memory_search still works, it just indexes later" >&2
if [ "$DESKTOP" -eq 1 ]; then
  say "Desktop: share-link service and the host node for computer use"
  "${VCTL[@]}" desktop-services
fi
if [ "$PROBE" -eq 1 ]; then
  say "Probe (real model -> exec -> final reply)"
  "${VCTL[@]}" probe
fi
"${VCTL[@]}" status
say "Done. V $VERSION is running (systemctl status openclaw-gateway; journalctl -u openclaw-gateway -f)"
