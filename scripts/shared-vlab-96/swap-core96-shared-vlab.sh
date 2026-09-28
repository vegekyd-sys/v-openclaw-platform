#!/usr/bin/env bash
# Replace the running 9.6 core's dist/ and its bundled workspace packages
# (node_modules/@openclaw/<pkg> shipped inside the core tarball, e.g. @openclaw/ai)
# with another build of the same version; npm-installed dependencies stay:
#   swap-core96-shared-vlab.sh <backup dir> <unpacked package dir> <files.sha256 of that package> [codex.tgz]
# With a codex.tgz, the installed @openclaw/codex plugin is overlaid from it (files verified)
# while the Gateway is stopped; the replaced plugin files are kept in the backup dir.
# Keeps the replaced core in <backup dir>/openclaw-96-<old commit>/, restarts the
# Gateway, recreates vlab-cua-node (it runs the same core) and restarts the
# companion if it was running.
set -euo pipefail
test "$(id -u)" = 0
B=${1:?backup dir}; PKG=${2:?unpacked package dir}; SUMS=${3:?files.sha256}; CODEX=${4:-}
I=/srv/vlab-production-mirror/labs/instances/db91-parity; U=lab-db91-parity; CORE=$I/runtime/openclaw
UNIT=openclaw-vlab-production-mirror-v8; COMPANION=nightshift-vlab-production-mirror
N24=/opt/vlab/node-v24.17.0-linux-x64/bin/node; HERE=$(cd "$(dirname "$0")" && pwd)
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $B/evidence/swap-core.log; }
(cd $PKG && sha256sum -c --quiet $SUMS) || { log "package tree does not match $SUMS"; exit 1; }
test "$(rsync -rlcn --itemize-changes --exclude=/dist/ --exclude=/node_modules/ --exclude=/.openclaw-lifecycle-pending $PKG/ $CORE/ | grep -vc '^\.d' || true)" = 0 || { log "differences outside dist/ and bundled packages; refusing"; exit 1; }
BUNDLED=$(cd $PKG/node_modules/@openclaw 2>/dev/null && ls || true)
OLD=$($N24 -p "require('$CORE/dist/build-info.json').commit.slice(0,7)"); NEW=$($N24 -p "require('$PKG/dist/build-info.json').commit.slice(0,7)")
companion=$(systemctl is-active $COMPANION || true); cua=$(systemctl is-active vlab-cua-node || true)
log "swap core dist $OLD -> $NEW (companion=$companion cua-node=$cua)"
test -e $B/openclaw-96-$OLD || cp -a $CORE $B/openclaw-96-$OLD
t0=$(date +%s)
bash $HERE/cua-node-shared-vlab.sh stop; systemctl stop $COMPANION 2>/dev/null || true; systemctl stop $UNIT
rsync -rlt --checksum --delete $PKG/dist/ $CORE/dist/; chown -R $U: $CORE/dist
for b in $BUNDLED; do rsync -rlt --checksum --delete $PKG/node_modules/@openclaw/$b/ $CORE/node_modules/@openclaw/$b/; chown -R $U: $CORE/node_modules/@openclaw/$b; done
(cd $PKG && grep -E '  (dist/|node_modules/@openclaw/)' $SUMS) | (cd $CORE && sha256sum -c --quiet) && log "   dist + bundled @openclaw/{$(echo $BUNDLED | tr ' ' ',')} verified ($(grep -cE '  (dist/|node_modules/@openclaw/)' $SUMS) files)"
if [ -n "$CODEX" ]; then
  CDIR=$(ls -dt $I/state/npm/projects/*/node_modules/@openclaw/codex | head -1)
  test -e $B/codex-before-$(date +%Y%m%dT%H%M%S) || cp -a $CDIR $B/codex-before-$(date +%Y%m%dT%H%M%S)
  src=$(mktemp -d); tar -xzf $CODEX -C $src
  rsync -a --checksum --delete --exclude=/node_modules/ $src/package/ $CDIR/
  (cd $src/package && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $B/evidence/overlay-codex.want
  (cd $CDIR && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $B/evidence/overlay-codex.have
  cmp -s $B/evidence/overlay-codex.want $B/evidence/overlay-codex.have || { log "   codex overlay mismatch"; exit 1; }
  chown -R $U: $CDIR; rm -rf $src; log "   @openclaw/codex <- $(basename $CODEX) (files verified)"
fi
systemctl reset-failed $UNIT 2>/dev/null || true; t1=$(date +%s); systemctl start --no-block $UNIT
until journalctl -u $UNIT --since "@$t1" --no-pager -o cat | grep -c "\[gateway\] ready" >/dev/null; do
  s=$(systemctl show -p ActiveState --value $UNIT); [ "$s" = failed ] && { log "unit failed"; exit 2; }; sleep 3; done
t2=$(date +%s); echo $t2 > $B/swap-ready.epoch; log "   READY_EPOCH=$t2 downtime $((t2-t0))s"
[ "$cua" = active ] && bash $HERE/cua-node-shared-vlab.sh start $N24 && log "   vlab-cua-node restarted"
[ "$companion" = active ] && systemctl start $COMPANION && log "   companion restarted"
log "   version $($N24 $CORE/dist/index.js --version | head -1)"
