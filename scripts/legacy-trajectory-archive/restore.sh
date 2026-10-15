#!/usr/bin/env bash
# Find and restore legacy trajectory files moved out of agents/makaron/sessions.
# Run as root on V.
#
#   restore.sh find <session-id | YYYY-MM | part of a file name>
#   restore.sh restore <file name> [--from vdb|cos] [--to DIR]
#
# find prints: batch  name  kind  month  size  sha256
# restore copies one file (owner, mode, mtime kept) into DIR, default the original
# sessions directory, refuses to overwrite, and checks sha256 against the manifest.
# --from cos reads the batch's tar.zst on COS instead of the vdb copy.
set -euo pipefail

ARCHIVE=/srv/openclaw-data/disk1/legacy-sessions-archive
VDB=$ARCHIVE/trajectories
COS=/lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories
SESSIONS=/home/openclaw/.openclaw/agents/makaron/sessions

manifests() {
  # COS holds every batch manifest; the vdb work dir holds the same files.
  if compgen -G "$COS/*.manifest.tsv" >/dev/null; then ls "$COS"/*.manifest.tsv
  else ls "$ARCHIVE"/work/*.tsv; fi
}

find_rows() {
  local q=$1 m batch
  for m in $(manifests); do
    batch=$(basename "$m" .manifest.tsv)
    awk -F'\t' -v q="$q" -v b="$batch" 'NR > 1 && (index($1, q) || $3 == q) {
      print b "\t" $1 "\t" $2 "\t" $3 "\t" $4 "\t" $9 }' "$m"
  done
}

case "${1:-}" in
  find)
    [ -n "${2:-}" ] || { echo "usage: $0 find <query>" >&2; exit 64; }
    find_rows "$2"
    ;;
  restore)
    name=${2:?usage: $0 restore <file name> [--from vdb|cos] [--to DIR]}
    shift 2
    from=vdb to=$SESSIONS
    while [ $# -gt 0 ]; do
      case $1 in
        --from) from=$2; shift 2 ;;
        --to) to=$2; shift 2 ;;
        *) echo "unknown option $1" >&2; exit 64 ;;
      esac
    done
    row=$(find_rows "$name" | awk -F'\t' -v n="$name" '$2 == n' | head -1)
    [ -n "$row" ] || { echo "not in any manifest: $name" >&2; exit 1; }
    batch=$(cut -f1 <<<"$row"); want=$(cut -f6 <<<"$row")
    dst=$to/$name
    [ ! -e "$dst" ] || { echo "refusing to overwrite $dst" >&2; exit 1; }
    tmp=$to/.restore-$$-$name
    if [ "$from" = cos ]; then
      x=$(mktemp -d)
      trap 'rm -rf "$x"' EXIT
      zstd -dc "$COS/$batch.tar.zst" | tar -x -C "$x" --numeric-owner -p --same-owner -- "$name"
      mv -- "$x/$name" "$tmp"
    else
      cp -a -- "$VDB/$name" "$tmp"
    fi
    got=$(sha256sum -- "$tmp" | cut -d' ' -f1)
    if [ "$got" != "$want" ]; then rm -f -- "$tmp"; echo "sha256 mismatch for $name" >&2; exit 1; fi
    mv -n -- "$tmp" "$dst"
    [ ! -e "$tmp" ] || { rm -f -- "$tmp"; echo "refusing to overwrite $dst" >&2; exit 1; }
    stat -c '%a %U:%G %s %y %n' -- "$dst"
    echo "restored $name from $from (batch $batch), sha256 ok"
    ;;
  *)
    sed -n '2,11p' "$0"; exit 64 ;;
esac
