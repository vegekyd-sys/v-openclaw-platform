# sessions_search lists its candidates with one sessions.list of visibility fields per scope

Status: candidate only (2026-10-25). Not merged, not on shared VLab, not on V. The V export below was read-only
and has been deleted from V.

## What fans out

`sessions_search` (agent tool, `openclaw-tools-BODVdJQD.js`, `listVisibleSearchSessions`) lists every session it
may search before it searches. For each scope (once without `agentId`, once with the requester's agent; only the
first when the session is sandboxed to its spawned children) and for `archived: false` and then `archived: true`
it pages `sessions.list` 200 rows at a time until `hasMore` is false. Of each row it reads `key`, `agentId`,
`ownerSessionKey`, `parentSessionKey` and `spawnedBy` for its row visibility check (`createSessionVisibilityRowChecker`);
it then sends the visible keys to `sessions.search` in chunks of 200.

On V (2026-10-25: makaron 9,869 sessions, 123 archived; other agents 130) one search is ≈ 50 + 1 pages per scope,
i.e. ≈ 100 `sessions.list` calls. In a worker (every V agent turn) `callAgentToolGatewayRequest` has no in-process
Gateway, so each call is a `callGateway`: a new WebSocket connection, connect handshake, one request, close. Each
`sessions.list` on the Gateway:

- loads the combined store with the list projection (`loadCombinedSessionStoreForGatewayCore`, all agents for the
  unscoped call), filters and sorts it, and slices the page (`offset + 200` rows are selected, then the window);
- builds a full row for each of the 200 (`buildGatewaySessionRow`: model, thinking, context window, usage, ACP,
  child sessions, goal, delivery …), the sharing targets and membership for the page, placement, active-run flags;
- is not served from the completed-list cache: the cache key includes `offset`, and V's fence (transcript updates,
  lifecycle, mutations) moves between pages.

The tool reads 4 of the ~100 fields of each row; `ownerSessionKey` is never in a `sessions.list` row.

Gateway journal (read with `nice`/`ionice -c3`, counts every `sessions.list` source in the window):

| window | `sessions.list` | handler time | max | distinct connections | `sessions.search` |
| --- | --- | --- | --- | --- | --- |
| 10/24 09:59–10:31 (two 3-day review crons, 0337f4f9 / ffef71d5) | 1,497 | 875 s | 11.5 s | 1,497 | 51 |
| 10/25 19:59–20:10 (weekly calibration cron 16fd590d) | 105 | 115 s | 4.9 s | 105 | 1 |

Every call came on its own connection. The handler time is mostly synchronous on the Gateway main thread
(store load, filter/sort and the sharing stage are synchronous; row building yields every 12 ms).

## Change

Plan `lab/sessions-search-candidate-rows.plan.json`, patcher `lab/patch-sessions-search-candidate-rows.mjs`, builder
`lab/build-sessions-search-candidate-rows.mjs`, test `lab/sessions-search-candidate-rows.test.mjs`, A/B
`lab/candidate/sessions-search-candidate-rows-ab.mjs`. Base bytes are V's
(`db91-release-v2026.9.1-db91.6/core/dist`, identical to `release/captured/feishu-conversations-20261024/dist`).

