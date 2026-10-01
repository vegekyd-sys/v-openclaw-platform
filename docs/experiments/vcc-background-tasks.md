# /vcc: background subagents swallow the reply (2026-09-27)

## Incident

Production V, group `oc_1fb85b7b…`, `/vcc` (claude-opus-5-5 on the claude-cli
harness), 23:14 CST. The user got no reply to two messages in a row.

From Claude Code's own transcript
(`/home/openclaw/.claude/projects/-home-openclaw-makaron-openclaw--openclaw-local-workspace/<uuid>.jsonl`):

| Time | Event |
|---|---|
| 23:15:01 | `Agent` tool called with `run_in_background: true` → "Async agent launched" |
| **23:15:09** | **complete reply written, `stop_reason=end_turn`** — not delivered |
| 23:20:57 | background agent finishes; `<task-notification>` wakes the main agent |
| 23:21:14 | stuck-session recovery: `stalled_agent_run lastProgress=tool:Agent:ended lastProgressAge=373s` → `abort_embedded_run`; the reply and the background result are discarded |

The next turn hit `ECONNRESET` on its first MCP call, spawned a child session,
answered `NO_REPLY`, and the child never ran.

## Cause

OpenClaw's claude-cli bridge delivers a reply on the CLI's terminal result.
The reply written in seconds is held for as long as the background work runs —
and once that exceeds the stuck-session threshold, it is lost.

**Correction (2026-10-01):** it is OpenClaw, not Claude Code, that holds the
turn. OpenClaw runs claude through the Agent SDK (`--input-format stream-json`,
one live process per session), and in that mode Claude Code 2.1.280 emits
`result` right at `end_turn`, then later emits `task_notification`, a follow-up
assistant turn and a second `result` on its own. The hold is
`acceptClaudeAgentSdkMessage` in `dist/extensions/anthropic/agent-sdk.runtime.js`:
a `background_tasks_changed` listing `local_agent`/`local_workflow` sets
`hasResultHoldingBackgroundTasks`, and the turn is not completed on `result`.
Output arriving after a turn has ended is dropped (`if (!turn) return;`), and
the CLI run owner has no `ownsLiveness`, so the stuck detector aborts at
max(300 s, 3 × 120 s). Only `-p` with the prompt as an argument withholds the
first `result` in Claude Code itself; OpenClaw does not use that mode.

The cross-harness route for background work is OpenClaw's own mechanisms
(`sessions_spawn` + `sessions_yield`, automations `stream`/`at`), measured in
`lab/candidate/bg-matrix.mjs`; Claude Code's own background stays disabled.

OpenClaw already launches claude with
`--disallowedTools ScheduleWakeup,CronCreate,Bash(run_in_background:true),Monitor`
— the same concern, applied to Bash but not to the `Agent` tool.

## Fix

`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, Claude Code's own switch (present in
2.1.273 and 2.1.280). It also covers auto-backgrounding
(`CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS`), which a model never asks for. Set
in the Gateway unit: the claude child inherits the Gateway environment (124 of
125 variables on V; only `SHELL` differs). OpenClaw has no claude-cli command
or env override in its config schema.

Deploy: `scripts/configure-v-claude-code-no-background.mjs check|apply|restore`
(drop-in `60-claude-code-no-background-tasks.conf`, daemon-reload only; the
switch reaches claude after the next Gateway restart, and `check` reports
whether the running process has it).

## Validation (candidate, real data copy, production versions)

`lab/candidate/vcc-background-tasks.mjs`, Claude Code **2.1.280** installed
privately (VLab ships 2.1.273, which rejects `claude-opus-5-5`), model
`anthropic/claude-opus-5-5` on claude-cli, a background subagent waiting 60 s:

| | baseline (`…-baseline.plan.json`) | fix (`….plan.json`) |
|---|---|---|
| switch in claude's environment | no | yes |
| background launch | yes | no — the parameter is dropped, the subagent runs in the foreground |
| reply ready → delivered | **held 66.8 s** | **1.3 s** |
| candidate | `candidate-4eb2623b-64e0-4942-b15c-aaf0162f8ee1` | `candidate-92c1fe8a-6431-4dde-843d-b8ed56cf4507` |

The baseline asserts the failure actually reproduces, so a pass on the fix is
not vacuous.

Two things the test had to work around, both worth knowing:

- OpenClaw's startup PATH bootstrap puts its trusted directories (so
  `/usr/bin`) ahead of the caller's PATH, and the claude-cli backend only runs
  `claude` from PATH. The test sets `OPENCLAW_PATH_BOOTSTRAPPED=1` to keep its
  private CLI first and asserts which binary the Gateway spawned.
- Claude Code refuses a bare foreground `sleep N`, and OpenClaw's
  `Bash(run_in_background:true)` rule does block background Bash — so the
  subagent waits in Python.

## Trade-off

With background tasks off, long `/vcc` work runs in the foreground: the reply
arrives when the work is done instead of immediately. It always arrives.
