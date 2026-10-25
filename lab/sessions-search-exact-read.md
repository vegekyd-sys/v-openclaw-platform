# sessions.resolve searches and plugin session ownership read only the rows they can match

Status: candidate only (2026-10-24). Not merged, not on shared VLab, not on V. The V export below was read-only
and has been deleted from V and VLab.

Follows `sessions-resolve-exact-read.md` (PR #462, key lookups). This plan carries that change too and
replaces its plan: deploy `lab/sessions-search-exact-read.plan.json`, not both.

## What still read the whole makaron store

`listSessionEntriesReadOnly` with the full projection (the default) parses every `session_nodes` row of the
agent and never caches (`readSessionEntryCache` returns early for `full`). On 2026-10-24 makaron had 9,503 rows
and 623 MB of entry JSON. After #462 the remaining hot-path callers are:

| caller | what it keeps | how often on V |
| --- | --- | --- |
| plugin `runEmbeddedAgent` → `resolveRunSessionExecutionOwner` → `assertSessionIdentitiesOwned` | rows whose `sessionId` is the run's (plus key / marker matches) | every V Voice product task (`voice.product.task.start`, v-voice-gpt-live → `api.runtime.agent.runEmbeddedAgent`): 117 runs in 7 days, ~17/day, each before the voice answer starts |
| `sessions.resolve` by `sessionId` | `entry.sessionId === id` or `key === id` | agent session tools given a session-id-like input (`resolveSessionReference`: key lookup first, then sessionId without agentId → one read per agent plus a combined read, i.e. two makaron reads); ACP targets |
| `sessions.resolve` by `label` | `entry.label === label` | `sessions_send` with a label, ACP targets |
| `sessions.resolve` by `shortId` | keys whose UUID suffix starts with the short id | CLI/TUI session targets (`session-target`) |

Measured on V from the Gateway journal, 2026-10-17 → 10-24 (read with `nice`/`ionice -c3`):

- `sessions.resolve` outside the Mac app burst of 10/23 (82 key calls on one connection): 155 calls in 7 days,
  2.7–3.3 s each on 10/17–19, 3.7–4.5 s on 10/20–22, 4.9–5.6 s median on 10/23, max 11.1 s. Two of them took
  twice the day's median (10.6 s, 11.1 s): the sessionId-without-agentId pattern (the 11.1 s call at 10/24
  00:06:54 followed a 5.6 s key miss for the same `codex-thread:…` input from an agent tool). The journal does
  not log parameters, so the split of the other single-read calls between key / sessionId+agentId / label /
  shortId is not known; key lookups are covered by #462.
- Voice: 117 `voice-product-task` runs and 17 `talk-realtime-consult` runs in the same 7 days.
  `talk-realtime-consult` (core Talk) overrides `runEmbeddedAgent` without the plugin facade, so it does not
  run the ownership check; `voice-product-task` does. The check is synchronous and runs before the embedded
  run starts, so its whole cost is added to the time before the voice answer begins and blocks the Gateway main
  thread (other calls' audio, every channel) for the duration. Liveness-delay lines near voice task starts:
  33 of 135 within 40 s vs 14 % of random windows; the heartbeat samples only every 30 s, so this is weak
  evidence and the cost below is measured directly instead.
- `skill-workshop-review`, `session-companion-ask`, `llm-slug-generator`, `experience-review` call the core
  `runEmbeddedAgent` directly (no ownership check). Codex does not call `runEmbeddedAgent`.

## Change

Plan `lab/sessions-search-exact-read.plan.json`, patcher `lab/patch-sessions-search-exact-read.mjs`, builder
`lab/build-sessions-search-exact-read.mjs`, test `lab/sessions-search-exact-read.test.mjs`, A/B
`lab/candidate/sessions-search-ab.mjs`. Base bytes are V's (`db91-release-v2026.9.1-db91.6/core/dist`, copied
2026-10-24; the first commit of each release file is that copy).

- New `v-session-entries-matching.mjs`: `listSessionEntriesMatchingReadOnly(scope, match)`. In one read
  snapshot it collects candidate keys from `current_session_id IN (…)` (indexed), `session_key IN (…)`,
  `label IN (…)` and, for short ids, a key-only pass over `session_key` (the primary-key index; no entry JSON
  is touched), then reads those rows exactly as the whole-store read does: `selectSessionEntryRows` +
  `parseSessionEntryJson` (unparseable rows skipped), `projectSqliteSessionParticipantsBatch`,
  internal-session-effects keys skipped, the same canonical-key check, rows in `session_key` order.
