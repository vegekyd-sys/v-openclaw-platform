#!/usr/bin/env bash
# Assemble the deployment kit for one customer machine: the package plus everything the install would
# otherwise download from sites a mainland-China machine often cannot reach (nodejs.org, GitHub,
# dl.google.com). Run it where those sites work (V's own host, a build machine), then copy the whole
# directory to the customer machine and check it there with `sha256sum -c SHA256SUMS`.
#
#   distro/build/offline-kit.sh v-distro-<ver>.tgz OUTDIR [--arch x64|arm64] [--no-chrome] [--no-cloudflared]
#
# OUTDIR/
#   v-distro-<ver>.tgz + .sha256        the package (copied, its own .sha256 checked first)
#   node/node-v<ver>-linux-<arch>.tar.xz   install.sh --node-tarball
#   skills/<owner>_<repo>-<commit>.tar.gz  V_SKILLS_TARBALL_DIR=OUTDIR/skills
#   chrome/google-chrome-stable.deb (+.sha256)   V_CHROME_DEB=... (only used with V_DESKTOP=1; amd64)
#   cloudflared/cloudflared.deb         V_CLOUDFLARED_DEB=... (only used with CLOUDFLARE_TUNNEL_TOKEN)
#   SHA256SUMS                          every file above
# Every download is checked against the package's own pins (tools.json, skills.json) or, for Chrome,
# Google's signed apt metadata; a mismatch stops the script.
set -euo pipefail
PKG="" OUT="" ARCH="x64" CHROME=1 CLOUDFLARED=1
while [ $# -gt 0 ]; do
  case "$1" in
    --arch) ARCH="$2"; shift 2 ;;
    --no-chrome) CHROME=0; shift ;;
    --no-cloudflared) CLOUDFLARED=0; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) if [ -z "$PKG" ]; then PKG="$1"; elif [ -z "$OUT" ]; then OUT="$1"; else echo "extra argument $1" >&2; exit 2; fi; shift ;;
  esac
done
[ -n "$PKG" ] && [ -n "$OUT" ] || { sed -n '2,19p' "$0"; exit 2; }
[ -f "$PKG" ] && [ -f "$PKG.sha256" ] || { echo "need $PKG and $PKG.sha256" >&2; exit 1; }
case "$ARCH" in x64) DEB_ARCH=amd64 ;; arm64) DEB_ARCH=arm64; CHROME=0 ;; *) echo "--arch x64|arm64" >&2; exit 2 ;; esac
command -v node >/dev/null || { echo "node (22+) is needed to read the package's pins" >&2; exit 1; }
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
want_sha() { # FILE EXPECTED
  local got; got="$(sha "$1")"
  [ "$got" = "$2" ] || { echo "sha256 mismatch for $1: got $got, want $2" >&2; exit 1; }
}
say() { printf '== %s\n' "$*"; }

[ ! -e "$OUT" ] || [ -z "$(ls -A "$OUT" 2>/dev/null)" ] || { echo "$OUT exists and is not empty" >&2; exit 1; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say "package"
want_sha "$PKG" "$(cut -d' ' -f1 < "$PKG.sha256")"
cp "$PKG" "$PKG.sha256" "$OUT/"
UNPACK="$(mktemp -d)"; trap 'rm -rf "$UNPACK"' EXIT
tar -xzf "$PKG" -C "$UNPACK"
REL="$(find "$UNPACK" -maxdepth 2 -name manifest.json -print -quit | xargs dirname)"
[ -f "$REL/runtime/tools.json" ] || { echo "no runtime/tools.json in the package" >&2; exit 1; }
pin() { node -e 'const t=require(process.argv[1]); const v=process.argv[2].split(".").reduce((o,k)=>o?.[k], t); if (v==null) process.exit(3); console.log(v)' "$REL/runtime/tools.json" "$1"; }

say "node"
NODE_FILE="$(pin "node.linux-$ARCH.file")"; NODE_SHA="$(pin "node.linux-$ARCH.sha256")"; NODE_VER="$(pin node.version)"
mkdir -p "$OUT/node"
ok=0
for m in "https://nodejs.org/dist/v$NODE_VER/" "https://npmmirror.com/mirrors/node/v$NODE_VER/"; do
  if curl -fsSL --retry 2 -o "$OUT/node/$NODE_FILE" "$m$NODE_FILE" && [ "$(sha "$OUT/node/$NODE_FILE")" = "$NODE_SHA" ]; then ok=1; break; fi
done
[ "$ok" = 1 ] || { echo "could not download a $NODE_FILE matching $NODE_SHA" >&2; exit 1; }

say "skills (GitHub sources pinned in runtime/skills.json)"
node "$REL/install/lib/vctl.mjs" fetch-skill-sources --release "$REL" --out "$OUT/skills" >/dev/null

if [ "$CHROME" = 1 ]; then
  say "chrome (Google's signed apt repository)"
  bash "$HERE/../install/lib/fetch-chrome-deb.sh" "$OUT/chrome" >/dev/null
fi

if [ "$CLOUDFLARED" = 1 ]; then
  say "cloudflared"
  mkdir -p "$OUT/cloudflared"
  curl -fsSL --retry 3 -o "$OUT/cloudflared/cloudflared.deb" "$(pin "cloudflared.linux-$ARCH.url")"
  want_sha "$OUT/cloudflared/cloudflared.deb" "$(pin "cloudflared.linux-$ARCH.sha256")"
fi

say "SHA256SUMS"
( cd "$OUT" && find . -type f ! -name SHA256SUMS | sed 's#^\./##' | sort | while read -r f; do printf '%s  %s\n' "$(sha "$f")" "$f"; done > SHA256SUMS )
du -sh "$OUT" | cut -f1 | sed 's/^/kit size: /'
echo "arch: linux-$ARCH ($DEB_ARCH)"
echo "on the customer machine: cd <kit> && sha256sum -c SHA256SUMS"
