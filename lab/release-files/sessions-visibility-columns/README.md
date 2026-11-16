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

Source: openclaw-versa `versa/port-sessions-visibility-columns-20261116` @ `628f03f9d18` (two commits on
`3466c31b26c`, the PR #608 source; the new test `sessions-read.visibility-columns.test.ts` compares 147
`visibilityRowsOnly` requests against the list projection and fails on the old code).

- `session-accessor.sqlite-entry-BlklNPKQ.js`: `readSqliteSessionVisibilityEntries` — in one deferred read
  transaction (or the caller's), `SELECT rowid, session_key, entry_valid, typeof(pinned_at)` from the table, and
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

CANDIDATE_RESULTS

## Not changed

- The subagent-run read index the visibility rows derive `spawnedBy` from (`buildSubagentSessionListReadIndex`,
  ~4.3 s of the 19:18 profile on V's 9,400 runs) is still built once per listing on the Gateway thread.
- Ordinary `sessions.list` (Control UI, workers: 6–7 s each on V) still loads the list projection.
- A sandboxed requester's listing (`spawnedBy` filter) and any listing with search/label/owner/people filters keep
  the list projection.
