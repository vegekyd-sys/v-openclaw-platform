#!/usr/bin/env bash
# Rebuild an official v-distro release from its git tag and prove it is the approved one.
#
#   distro/build/release-build.sh --tag distro-<version> --expect-tar <tarSha256> [--repo DIR] [--out DIR]
#   distro/build/release-build.sh --commit <sha> --version <ver> --expect-tar <sha> [...]   (rehearsals)
#
# The tag names the version (tag "distro-<version>"); distro/release.json at that commit names the
# V release and the captured-store commit holding its bytes. The build reads git objects only, with
# the build scripts taken from the tag itself, so the same tag gives the same tar on every machine
# (sorted entries, the commit's time as mtime, no owner, host or clock in it). The gzip around the tar
# can differ between zlib builds, so the approval is the tar's sha256; the .tgz's own sha256 printed
# here is what the customer machine checks after the transfer.
#
# --repo: a mirror clone used only for this (default ~/distro-build/v-openclaw-platform.git, made
#         with git clone --mirror on first use; fetched every run). Never a working copy.
# Exit 0 and "tarSha256 OK" only when the rebuilt tar matches --expect-tar.
set -euo pipefail
URL="https://github.com/vegekyd-sys/v-openclaw-platform.git"
REPO="${HOME}/distro-build/v-openclaw-platform.git" OUT="${HOME}/distro-build/out"
TAG="" COMMIT="" VERSION="" EXPECT="" RELEASE="" STORE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --release) RELEASE="$2"; shift 2 ;;
    --captured-ref) STORE="$2"; shift 2 ;;
    --expect-tar) EXPECT="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[ -n "$EXPECT" ] || { echo "--expect-tar <tarSha256> is required (from the approval message)" >&2; exit 2; }
[[ "$EXPECT" =~ ^[0-9a-f]{64}$ ]] || { echo "--expect-tar must be a 64-character sha256" >&2; exit 2; }
[ -n "$TAG" ] || [ -n "$COMMIT" ] || { echo "--tag or --commit is required" >&2; exit 2; }
command -v node >/dev/null && command -v git >/dev/null || { echo "need git and node" >&2; exit 1; }
say() { printf '== %s\n' "$*"; }

say "repository $REPO"
if [ -d "$REPO" ]; then git -C "$REPO" fetch -q --prune --tags origin
else mkdir -p "$(dirname "$REPO")"; git clone -q --mirror "$URL" "$REPO"; fi

if [ -n "$TAG" ]; then
  [[ "$TAG" =~ ^distro-[A-Za-z0-9][A-Za-z0-9._+-]*$ ]] || { echo "tag must look like distro-<version>" >&2; exit 2; }
  COMMIT="$(git -C "$REPO" rev-parse --verify -q "refs/tags/$TAG^{commit}")" || { echo "no tag $TAG on $URL" >&2; exit 1; }
  VERSION="${VERSION:-${TAG#distro-}}"
fi
COMMIT="$(git -C "$REPO" rev-parse --verify -q "$COMMIT^{commit}")" || { echo "no commit $COMMIT" >&2; exit 1; }
[ -n "$VERSION" ] || { echo "--version is required with --commit" >&2; exit 2; }
if [ -z "$RELEASE" ] || [ -z "$STORE" ]; then
  REL_JSON="$(git -C "$REPO" show "$COMMIT:distro/release.json" 2>/dev/null)" || { echo "no distro/release.json at $COMMIT (pass --release and --captured-ref)" >&2; exit 1; }
  RELEASE="${RELEASE:-$(printf '%s' "$REL_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).release)')}"
  STORE="${STORE:-$(printf '%s' "$REL_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).capturedStore)')}"
fi
STORE="$(git -C "$REPO" rev-parse --verify -q "$STORE^{commit}")" || { echo "captured-store commit $STORE not in the repository" >&2; exit 1; }
echo "source $COMMIT  version $VERSION  release $RELEASE  captured-store $STORE"

say "build (scripts from $COMMIT)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive "$COMMIT" distro/build | tar -x -C "$TMP"
mkdir -p "$OUT"
node "$TMP/distro/build/build.mjs" --repo "$REPO" --source "$COMMIT" --release "$RELEASE" --version "$VERSION" --captured-ref "$STORE" --out "$OUT" > "$TMP/summary.json"
FILE="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).file)' "$TMP/summary.json")"
GOT="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).tarSha256)' "$TMP/summary.json")"
TGZ="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).tgzSha256)' "$TMP/summary.json")"
echo "file $FILE"
echo "tarSha256 $GOT"
echo "tgzSha256 $TGZ"
if [ "$GOT" != "$EXPECT" ]; then
  echo "tarSha256 MISMATCH: expected $EXPECT. Do not install this; report the tag, both sums and this output." >&2
  exit 1
fi
echo "tarSha256 OK"
