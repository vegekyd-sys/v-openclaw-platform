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

Source: openclaw-versa `versa/port-usage-offload-20261113` @ `45b1333d152`
(two commits on `8f8b5ed3525`, the remote-node-stable port).

- **Off the main thread.** `usage.cost`, `sessions.usage`,
  `sessions.usage.timeseries` and `sessions.usage.logs` run as whole handlers
  in the worker for administrators without a session-visibility filter
  (timeseries and logs for every caller); only the reply crosses back.
  Filtered callers and the `/usage cost` command keep their handler and call
  the readers through the new `usage-offload-v1.js`. That module forwards each call over IPC
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
- **Chunked rollup reads.** Bounded reports, session summaries and refreshes
  read stored rollups 500 rows at a time. A bounded refresh keeps only the
  list of stale transcripts and re-reads each one's previous row right before
  scanning it, so memory does not grow with the session count.
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
| `openclaw/dist/usage-C3nh9kcO.js` | readers imported from `usage-offload-v1.js`; RPCs wrapped to run whole in the worker |
| `openclaw/dist/commands-session-cost.runtime-C4rqe689.js` | same for `/usage cost` |
| `openclaw/dist/usage-offload-v1.js` (new) | IPC proxy and worker lifecycle |
| `openclaw/dist/usage-offload-child-v1.js` (new) | worker entry |

## Evidence

- `lab/usage-offload.test.mjs` (CI, 8 tests): plan and markers. It runs the
  shipped `usage-offload-v1.js` / `usage-offload-child-v1.js` against stub
  readers and handlers in a real child process: readers and a whole RPC answer
  from another pid; `--inspect` is stripped and `--max-old-space-size=4096` is
  set; non-cloneable config is dropped; a dead worker fails its calls and the
  next call starts a new one; an idle worker exits; `OPENCLAW_USAGE_OFFLOAD=0`
  runs in-process. The budget and window switches are evaluated from the
  patched chunk itself.
- openclaw-versa tests: `session-cost-usage.test.ts` adds "reads only
  transcripts changed inside the report range", "stops a refresh run at its
  byte budget…" (both fail on 9.1) and "sums reports and session summaries
  across rollup read chunks" (1,001 transcripts).
  `session-cost-usage-offload.test.ts` (5) and `usage-offload.test.ts` (3)
  are new. Existing infra usage tests pass (100), as do gateway usage tests
  (46) and `/usage cost` command tests (15).
- **V-scale candidate repro** (`lab/candidate/usage-offload-{old,new}.plan.json`,
  `usage-offload-repro.mjs`). Base: a consistent copy of shared VLab's makaron
  database (3,824 sessions). Setup grows it deterministically to 25,000
  sessions, 1.4M synthetic events, a 310 MB / 70.6k-event and an 88 MB
  session, and 4,260 stale stored rollups (457 MB of JSON); the database ends
  at 14.8 GB. As on V, setup's first open records the DB91 integrity receipt
  and later processes reuse it. A Gateway stand-in loads the runtime's real
  `usage-C3nh9kcO.js`, runs with V's flags (`--experimental-async-context-frame`,
  7 GiB heap) and calls the handlers as `openclaw gateway call` does:
  1. P1 is the incident request: makaron, one day (2026-11-12, UTC+8).
  2. Then a 2-minute watch.
  3. P1 is repeated until `fresh`.
  4. P2 (30 days, the Control UI default) is repeated until `fresh`.
  5. Finally one `sessions.usage` call (limit 1000).

| | old (V's bytes) | new (usage-offload-v1) |
|---|---|---|
| incident request P1 | 131 s, event loop stalled 125.6 s | 39 s in the worker; the only Gateway gap is the 3.7 s dist import\* |
| after the answer | refresh on the Gateway thread: stalls of **393 s** and 203 s | Gateway loop max 4 ms while the worker refreshed |
| 30-day P2 | 189 s with a 28 s stall (after the full refresh) | backfill in 1 GiB runs across 16 calls of 80–167 s each, Gateway loop max 36 ms; warm call 81 s in the worker |
| `sessions.usage` (limit 1000) | 287 s, stall **186 s** | 182 s in the worker, Gateway loop max 10 ms |
| Gateway event loop over the whole run | max 393 s, 6 stalls over 1 s | p99 22 ms, max 116 ms\* |
| Gateway heap / RSS peak | 4.86 GiB sampled / 6.2 GiB | 145 MiB / 236 MiB |
| worker RSS peak | — | 4.25 GiB (heap limit 4 GiB, no crash) |
| P1 totals and daily | 3,768,820,019 tokens, $195.4735 | **identical** |
| P2 totals and 30 daily rows | 55,988,446,995 tokens, $3,034.0756, 420 missing-cost entries | **identical** |
| `sessions.usage` totals | $3,034.075624860007 | **identical** |

\* The one gap over 1 s in the new arm (3.7 s) is the stand-in importing the
dist before its first request; the timer started before the import.

The first new-arm run, which offloaded readers only, found two problems. The
worker hit its 4 GiB limit 11 times on the 30-day report: the report and its
refresh each parsed every in-range rollup. `sessions.usage` still
deserialized 19k session summaries on the Gateway thread (13 s, 1.4 GiB). The
chunked rollup reads and whole-RPC offload above fix both; the table is the
second run.

## Deploy

Core dist files plus two new files; takes effect at the next Gateway start
(the handlers are loaded at boot). Ship with `scripts/promote-to-v.mjs` using
`lab/usage-offload.plan.json` (`baseRelease` set at stage). After the start:

- `openclaw gateway call usage.cost --params '{"agentId":"makaron","days":1}'`
  as an admin. Gateway `[ws] ⇄ res ✓ usage.cost` comes back, and no `host
  timing gap` / `liveness heartbeat delayed` appears; a
  `usage-offload-child-v1.js` process exists while it runs, at nice 19, and
  exits a minute later.
- Rollback: `OPENCLAW_USAGE_OFFLOAD=0` (worker off),
  `OPENCLAW_USAGE_COST_WINDOW=0` (whole-agent reads), budget variables `0`,
  or restore the three files and drop the two new ones.

Known costs:

- A report's first open of the agent database in a new worker reuses the
  Gateway's DB91 integrity receipt. After 26 h of Gateway uptime the receipt
  has expired, and the first new process to open the database (worker, or a
  recycled vlab-worker) runs the full check once and records a new receipt.
  That happens in the worker, not on the Gateway thread.
- On V's 39 GB database the first 30-day backfill reads tens of GB of
  transcripts across many reports (1 GiB per run, ionice idle). A 30-day
  report still counts every in-range session's transcript rows
  (`SUM(OCTET_LENGTH)`), about 80 s for 19k sessions in the worker.

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
