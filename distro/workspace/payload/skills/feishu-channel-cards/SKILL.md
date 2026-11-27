---
name: feishu-channel-cards
description: Create polished Feishu/Lark interactive cards using Channel SDK or Feishu card JSON. Use when the user says 卡片/card/交互卡/进度卡/报告卡/审批卡/交付卡, or when a Feishu task needs realtime in-place progress updates, buttons/callbacks, links, artifact delivery, approval/confirmation, dashboard/stalled-session/liveness alerts, report delivery, customer-facing status, or mobile-friendly structured UX. Applies to all long tasks, not just web reports or Makaron. Also covers reply cards: when a Feishu reply has a series of numbers, key metrics, options to compare, a schedule or good/bad status, the reply itself is a card (references/reply-cards.md).
---

# Feishu Channel Cards

Use this skill to make Feishu/Lark long tasks observable and actionable through **one card updated in place**.

## 两种卡片，先选对

| | 回复卡片 | 实时进度卡 |
|---|---|---|
| 是什么 | 这一条回复本身就是卡片：整条回复只写一个卡片 JSON 2.0，渠道原样发出 | 一张卡随任务原地更新（Channel SDK / `streamCard()` / runner） |
| 什么时候 | 结果一次给全：趋势与数据、开支汇报、多方对比、行程计划、调研结论 | 长任务过程：生成、构建、部署、批处理，要按钮回调或审批 |
| 怎么做 | 读 [references/reply-cards.md](references/reply-cards.md)，套版式 | 按下面的流程和脚本 |

需要一张静态结果卡时用回复卡片（完整 JSON 2.0：图表、分栏、表格、折叠、按钮都能用），不再用 `message.send` + `presentation`。长任务结束时，最终结果可以直接写在进度卡里，也可以另发一张回复卡片，不要两边重复。

## Important distinction

`message.send` with `presentation` is a lightweight static card fallback. It is **not** the realtime `feishu-channel-cards` workflow.

For long tasks, the intended path is Channel SDK / `streamCard()` / `live-card-state-runner.cjs`, so one card can be updated in place. Use `presentation` only when the SDK runner is unavailable, too risky, or the task is short enough that static delivery is acceptable.

This is a general Feishu interaction layer. It is **not** Makaron-specific and **not** report-web-specific. Apply it to any task where plain text would hide state, bury links, or force the user to wait until the end.

## Core rule

For long Feishu tasks:

> Feishu card = realtime control/status surface.  
> Final artifact = web report / video / doc / Bitable / file / dashboard link.

Do not send only a start card and a final card. Update the **same card** through the task lifecycle.

## When to use

Use a card for:

- Long-running task progress: video/image generation, report build/deploy, ASR, research, batch jobs, scripts, uploads/downloads.
- Report delivery: web reports, daily session reviews, research reports, A2A summaries, customer proposals.
- Approval/confirmation: approve, retry, revise, skip, continue, choose option.
- Artifact delivery: video/doc/Bitable/project/dashboard links.
- Dashboard/stalled/liveness alerts.
- Customer-facing status where readability and polish matter.

Do **not** use a card for ordinary short replies or simple Q&A.

## Required behavior

1. Send one initial card quickly via Channel SDK or `streamCard()` when possible.
2. Update the same card in place using `channel.stream()` / `streamCard()` / `live-card-state-runner.cjs`.
3. If forced to use `message.send` + `presentation`, explicitly treat it as a static fallback, not a completed realtime-card workflow.
4. Show user-facing stages, not internal tool calls.
4. Attach final artifact links/buttons to the same card.
5. After the final card contains progress/result/links, **do not repeat the same content in ordinary chat text**. Use `NO_REPLY` as the final assistant response when appropriate.
6. If card sending fails, send a concise plain-text fallback and say the card failed.

## Standard lifecycle

For any long task, map work to 4-6 user-facing stages:

