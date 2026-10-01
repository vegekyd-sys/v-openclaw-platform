# Background work on the Feishu reply card

VLab candidate, 2026-10-02. Patcher:
`lab/release-files/feishu-task-status/patch-feishu-task-status.mjs`
(markers `v-task-registry-bridge-v1` / `v-feishu-task-status-v1`).

## Problem

On 2026-10-02 00:14 CST, in group `oc_d0fdd37a…`, V (codex runtime) answered
"实验已启动" and the reply card closed. A Codex native subagent then ran from
00:15:18 to 00:18:16 with nothing on screen. The reader could not tell that any
work was still going on.

Background work from Feishu sessions on V over 14 days (task registry,
`task_runs`):

| Kind | Count | Mean duration |
| --- | --- | --- |
| background command (`cli/exec`) | 343 | 17 min |
| subagent (`sessions_spawn`) | 7 | 5 min |
| Codex native subagent | 1 | 3 min |
| media generation | 6 | |

## What OpenClaw already has, and why it is not enough

- Every kind above is one record in the task registry, owned by the session
  that started it (`owner_key = requester_session_key` for all 358 Feishu
  rows). Codex native subagents are mirrored there by the Codex plugin
  (`runtime=subagent, taskKind=codex-native`).
- The Gateway broadcasts a `task` event per change, addressed to that session
  (Control UI uses it). The Feishu plugin does not consume it, and the
  registry's observer is a single slot the Gateway already owns.
- `notifyPolicy: "state_changes"` posts separate English messages
  ("Background task started: …"); Codex native subagents are hard-coded
  `silent`, and subagents only announce cancellation.
- `/tasks` and `/subagents` list a session's work, on request only.

## Design

Same shape as the progress-stream patch: one core hook, one Feishu renderer,
no per-runtime adapters. Three files:

- core `task-registry-activity-*.js`: a global bridge
  (`Symbol.for("openclaw.v.taskRegistryBridge")`). `listActive(sessionKey)`
  returns the session's unfinished work. Whenever the registry notifies its
  observer, bridge listeners get `{kind, sessionKeys}` (on a microtask). The
  Gateway observer still runs as before.
- core `task-registry.store.sqlite-*.js`: two indexed reads of the shared
  state database, merged into `listActive`:
  - `task_runs WHERE owner_key = ? AND status NOT IN (terminal)` — work a
    V worker process registered. Workers keep their own registry and only
    share the database, so their background commands are never in the
    Gateway's memory and raise no Gateway event. A row with no event for 6 h
    is treated as abandoned (V had two such nightshift rows, 2 days old).
  - `subagent_runs WHERE requester_session_key = ? AND created_at >= now-24h`,
    not yet terminal — a subagent a worker spawns is not a task at all
    (completion is owned by the Gateway's external task bridge); it only exists
    there. A run past its own timeout by 10 min is treated as abandoned.
  The upstream `listTasksForOwnerKey` was not reused: it forces
  `FROM task_runs NOT INDEXED` (13,909 rows on V). Both new queries use an
  index (`SEARCH … USING INDEX idx_task_runs_owner_key`,
  `… COVERING INDEX idx_subagent_runs_requester_session_key`).
  Tasks the Gateway's registry knows are decided by the registry; a subagent
  that is also a task is counted once.
- feishu `monitor.account-*.js`: every reply card registers for its session.
  When the session has background work, one small grey line (markdown
  `text_size: notation`, own element `v_bg_tasks`) is inserted right after the
  reply text, so it is the last thing in the card above the divider and footer:
  `⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1`, and `☑️ 后台任务已结束` once the
  work it showed is done. Content of the work is not shown. (Tianyi 2026-10-02:
  above the footer, not under it.)
  - Refreshes on registry events (800 ms debounce) and every 5 s while the card
    is tracked, because worker-owned work raises no event in the Gateway.
  - CardKit element calls: insert (`POST /elements`, `insert_after content`),
    update (`PUT /elements/v_bg_tasks`), delete. All accepted on streaming and
    on closed cards; the final body rewrite at close leaves the element in place.
  - Only the newest card of a session carries the live line; when a new reply
    starts, the previous card's element is deleted.
  - A card is released when it is closed and nothing is running, or after 24 h.
    Ordinary replies with no background work get no element and no extra
    CardKit writes (one indexed read per 5 s while they stream).
  - A failed write is retried on the next refresh.
- Counted: the session's own background work. Not counted: a run of the
  session itself (`openclaw agent` registers its turn as a kindless cli task
  whose child is the session), and a subagent's own commands (owned by the
  subagent's session).

## Evidence

Unit tests: `tests/patch-feishu-task-status.test.mjs` (15/15) — renderer and
filters, all three patches against the live V bytes, idempotence, the bridge
against a registry fixture (merge with worker rows and `subagent_runs`,
de-duplication, abandoned rows), and the card lifecycle against a
streaming-session double: live update, re-applying the line after close,
handoff to a new reply, worker work found by polling only, release, monotonic
sequence, no-op without the core patch.

Candidate (`lab/candidate/feishu-task-status.mjs`, base `vcodex-sol61-v1`,
inputs byte-identical to V; receipt `candidate-f45bf238`, input
`ee856017…`):

| Part | Result |
| --- | --- |
| link | patched activity, store and monitor import against the runtime |
| sdk (Codex native path) | `createAgentHarnessTaskRuntime` (runtime `subagent`, kind `codex-native`): listed while running, empty after finalize, 2 notices |
| cardkit | VLab bot created card entities (never sent): insert while streaming, close, final body rewrite, update ×2 after close, delete after close, insert into an already closed card — 9/9 code 0 (receipt `candidate-dc3126ef`) |
| worker / deepseek-v4-flash | called `sessions_spawn` + background `exec`; answered at 14 s; visible 13 s: 2 (exec + subagent) → 53 s: 1 → 66 s: 0 |
| worker / deepseek-v4-pro | same; answered at 6 s; 2 → 1 at 45 s → 0 at 59 s |
| claude-cli / claude-sonnet-5 | answered at 28 s; subagent visible 26 s → 0 at 79 s |

Baseline (unpatched, receipt `candidate-68ac90c0`): the worker turn called
`sessions_spawn` + `exec`, the bridge does not exist and the probe never
attached — the measurement cannot pass on its own.

Earlier runs found the two worker gaps above: with only the in-memory registry,
worker background commands and worker-spawned subagents were invisible
although the model called both tools.

## Not covered

- The Feishu dispatcher itself was not driven by a real Feishu message in the
  candidate (a second consumer of the VLab bot would steal its events). The
  card lifecycle is covered by the unit double; CardKit acceptance by the API
  check. A visible check in a real chat belongs to the shared VLab gate.
- A real Codex native subagent turn (no OpenAI login in VLab; the mirror's
  SDK path is covered).
- The `ask_user` inline card rewrites the footer from its own copy; while a
  question card is up the line can disappear until the next change.
