# V production sentinel

Runs on the production host itself, on a two-minute systemd timer, and alerts
to Feishu. Alerts go to the dedicated Heartbeat group chat by default (set on
2026-09-24 at Tianyi's request); override with `V_SENTINEL_ALERT_CHAT`, or set
it empty and use `V_SENTINEL_ALERT_TO` for a direct message instead. Installed at `/opt/v-sentinel/`, state in `/var/lib/v-sentinel/`.

    sudo install -m 0755 sentinel.py /opt/v-sentinel/sentinel.py
    sudo install -m 0644 v-sentinel.{service,timer} /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable --now v-sentinel.timer

## The failure it exists for

On 2026-09-20 a config hot reload closed the Worker pool and left it closed for
161 minutes. Every ordinary health signal stayed green the whole time: systemd
reported the service `active`, the health endpoint returned 200, and the restart
count stayed at 0. Meanwhile every request died in 2ms and users across several
Feishu groups saw "Agent couldn't generate a response". Nobody noticed until a
user asked why their groups had gone quiet.

Two design rules follow from that, and both matter more than the thresholds:

**It does not ask the Gateway whether the Gateway is healthy.** It counts worker
processes with `ps` and reads the journal. The unit file deliberately has no
`After=openclaw-gateway.service`.

**Alerts do not travel through the thing being watched.** `feishu()` reads the
app credentials from the OpenClaw config and calls the Feishu API directly over
HTTPS. When the Gateway is the broken component, the alert still goes out.

## Rules

| Alert | Fires on | Why that threshold |
| --- | --- | --- |
| pool empty | 0 worker processes, one sample | `close()` is terminal. The pool never returns on its own, so there is nothing to wait for. |
| pool closing | any `worker pool is closing` in 3 min | The same outage seen from the request side. |
| unit down | `systemctl is-active` not `active` | |
| stalled | 8+ stalled requests, two samples running | Baseline measured across three separate hours of real traffic on 2026-09-20: exactly 0. Two samples to skip a single burst. |
| disk / memory | under 15 GB / 2 GB | |

Every rule latches: it fires once on the way in, stays quiet while the condition
persists, and sends a recovery message on the way out.

## No-worker mode (OpenClaw 9.6+)

On 9.6 V can run without the Worker pool: agent turns run inside the Gateway on
the native `openclaw` runtime and `vlab-agent-worker-isolation` is disabled
(converted by `scripts/upgrade-mirror/noworker96-config.mjs`). Zero worker
processes is then the normal state, so **pool empty** and **pool closing** stand
down; unit down, stalled, crashes, restarts, cut-off replies, disk and memory are
unchanged.

The mode is read from the same `openclaw.json` the alerts already read: worker
mode while `plugins.entries.vlab-agent-worker-isolation` is not
`enabled: false` or any `agentRuntime.id` is still `vlab-worker`; no-worker
mode only when the config positively says so. An unreadable config keeps the
worker rules. `V_SENTINEL_MODE=worker|no-worker` overrides. A mode switch sends
one notice and clears any pool latch without a false "recovered" message.

What no-worker mode gives up: the pool-empty rule was the detector for "every
signal green, nothing served" (2026-09-20). That exact failure cannot happen
without a pool, but nothing yet replaces it for other causes of the same shape.
`received` and `complete` are already sampled (see the JSON line each run) and
are the candidates for a replacement rule once their no-worker baseline is
measured.

Tests: `python3 -m unittest discover -s scripts/v-sentinel -p 'test_*.py'`.

## Verifying it without breaking production

The rule layer takes its sample from one function, so it can be driven with
synthetic readings. Point `STATE_PATH` at a temp file, replace `feishu` with a
collector, replace `sample` with a fixture, and call `main()` once per scenario.
Doing this after any change is worth more than reading the diff: it is how the
"fires once, recovers once, does not repeat" behaviour was confirmed.

## What it still does not catch

Whole-host failure. If the machine goes down, nothing here runs. That needs an
off-box check. A user message that gets no reply is only partly covered: the
saturation case is visible, but an agent deciding a group message needs no reply
looks identical in the logs and is normal behaviour.
