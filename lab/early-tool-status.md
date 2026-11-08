# Early tool status: the status line when the model starts a tool call

Status: rebuilt on V's bytes 2026-11-08, Feishu e2e A/B done (below), not on V. Fork source
`vegekyd-sys/openclaw-versa` `versa/port-early-tool-status-20261108` @ad7497575da.

## What V shows

Feishu 首字 (create_time to first push), Worker (deepseek-flash), 2026-11-05..07, 865 replies whose
session had no turn still running:

| first visible event | n | event -> Feishu card start P50 / P90 / P95 |
|---|---|---|
| tool call (toolcall_start in the model stream) | 610 (70%) | 0.55 / 1.86 / 3.74 s |
| answer text | 255 | 0.02 / 0.11 / 0.28 s |

In between the model is still streaming the tool's arguments; the status line ("正在 …") waits for
tool_execution_start.

## Why it was never on V

#303 (v1, Worker path never fired) and #309 (v2, process-wide event bus) were merged into dev on
2026-10-10. The release files were built on bytes from before 10/13 and would have reverted every later
change to the same two files (#317, #322, ...), so the 10/13 triage left it parked.

## The change

The embedded agent reports a tool `input_start` event (name + toolCallId, no arguments) the first time a
tool call appears in the stream, on the process-wide bus and the run callback, like the real tool start;
the reply runner shows it as a tool start (`onToolStart`). The real start follows and refreshes the
same line. Nothing the model sees or the tool does changes. `OPENCLAW_EARLY_TOOL_STATUS=0` turns it off
(checked on both sides).

Files (built from `release/captured/cron-default-owner-tools-20261107`, which is V on 2026-11-08):
`builtin-openclaw-zQV8Wwjr.js` (a44b846a -> 10af16f4), `agent-runner.runtime-CAdsMsQt.js`
(09f1b500 -> ec866319), by `lab/patch-early-tool-status.mjs`. Worker turns pick the builtin up through
`vlab.workers.roll`; the agent-runner runs in the Gateway, so the change is live after a Gateway restart.

## Tests

- Platform: `lab/early-tool-status.test.mjs` (release files = V's captured bytes + only this patch; the
  inserted blocks run in vm for each event shape and the kill switch).
- Fork: `src/agents/embedded-agent-early-tool-status.test.ts`,
  `src/auto-reply/reply/agent-runner-event-handler.early-tool-status.test.ts` (fails without the change);
  three reasoning-delivery cases that asserted the whole onAgentEvent list now assert tool and item events
  separately. 65 related test files, 1,584 tests pass on Node 22.23.1.
- Candidate: `lab/candidate/early-tool-status-e2e.mjs`.

## Feishu e2e A/B

A private Gateway on VLab's runtime runs V's Feishu plugin and V's vlab-worker runtime against a local fake
Feishu (REST + Lark WebSocket frames) and a loopback DeepSeek: a tool turn streams reasoning, the tool call
header, then 1.5 s of arguments, then the answer; a text turn answers without a tool. Each reply is a real
Feishu turn (inbound event, dispatcher, Worker, streaming card, final reply); timings are V's own
`[firsttext-e2e.1]` record. Two warm-up turns per arm are not counted.

VLab candidate, 2026-11-08 13:21-13:32 CST, same runtime (VLab = V's bytes), one arm after the other,
8 tool turns + 4 text turns each, ms:

| | base (V bytes) | on (this patch) | off (patch, `OPENCLAW_EARLY_TOOL_STATUS=0`) |
|---|---|---|---|
| tool turn: tool call header -> first card push, P50 / P90 / max | 1571 / 1588 / 1604 | **20 / 22 / 25** | 1566 / 1573 / 1643 |
| tool turn: first push before the arguments finished | 0 / 8 | **8 / 8** | 0 / 8 |
| tool turn: Feishu send -> first card push, P50 / P90 | 3469 / 3658 | **1887 / 1977** | 3417 / 3527 |
| tool turn: Feishu send -> first answer push, P50 / P90 | 5709 / 5908 | 5683 / 5745 | 5693 / 5768 |
| text turn: Feishu send -> first card push, P50 / max | 2585 / 2685 | 2592 / 2856 | 2617 / 2667 |
| dispatcher -> Worker submit, P50 / P90 (all turns) | 209 / 306 | 193 / 252 | 207 / 246 |

In every arm the first card content of a tool turn is the same status line ("📊 Session Status"); with the
patch it arrives 20 ms after the model starts the tool call instead of after its arguments. All 42 turns
replied; every tool turn called the tool once. The answer, text turns and the path into the Worker are
unchanged, and the switch gives back the base behavior.

What this means on V: the saving is the argument streaming time of the first tool call, which on V is
P50 0.55 s, P90 1.86 s, P95 3.74 s for 70% of Worker replies (larger for long writes and commands).
