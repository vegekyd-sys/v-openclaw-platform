# Feishu visible progress for the Claude CLI harness (`/vcc`)

VLab experiment, 2026-09-17. Shared VLab mirror
`openclaw-vlab-production-mirror-v8.service`, integration lease
`claude-vcc-streaming`, Feishu app `cli_aae2c999c7789bd9` (`V - Lab`) — a
different app from production V's `cli_a9365919fc3a1bd6`, so no WebSocket
contention with production.

## Problem

`/vcodex` streams its working commentary into the Feishu card. `/vcc` showed an
empty card for the whole run and then one final answer.

The cause is not configuration. OpenClaw core already bridges CLI-backend
commentary for `claude-cli`:

```
Claude Code stream-json
  -> classifyClaudeCommentary            (supportsCliJsonlToolEvents -> isClaudeCliProvider)
  -> onCommentaryText
  -> bridgeCliPreambleProgress           (shouldBridgeCliPreambleEvents: commentaryProgressEnabled)
  -> onItemEvent({kind:"preamble", progressText})
  -> Feishu dispatcher                   <- dropped here
```

The deployed `worker-visible-progress-v4` / `vlab91-codex-commentary-v5` patches
gate the Feishu dispatcher on a hardcoded runtime allowlist:

```js
if (closed || !['codex', 'vlab-worker'].includes(runtime) || payload?.kind !== 'preamble' ...) return null;
```

Three sites carry that allowlist: the commentary state, `onToolStart`, and
`onCompactionStart`. No environment variable or config key reaches them.

## Change

`scripts/apply-feishu-claude-cli-streaming-patch.mjs` (marker
`claude-cli-visible-progress-v2`), shape-gated and idempotent:

1. Add `claude-cli` to all three runtime allowlists.
2. Retire commentary when the first final-answer partial arrives, scoped to
   `claude-cli` so `codex` / `vlab-worker` keep their deployed behaviour.

Step 2 is not optional. Commentary assigns `streamText` directly while the final
answer arrives through `queueStreamingUpdate(..., mode:"snapshot")`, which
merges against `snapshotBaseText`. Without the reset the two texts concatenate —
observed on the first candidate run as a card reading
`...负载 3.97 / 3.27 / 2.83第一步，我先用 pwd...`. `vlab91Commentary.close()`
otherwise only runs in `performStreamingClose`, at the end of the turn; the
mid-turn `final` transition that the never-promoted VLab `v0.1.3` design called
for does not exist in the deployed bundle.

## Result

Baseline (unpatched, same prompt): card created at +12.8s carrying only the
footer, no body until the final answer replaced it at +21.0s. The three
interim sentences the model produced before each tool call were never shown.

Candidate (patched), from dispatcher instrumentation:

```
accepted=true closed=false kind=preamble ptLen=22 pt=第一步，我先用 pwd 看一下当前工作目录。 out=22
card-update len=22 :: 第一步，我先用 pwd 看一下当前工作目录。
card-update len=32 :: 第一步，... 🛠️ Bash
accepted=true ... 第二步，我来数一下 /etc 下的 .conf 文件 ... out=59
card-update len=69 :: 第一步... 第二步... 🛠️ Bash
accepted=true ... 第三步，我用 uptime 查一下系统运行了多久。 out=86
card-update len=96 :: 第一步... 第二步... 第三步...
final-retires-commentary len=310
card-update len=320 :: 三步都跑完了，结果如下：...
```

Commentary accumulates in place, the tool status line appears, and the final
answer replaces the whole body exactly once. The end-state card carries only the
final answer.

Gateway health across five restarts: `NRestarts=0`, cold start 95-165s.

## Known limitation

A message that carries the `/vcc` directive **and** the task produces no
preamble events at all for that turn — the probe never fires, so it is not the
commentary state being closed; the model-switch reply path runs that turn
without `onItemEvent`. Streaming works normally from the next message onward.
Workaround: send `/vcc` on its own, then the task. Not investigated further.

## Measurement note

Polling `im/v1/messages` does not reveal intermediate card states: both the
baseline and the candidate look like "empty card then final" through that API.
The only reason the concatenation bug was visible there is that it survived into
the final text. Live visibility has to be proven from dispatcher instrumentation
or by a human watching the card.

## Fidelity gaps closed during setup

- vLab Claude Code CLI 2.1.133 -> 2.1.273, matching production.
- `messages.visibleReplies` / `messages.groupChat.visibleReplies` set to
  `automatic`, matching production.
- `channels.feishu.streaming.block.enabled` `true` -> `false`, matching
  production. With block streaming on, every run also posted a duplicate
  standalone final message.

## Rollback

```bash
# bundle
cp -a <bundle>.bak-claude-cli-visible-progress-v2-<ts> <bundle>
# config
cp -a <config>.bak-vcc-20260917-091327 <config>
systemctl restart openclaw-vlab-production-mirror-v8.service
```

Pristine bundle sha256 `b7d3bbb1f7bd29da191670987775daaa3be3728285591a86898400e8c4aa8e63`,
patched `f24dc3cb46b90c1dea176b6bc4b491415c6b5b0e60fd3bb206d6d066763b4655`.

## Not done

Production promotion. The Feishu monitor bundle is global to every Feishu
conversation, and production's copy is a different build (it carries a
`pre-perchat-cap-20260915` lineage vLab does not), so the patcher must be re-run
against production's own bytes rather than copying this artifact — see
`release-artifact-rebase-trap`. Promotion needs a separate user decision, a
fresh production backup, and a real `/vcc` programming-session acceptance.
