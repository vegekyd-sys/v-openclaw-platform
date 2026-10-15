#!/usr/bin/env bash
# Move planned batches one at a time: copy+verify to vdb, pack+verify on COS,
# re-plan, then delete originals only if every check passed. Stops at the first
# failure. Run as root on V, detached so an ssh drop does not kill it:
#   systemd-run --unit=legacy-trajectory-archive --property=Nice=19 \
#     --property=IOSchedulingClass=best-effort --property=IOSchedulingPriority=7 \
#     /srv/openclaw-data/disk1/legacy-sessions-archive/bin/run_batches.sh 2026-09-a 2026-06-a ...
set -euo pipefail
A=/srv/openclaw-data/disk1/legacy-sessions-archive
W=$A/work
cd /tmp
for b in "$@"; do
  echo "== $b start $(date -Is)"
  python3 "$A/bin/copy_verify.py" --plan "$W/plan-20261016.json" --names "$W/$b.names" \
    --manifest "$W/$b.tsv" --rate-mb 20
  python3 "$A/bin/cos_pack.py" --manifest "$W/$b.tsv" --name "$b"
  runuser -u openclaw -- python3 "$A/bin/plan.py" > "$W/$b.fresh-plan.json"
  chmod 0600 "$W/$b.fresh-plan.json"
  python3 "$A/bin/remove_sources.py" --manifest "$W/$b.tsv" --fresh-plan "$W/$b.fresh-plan.json"
  python3 "$A/bin/remove_sources.py" --manifest "$W/$b.tsv" --fresh-plan "$W/$b.fresh-plan.json" --apply
  runuser -u openclaw -- python3 "$A/bin/measure_budget.py"
  echo "== $b done $(date -Is)"
done
