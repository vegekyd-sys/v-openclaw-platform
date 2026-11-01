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
| disk low | root `/` under 60 GB, data disk `/srv/openclaw-data/disk1` under 20 GB (only when that path is its own mount) | 2026-10-27: the root went from 172 GB free to 53 GB in six days after the 10-21 resize, 43 GB of it in one day. 15 GB is a few hours at that pace. |
| disk filling | at the rate free space fell over the last 6 h (one point per 10 min, needs ≥ 1 h of history), full within 24 h, two samples running | Catches a fast fill while there is still room; a cleanup that frees space clears it. |
| big new file | a file over 4 GB changed in the last hour under `/tmp`, `/var/tmp` or `workspace/tmp`, scanned every 30 min (~1 s on V), each inode reported once | 2026-10-27: a 7.3 GB 192 kHz WAV in `/tmp`, and one 7.4 GB Feishu zip downloaded twice in parallel. Cleanup list: `docs/v-disk-governance.md`. |
| plugin dir missing | any `plugins.load.paths` entry of the main or worker config absent on disk, every tick | 2026-10-09: a deleted plugin dir broke the worker config at once (48 turns failed in 22 min) and the main config silently (it would only have failed at the next Gateway start). |
| config invalid | `openclaw config validate` fails for either file, run every 10 min (≈2 s each) as `openclaw` with the unit's own node + `dist/index.js` | Catches the main config breaking long before a restart exposes it. A validator timeout is not reported. |
| worker invalid config | any `Worker Agent request failed … InvalidConfigError` in 3 min | Each one is a user turn that got an error card before reaching the model. |
| session disk budget near / over | every 10 min, makaron-style measurement of each `agents/<id>/sessions` store (top-level files + prompt blobs + agent SQLite + WAL, ~0.6 s on V) at ≥ 85% / > `session.maintenance.maxDiskBytes` | 2026-10-15: over budget, 9.1's enforcement pass held the session writer queue and no Feishu message reached an agent for 30 min. V had been at 97–98% of the 32 GiB budget for days; the DB grows ~0.4 GB/day. |
| session disk budget exhausted | the Gateway's `session history disk budget exhausted` warning (disk-budget-stall-v1 patch) | Cleanup removed everything it may and the store is still over budget. |
| ingress stalled | any Feishu `claim→adoption stalled` event in 3 min (one event logs two lines; counted once) | Each is a user message nobody started on for 5 minutes. |

Every rule latches: it fires once on the way in, stays quiet while the condition
persists, and sends a recovery message on the way out.

Inter-session collaboration turns (`sessions_send` through the channel inbound
bridge, `docs/inter-session/design.md`) are not people. Their runIds, synthetic
message ids and MessageSids start with `v-a2a-` / `v-a2a:` and their Feishu
`[firsttext-e2e.1]` record says `origin: "inter_session"`. The slow-first-reaction
and slow-dispatch waits, the per-conversation dispatch failures and the ingress
stall count leave them out; BUSY attempts (zero output, retried later) are such
turns too. The core's `message dispatch completed` line names no message, but
the `message processed … outcome=error` line it writes right after (same
session, a few ms later) carries the MessageSid, which is `v-a2a:…` for a relay
turn; the sentinel pairs the two. A failed dispatch writes no
`[firsttext-e2e.1]` record, so that record cannot be used to recognise it.
Cut-off replies keep room turns: people in that chat watched the answer stop.

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