- `准备 / 收集素材`
- `执行 / 生成草稿`
- `验证 / build / check`
- `部署 / 上传 / 发送产物`
- `完成 / 等待确认`

For report-web tasks specifically:

- `scan` → `draft` → `build` → `deploy` → `verify` → final report link.

## Card DSL

Use a compact DSL before rendering:

- `title`
- `subtitle`
- `status` + `color`
- `progress`
- `summary` in 1-3 bullets
- `sections` for progress, findings, artifacts, errors
- `actions` for buttons/links/callbacks

See `references/card-dsl.md`.

## UX guardrails

- Mobile first: large readable text, short sections, no dense tables.
- Use one strong status line and a progress bar.
- Pair common buttons with 1:1 width (`column_set.flex_mode: bisect`).
- Avoid card `replyTo` when it causes ugly `[Interactive Card]` quote previews.
- Do not expose `read:`, `exec:`, raw stack traces, tokens, secrets, Authorization headers, or private local paths.
- Keep logs user-facing: “build passed”, not raw command output.
- Ordinary text after a successful card should not restate the card. Only use text for blockers, errors, or information not in the card.
- For **presentation cards**, do **not** manually write `Agent / Model / Provider` metadata in the LLM content. The Feishu channel should auto-append attribution as the native small gray footer (`divider + grey note`) inside the card. Use `context` only for genuine user-facing status notes when needed; never expose internal tool calls or raw commands.

## Implementation resources

- `scripts/card-runner-template.cjs`
  - `renderCard(dsl)`
  - `connect(target)` / `disconnect(channel)` / `withChannel(target, fn)`
  - `streamCard(channel, target, initialDsl, producer)`
- `scripts/live-card-state-runner.cjs`
  - Watches a JSON state file and updates one card in place.
  - Useful when a shell/Python workflow wants to update progress without embedding all logic in Node.
- `references/card-dsl.md`
- `references/channel-sdk-notes.md`
- `references/reply-cards.md` — 回复卡片：什么时候用、组件写法、趋势/对比/行程/汇报四种版式（每种都实测飞书接受）
- `references/feishu-card-json-v2.md` — official Feishu Cards JSON v2 links + form/input schema + 200530 debugging notes

## Target IDs

Use Channel SDK native targets:

- Group chat: bare `oc_*`
- DM/open user: bare `ou_*`

Do **not** pass OpenClaw message-tool prefixes like `user:ou_*` or `chat:oc_*` to Channel SDK.

## Form / input components

When a card needs free-text input, read `references/feishu-card-json-v2.md` before implementing. Key rules:

- `form` / `input` are Feishu Cards JSON v2 (CardKit) components, not basic Channel SDK button-only DSL.
- The form must contain a submit button with `form_action_type: 'submit'`.
- Every interactive component inside the form needs `name`; the submit button also needs `name`. `element_id` alone is not enough and can cause client error `200530` when clicked.
- Submitted values are returned by Feishu under `action.form_value`, keyed by component `name`. If Channel SDK normalized `cardAction` drops this field, create the channel with `includeRawEvent: true` and inspect `evt.raw`.
- Keep OpenClaw quick callback payloads small and flat (`oc/k/a/q/jobId/step`). Deep nested payloads have caused `This card action payload is invalid`.

## Connection safety

Card scripts are **outbound only**. Never open a Feishu WebSocket from a script (`channel.connect()` without `transport: 'webhook'`, `channel.on(...)`, `WSClient`): the Gateway owns the app's event connection, and Feishu gives each event to only one connection, so a second one silently eats users' messages in every V chat. `scripts/card-runner-template.cjs` already uses `transport: 'webhook'`; reuse its `connect()` / `withChannel()` instead of writing your own. Button clicks come back through the Gateway. See `references/channel-sdk-notes.md`.

Still disconnect in `finally` with a timeout fallback.

For long creative/customer tasks, prefer an isolated sub-agent or background runner so the inbound Feishu session stays responsive.
