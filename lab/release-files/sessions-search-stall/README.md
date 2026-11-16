# sessions-search-stall — one sessions_search froze the Gateway main thread for 27–30 s

## Symptom (production V)

Feishu ingress catch-up logs `event loop stalled Ns` almost daily, and on 11/16 the stalls grew:
10:52 15 s, 14:41 24 s, 14:51 24 s, 16:15 29 s, 17:00 20 s, 18:43 20 s, 18:53 55 s, 19:18 27 s
(11/13: 47 s / 40 s; 11/14: 39 s). At 18:53 the liveness warning read `eventLoopUtilization=0.95
cpuCoreRatio=0.459`: the thread was busy but used half a core, i.e. it was waiting on reads.

## Evidence: one CPU profile on V (Tianyi's authorisation, 2026-11-16)

V8 sampling profile of the Gateway main thread (pid 2624185) through its existing inspector, 10 ms
interval, 19:01:32 → 19:40:26 CST (223,701 samples). It covers the 19:18 stall
(`ingress catch-up (event loop stalled 27s)` at 19:18:40). The profile file was copied off V,
checksummed and deleted there; it is not in this repository.

Longest stretch without an idle sample: **19:18:03.4 → 19:18:33.3, 29.9 s**. Per second:

| time | what the samples are in |
|---|---|
| 19:18:03 → 19:18:16 | `sessions.list` with `visibilityRowsOnly` (`listVisibleSessions`): `loadCombinedSessionStoreForGatewayCore` list projection of every session (~5.2 s), `buildSubagentSessionListReadIndex` → `readSubagentSessionListRows` (~4.3 s), GC 10–20 % |
| 19:18:16 → 19:18:29 | `sessions.search` → `searchSessionTranscripts` → `listSessionsNeedingTranscriptIndexReconcile` → `StatementSync.next`: 93.6 % of the samples, in ~70 separate runs of 100–300 ms (the first 1.67 s), each followed by 1–4 samples of the FTS query |
| 19:18:29 → 19:18:33 | GC, then idle |

The first sample of the search is `listVisibleSearchSessions` in `openclaw-tools-BODVdJQD.js` (the
`sessions_search` tool) on the Gateway thread, and the journal has no `res ✓ sessions.list` /
`sessions.search` line for it: the tool ran inside the Gateway (a Codex/embedded run's tool) and
called the Gateway in-process.

What the tool does (V's bytes): two `sessions.list` calls (no agentId, then the requester's agent),
then `sessions.search` in chunks of `SESSIONS_SEARCH_MAX_SESSION_KEYS = 200` session keys. V's makaron
has 21,854 session nodes, so about 110 `sessions.search` calls. Each one starts with
`listSessionsNeedingTranscriptIndexReconcile(db)`, which joins every `session_windows` row (26,913 on
V) to its newest transcript row and its index state. An in-process Gateway call resolves through
promises only, so the listings and the ~110 calls run as **one** synchronous block.

Cost of that listing on V, read-only (`mode=ro`, `ionice -c3`, same node 22.23.1 / SQLite 3.51.3):
plan is index-only (`SCAN session_windows` covering, two `SEARCH transcript_events` PK probes per
window, the pending-eligibility partial index), 0 rows today, **22,807 distinct pages touched**
(~89 MB of a 42 GB file), 0.1 s with warm pages. In the Gateway each call took 0.1–0.3 s and the first
1.7 s; with V's disk at ~6 ms average read latency (sar 19:10–19:20: 550 tps, 25 MB/s reads,
active page reclaim) a mostly-cold pass costs seconds. The small-table part of the same predicate
touches ~1,800 pages.

What is expensive all the time, for comparison (whole 39-minute profile, 50.7 % non-idle):
SQLite write transactions 5.4 %, child-process spawn 3.3 %, secret redaction 3.4 %, transcript
broadcast 2.8 %, every `sessions.list` together 2.2 % (48 s; 6–7 s per call from Control UI and
workers, e.g. three at 19:02:32–19:03:01). These are spread out; the reconcile listing (13.6 s in
39 min) occurs almost only inside the 19:18 stall.

## Change (marker `sessions-search-stall-v1`)

Source: openclaw-versa `versa/port-sessions-search-stall-20261116` @ `3b96a73af08` (on `ca32fca3e29`).

- `session-transcript-search-pRB2YScP.js`: the caller checks only the small-table part of the
  dirty predicate (a window with transcript rows whose index state is missing, flagged
  `needs_rebuild`, or has active events of undecided context eligibility). The watermark clause
  (newest transcript row past `indexed_seq`), which needs the per-window transcript probes, runs on
  the reconcile preflight Worker's read-only connection at most once a minute per database; when it
  finds work it starts the reconcile, which is then reported as `indexing` while it runs.
  `OPENCLAW_V_TRANSCRIPT_SEARCH_LAG_OFFTHREAD=0` restores the whole listing on the caller.
- `session-transcript-reconcile-j5qhAafV.js`: the preflight Worker can skip the orphan scan (it reads
  the whole FTS table); `scanTranscriptIndexNeedsReconcile` (export `o`) runs only the dirty listing.
- `openclaw-tools-BODVdJQD.js`: `sessions_search` waits for a macrotask (`setImmediate`) before every
  Gateway call, so an in-process search is ~112 short tasks instead of one block.
  `OPENCLAW_V_SESSIONS_SEARCH_YIELD=0` calls straight through.

Behaviour difference: a session whose only problem is a lagging watermark (transcript rows written
outside the accessor's transaction, e.g. a doctor import) is no longer reported as `indexing: true`
by the first search; the Worker check finds it within the same second and the reconcile fixes it
(the candidate's `lag` scenario). Flagged, missing and undecided state are reported at once, as
before. Hits are unchanged (sessions flagged `needs_rebuild` stay excluded by the FTS query itself).

Build: `node lab/build-sessions-search-stall.mjs` (inputs: the `remote-node-stable-20261111` capture
for the tools and reconcile chunks, `v-base/` for the upstream search chunk). Plan:
`lab/sessions-search-stall.plan.json`. Offline test: `lab/sessions-search-stall.test.mjs`.
Deploy: replace the three dist files and restart the Gateway once.

## Candidate (VLab)

`lab/candidate/sessions-search-stall-ab.mjs`, plan `lab/candidate/sessions-search-stall-ab.plan.json`.
Results: see the PR description (filled in from the receipt).

## Not explained / not changed

- Only the 19:18 stall was profiled (one capture, as authorised). The 18:53 55 s stall and the
  others are not attributed; in-process tool calls leave no journal line, and V's Codex rollouts did
  not show a `sessions_search` call record either way. Some of them may have other causes.
- The two visibility listings (`sessions.list visibilityRowsOnly`, ~6.5 s each on V) are unchanged;
  after this change they are the longest single blocks of a search. Shrinking them (one listing for
  `visibility: "all"`, or bounded reads) is a follow-up.
- Every `sessions.list` from Control UI / workers still costs 6–7 s on V.
