#!/usr/bin/env bash
# cloudflared for the optional Cloudflare tunnel (CLOUDFLARE_TUNNEL_TOKEN), as root.
# Sourced by install.sh, update.sh and reconfigure.sh; does nothing when already at the pinned version.
# The .deb is Cloudflare's GitHub release, checked against the pinned sha256 in runtime/tools.json.
set -euo pipefail

v_cloudflared_package() {
  local pkg_dir="$1" arch
  case "$(dpkg --print-architecture)" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) echo "cloudflared: unsupported architecture" >&2; return 1 ;; esac
  read -r want url sha < <(python3 - "$pkg_dir/runtime/tools.json" "$arch" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))["cloudflared"]
a = c["linux-" + sys.argv[2]]
print(c["version"], a["url"], a["sha256"])
PY
)
  if command -v cloudflared >/dev/null && cloudflared --version 2>/dev/null | grep -q "version $want "; then return 0; fi
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/cloudflared.deb" "$url"
  echo "$sha  $tmp/cloudflared.deb" | sha256sum -c --quiet - || { rm -rf "$tmp"; echo "cloudflared: sha256 mismatch for $url" >&2; return 1; }
  dpkg -i "$tmp/cloudflared.deb" >/dev/null
  rm -rf "$tmp"
  cloudflared --version
}
