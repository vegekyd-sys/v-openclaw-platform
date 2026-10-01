#!/usr/bin/env bash
# Bring V's memory_search index up to date with the memory files on disk.
#
# Since the 2026-09-11 query-isolation patch, memory_search opens a read-only
# "search" manager that never watches files or syncs on search, and nothing else
# ran `openclaw memory index`. The makaron index stopped at the 2026-09-28 trigram
# rebuild: on 2026-10-02 it still served 949 files the Librarian had archived and
# missed 90 new ones (docs/memory-search-latency-quality-20261002.md).
#
# This is an incremental `openclaw memory index` (no --force): unchanged files are
# skipped by content hash, embeddings come from the embedding cache, and only new
# or changed chunks call the embedding API. It runs the exact code, config, user
# and environment of the running Gateway, read from /proc, so it can never index
# with a different OpenClaw build than the one that serves memory_search.
#
#   v-memory-index.sh [agent...]      default agent: makaron
set -euo pipefail

agents=("$@")
[ ${#agents[@]} -gt 0 ] || agents=(makaron)

pid=$(systemctl show -p MainPID --value openclaw-gateway.service)
if [ -z "$pid" ] || [ "$pid" = 0 ] || [ ! -r "/proc/$pid/cmdline" ]; then
  echo "openclaw-gateway is not running; skipping memory index" >&2
  exit 0
fi

mapfile -d '' argv < "/proc/$pid/cmdline"
node=${argv[0]}
entry=
for arg in "${argv[@]:1}"; do
  case $arg in */dist/index.js) entry=$arg; break ;; esac
done
[ -x "$node" ] && [ -f "$entry" ] || { echo "cannot resolve Gateway node/entry from /proc/$pid/cmdline" >&2; exit 1; }

# The Gateway's own environment (config path, provider keys, db91 switches), minus
# anything that would make the CLI talk to or impersonate the Gateway service.
mapfile -d '' genv < "/proc/$pid/environ"
cli_env=()
for kv in "${genv[@]}"; do
  case ${kv%%=*} in
    OPENCLAW_GATEWAY_PORT|OPENCLAW_SYSTEMD_UNIT|OPENCLAW_SERVICE_*|NODE_OPTIONS|INVOCATION_ID|JOURNAL_STREAM|NOTIFY_SOCKET|LISTEN_*) ;;
    *) cli_env+=("$kv") ;;
  esac
done

user=$(stat -c %U "/proc/$pid")
rc=0
for agent in "${agents[@]}"; do
  started=$(date +%s)
  if runuser -u "$user" -- env -i "${cli_env[@]}" "$node" "$entry" memory index --agent "$agent"; then
    echo "memory index $agent ok in $(( $(date +%s) - started ))s"
  else
    rc=$?
    echo "memory index $agent failed rc=$rc after $(( $(date +%s) - started ))s" >&2
  fi
done
exit $rc