- `combined-store-gateway-BwDhjbIt.js`: `loadCombinedSessionStoreForGatewayCore` accepts `match` and passes it
  to the durable store reads only. Canonical keys, the duplicate check, lineage rewrite, agent filter,
  configured-agent filter and incognito stores are unchanged.
- `sessions-resolve-_D6BmQTT.js`: the four search reads pass a match: sessionId → `{ sessionIds: [id],
  sessionKeys: [id] }` (findVisibleSessionIdMatches keeps `entry.sessionId === id || key === id`); shortId →
  `keyFilter` with findVisibleShortIdMatches' own key test; label → `{ labels: [trimmed label] }`.
  Visibility, sharing filter, selection, ambiguity and errors are V's code on fewer rows.
  `OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT=0` restores the whole-store reads (#462's
  `OPENCLAW_V_SESSIONS_RESOLVE_EXACT=0` still controls the key lookup).
- `registry-runtime-session-ownership-B1XvaNE7.js`: `assertSessionIdentitiesOwned` lists rows matching the
  session ids and session-file keys, then (session files given as keys) the rows sharing those keys' session
  ids, and for SQLite markers the rows with the marker's session id. The assertions are V's.
  `OPENCLAW_V_SESSION_OWNERSHIP_EXACT=0` restores the whole-store reads.

Why the candidate columns are enough: `bindSessionNode` (the session entry writer) sets
`current_session_id = entry.sessionId` and `label = trim(entry.label)` from the same entry it serializes;
the schema calls promoted columns "query indexes projected only by the session entry writer". Every row the
callers keep therefore is a candidate. The A/B checks this on V's data with OpenClaw's own parser: 9,642
entries across five agents, 0 session-id and 0 label mismatches. The doctor's `--fix` rewrite
(`rewriteDoctorSessionEntries`) updates `entry_json` alone; it runs with the Gateway stopped and does not
change session ids or labels.

Differences, all on data V does not have:

- Duplicate canonical rows or a non-canonical row elsewhere in the store: the whole-store read throws for
  every search; the matching read only for the rows it reads. (Any invalid row makes OpenClaw's database-wide
  canonical check throw for both, before either read.)
- A session id stored with surrounding whitespace: the ownership session-file pass compares trimmed ids; the
  candidate query matches the stored value exactly. V's rows: 0 untrimmed session ids.

## Results

Candidate `candidate-cf243c46` (tested commit `7754873b`, clean tree; the release files and plan are unchanged since) on VLab runtime
`feishu-conversations-no-code-20261024`, whose four touched files are V's bytes
(the harness asserts the hashes; `v-session-entries-matching.mjs` must not exist there). Data: V's
`session_nodes`, `session_windows`, `session_participants`, `session_transcript_index_state` and
`session_progress_cards` of makaron (9,503 rows, 623 MB entry JSON), v-codex (61), xiaoai (41), dealclaw (26) and
short-v (2), exported read-only 2026-10-24 00:48 CST, loaded into agent databases created by OpenClaw. Synthetic
rows add what V lacks: an internal-session-effects row, a locked codex-harness row sharing
`agent:makaron:main`'s session id, a row locked to another plugin, a tombstone with its retained window, a label
padded in the entry, one label and one session id in two agents, a short-id collision.

