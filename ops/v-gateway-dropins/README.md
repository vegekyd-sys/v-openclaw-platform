# V Gateway drop-ins kept in git

Byte copies of systemd drop-ins on production V (`/etc/systemd/system/openclaw-gateway.service.d/`)
that are not written by a release or an install script.

| File | Purpose | History |
|---|---|---|
| `90-firsttext-pipeline.conf` | `OPENCLAW_FIRSTTEXT_WORKER_PHASES=1`: Workers log `[firsttext-worker-phases]` stage times used by the 首字 analysis | Written 2026-09-09 under `/run/systemd/system/` (lost on host reboot). Moved byte-identical to `/etc` on 2026-10-07 17:50 CST with Tianyi's approval; `daemon-reload` only, Gateway not restarted (PID unchanged), variable still in the unit's Environment. |

The release drift sentinel tracks release files and the effective `ExecStart`, not individual drop-ins:
compare these against V with `sudo sha256sum` when auditing. systemd applies drop-ins in file name
order and the last `ExecStart=` wins (see `scripts/node-async-context-frame.mjs`); `Environment=` lines
accumulate unless an empty `Environment=` resets them, and none of V's drop-ins does.
