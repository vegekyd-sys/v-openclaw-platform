# V session archive

Daily job on V that archives finished Night Shift sub-agent sessions older than
7 days, so the number of unarchived sessions stays well under the 10,000 the
Workboard lifecycle sweep reads.

Installed at `/opt/v-session-archive/`. It runs as `openclaw` from
`v-session-archive.timer` at 05:50 CST. The last run's summary is in
`/var/lib/v-session-archive/last-run.json`, and the full log is in
`journalctl -u v-session-archive`.

## Why it exists

The Workboard lifecycle sweep (`extensions/workboard`, `WORKBOARD_SESSION_SWEEP_LIMIT = 1e4`)
lists at most 10,000 sessions. Only a sweep that saw every session can fail a
prepared card whose session never appeared.

OpenClaw keeps the unarchived count under that with `session.maintenance`, whose
defaults are `mode: enforce` and `maxEntries: 5000`. Since 2026-10-15, V has run
`mode: warn` to stop the disk-budget enforcement from holding the session
writer queue (the 10-15 ingress stall). That also stopped count and age cleanup.

By 2026-11-18 makaron had 22,869 unarchived sessions. 20,507 of them were
`:subagent:workboard-` rows, and 16,539 of those were older than 7 days.

In 9.1, `pruneAfter` and `maxEntries` *delete* sub-agent rows. Upstream later
switched to archiving them. Tianyi's rule is not to lose history, so this job
archives instead. It calls the official `sessions.patchMany` (at most 100
targets, `expectedSessionId` required) with `{archived: true}`.

What archiving does:
- It sets `archivedAt`.
- The transcript and entry stay, and the session can still be read by key.
- It is reversible with `{archived: false}`.

The default `sessions.list`, and therefore the Workboard sweep, no longer sees
an archived session. A card whose session the sweep does not see is skipped.

## What it archives

A session is archived only when all of these hold:

| Rule | Why |
|---|---|
| The key contains `:subagent:workboard-` and the session is unarchived. | Only Night Shift worker sessions. Chats, groups and main sessions are never touched. |
| The session status is `done`, `failed`, `killed` or `timeout`. | Nothing is running on it. |
| `updated_at` and `last_activity_at` are both older than 7 days. | |
| Every Workboard card pointing at it is `done` or archived. | A `blocked`, `ready`, `review` or `todo` card can be retried on the same session. |

On 2026-11-18 that matched 16,051 sessions. 487 were kept because their card
was still open. Selection is read-only and takes 0.35 s on V.

## How it writes

Writes go through `openclaw gateway call sessions.patchMany`, using the
Gateway's own node and `dist/index.js` as `openclaw`.

Each nightly run:
- archives oldest first, in batches of 25 with a 3 s pause between them;
- archives at most 3,000 sessions and runs at most 30 minutes;
- stops at once if a call fails or a batch takes more than 15 s;
- counts per-session errors (for example "still active") and carries on.

## Watching it

The sentinel (`scripts/v-sentinel`) counts unarchived sessions per agent every
10 minutes, read-only. It alerts above 8,000. That means this job has stopped
working while there is still room before 10,000.

## Install

```bash
scripts/install-v-session-archive.sh v
```

This installs the job and does a dry run. It does not enable the timer.

```bash
scripts/install-v-session-archive.sh v --enable
```

This also enables the daily timer.

Manual runs on V:

```bash
sudo -u openclaw -H python3 /opt/v-session-archive/archive.py
```

This is a dry run.

```bash
sudo systemctl start v-session-archive.service
```

This runs one real pass with the unit's limits.

To undo one session:

```bash
openclaw gateway call sessions.patch --params '{"key":"…","expectedSessionId":"…","archived":false}'
```
