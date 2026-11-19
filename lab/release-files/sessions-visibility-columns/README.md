# sessions-visibility-columns — visibility listings without decoding every session's entry JSON

## What is slow (production V)

`sessions_search` lists its candidate sessions with `sessions.list` `visibilityRowsOnly: true` (PR #475), once
without and once with the requester's agent. Each call loads the combined session store with the **list
projection**: for every `session_nodes` row, SQLite runs `json_remove(entry_json, '$.skillsSnapshot',
'$.systemPromptReport')` and the Gateway `JSON.parse`s the result and normalizes it — on V's makaron store
**21,913 rows, 1.98 GB of entry JSON** (read-only count, 2026-11-16 22:35 CST). The rows it returns use five fields of
each entry. In the 2026-11-16 19:18 CPU profile (PR #608 README) the store load was ~5.2 s of the 27 s stall; after
PR #608 one visibility listing is the longest block left in a search: 4.5 s warm, ~25 s with the database file
cold on a V-scale VLab fixture.

## What a visibility listing reads from an entry

For the requests this change serves (below), with V's 9.1-db91.6 bytes:

| reader | entry fields |
| --- | --- |
| `listSqliteSessionEntriesFromDatabase` (row kept iff the JSON parses with a valid identity) | sessionId, updatedAt; delivery fields for the canonical-key proof |
| `mergeSessionEntryIntoCombined`, `filterCombinedStoreToConfiguredAgents` | parentSessionKey, spawnedBy (lineage canonicalization / configured agents) |
| `filterSessionEntries` | sessionId + updatedAt (phantom check), archivedAt, updatedAt (`activeMinutes`) |
| sort (`compareSessionEntryPairs`) | pinnedAt, updatedAt or lastInteractionAt |
| row derivation (`listSessionVisibilityRowsFromStore`) | spawnedBy, parentSessionKey (agentId comes from the key; the subagent-run index from the state DB) |

`session_nodes` already carries these as promoted columns, written by the canonical writer from the same entry
(`bindSessionNode`): `current_session_id`, `updated_at`, `archived_at`, `pinned_at`, `last_interaction_at`,
`spawned_by`, and `parent_session_key = parentSessionKey ?? spawnedBy`. Except `pinned_at`, each has a covering
index (`idx_agent_session_nodes_*`, rowid included).

Read-only check on V (2026-11-16 22:35 CST, `mode=ro`, `nice`/`ionice -c3`, 3.4 s): for all 21,913 makaron rows the
columns agree with the JSON for every one of these fields (0 mismatches each; no `archivedAt: null`), every row has
`entry_valid = 1`, no row is pinned, and the only ambiguous lineage — `parent_session_key = spawned_by`, 66 rows —
all carry an explicit `parentSessionKey`.

## Change (marker `sessions-visibility-columns-v1`)

Source: openclaw-versa `versa/port-sessions-visibility-columns-20261116` @ `13eee00de5c` (three commits on
`3466c31b26c`, the PR #608 source; the new test `sessions-read.visibility-columns.test.ts` compares 147
`visibilityRowsOnly` requests against the list projection and fails on the old code).

- `session-accessor.sqlite-entry-BlklNPKQ.js`: `readSqliteSessionVisibilityEntries` — in one deferred read
  transaction (or the caller's), `SELECT rowid, session_key, entry_valid, typeof(pinned_at)` from the table in rowid
  order (keys then sorted by UTF-8 bytes, the order of `ORDER BY session_key`), and
  each other column from its covering index (`INDEXED BY`), joined by rowid. A 0/1/NULL value lives in the record
  header, so the table scan does not walk the overflow pages (where every column after `entry_json` is stored).
  Each entry is `{ sessionId, updatedAt, archivedAt?, lastInteractionAt?, spawnedBy?, parentSessionKey? }`. Rows the
  columns cannot reproduce exactly are decoded from JSON with the list projection, as before (chunks of 500 keys,
  same parser, participants projected): `entry_valid != 1` (raw or unsettled writes: the JSON decides whether the
  row lists), pinned rows (no index; the sort reads pinnedAt), and `parent_session_key = spawned_by` (an explicit
  parentSessionKey and an absent one store the same column). A database without one of the six indexes returns
  nothing and keeps the list projection. `listSqliteSessionEntriesFromDatabase` uses it for a list read with
  `visibilityColumns` on a durable (non-incognito) database; the canonical key check still runs first.
- `combined-store-gateway-BwDhjbIt.js`: projection `"visibility"` = list projection + `visibilityColumns`; the
  `match` path (lifecycle sweeps) and incognito stores keep the list projection.
- `sessions-read-C6mAMxyQ.js`: `sessions.list` asks for `"visibility"` when `visibilityRowsOnly` is set, there is no
  lifecycle window and no row-repair retry, the caller has no visibility filter (the sharing filter reads other
  entry fields), and every parameter is one of `agentId, archived, activeMinutes, configuredAgentsOnly,
  includeDerivedTitles, includeGlobal, includeLastMessage, includeUnknown, limit, offset, sortBy,
  visibilityRowsOnly` (set to `false`/`undefined` counts as absent). `sessions_search` sends exactly such requests,
  except a sandboxed requester (`spawnedBy`), which keeps the list projection.

Kill switch: `OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS=0` (accessor level; the request then reads the list projection
exactly as V does). Rows returned are unchanged; only the entries behind them are smaller.

Behaviour differences (none on V's data):
- An entry whose JSON disagrees with its promoted columns lists by the columns. The canonical writer writes both
  from one entry and the startup canonical-key check rejects lineage mismatches; raw writes clear `entry_valid` and
  are decoded from JSON.
- A non-canonical row whose delivery fields prove another key makes the list projection throw
  (`requires repair`); the column read does not see delivery fields. The startup canonical-key check throws for such
  a row before any listing.

Build: `node lab/build-sessions-visibility-columns.mjs` (input: the `remote-node-stable-20261111` capture, which
holds V's bytes of the three chunks — sha256 checked against V 2026-11-16). Plan:
`lab/sessions-visibility-columns.plan.json`. Offline test: `lab/sessions-visibility-columns.test.mjs`.
Deploy: replace the three dist files and restart the Gateway once. Independent of PR #608 (no shared file).

## Candidate (VLab)

Harnesses: `lab/candidate/sessions-visibility-columns-ab.mjs` (equivalence, per-listing timing, cold breakdown) and
`lab/candidate/sessions-visibility-columns-e2e.mjs` (one `sessions_search`, derived from PR #608's harness; it needs
PR #608's release files, branch `claude/sweet-wu-5b78f9`). VLab runtime `startup-stall-usage-20261114b`, whose touched
files are V's bytes (asserted). Fixture: private makaron database built from the shared VLab store
(`lab/candidate/v-scale-session-fixture.mjs`), 21,813 nodes / 1.7 GB entry JSON, plus edge rows written by OpenClaw's
own writer (pinned, archived, spawned with implicit and explicit parentSessionKey, parent-only, parent != spawner,
last interaction, equal timestamps, cron run key, a second agent) and one row rewritten raw (`entry_valid = 0`) in
every arm. Two lineage shapes: **as built**, 10,802 cloned subagent rows have `parent_session_key = spawned_by`
(JSON path, worst case); **V's shape**, 66 spawned rows kept (V 2026-11-16: 66).

How "cold" is measured matters. A fresh process's first listing also runs the canonical key check
(`scanCanonicalSqliteSessionEntries`), which reads every row's entry JSON once per process — a Gateway does that once
at start. PR #608's "cold 25.6 s" was a fresh process on a dropped file, so it is mostly that one-time check (here:
A 25.6 s / B 24.1 s fresh-process first listing, unchanged by this patch). The numbers below are **evicted**: the
process has listed once (database validated), then this database file is dropped from the page cache
(`dd oflag=nocache`, our file only) before each measured call — a running Gateway whose pages were reclaimed.

**Equivalence** (every `sessions.list` response field but `ts`, and the agent/session-key sequence the
`sessions_search` tool sends to `sessions.search`): 45 requests (3 agent scopes x 4 archived modes x pages, sort
orders, `includeGlobal`/`includeUnknown`, `activeMinutes`, `configuredAgentsOnly`, two list-projection filters) and 35
tool cases (8 requesters x visibility all/agent/tree/self + 3 sandboxed).
- as built, V's bytes vs release: 80 comparisons, **0 differences** (`candidate-fd2bbc95`);
- V's shape, kill switch vs release, one fixed clock: 80 comparisons, **0 differences** (`candidate-9f5e63ea`; an
  earlier run without the fixed clock differed on `activeMinutes: 60` only, a row crossing the cutoff between arms).
- The release arm read no whole-store list projection for any column request; sandboxed requesters (`spawnedBy`)
  keep it, as designed.

**One visibility listing** (`archived: "all"`, `limit: 50000`; unscoped / makaron), main-thread block = call time:

| | V's bytes | release |
| --- | --- | --- |
| V's shape, warm | 4.2–4.4 s | **0.6 s** |
| V's shape, evicted | 56–63 s | **7.9–8.1 s** |
| as built (10,802 JSON rows), warm | 4.2 s | 2.8–2.9 s |
| as built, evicted | 20.4–21.1 s | 20.8–21.1 s |

(`candidate-858d6d43`, `candidate-9f5e63ea`; the fixture's evicted times are larger in V's shape because rewriting
10,727 rows' JSON scattered the file.)

**One `sessions_search`** (in-process tool call, 2 listings + 109 `sessions.search`; `candidate-9611491a`, V's shape,
5,200 historical windows with transcripts; identical results in all arms):

| | longest block | total |
| --- | --- | --- |
| V's bytes, warm | 31.4 s | 31.4 s |
| PR #608 only, warm | 4.4–4.8 s | 11.5–12.0 s |
| PR #608 + this, warm | **0.89 s** | 4.4–4.9 s |
| V's bytes, evicted | 83.7 s | 83.7 s |
| PR #608 only, evicted | 56.0–56.2 s | 64 s |
| PR #608 + this, evicted | **8.2 s** | 12.7–13.3 s |

**What is left cold** (release statements timed one by one after eviction, `candidate-9f5e63ea`): the table scan for
`entry_valid` / `typeof(pinned_at)` 6.6 s, the six index reads 0.6 s together, the 77 JSON rows 0.16 s. No statement
reads entry JSON beyond those rows. On this fixture the table scan costs 6.5 s even warm through a plain connection,
while on V's real database the same scan took 25–28 ms warm (read-only, 2026-11-16) and a locally built 20,000-row
x 80 KB table (fresh and rewritten) 20–40 ms — the fixture's figure is not V's. An earlier version scanned with
`ORDER BY session_key`, which walks the primary-key index with a random row lookup per row (9.3 s evicted); it now
scans in rowid order and sorts the keys by UTF-8 bytes.

## Not changed / follow-ups

- Cold, the column read still blocks the Gateway thread for its table and index pages (8 s on the fixture). Two ways
  to take it off the main thread entirely: run the column read on a read-only worker thread and await it (the
  visibility path would preload per-database snapshots before the synchronous store load), or a partial index
  `WHERE entry_valid != 1 OR pinned_at IS NOT NULL` that makes the read index-only (a schema change on V).
- The canonical key check reads every entry JSON once per process (Gateway start).

- The subagent-run read index the visibility rows derive `spawnedBy` from (`buildSubagentSessionListReadIndex`,
  ~4.3 s of the 19:18 profile on V's 9,400 runs) is still built once per listing on the Gateway thread.
- Ordinary `sessions.list` (Control UI, workers: 6–7 s each on V) still loads the list projection.
- A sandboxed requester's listing (`spawnedBy` filter) and any listing with search/label/owner/people filters keep
  the list projection.