- `src-B9mb84px.js`: `sessions.list` params (closed object) accept `visibilityRowsOnly: boolean`.
- `session-utils-list-BUP03AzS.js`: `listSessionVisibilityRowsFromStore` — the same `selectSessionEntries` call as
  `prepareSessionList` (filters, `archived`, order, `offset`/`limit`, default limit), then for each selected row
  `{ key, agentId, parentSessionKey, spawnedBy }` derived exactly as `buildGatewaySessionRow` derives them: the
  list's row context and clock, `spawnedBy = displayed subagent run's controller || entry.spawnedBy`, `agentId`
  from `sessionClassificationForRow`. No model, thinking, usage, ACP, child-session or transcript projection.
- `sessions-read-C6mAMxyQ.js` (`sessions.list` handler): with `visibilityRowsOnly` it lists those rows; the sharing
  projection runs only when the caller has a visibility filter (it still decides which rows that caller sees, with
  V's row-repair retry); placement and active-run decoration are skipped; the completed-list cache does not keep
  these results (they lack the active-run fields `resolveSessionListExpiration` checks; in-flight requests are
  still shared). Without the flag every line runs as on V (the test checks every changed line is guarded by it).
- `openclaw-tools-BODVdJQD.js` (`listVisibleSearchSessions`): per scope one `sessions.list` with
  `archived: "all"`, `limit: 10000`, `visibilityRowsOnly: true` (still paged by `hasMore`/`nextOffset`). A Gateway
  without the parameter answers `invalid sessions.list params: …`; the tool then pages as V does (only on that
  error, only before any row of the scope was read). `OPENCLAW_V_SESSIONS_SEARCH_CANDIDATE_ROWS=0` restores V's
  requests. The local embedded `sessions.list` (no Gateway) ignores the flag and returns full rows, which carry the
  same fields.

Why the candidate set is the same: `archived: "all"` is the union of `false` and `true` in `filterSessionEntries`
(the only place `archived` is read); a 10,000-row page is the union of the 200-row pages of the same selection;
the rows carry the fields the row check reads with V's derivation; candidates are keyed by session key and sorted
before use. When the store changes between V's pages, V can skip or repeat rows at page boundaries; one listing
cannot.

## Results

Candidate `candidate-d1b00c2b` (source commit `3fa6aff3` plus the uncommitted release files, plan and harness of this
change; the release files and plan are byte-identical to the ones committed here, the harness differs only in its
header comment) on VLab runtime `voice-feishu-confirm-20261025`, whose four touched files are V's bytes (the harness
asserts the hashes). Data: V's `session_nodes`, `session_windows`, `session_participants`,
`session_transcript_index_state` and `session_progress_cards` of all eight agents (makaron 9,869 rows, v-codex 61,
xiaoai 41, dealclaw 26, short-v 2, three empty) and `subagent_runs` (9,375, which decide `spawnedBy`), exported
read-only 2026-10-25 22:09 CST into agent and state databases created by OpenClaw. A private Gateway on that state
(channels, cron, Workboard off; V's `tools.sessions.visibility: "all"` and agent-to-agent allow list), started twice:
phase A with V's four files, phase B with the release files. This process runs the `sessions_search` tool the way a
worker does (`callAgentToolGatewayRequest` → `callGateway`, one connection per request), V's chunk and the release
chunk side by side. Numbers in `sessions-search-candidate-rows-results-20261025.json` (counts, hashes, timings).

**Equivalence: 47 cases × 3 comparisons = 141, 0 differences** (tool result and the full sequence of
`sessions.search` requests, i.e. agent and session keys of every chunk, compared by hash against V's tool on V's
Gateway). Cases: 11 requesters (makaron main, the session with the most spawned children, a group, a direct, a
subagent, an archived session, a cron-run key; v-codex, xiaoai, short-v, dealclaw) × visibility `all` (V), `agent`,
`tree`, `self`, plus 3 sandboxed (`restrictToSpawned`). The visible candidates range from 1 to 9,973 keys (`tree`
with the top spawner: 14). Comparisons per case: release tool on V's Gateway (the fallback path), V's tool on the
release Gateway (the unflagged path), release tool on the release Gateway.

| makaron:main, visibility all (V's config), first real search | `sessions.list` | Gateway handler total | max | response bytes | `sessions.search` |
| --- | --- | --- | --- | --- | --- |
| V tool, V Gateway | 101 (101 connections) | 108.9 s | 1.7 s | 44.3 MB | 53 (9,972 keys) |
| release tool, V Gateway (rejected once, then V's pages) | 102 | 109.0 s | 1.6 s | 44.3 MB | 53, same |
| V tool, release Gateway | 101 | 120.8 s | 1.8 s | 44.3 MB | 53, same |
| release tool, release Gateway | **2** | **2.7 s** | 1.4 s | 2.8 MB | 53, same |

V's 200-row pages cost 0.5–1.7 s each (median ~1.1 s) on VLab: the fixed part (store load, filter and sort of every
row) is paid per page. The two visibility-row calls (9,998 and 9,868 rows) take 1.41 and 1.43 s. Sandboxed requesters
make 1 call instead of 2. VLab's 4 cores are slower than V (V's pages: 0.3–4.9 s on 10/25).

Harness notes: the runner's environment names another Gateway port and a shared cache directory; the harness sets
`OPENCLAW_GATEWAY_PORT`, `TMPDIR` and `XDG_CACHE_HOME` to its own and checks that every readiness answer comes from
its own store. A first attempt without that (`candidate-6b152969`, 2026-10-25 22:33 CST) sent its requests to the
shared VLab Gateway instead: read-only `sessions.list` / `sessions.search`, on the order of 200 / 100 calls within about a minute; its results
were discarded. During the final run the shared Gateway was restarted by systemd at 23:07:29 CST from outside this
test (the harness only stops its own child by PID).

## Not covered

- `callGateway` from a worker still opens one connection per request for every agent tool; with two listing calls
  per search this is no longer the cost, but connection reuse is not changed here.
- `sessions.search` still gets the visible keys in chunks of 200 (with V's visibility `all` and agent-to-agent on,
  that is every visible session: ~50 chunks for makaron); each chunk is an FTS query on the indexed transcripts.
- Other full `sessions.list` callers (Control UI, Workboard sweeps with `lifecycleOnly`) are unchanged.
- Single-process replay; V's concurrency and page cache are not reproduced. Deploying needs a Gateway restart.
