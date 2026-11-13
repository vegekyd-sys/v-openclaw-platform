# usage-offload — usage reports no longer freeze the Gateway

V's Gateway stopped answering on every channel from 22:00:22 to 22:08:34 CST on
2026-11-12. `journalctl` shows no Gateway output in that window, then
`[ws] ⇄ res ✓ usage.cost 468515ms` and
`host timing gap detected: process was frozen ~487118ms`, with
`memory pressure: level=critical rss=10.1 GiB heap=8.4 GiB`. The stall then
ended in the DingTalk 400 crash (fixed separately by dingtalk-socket-guard,
PR #602).

## Who called it

`journalctl _COMM=sudo` shows an operator agent session (logged in as
`ubuntu`, running commands as `openclaw`) checking subscription quotas with
`openclaw gateway call`:

- 21:57–21:58: `sessions.usage` ×3 and `usage.cost {"days":1}`, all rejected
  for missing `agentId`.
- 22:00:00: `usage.cost --params {"agentId":"makaron","days":1}`. This call
  ran for 468 s.

It was not the Control UI. `[ws] res` lines are printed only for failures or
calls of 50 ms or more (`logWsOptimized`), which is why this is the only
`usage.cost` line since 11/01.

## Why one day took 8 minutes on the main thread

All of this happens in 9.1's `session-cost-usage-C_mE_GAE.js`, synchronously,
whatever date range is requested:

1. `readUsageCostRollups` reads every stored rollup and parses each row.
   makaron has 6,214 rows holding 457 MB of JSON. All were written on 9/27 and
   never refreshed since.
2. `listUsageCountedTranscriptStats` runs
   `SUM(OCTET_LENGTH(event_json))`/`COUNT`/`MAX(seq)` once per session, for
   all 25k makaron sessions, on the 39 GB database (cold reads). It also stats
   the 24k legacy JSONL files.
3. Stale rollups queue a refresh (`setTimeout 0`, same thread). The refresh
   repeats steps 1 and 2, prunes, then loads each stale transcript whole with
   `loadTranscriptEventRowsAfterSeqSync`, including the 310 MB / 44.5k-event
   direct session.

The answer went out at 22:07:51. The refresh kept the loop blocked for another
43 s until the crash, so it never wrote a row.

Upstream rewrote this area after 9.1 (96 commits). The fix for exactly this,
#197482 "stop usage summaries from scanning entire agent databases", merged on
2026-11-11, and it sits on a database worker infrastructure 9.1 does not have.
9.1 has no setting that bounds the work. The port below keeps 9.1's code and
data format and moves the work off the main thread.

## Change (marker `usage-offload-v1`)

Source: openclaw-versa `versa/port-usage-offload-20261113` @ `d25de0a30ff`.

- **Off the main thread.** `usage.cost`, `sessions.usage` (and its
  timeseries and logs) and the `/usage cost` command import their readers
  from the new `usage-offload-v1.js`. That module forwards each call over IPC
  to one worker process, `usage-offload-child-v1.js`. The worker inherits the
  Gateway's node flags without `--inspect` or the heap size. It gets
  `--max-old-space-size=4096` (`OPENCLAW_USAGE_OFFLOAD_HEAP_MB`), nice 19 and
  ionice idle. It exits a minute after its last call
  (`OPENCLAW_USAGE_OFFLOAD_IDLE_MS`) once its refresh queue drains, and
  immediately when the Gateway's IPC channel closes. If the worker dies, only
  its pending calls fail, and the next call starts a new worker. Each call
  times out after 10 min (`OPENCLAW_USAGE_OFFLOAD_TIMEOUT_MS`).
  `OPENCLAW_USAGE_OFFLOAD=0` runs the readers in-process again.
- **Bounded to the range.** A report lists and reads only transcripts changed
  since its start (for SQLite transcripts, `transcript_updated_at ??
  updated_at`; for files, mtime). A transcript last changed before the range
  has no usage inside it. 9.1's own sync rebuild already filters this way.
  The refresh a report queues carries that start. Requested-session refreshes
  skip the whole-agent listing. Pruning stays with unbounded refreshes.
  `OPENCLAW_USAGE_COST_WINDOW=0` restores whole-agent work.
- **Budgeted refresh.** A refresh run stops after 1 GiB of transcripts or
  5 min (`OPENCLAW_USAGE_REFRESH_MAX_BYTES`, `OPENCLAW_USAGE_REFRESH_MAX_MS`;
  `0` = unbounded) and yields between transcripts. The next report continues
  with the remaining stale files, smallest first. This bounds the page-cache
  churn of one report on V's 39 GB database.

Files (`lab/usage-offload.plan.json`, built by
`node lab/build-usage-offload.mjs --base <V bytes>`):

| target | change |
|---|---|
| `openclaw/dist/session-cost-usage-C_mE_GAE.js` | range bounds, refresh budget, `isCostUsageRefreshQueueIdle` export |
| `openclaw/dist/usage-C3nh9kcO.js` | readers imported from `usage-offload-v1.js` |
| `openclaw/dist/commands-session-cost.runtime-C4rqe689.js` | same for `/usage cost` |
| `openclaw/dist/usage-offload-v1.js` (new) | IPC proxy and worker lifecycle |
| `openclaw/dist/usage-offload-child-v1.js` (new) | worker entry |

## Evidence

RESULTS_PLACEHOLDER

## Not covered / follow-ups

- `sessions.usage` still builds its session list on the main thread with
  `loadCombinedSessionStoreForGatewayCore`, the same cost as `sessions.list`
  (about 6 s on V).
- The startup heap spike (8–12 GiB about a minute after `ready`; 11/10, 11/11
  OOM ×3, 11/12) is **not** `usage.cost`. None of those startups had a usage
  call, either in the sudo log or as a `[ws] res` line in the surviving
  processes. Every spike follows a Feishu DM dispatched to one of the two huge
  /vds sessions (ou_0674d5a6, 310 MB; ou_52b437fd, 88 MB), whose codex harness
  turn runs in the Gateway process. On 11/12, 22:18:35.6 "你还活着么" was
  followed by 60 s of silence,
  `slow SQLite session write criticalSectionMs=50675` and heap 8.31 GiB.
  This needs its own investigation.
