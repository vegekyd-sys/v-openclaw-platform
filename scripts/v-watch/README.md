# V production health sentinel

A read-only probe for the production OpenClaw host. `watch.py` runs locally, ships
`sample.sh` over SSH every cycle, and turns the returned key=value lines into
alerts. It generates no synthetic traffic: every latency and failure number is
measured passively from log lines that real user traffic already produced.

    python3 watch.py          # from this directory; expects an `ssh v` alias

## Why each rule exists

These thresholds are not guesses. Each one was added after a real incident that
the probe had missed, and several were corrected after producing false alarms.

| Rule | Fires on | Incident it came from |
| --- | --- | --- |
| `OUTAGE` pool empty | 0 worker processes, one sample | 2026-09-20, a config hot reload called `close()` on the worker pool. `close()` is a one-way door, so the pool never rebuilt. The Gateway stayed `active`, health returned 200 and `NRestarts` stayed 0 for 161 minutes while every request died in 2ms. |
| `OUTAGE` pool closing | any `worker pool is closing` in the window | Same incident, seen from the request side. |
| `SATURATED` | 3+ stalled requests, two windows running | 2026-09-20, an hour later. One agent fanned out 45 video-generation runs, pinned the pool at 15/15 and pushed event-loop P99 to 20.7s. Group messages reached `dispatching` and never reached `dispatch complete`. |
| `SLOW` | TTFT over 20s, banded | 2026-09-18 first-token regression. |
| `EGRESS` | over 30 Mbps sustained | 2026-09-18. The Live Board pulled 27.6MB of raw JSON every 10s and saturated the host's 50 Mbps uplink. The cap is 50, not the 3 an earlier version of this file wrongly assumed. |
| `CALLFAIL` | user-facing failure rate over a rolling hour | Needs a denominator. An earlier version called 4 failures a rising trend when they were 0.37% of 1069 calls. Background runs (`announce`, `workboard`, `nightshift`, `internal-session-effects`, `skill-workshop`) are counted separately because one of them fails 36-79 times an hour on its own. |

The `SATURATED` threshold is low because the baseline is genuinely zero. Across
three separate hours of real production traffic on 2026-09-20 (10-11, 14-15,
18-19) all three stall counters read exactly 0, and they jumped to 18.9 / 0.4 /
3.0 per 70s window the moment the pool filled.

## Sampling constraints

`sample.sh` runs on the production host, so it is deliberately cheap and cannot
be allowed to become a second source of load:

- No `set -e` or `pipefail`. A `grep` that matches nothing must not abort the
  sample, and `grep -q` in a pipeline raises SIGPIPE 141 which once made a
  readiness probe never fire.
- No recursive `grep`, no whole-disk `du`. A recursive grep has taken the host
  down before.
- Parse `systemctl show` output by property name. It orders `--value` output its
  own way, so positional reads silently swap fields.
- Confirm a bad health code with a second, longer request before believing it.
  One service swings from 11ms to 1.6s and a single 4s curl reported it dead.
- The local side multiplexes SSH (`ControlMaster`). Without it, handshake time
  alone once reached 114s and was misread as host contention.

## What it still cannot see

A user sending a message and getting no answer is only partly covered. The
saturation case is now visible. The case where the agent decides a group message
needs no reply looks identical in the logs and is normal product behaviour, so
it is deliberately not alerted on.
