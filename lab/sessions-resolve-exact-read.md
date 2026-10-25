# sessions.resolve exact read, and what the makaron session database is made of

Status: candidate only (2026-10-23). Not merged, not on shared VLab, not on V. No production data was changed;
the V export below was read-only and has been deleted from V.

## The stall

On 2026-10-23 19:09–19:3x Tianyi's Mac app (OpenClaw.app, over the ssh tunnel, one websocket connection)
called `sessions.resolve` + `sessions.patch` about every 6 s on `agent:makaron:subagent:workboard-nightshift-*`
keys. Each `sessions.resolve` took 5.0–6.3 s on V (journal `[ws] ⇄ res ✓ sessions.resolve <ms>`: 82 calls on
that connection, avg 5.57 s, max 6.35 s); Gateway RSS went 4.2 → 7.8 GB within 33 s, liveness came 4–5 s late
every ~35 s and the Night Shift host brake turned red. It was not only the burst: every call has been slow,
from 3.4–4.9 s on 10/22 to 4.9–10.6 s on 10/23 (one-shot connections from agent tools and CLI clients, a few
an hour), growing with the store.

## Why

`sessions-resolve-_D6BmQTT.js` (`resolveSessionKeyFromResolveParams`) looks a key up with
`resolveGatewaySessionStoreTargetWithStore({ cfg, key, clone: false, agentId })`, without `exactRead`. That
loads the agent's whole store with `listSessionEntriesCore` and the default `full` projection, and
`readSessionEntryCache` never caches `full` (it returns `loadSessionEntrySnapshot` directly). So every call
parses every `session_nodes` row of makaron and projects their participants on the Gateway main thread, to
read one entry.

makaron on 2026-10-23 20:03 CST: 9,050 rows, 592 MB of `entry_json`. 96 % of that is two fields every
session stores: `skillsSnapshot` 351 MB and `systemPromptReport` 220 MB (the `list` projection drops them after
reading). 7,512 rows (467 MB) are Night Shift subagent sessions, none running. On 10/20 it was 5,157 rows /
335 MB.

