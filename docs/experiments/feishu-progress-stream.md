# Progress card in the Feishu streaming reply

VLab candidate, 2026-09-25. Patcher:
`lab/release-files/feishu-progress-stream/patch-feishu-progress-stream.mjs`
(markers `v-progress-card-changed-listeners-v1` / `v-feishu-progress-stream-v1`).

## Problem

When an agent maintains its progress card, the Feishu reply card showed only
the tool status line `🖼️ Progress Card`. The plan and the note were dropped:
the Feishu `onToolStart` path for visible-progress runtimes renders the tool
name with `detailMode:"status"` and never reads the arguments, and the Feishu
dispatcher does not implement `onPlanUpdate` at all (Telegram does).

## Why one Gateway hook, not reply callbacks

Each runtime reports the call differently:

| Runtime | How the card is written |
| --- | --- |
| codex | OpenClaw dynamic tool in the Gateway process; native Codex plan updates are also persisted through the same tool (`onNativePlanUpdate`) |
| claude-cli | `mcp__openclaw__progress_card` over the OpenClaw MCP bridge |
| V worker | tool runs in the worker, `callInProcessGatewayTool` falls back to Gateway RPC |
| built-in | tool in the Gateway process |

All of them end in the Gateway's `progressCard.put`. Following the
secret-entry v2 design (subscribe to the Gateway lifecycle, not per-runtime
callbacks), the core notifies in-process listeners on a global symbol next to
its `progressCard.changed` broadcast, and the Feishu monitor subscribes to it.

## Behaviour

- Each reply dispatcher listens from reply start to cleanup for its own
  session key only (lower-cased match).
- The card is rendered into the streaming card body, after the commentary and
  before the status line. No separate card element.
- The `progress_card` status line is suppressed for all runtime spellings.
- The block is working state: the closed card keeps only the answer, and a
  progress update after the reply went idle never opens a new card.

Default rendering (style to be settled in VLab Feishu):

```
**📋 进度 1/3**
✅ <font color='grey'>读需求</font>
🔄 **写方案**
⬜ <font color='grey'>复核</font>
```

Plans over 12 steps fold the finished head into one line. The note keeps its
markdown, draws `<progress>` as `▰▰▰▰▰▰▰▱▱▱ label`, and strips all other tags,
so agent text cannot forge `<at>` mentions or colours.

## Evidence

Unit: `node --test tests/patch-feishu-progress-stream.test.mjs` (10/10),
including the patch against the captured production Feishu monitor.

Candidate `lab/candidate/feishu-progress-stream.mjs`: private Gateway with no
channels, probe preloaded into the Gateway process on the same symbol, real
turns on `agent:makaron:feishu:direct:*` keys asking the model to call
`progress_card`. Inputs matched shared VLab and production bytes
(core `d32a0caa…`, Feishu monitor `605b3124…`).

| Scenario | Model | Result |
| --- | --- | --- |
| V worker | deepseek-v4-flash | event in Gateway process, exact key, plan + note intact |
| built-in (in-process, the Codex tool path) | deepseek-v4-pro, `agentRuntime: openclaw` | same |
| claude-cli | claude-sonnet-5 | same |
| codex | gpt-5.6-sol | **not covered**: VLab has no OpenAI auth profile |
| baseline, unpatched core | worker + claude-cli | both replied OK, probe saw 0 events |

The patched Feishu monitor also imported cleanly against the real runtime.

Not covered by the candidate: the Feishu card rendering itself (needs the
shared VLab bot), and a real Codex turn. The in-process scenario exercises the
same Gateway call a Codex dynamic tool makes, but not the Codex harness.
