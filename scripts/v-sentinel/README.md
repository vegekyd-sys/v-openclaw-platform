# V production sentinel

Runs on the production host itself, on a two-minute systemd timer, and alerts
to Feishu. Installed at `/opt/v-sentinel/`, state in `/var/lib/v-sentinel/`.

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