`sessions.get` and `sessions.preview` in the same Gateway already look sessions up with
`exactRead: true, readOnly: true` (#314); `sessions.resolve` was left on the whole-store read.

## Change

Plan `lab/sessions-resolve-exact-read.plan.json`, patcher `lab/patch-sessions-resolve-exact-read.mjs`, builder
`lab/build-sessions-resolve-exact-read.mjs`, test `lab/sessions-resolve-exact-read.test.mjs`. One core dist
file, V's bytes unchanged since the 9.1 install (`c3d8c801…`); the first commit of the release file is that copy.

- The key branch asks for the same scan targets with `exactRead: true, readOnly: true` and reads the entry as
  before (`store[canonicalKey]`). Everything after the lookup is V's code.
- The `spawnedBy` visibility check (`isResolvedSessionKeyVisible`) only asks whether the resolved key survives
  `filterAndSortSessionEntries`, which decides each entry on its own (plus the subagent registry) with no
  limit, so a store holding just the scan targets answers the same.
- Kept on purpose: the whole-store read never returns `internal-session-effects` rows, so the patched branch
  treats them as missing too.
- `OPENCLAW_V_SESSIONS_RESOLVE_EXACT=0` restores the whole-store read.
- Unchanged: `sessionId`, `label` and `shortId` lookups. They search the store, so they still read all of it
  (costs below).

Difference on corrupt data only: if any row of the store fails the canonical-key check, the whole-store read
throws, the lookup swallows it and every key resolves as missing; the exact read only fails for the key's own
rows.

## Results

Candidate `candidate-51cc7ce8` (commit `c11900b7`; only this document was uncommitted) on VLab runtime
`feishu-auto-phone-tab-v1`, whose `sessions-resolve-_D6BmQTT.js` is V's bytes (the harness asserts the hash).
`candidate/sessions-resolve-ab.mjs`: a makaron agent database created by OpenClaw and filled with V's
`session_nodes`, `session_windows`, `session_participants`, `session_transcript_index_state` and
`session_progress_cards` (exported read-only 2026-10-23 20:03 CST, 9,050 sessions, 592 MB of entry JSON), the
writable handle kept open as in the Gateway. V's chunk and the release chunk are loaded side by side and each
case calls `resolveSessionKeyFromResolveParams` (the whole decision; the handler only maps its result) on both.
Numbers in `sessions-resolve-exact-read-results-20261023.json`.

**Equivalence: 528 cases, 0 differences** (results, error messages and thrown errors compared as JSON).

| cases | n | resolved | not found / error |
| --- | --- | --- | --- |
| key, key + agentId, key + allowMissing (100 keys spread over Night Shift and other sessions) | 220 | 220 | 0 |
| spawnedBy = parent / other parent / parent + includeGlobal, real clock (40 linked sessions) | 120 | 0 | 120 |
| the same at a clock one minute after the child ended (store-only child links are live for 30 min) | 120 | 60 | 60 (archived or other parent) |
| archived child + spawnedBy | 10 | 0 | 10 |
| aliases: `main`, `agent:makaron:main` (any case), `global`, `unknown`, a group key without and in upper case, with and without agentId | 18 | 12 | 6 |
| missing keys and unknown agents, with and without allowMissing | 8 | 0 | 8 (3 allowMissing) |
| an `internal-session-effects` row (added; V has none) | 2 | 0 | 2 |
| operator role boundary (`gateway.roles`, not on V), others = read / none, real profile | 30 | 15 | 15 |

**Cost per call** (V's chunk 5 calls, release 50; the lookup is synchronous until it returns, so wall time is
main-thread time; `allocated` counts objects later collected by GC):

| case | V chunk | release |
| --- | --- | --- |
| key, Night Shift subagent session (what the Mac app asked) | 7,453 ms, 2,239 MB | 1.8 ms, 0.4 MB |
| key `agent:makaron:main` | 7,466 ms, 2,240 MB | 2.1 ms, 0.4 MB |
| missing key + allowMissing | 7,439 ms, 2,236 MB | 0.3 ms, 0.1 MB |
| key + spawnedBy | 8,653 ms, 2,379 MB | 1.6 ms, 0.4 MB |

VLab's 4 cores are slower than V (7.4 s here, 5.0–6.3 s on V for the same store).

Unchanged branches, same code in both chunks (3 calls each; the spread is VLab noise, the host was loaded by
other work): sessionId + agentId 8.9 / 9.5 s, sessionId without agentId 10.5 / 9.8 s, label 8.2 / 9.2 s,
shortId 8.0 / 9.7 s, each ~2.3 GB. They still read every row; see "Not covered".

Other callers of the same function get the same change: `talk.session.create` (voice session creation resolves
its key with spawnedBy) and the embedded Gateway stub.

## Not covered

- `sessions.resolve` by `sessionId`, `label` or `shortId` still reads the whole store (8–10 s on VLab). Agent
  tools (`sessions_send` by label, `sessions_history`) and ACP commands use them. A sessionId lookup could use
  `idx_agent_session_nodes_current_session_id`; label and shortId need a key-only pass. Not done here: the
  combined store canonicalizes keys and lineage across agents, which needs its own equivalence work.
- `assertSessionIdentitiesOwned` (full projection) and the workboard `sessions.list` sweeps (list projection)
  remain whole-store readers.
- Single-process replay: V's concurrency, timers and page-cache state are not reproduced. Deploying needs a
  Gateway restart (`v-self-restart`).

## The makaron database

Read-only, on 2026-10-23 20:03–20:50 CST. No full scan ran on V: the session tables were exported once
(`CREATE TABLE … AS SELECT` from a `mode=ro` connection under `ionice -c3 nice -n19`, 3.1 s, the rows were
already in the page cache because every `sessions.resolve` reads them), the other tables were sampled by rowid
windows (60 × 500 rowids of `transcript_events`, 2:56 min at idle IO priority, a few hundred MB read).

| | size | notes |
| --- | --- | --- |
| whole file | 27.3 GB | 6,674,514 pages × 4 KB, freelist 0, `auto_vacuum = incremental` |
| `transcript_events` | ≈ 15 GB (sampled) | ≈ 1.57 M rows × 9.7 KB; Night Shift subagent transcripts ≈ 71 % of the bytes; rows carrying base64 images are ≈ 1 % of rows but ≈ 60 % of the bytes (74 % within Night Shift) |
| `session_transcript_archives` | 581 MB | 974 zstd blobs, reason `deleted`, all published, created 10/12–10/23 (kept ~14 days) |
| `memory_index_chunks` | ≈ 0.6 GB (sampled) | text + embedding |
| `session_nodes` | 592 MB `entry_json` | 96 % is `skillsSnapshot` + `systemPromptReport`; 7,512 of 9,050 rows are Night Shift subagent sessions |
| `trajectory_runtime_events` | ≈ 0.5 GB (sampled) | |
| rest | ≈ 9–10 GB | indexes (`transcript_event_identities` has four), `session_transcript_active_events` (rowids up to 39.8 M), FTS, vectors; not measured |

Night Shift subagent sessions by age (`updated_at`): 498 older than 14 days, 2,467 older than 7, 4,080 older
than 3.

**Why the Gateway needs the whole store in the page cache.** An entry is ~64 KB, so each row lives in ~16
overflow pages spread over the file. A whole-store read (`full` or `list` projection: `list` strips the two big
fields in SQL, which still reads them) touches ~150,000 pages. With the pages cached that is 0.2 s (`list`) to
7 s (`full`, JSON parse plus 2.2 GB of short-lived objects); after anything evicts them (a doctor transcript scan,
a backup, a bulk read of 15 GB of transcripts) it becomes random 4 KB reads. The remaining whole-store readers
after this change: `sessions.resolve` by sessionId / label / shortId, `sessions.list` sweeps (list projection,
cached until the next write), `assertSessionIdentitiesOwned` (full projection, plugin `runEmbeddedAgent`).

**Slimming, in order of value per risk**

1. Retire finished Night Shift sessions with `scripts/retire-nightshift-sessions.mjs` (#442; OpenClaw's own
   lifecycle removal, preview by default, 2 keys per transaction, backs off on lock waits, `--window`). It
   removes the `session_nodes` rows (the hot-path cost) and moves each transcript into a zstd archive, which the
   archive retention deletes after ~14 days. At 14 days today: 498 sessions (~31 MB of `entry_json`); at 7 days
   2,467 (~150 MB), at 3 days 4,080 (~250 MB). Measured on 10/20: ~1 h per 3,200 sessions at batch 2, other
   writers waited at most 1.7 s. Needs Tianyi's choice of threshold and approval to `--apply`.
2. File size: after retirement the freed pages go to the freelist; the Gateway's incremental vacuum shrinks the
   file over time (#149 made shrinking safe for the integrity proof). No `VACUUM` window is needed for the
   hot paths; a full `VACUUM` of 27 GB would hold the write lock for many minutes and needs a stopped Gateway.
3. Not proposed: rewriting transcript rows to drop base64 images, or stripping `skillsSnapshot` /
   `systemPromptReport` from live rows. Neither is an official mechanism; transcripts are replayed into model
   context and the snapshot keeps a session's skills stable.

**Exact per-table sizes (dbstat), if wanted:** one statement per table, each its own read snapshot, page cache
and bandwidth capped by a transient cgroup so it does not evict the Gateway's pages. Costs ~27 GB of disk reads
(~12 min at 40 MB/s) and keeps a WAL snapshot open for the duration of each statement (the WAL cannot
checkpoint past it), so run it in 03:00–05:30:

```sh
DB=/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite
for t in $(sudo -u openclaw sqlite3 "file:$DB?mode=ro" "SELECT name FROM sqlite_schema WHERE rootpage > 0"); do
  sudo systemd-run --quiet --wait --collect --uid=openclaw -p MemoryHigh=256M -p MemoryMax=512M \
    -p IOReadBandwidthMax="/dev/vda 40M" -p Nice=19 -p IOSchedulingClass=idle \
    sqlite3 "file:$DB?mode=ro" "SELECT name, sum(pgsize), sum(payload), sum(ncell) FROM dbstat WHERE name = '$t' AND aggregate = 1"
done
```

## Doctor inside the Gateway

The 10/22 freezes (21:37 310 s, 22:20 158 s) were OpenClaw's built-in assistant running its `doctor`
operation. `operations-CTofDiKh.js` handles it with
`await doctorCommand(runtime, { nonInteractive: true })` in the Gateway process. In the 21:36:18 run the
Gateway journal shows "Backups" at 21:36:57 and the next section ("Cron") at 21:42:54: in between ran
`doctor:session-transcript-headers` and `doctor:session-transcript-labels`. The labels check
(`doctor-session-transcript-labels-DTxp6Q8J.js` with `ReadOnlySqliteTranscriptReader`) lists every transcript
session (`SELECT DISTINCT session_id FROM transcript_events`) and, for each, iterates
`SELECT event_json, seq FROM transcript_events WHERE session_id = ? ORDER BY seq` and `JSON.parse`s every row:
all ~15 GB of transcripts, base64 images included, synchronously on the main thread, without `--fix` (it only
reports). The headers check reads the first row of every session.

Ways to keep the assistant's doctor without freezing the Gateway (not implemented here):

- run the operation's doctor in a child process (`openclaw doctor --non-interactive` with the Gateway's
  environment, `nice`/`ionice -c3`, output streamed to the operation's `runtime.log`). The main thread stays
  free; the disk and page-cache cost stays, so also:
- skip the two transcript-wide checks on this path. Their findings can only be acted on with
  `doctor --fix`, which the assistant already refuses to run in-process ("run with OpenClaw stopped").