`candidate/sessions-search-ab.mjs` loads V's chunks and the release chunks side by side and calls
`resolveSessionKeyFromResolveParams` (the whole `sessions.resolve` decision) or the plugin ownership checks
(`createPluginSessionOwnership` with the plugin runtime's own session accessors) on both. Numbers in
`sessions-search-exact-read-results-20261024.json` (counts and timings only).

**Equivalence: 568 cases, 0 differences** (results, error messages and thrown errors compared as JSON;
463 `sessions.resolve`, 105 ownership). The first full run (`candidate-3e4859c9`) gave the same 568 / 0 and
stopped on a harness assertion that wrongly expected V's natural duplicates to be ambiguous; fixed and rerun.

| cases | n | outcomes (V's result, identical in the release) |
| --- | --- | --- |
| sessionId + agentId / as agent tools send it (no agentId, includeGlobal/Unknown; also with an explicit agents list) / allowMissing, 40 sampled sessions (Night Shift and others) | 100 | 94 resolved, 5 not visible (archived), 1 missing |
| sessionId of other agents' sessions, without agentId / with the wrong agentId / with an explicit agents list | 30 | 16 resolved, 14 not found |
| V's natural duplicate session ids (3) and labels, with and without agentId | 9 | 9 resolved (archived duplicates are filtered first) |
| one session id and one label in two agents (synthetic), without / with agentId | 6 | 2 ambiguous across agents ("Multiple sessions found …"), 4 resolved |
| sessionId equal to a session key (`key === sessionId`) | 6 | 6 resolved |
| sessionId of internal-session-effects / tombstone / locked rows; unknown ids, with and without allowMissing | 10 | 2 resolved (locked row), 8 missing / not found |
| sessionId + spawnedBy parent / other parent, real clock and one minute after the child ended | 64 | 12 visible, 52 not visible |
| label + agentId / without / explicit agents list, 40 sampled labels | 90 | 66 resolved, 24 not visible (archived) |
| label padded in the entry, padded in the request, internal / tombstone labels, unknown, blank | 7 | 1 resolved, 6 not found / missing / invalid |
| label + spawnedBy, real clock and fresh | 12 | 2 visible, 10 not visible |
| shortId 12 hex + agentId, 8 hex upper case, 32 hex, explicit agents list | 91 | 91 resolved |
| shortId collision, + matching slugHint, + other slugHint; internal / tombstone keys; unknown; invalid | 8 | 2 ambiguous, 1 resolved, 5 missing / invalid |
| selector errors (slugHint without shortId, two selectors) | 2 | 2 errors |
| operator role boundary (`gateway.roles`, not on V), others = read / none, real profile; sessionId, label, shortId | 28 | 12 resolved, 16 hidden |
| ownership: V Voice product task run (`resolveRunSessionExecutionOwner`) and `assertSessionIdentitiesOwned` id + key, 40 sessions | 80 | 80 pass |
| ownership: `agent:makaron:main`'s run while a locked codex row shares its session id, as voice / as the harness owner | 2 | 1 refused, 1 pass |
| ownership: row locked to another plugin by id / key / as its owner; duplicate, internal, tombstone, unknown ids; storePath; other agent | 13 | 2 refused (locked), 10 pass, 1 refused for no agent id (both) |
| ownership: session files as a key (then rows sharing its session id), locked key, SQLite markers (existing, locked, other agent, unknown, internal), not a marker, mixed | 10 | 6 refused, 4 pass |

The switches restore V's behavior: with `OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT=0` /
`OPENCLAW_V_SESSION_OWNERSHIP_EXACT=0` the release chunks return V's results and take 7.9–9.9 s again (whole
reads).

**Cost per call** (VLab, 4 cores; V's chunk 3 calls, release 30; synchronous until the result, so wall time is
main-thread time; `allocated` counts objects later collected by GC):

| path | V chunk | release |
| --- | --- | --- |
| V Voice product task run, ownership check (`resolveRunSessionExecutionOwner`, Feishu direct session) | 8,905 ms, 2,362 MB | 5.1 ms, 1.0 MB |
| `sessions.resolve` sessionId + agentId | 8,635 ms, 2,407 MB | 2.7 ms, 0.4 MB |
| `sessions.resolve` sessionId, no agentId (agent session tools; found in the per-agent pass) | 8,552 ms, 2,423 MB | 4.3 ms, 0.8 MB |
| `sessions.resolve` label + agentId | 9,028 ms, 2,407 MB | 17 ms, 0.4 MB |
| `sessions.resolve` label, no agentId | 9,064 ms, 2,420 MB | 19 ms, 0.9 MB |
| `sessions.resolve` shortId + agentId | 8,981 ms, 2,425 MB | 70 ms, 15.8 MB |

A sessionId that is not found without agentId (an agent tool's session-id-like input that is not a session)
reads every agent and then the combined store again: two makaron reads in V's chunk (10.6–11.1 s on V).
The label path still scans the `label` column, which SQLite reaches through each row's overflow chain (no
index; pages already cached here). The shortId path reads all keys and then builds the session row info for
the matches.

VLab's 4 cores are slower than V (8.6–9.1 s here for what took 4.9–5.6 s on V on 10/23).

## Not covered

- The workboard `sessions.list` sweeps (list projection, cached until the next write) and
  `listLifecycleLinks` / `readCards` still read everything.
- Other plugin runtime callers of `listSessionEntries` (`session-catalog`, memory-core session listing)
  are unchanged.
- Single-process replay: V's concurrency, timers and page-cache state are not reproduced. Deploying needs a
  Gateway restart (`v-self-restart`).
