# 投影重建期间，媒体完成等跨会话回合等待投影，不再直接失败

2026-10-17 CST。接 `docs/gateway-freeze-20261016.md`、PR #404。

## 问题

V 10/17 00:39，马晴会话 7da00997（143 MB）有 4 个回合在到达模型之前就失败了：
- 每个都只用了约 300 ms；
- 报错是 `Session transcript projection is rebuilding`；
- 用户看到的是错误卡。

这 4 个回合都是生图完成后的唤醒回合，runId 形如 `image_generate:<id>:ok:agent-loop`。

## 根因

**唤醒回合怎么入队。** `subagent-announce-delivery` 把生成媒体的完成结果，作为带 `inputProvenance { kind: "inter_session", sourceTool: "image_generate" | "video_generate" | … }` 的回合放入队列。

**等待只覆盖了两种 sourceTool。** PR #399 在 `builtin-openclaw-zQV8Wwjr.js` 里加的 `waitForSubagentCompletionProjection` 会在回合开始前等投影就绪，但条件是 `sourceTool` 属于 `subagent_announce` 或 `agent_harness_task`。媒体完成回合不在其中，所以不等。

**失败发生在哪。** 在 worker 里，`prepareEmbeddedAttemptSessionManager → SessionManager.open → openBounded → readSessionTranscriptBoundedActiveContextCore` 读到过期投影，直接抛错。这是 candidate 探针抓到的调用栈。

**用户消息回合为什么没事。** 它们在 `persistUserTurnTranscript` 里本来就会等投影就绪：VLab 实测，标脏后的用户回合等了约 16 s，然后成功。

## 改动

只改 `builtin-openclaw-zQV8Wwjr.js`：
- before `71c2310a73dbfa66d70fe560ff13132c620f0033439e604417842412758a67bc`（V = VLab，即 PR #399 的产物）
- after `2e87605aea33d4bf26f8420f38af14a597a636b3749932492a4a9e903997d62c`

等待条件从「inter_session 且 sourceTool 属于两个指定值」改为「所有 inter_session 回合」。等待器本身不变：
- 原生的有界等待，上限 15 s；
- 跨进程判断就绪；
- 校验规范 generation；
- 不重放 prompt，不重试。

## 验证

VLab candidate，`lab/candidate/projection-rebuild-turn.mjs`：
- 数据：24,073 事件、170 MB 的会话，FTS 12 万行；
- 每个回合开始前把会话标为需要重建；
- 媒体回合经 `agent` RPC 发起，带 `inputProvenance { inter_session, image_generate }`；
- 用探针记录每次抛「rebuilding」的调用栈。

| | 原版 candidate-9e10cffe | 修复 candidate-4937d02f |
|---|---|---|
| 媒体回合，会话已标脏 #1 | 成功（93.5 s） | 成功（40.0 s） |
| 媒体回合，会话已标脏 #2 | **失败，11 s，projection is rebuilding**（与 V 相同） | **成功，19.6 s** |
| 媒体回合，投影干净 | 成功 | 成功 |
| 「rebuilding」导致的回合失败 | 1 次（日志 3 条） | 0 |

修复版的探针显示，worker 在 `waitForSubagentCompletionProjection` 里等到了投影就绪，命中 2 次。

用户消息回合（chat.send）在两轮里都受大上下文模型本身影响（一次超时，一次模型中途出错）。两边走的是同一条已有的等待路径，与本改动无关。

测试：`lab/patch-projection-wait-all-inter-session.test.mjs`。
