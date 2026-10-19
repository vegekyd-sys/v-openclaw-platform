# Bounded branch list

Status: candidate only (2026-10-19). Not merged, not on shared VLab, not on V.

## What prompted it, and what it does not fix

On 2026-10-19 02:20:31 CST a Control UI connection on V (conn 5691098d) got
`chat.history` back after 49,655 ms and `sessions.branches.list` after 49,700 ms;
the Gateway reported `liveness overdue=43394ms`, RSS 7.55 GiB, heap 4.24 GiB.
The working assumption was that the UI opened a very large session and these two
reads parsed its whole transcript. The evidence says otherwise:

- The session was `agent:makaron:main` (the same second, `tools.effective` logged
  `sessionKey="agent:makaron:main"`). Its only window has 656 rows / 1.2 MB, last
  written 2026-10-05; it has no child sessions and no Claude CLI binding.
- A private Gateway on V's runtime with the whole shared makaron database
  (7.3 GB, 4,298 sessions), V's DB91 integrity gate and the Control UI's own
  request order (`lab/candidate/control-ui-open-repro.mjs`, candidate
  dd1f1f2f) answers the same open in 58–82 ms (`chat.history`) and 62–112 ms
  (`sessions.branches.list`). The two largest real VLab sessions answer in
  under 0.9 s each.
- The makaron integrity receipt was last written at Gateway start (10-18 17:22),
  so no full integrity check ran at 02:21; there is no revocation marker.
- Both replies finished 45 ms apart, right after the block ended: they queued
  behind a 43 s main-thread block, they did not cause it. Things in the same
  window: a phone-app node (8885c3…, commands `screen.record,chat.push,camera.*,
  contacts.add,calendar.add,reminders.add`) connected at 02:20:29 for the only
  time in two days, just before the Control UI requests; the hourly cron
  `companion-01-hourly-heartbeat-lite` started at 02:20:03 with +870 MiB RSS and a
  1.3 s stall. The 43 s block is still unexplained and is a separate follow-up.

`chat.history` is already bounded on V (projection pages, 6 MB budget); it needs
no change. `sessions.branches.list` does read every row of the current window.

## Change

`sessions.branches.list` built its tree from `loadTranscriptEventsFromDatabase`,
i.e. `JSON.parse` of every row, base64 images included, on the Gateway main
thread. The tree only needs navigation facts. This patch:

- reads rows through the native `reset-boundary` SQL projection (navigation keys,
  `timestamp`, `firstKeptEntryId`, `message.role`; key presence preserved), plus
  the seq list, inside one deferred read snapshot;
- keeps the tree scan, tip selection, ordering and message counts as before;
- resolves a branch headline lazily: nearest user/assistant message on the path,
  tip first, whose text is non-empty. Only those rows are read and parsed, by seq,
  in the same snapshot.

The cache, its watermark, the RPC handler and every other caller are unchanged.
`summarizeSessionBranches` stays in the chunk unused.

Upstream (openclaw/openclaw main) did the same in
`src/config/sessions/session-accessor.sqlite-branch-summaries.ts` (navigation SQL +
selected headlines), and additionally moved it into a transcript worker with
append-incremental reuse. Their navigation projection relies on a new stored
`navigation_json` column, so it is not backported; V's existing `reset-boundary`
projection gives the same facts without a schema change.

## Files

- `patch-bounded-branch-list.mjs`: the transformation; refuses patched input and
  missing anchors.
- `build-bounded-branch-list.mjs`: builds from V's bytes, which are the
  mirror-facts-identity release (`30c7b9d6…`, checked against V core/dist on
  2026-10-19). Output `release-files/bounded-branch-list/`, plan
  `bounded-branch-list-plan.json` (after `a141e646…`).
- `bounded-branch-list.test.mjs`: mechanical and drift checks.
- `candidate/branch-summary-equivalence.mjs`: property check on the real
  transcript-tree module, 20,000–30,000 random trees (forks, leaf controls,
  resets, side appends, parentless rows, duplicate ids, forward/missing parents,
  cycles): identical results.
- `candidate/big-session-history-*.mjs`: A/B on V-scale sessions and on the whole
  shared database; `candidate/control-ui-open-repro.mjs`: the Gateway reproduction.

## Results

See `experiments/bounded-branch-list-20261019.json`.

V-scale fixture (candidate 00a558a2): one 21,834-row / 284 MB session with no
compaction (V's 9e7ce112 has 20,788 messages after its last boundary) and one
26,229-row / 149 MB session with 417 branch tips. Two alternating rounds, each
op in a fresh process:

| op | V | bounded |
| --- | --- | --- |
| branches.list, 284 MB session, main-thread block | 1,323–1,348 ms | 938–1,071 ms |
| branches.list, 417 tips, main-thread block | 1,289–1,338 ms | 914–967 ms |
| open (history + branches), 284 MB session | 1,535–1,681 ms | 1,194–1,305 ms |
| peak RSS after branches.list | 681–695 MB | 438–440 MB |

All 20 replies are field-by-field identical.

Whole shared database (candidate 2c016cc4): the 150 largest current sessions plus
every current session with leaf controls, 217 sessions (151 with several branches,
up to 189 tips), each read by both arms in their own process: 217/217 replies
identical. Excluding the first read of each process (it includes the cold
database open and its full integrity check), total main-thread block 5,185 ms →
4,181 ms; for example 294 → 169 ms, 222 → 141 ms, 154 → 74 ms.

The remaining cost is SQLite
parsing the JSON text in the projection, still on the main thread; moving the
read into a worker (as upstream does) is the next step if this path matters.
