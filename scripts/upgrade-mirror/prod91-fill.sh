#!/usr/bin/env bash
# Fill the production 9.1 baseline with warm-worker samples: warm every worker
# first, then c1 x3, c5 x3, c15 x2.
set -uo pipefail
R=/srv/versa-mirror95; N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
cd $R/workspace
b() { VERSA_UNIT=versa-mirror95-gateway.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tail -1 | grep -oE "\"(label|finals|errors|firstTextMs|totalMs|peakWorkers)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
echo "$(date +%T) warm"; b 10 f91-warm1; sleep 30; b 10 f91-warm2; sleep 30
for i in 1 2 3; do b 1 f91-c1-$i; sleep 20; done
for i in 1 2 3; do b 5 f91-c5-$i; sleep 30; done
for i in 1 2; do b 15 f91-c15-$i; sleep 45; done
echo "$(date +%T) done"
