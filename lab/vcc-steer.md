# /vcc steering (claude-cli live sessions)

Tianyi, 2026-11-06: steer seems to do nothing on /vcc. Only V has a working Claude subscription.

## What was wrong

Reproduced in V's test group 2026-11-06 00:00 CST (/vcc, then a 45 s Bash task, then a message 25 s
in): the second message was answered as a separate turn after the first reply.

A message that arrives during a reply is steered only when the reply's backend offers message
injection (`replyRunRegistry.resolveCurrentMessageInjectionTarget` -> `backend.messageInjection`).
The claude-cli reply handle was `{ kind, runId, toolAuthorityFingerprint, cancel }`, so every steer
fell back ("no injectable reply operation") to a follow-up turn. (The vlab-worker handle is the same:
its `messageInjection.isAvailable()` is `false`; not changed here.)

## What Claude Code does with a message written mid-turn

V already drives /vcc through a live Agent SDK session (`cli live session start`, one process across
turns, prompts written into `query({ prompt: PassThrough })`). Probes against V's own Claude Code and
SDK 0.3.241 (haiku, a 20 s Bash tool, a second message written at 8 s or 23 s):

| Second message written | Claude Code |
|---|---|
| while the tool runs | consumed at the tool boundary, one result that answers both |
| while the final answer is produced | ends the turn (result 1), then runs a turn for it (result 2) |
| `priority` unset vs `next` | same |

With `--replay-user-messages` each consumed user message is echoed with its uuid (`isReplay: true`),
before the result in the first case and after it in the second.

## Change (`vcc-steer-live-injection-v1`, 2 V files)

- `extensions/anthropic/agent-sdk.runtime.js`: the live session handle gains `canQueueMessage()` and
  `queueMessage(text)`; a steer is written into the running process with `priority: "next"` and its
  uuid is tracked. Live sessions pass `--replay-user-messages`; echoes clear the uuid and are never
  forwarded. At a result the turn stays open while a steer is unconsumed, so the follow-on turn's
  text joins this reply (the JSONL parser already joins several results). No echo within 60 s ends
  the turn and closes the process. A steered prompt does not get the turn's prompt context again.
- `execute.runtime-DRmvah87.js`: the plugin-executed claude-cli reply handle exposes
  `messageInjection` while its live session can take a steer, plus the run's
  `sourceReplyDeliveryMode` / `taskSuggestionDeliveryMode` (group-chat steers carry them). Images and
  any other case still fall back to a follow-up.

Source: openclaw-versa `versa/port-vcc-steer-20261106` (`6f600039627`). Build:
`node lab/build-vcc-steer.mjs --base <dir with V's bytes>`; plan `lab/vcc-steer.plan.json`.
Needs a Gateway restart.

## Tests

- `lab/vcc-steer.test.mjs` (9): plan vs V bytes, marker/parse/idempotence, the handle wiring, and the
  patched runtime against a simulated Claude Code (tool-time steer, answer-time steer, missing echo
  timeout, no duplicated prompt context).
- versa: `extensions/anthropic/agent-sdk.runtime.test.ts` 34/34 (3 new, which fail without the
  source change); `src/agents/cli-runner/` 501/501; `tsgo` clean for the changed files.
- VLab candidate (`lab/candidate/vcc-steer/`): VLab's Claude Code login belongs to an organization
  that disabled subscription access, and VLab's state binds claude-cli to `/usr/bin/claude`, so the
  private Gateway runs in its own mount namespace with that entrypoint bind-mounted to a fake Claude
  Code (`fake-claude.mjs`, which reproduces the probed behaviour above; install with
  `install-fake.sh install`, remove after). Everything on the OpenClaw side is real: `chat.send
  queueMode=steer` -> injection target -> CLI handle -> live session -> process stdin.

| | baseline (V today) | fixed |
|---|---|---|
| A: steer during a tool | reaches Claude after the reply, answered separately | consumed in the same turn: `MAIN-A \| STEER-A` |
| B: steer during the answer | separate reply | same OpenClaw run carries both results |
| C: next message | — | answers only `MAIN-C`, nothing leaks |

Receipts: fixed `candidate-8053e38d-7ea2-4612-9dfd-4c21f5ffdf7c` (PASS), baseline `candidate-7fcb802f-9f5d-4a73-a1cd-039fb43e5170`.

## Not covered

- Real Claude Code + Feishu end to end: only possible on V; after go-live, repeat the test-group
  repro (expect one reply mentioning the steer) and check `cli live session` logs.
- /vcc on a paired node (node placement) and the managed-process path keep follow-up behaviour.
- Image steers fall back to a follow-up (`supportsQueueMessageImages` not set).
