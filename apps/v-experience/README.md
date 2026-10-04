# v-experience

V's conversation experience, written once and rendered by each channel.
Plan and channel matrix: [docs/v-experience.md](../../docs/v-experience.md).

`v-experience.mjs` has no imports. A channel patch copies it next to the
channel's code as `v-experience.mjs` and calls it; the channel keeps only the
transport (send, rewrite, Gateway calls).

| Piece | What the user sees | Gateway input |
|---|---|---|
| work view | answer so far, then a rule and: 💬 latest commentary, ✅/▶️/◻️ plan, ⚙️ current tool, ❓ waiting for an answer. Gone from the finished reply. | `progressCard.put` listeners (V core), `onPlanUpdate`, `onToolStart`, `onItemEvent`, compaction callbacks |
| questions in chat | ask_user as its own message, numbered options, answered by typing (`3`, `1、3`, `1. …` lines). Answering bypasses the channel's queue and resolves the Gateway question directly. | `question.get` / `question.resolve` |
| background line | `⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1` → `☑️ 后台任务已结束` | V core task registry bridge |
| link cards | a Feishu-like card: title, a few lines, a link button. The credential link (「🔑 V 需要凭据 X」, 填写凭据) and V's desktop handoff card (「需要你接管 V 的电脑」, 接管电脑). DingTalk `actionCard` (link wrapped as `dingtalk://dingtalkclient/page/link?url=…&pc_slide=false`), WeCom `text_notice` template card, Telegram inline URL button; text link when the platform refuses the card | `deliverSecretQuestion`; `openclaw message send --presentation` (handoff plugin) through the channel's outbound `renderPresentation` / `sendPayload` |
| Telegram staged questions | toggle buttons + 确认 for multi-select / several questions (not wired; Telegram stays stock for now) | — |

## Channels

| Channel | Patch | Target on V | Notes |
|---|---|---|---|
| DingTalk | `dingtalk/patch.mjs` | `@dingtalk-real-ai/dingtalk-connector` 0.8.26 `dist/message-handler-BUoLSylZ.mjs`, `dist/connection-DCvu-l09.mjs`, `dist/runtime-C81EKBS1.mjs` | Work view inside the streaming AI card; background line rewrites the finished card. Questions used to be dropped (the connector ignored `tool` payloads). |
| WeCom | `wecom/patch.mjs` | `@wecom/wecom-openclaw-plugin` 2026.8.17-vlab.2 `dist/src/monitor.js`, `dist/src/channel.js` | Adds answer streaming (the plugin sent the whole reply at the end) and the work view inside the stream message. Six-minute stream limit: the background line is part of the finished reply and "已结束" is a new message. Answers used to wait behind the turn that asked (per-chat queue). |

`*/baseline/` holds V's unpatched bytes for the tests; `*/fetch-*.sh` copies the
plugin code from V into `tmp/inputs/` for candidate runs.

## Tests

```sh
node --test tests/v-experience.test.mjs
apps/v-experience/dingtalk/fetch-connector.sh
apps/v-experience/wecom/fetch-plugin.sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK --plan "$PWD/lab/candidate/dingtalk-experience.plan.json"
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK --plan "$PWD/lab/candidate/wecom-experience.plan.json"
# link cards: {dingtalk,wecom}-{secret-link,handoff-card}.plan.json, telegram-secret-link.plan.json (one at a time)
```

The candidates run the real plugin in a private Gateway against loopback fakes
of the DingTalk open platform and the WeCom robot socket
(`lab/candidate/*-fake-*.mjs`), with real model turns on the VLab Worker. They
prove what the plugin sends; they cannot prove how the DingTalk or WeCom client
renders it (markdown, post-finish card updates). That needs a test bot.
