#!/usr/bin/env bash
# Prepare Google Chrome for a machine that cannot reach dl.google.com (desktop takeover, V_DESKTOP=1).
# Run where dl.google.com works (V itself, any Ubuntu with gpg, curl, gzip):
#
#   v-distro-<ver>/install/lib/fetch-chrome-deb.sh OUTDIR
#
# The same chain of trust as the apt install: Google's signing key is checked against its published
# fingerprint, the repository's InRelease is verified with that key (gpgv), the Packages index is
# checked against InRelease, and the .deb against Packages. Writes OUTDIR/google-chrome-stable.deb
# and its .sha256; copy both, then install with V_CHROME_DEB=<that .deb>.
set -euo pipefail
OUT="${1:?usage: fetch-chrome-deb.sh OUTDIR}"
FPR="EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796"
BASE="https://dl.google.com/linux/chrome/deb"
mkdir -p "$OUT"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export GNUPGHOME="$tmp/gnupg"; mkdir -m 700 "$GNUPGHOME"
curl -fsSL -o "$tmp/key.pub" https://dl.google.com/linux/linux_signing_key.pub
gpg --batch --show-keys --with-colons "$tmp/key.pub" | awk -F: '$1=="fpr"{print $10}' | grep -qx "$FPR" || { echo "Google key fingerprint is not $FPR" >&2; exit 1; }
gpg --batch --no-default-keyring --keyring "$tmp/ring.gpg" --import "$tmp/key.pub" 2>/dev/null
gpg --batch --no-default-keyring --keyring "$tmp/ring.gpg" --export "$FPR" > "$tmp/trusted.gpg"
curl -fsSL -o "$tmp/InRelease" "$BASE/dists/stable/InRelease"
gpgv --keyring "$tmp/trusted.gpg" "$tmp/InRelease" 2>/dev/null || { echo "InRelease signature does not verify with key $FPR" >&2; exit 1; }
want="$(awk '/^SHA256:/{f=1;next} /^[A-Z]/{f=0} f && $3=="main/binary-amd64/Packages"{print $1}' "$tmp/InRelease")"
[ -n "$want" ] || { echo "InRelease lists no main/binary-amd64/Packages" >&2; exit 1; }
curl -fsSL -o "$tmp/Packages" "$BASE/dists/stable/main/binary-amd64/Packages"
echo "$want  $tmp/Packages" | sha256sum -c --quiet - || { echo "Packages does not match InRelease" >&2; exit 1; }
read -r file sha ver < <(awk -v RS= '/(^|\n)Package: google-chrome-stable(\n|$)/' "$tmp/Packages" | awk '/^Filename:/{f=$2} /^SHA256:/{s=$2} /^Version:/{v=$2} END{print f, s, v}')
[ -n "${file:-}" ] && [ -n "${sha:-}" ] || { echo "google-chrome-stable is not in Packages" >&2; exit 1; }
curl -fsSL -o "$OUT/google-chrome-stable.deb" "https://dl.google.com/linux/chrome/deb/$file"
echo "$sha  $OUT/google-chrome-stable.deb" | sha256sum -c --quiet - || { echo "the .deb does not match Packages" >&2; exit 1; }
echo "$sha  google-chrome-stable.deb" > "$OUT/google-chrome-stable.deb.sha256"
echo "google-chrome-stable $ver verified: $OUT/google-chrome-stable.deb (sha256 $sha)"
