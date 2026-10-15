# 超大会话的上下文超限（2026-10-15）

起因：监控会话在 V 上看到超大会话反复出现英文 `Context overflow: prompt too large for the model. Try /reset (or /new)…`，涉及 deepseek-flash 上的两个会话（10/15 17:02、17:53），以及 luna 临时当主模型时（10:12–13:01）的 4 个会话。

本文按 V 10/15 的字节（`db91-release-v2026.9.1-db91.6/core`，已含 history-image-e3 与 upstream-5xx-fallback）、journal 和 `/tmp/openclaw/openclaw-2026-10-15.log` 复核。

## 1. 生产上实际发生了什么

**10/15 的 6 次溢出全部自动恢复了，用户没有看到英文报错。**

| 时间（CST） | 会话 | 模型 | 触发 | 结果 |
|---|---|---|---|---|
| 10:16 | 群 oc_6b3e67b6（233 条） | luna | 回合中途预检估算 29.5 万 > 25.2 万 | 压缩 12 s → 重试 → stop |
| 10:22 | 私聊 ou_3fe4922d（223 条） | luna | 预检 25.27 万 > 25.2 万 | 压缩 34 s → stop |
| 10:52 | 群 oc_4383a58b（303 条） | luna | 预检 31.0 万 | 压缩 16 s → stop |
| 11:37 | 私聊 ou_3fe4922d（177 条） | luna | 预检 25.27 万 | 压缩 21 s → stop |
| 17:02 | 群 oc_ecabb651（1209 条） | deepseek-flash | DeepSeek 400：71.5 万输入 + 38.4 万 max_tokens > 1,048,576 | 压缩 36 s → 重试 → 完整回答 |
| 17:53 | 私聊 ou_2e57da32（955 条） | deepseek-flash | DeepSeek 400：74.2 万 + 38.4 万 | 压缩 27 s → 重试 → 完整回答 |

- 日志里的英文 `Context overflow: … Try /reset` 来自 `embedded_run_agent_end` 诊断事件，是第一次请求失败那一刻打的，不是发给用户的文字。
- 会话库里两个 DeepSeek 会话：失败那次请求留下一条 `content: []`、`stopReason: error` 的 assistant 记录，后面是 compaction 条目（摘要有真实内容），再后面是完整回答。后续消息（17:21、17:36）没有再溢出。
- 飞书卡片是在压缩完成、重试开始后才创建的（17:03:21、17:54:06）。
- Control UI 回看历史时，那条错误记录会显示成英文「this conversation is too large…」（`session-transcript-readers` 的兜底文案），这是旁观者能看到的英文。

**本周（10/08–10/15）真正失败、用户收到英文的只有 3 次**（journal `Auto-compaction failed` / `exhausted provider overflow recovery`）：

1. 10/10 11:41 /vds（Codex runtime）413 请求体过大，另案（vds-image-bytes-413）。
2. 10/11 12:30 /vcc（claude-cli）压缩失败，另案（vcc-compact-window，PR #341）。
3. **10/12 14:49 群 oc_5195cdfe（455 条），deepseek-flash，vlab-worker**：
   - 这一轮先跑了 5 个工具，下一次模型请求被传输层预算守卫拒绝：`[V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED] estimated input 996075 tokens leaves 3924 of 1000000`。
   - `incomplete turn … tools=5 replaySafe=no compactions=0 — surfacing error to user`，worker 侧没有任何 `[context-overflow-diag]`，也就是**根本没进溢出恢复**。
   - 用户收到英文。

所以「每条都失败」在 10/15 的日志里不成立；真正会让用户失败的是第 3 种：**回合中途、工具跑完之后的那次请求超限**。

## 2. V 当前字节上的链路

Gateway 把 deepseek-flash 的回合交给 vlab-worker；worker 用 `VLAB_OPENCLAW_AGENT_RUNTIME=…/core/dist/plugin-sdk/agent-runtime.js` 加载同一份 core dist，在里面跑内置 runner（worker 配置里 deepseek-flash 的 runtime 是 `openclaw`）。所以下面的逻辑 Gateway 内置 runtime 和 worker 是同一份代码。

**token 估算有三套口径，互相不一致**
- 回合前/回合中预检（`helpers-BTOsl-oB.js`，`[context-pressure-diagnostic]`、`[context-overflow-midturn-precheck]`）：会话估算，与预算 `contextTokens − 20000 预留` 比。
- 传输层（`@openclaw/ai/dist/transports.mjs`）：对 proxy-like 端点，按 `estimateStringChars/4 × 1.25` 估输入（CJK 每字按 4 字符，即 1.25 token），`max_tokens = min(384000, 1000000 − 估算 − 1)`；余量 < 4096 时抛 `V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED`（PR #108）。
  - E3 的 `applyDeepSeekOutputBudget`（按真实 usage 估算）只管 `^deepseek-v4`，**deepseek-flash 不经过**。
- DeepSeek 自己的计数：中文约 0.6 token/字，代码和英文工具输出约 3–4 字符/token。
- 结果：中文为主的会话，传输层高估（10/12：估 99.6 万）；代码/日志为主的会话，传输层低估（10/15：真实 71.5 万，估算低于 61.6 万，`max_tokens` 没被钳，原样发 384000 → DeepSeek 400）。

**压缩触发**（V 两份配置相同：`mode: safeguard`、provider `versa-fast-quality-v1`、`midTurnPrecheck.enabled: true`、`compaction.model: deepseek/deepseek-flash`；worker 里实际摘要模型是 `azure-openai/gpt-5.6-sol`）
- safeguard 关掉了按阈值的自动压缩（9/29 已查明）。触发压缩只有两条路：
  1. 预检（回合开始或回合中途）判定超预算，抛 `Context overflow … (precheck)` / `(mid-turn precheck)`；
  2. provider 或传输层报溢出（DeepSeek 400、`V_COMPLETIONS_…`）。
- deepseek-flash 的预算是 100 万 − 2 万，预检很少命中；实际上压缩几乎都是第 2 条路触发的，触发点大约在 DeepSeek 真实 66.4 万（1,048,576 − 384,000）。

**溢出之后**（`embedded-agent-DaSvA-Yk.js`）
- `recoverEmbeddedRunAttempt` 先判：`if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason) return { action: "proceed" }`。
  - 回合开头溢出：attempt 可重放 → 进 `recoverEmbeddedRunOverflow` → 压缩 → 用压缩后的转录重发用户消息。10/15 的 6 次都是这条。
  - 回合中途、由预检发现：`canContinueSettledMidTurnOverflow` 放行 → 压缩 → 从当前转录继续（不重放用户请求）。10/04 生产实证过。
  - **回合中途、由 provider/传输层发现**（工具已执行，attempt 不可重放）：直接 `proceed`，不压缩，最后 `incomplete turn … surfacing error`。10/12 就是这条。
- 恢复用尽时的用户文字，按路径有 4 种，全英文：
  - `renderOverflowResetGuidance`：`Context overflow: prompt too large for the model. Try /reset (or /new)…`
  - helpers `formatUserFacingAssistantErrorText`：同上（failover 路径）
  - agent-runner `buildContextOverflowRecoveryText`：`⚠️ Auto-compaction could not recover this turn…` / `⚠️ Context limit exceeded…`
  - agent-runner 另外两处：`⚠️ Context overflow — prompt too large for this model…`、`⚠️ Context overflow — this conversation is too large…`
  - 只有 DeepSeek v4 预算守卫（`V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED`）有中文（E3 notice）。

## 3. luna 的窗口

- V 上 `openai/gpt-6-luna` 走 ChatGPT 登录（`openai-chatgpt-responses`），定义在 V 自己的补丁 `v91-gpt6-sol-luna-v1`（`openai-chatgpt-provider-BApw3_oy.js`）：`contextWindow: 1050000, contextTokens: 272000`。配置里没有覆盖，所以生效窗口是 27.2 万，预检预算 25.2 万（日志 `promptBudgetBeforeReserve=252000`）。
- **27.2 万与账号实际下发一致**。V 上 Codex 从 ChatGPT 后端拉的模型目录（`agents/makaron/agent/codex-home/models_cache.json`，10/15 18:26 刷新）：
  - `gpt-6-luna`：`context_window: 272000`，`max_context_window: 872000`，`supports_experimental_context: true`
  - `gpt-6-sol`、`gpt-6-astra`、`gpt-5.6-*` 同为 272000 / 872000；`gpt-6.1-sol` 为 500000 / 872000。
- 上游对 ChatGPT 登录的处理也是这样（`openai-provider` live catalog：`contextTokens = context_window`，`contextWindow = max_context_window`）。
- 结论：订阅路线上 luna **不是 100 万**。100 万是 API 规格；ChatGPT 登录默认 27.2 万，最多 87.2 万，要显式开扩展上下文。
- 要抬高：官方开关是 `models.providers.openai.models[{ id: "gpt-6-luna", name: "GPT-6 Luna", contextTokens: N }]`（`resolveContextWindowInfo` 优先取配置），N ≤ 87.2 万 × 95%。是否真的能用、是否额外计费，需要先拿一次超过 27.2 万的真实请求验证。本次没有做，也没有改。

## 4. 官方机制

- 配置开关：
  - `compaction.mode` 改回 default 能恢复按阈值压缩，但会丢掉 versa-fast-quality 的快速摘要（V 9/29 有意选的 safeguard），本次不动。
  - `contextTokens`：9/29 实测单独设会被传输层当成有效窗口，把大会话的 `max_tokens` 钳成 1，更糟。
  - `maxTokens`（deepseek-flash 384000）：调小能推迟 DeepSeek 400，但只是把压缩点往后挪，会话会长到接近 100 万才压缩，每轮输入更大，首字更慢；不解决回合中途的失败。不建议。
  - 都解决不了「回合中途 provider 溢出不进恢复」。
- 上游已修：**openclaw a6093ef81fa（#148383，2026-09-14，9.6 起带）"fix: continue tasks after provider context overflows"**。
  - `attempt-recovery.ts` 加 `canRecoverSettledToolResults`：工具全部落定（settled）、没有异步活动/审批/yield/client tool 时，放行溢出恢复。
  - `overflow-context-recovery.ts` 加 `requiresTranscriptContinuation = preflightRecovery?.source === "mid-turn" || !isCurrentAttemptReplaySafe(attempt)`，5 处原来只对 mid-turn 预检的「从当前转录继续」改用它。
  - 文档：「provider 在工具完成后拒绝请求时，内置 runtime 压缩并从记录的结果继续；不换模型、不重放已完成的操作」。
  - 后续 #172019（steer 后溢出）、#170141（溢出恢复后用 fallback）等更大，本次不带。

## 5. 改动（PR 分支 `claude/context-overflow-big-sessions`）

`lab/patch-context-overflow-recovery.mjs`，从 V 字节生成 `lab/release-files/context-overflow-recovery/` 三个文件，`lab/context-overflow-recovery.plan.json` 记录 before/after：

| 文件 | V before | after |
|---|---|---|
| `openclaw/dist/embedded-agent-DaSvA-Yk.js` | a53fe92d… | 682bb94a… |
| `openclaw/dist/embedded-agent-helpers-CzpaLpCq.js` | 63002d77… | 47fdc33b… |
| `openclaw/dist/agent-runner.runtime-CAdsMsQt.js` | 8c192b9d… | 8b64a58b… |

1. `context-overflow-settled-tools-v1`：回移 #148383。
   - `requiresTranscriptContinuation` 与上游一字不差，5 处替换。
   - 入口放行比上游窄：除了上游的 settled 条件，还要求这次错误确实是上下文溢出（`isLikelyContextOverflowError` / `isContextOverflow`）。这样超时等其他不可重放的失败仍按 9.1 原逻辑走，`recoverEmbeddedRunTimeout` 不会被新放行的 attempt 触发。
   - 放行时打一行 `[context-overflow-settled-tools-v1] … compacting and continuing from the transcript`，上线后可按它统计。
2. `context-overflow-notice-zh-v1`：恢复用尽时的 4 处英文换成一段中文，带两个在聊天里能用的操作：
   - 「这段对话太长，超出了模型能处理的上下文，自动压缩后仍然放不下，这一轮没有完成。请发送 /compact 压缩后重试，或发送 /new 开始新对话（长期记忆和文件不受影响）。」
   - 有副作用时追加「本轮已经执行过的操作不会重做，重试前请先核对结果。」
   - 压缩本身失败（会话映射保留）时用另一句，说明会话保持不变。
   - Gateway 收到 worker 已渲染的中文时原样转发（沿用 E3 的识别函数）。
   - DeepSeek v4 预算守卫的中文提示不变。
- 正常回合不经过任何改动的代码：改动只在 attempt 以错误结束之后才执行；文案只在恢复用尽时用到。

离线测试 `lab/context-overflow-recovery.test.mjs`：发布文件 = 补丁(V 字节)，plan 的 before 等于 V，5 处续写全部替换，英文文案清零，中文提示可透传。

## 6. candidate 证据

脚本 `lab/candidate/context-overflow-recovery.mjs`，plan `lab/candidate/context-overflow-recovery.plan.json`（不需要 lease）。

**设置**
- 两个私有 Gateway，各带 1 个 worker：
  - A = 共享 VLab runtime 的原字节。三个目标文件与 V 的 before sha 一致，receipt 里 `liveIsV: true`。
  - B = 同一份 runtime 套上补丁。结果与发布文件逐字节相同，`bIsRelease: true`。
- 模型配置同 V：deepseek-flash（vlab-worker → worker 内 openclaw，`maxTokens 384000`，`timeoutSeconds 90`）；压缩 `safeguard` + `versa-fast-quality-v1` + `midTurnPrecheck`。
- 真实 DeepSeek 前面挂录制代理。按消息里的标签注入 DeepSeek 原样的 400 溢出（`This model's maximum context length is 1048576 tokens…`）：
  - `midtool`：只对「工具之后的第一次请求」注入；
  - `start`：只对回合第一次请求注入；
  - `always`：每次请求都注入。
- 大会话：共享 VLab 镜像里的 `faa116bd`（群 oc_eb6d0748，V 规模），每个大会话回合前都恢复同一份原始私有库。
  - 每次请求 1.79 MB，DeepSeek 实计 **48.45 万 token**。
  - 测试副本里关掉了 30 天空闲重置和 14 天清理，否则这个 9 月的会话会被重新开（candidate-c44486cf 的教训）。
- 压缩摘要模型：VLab 没有 V 用的 `azure-openai/gpt-5.6-sol`，versa-fast-quality 报 OAuth/凭据错误后，退回 safeguard 的普通摘要（`compaction.model` = deepseek-flash，经同一个代理）。A/B 两臂一样。V 上实际用的是 azure gpt-5.6-sol，生产实测压缩 25–36 s（第 1 节）。

**结果**

candidate-a03ee738（V 规模，worker 路径，agent CLI 驱动），每个场景 A/B 各 2 次：

| 场景 | A（V 原字节） | B（补丁） |
|---|---|---|
| midtool：exec 跑完后，下一次请求 400 | 2/2 失败：`incomplete turn … tools=1 replaySafe=no`，0 次压缩，8–14 s 后报错 | 2/2 答完：`[context-overflow-settled-tools-v1]` → 压缩 1 次（48.46 万 → 1.6 万字摘要；摘要请求 12.2 s / 23.7 s）→ 从转录继续 → 回复里给出正确探针输出。探针 exec **只执行 1 次** |
| start：回合开头 400 | 2/2 压缩后答完（35–42 s），行为不变 | 2/2 压缩后答完（35–45 s），行为不变 |
| always：一直 400（恢复用尽） | `Context overflow: … Try /reset …` | `这段对话太长，……请发送 /compact 压缩后重试，或发送 /new 开始新对话（长期记忆和文件不受影响）。` |

- B 的 midtool 总时长 56 s / 75 s，大头不是压缩。压缩后模型按摘要里的「待办」又去查了这个镜像群的夜班任务（4–6 条只读 exec）。这是压缩摘要本身带回旧待办的行为，A 的 start 场景压缩后也是同一套摘要，与补丁无关；生产上普通会话的待办是当前的，不会这样。

**用户在聊天里看到的文字**（chat.send，等同渠道回复路径）

candidate-0ae0e273、candidate-fd5f16c3，小会话上下文：
- A：两条，`Context overflow: prompt too large … Try /reset …` + `⚠️ Context overflow — prompt too large for this model…`；回合中途那次是 `⚠️ Auto-compaction could not recover this turn…`。
- B：两条都是同一句中文提示，没有英文。
- 回合中途：A 两次英文报错，B 两次压缩后回答。

**普通会话没有变慢**

三轮里的小会话（chat.send → 首段文字，各 9 次）：
- A：2.9–8.2 s，中位数 **4.97 s**
- B：3.3–7.9 s，中位数 **4.98 s**

大会话不注入时的第一次请求，A/B 发出的字节数一致（1,785,598 vs 1,785,444，差别是消息标签里的 A/B 字母和 runId），DeepSeek 计数一致（484,548 vs 484,485）。

正常回合不经过改动代码：只有 attempt 以错误结束后才判 `vSettledToolOverflow`，中文文案只在恢复用尽时才用到。

**过程记录**
- candidate-0ae0e273、candidate-fd5f16c3：机制成立。但镜像会话的当前分支几乎是空的（5.2 万 token），快速压缩缺 Gateway 侧 llm 授权。
- candidate-c44486cf：改用 CLI 驱动，但 9 月的会话被空闲重置，开了新会话。
- candidate-a03ee738：V 规模，结论以这一轮为准。

receipt 与完整输出在 `~/v-upgrade-private/context-overflow-20261015/runs/`（run1–run4，以及 in-Gateway 那轮 run5）。

## 7. 上线

- 只改 dist，不改配置：`lab/context-overflow-recovery.plan.json`，3 个文件，before 是 V 10/15 的字节。
  - 底本：history-image-e3 + upstream-5xx-fallback 已上 V 之后的状态。
  - 下次发版如果还有别的改动替换这三个文件之一，必须重新执行 `node lab/patch-context-overflow-recovery.mjs <V 现字节目录> <out>`，不能直接拿本目录的文件。
- Gateway 和 worker 用同一份 core dist，需要一次 `v-self-restart`。worker 由池子在 Gateway 重启时一起换代。
- 回滚：按 plan 的 before 还原三个文件，再重启。
- 上线后的观察：
  - 生产日志 `[context-overflow-settled-tools-v1]`：每一行是一次以前会失败、现在压缩后继续的回合。
  - `[context-overflow-recovery] exhausted`：用户此时看到中文提示。
- Control UI 回看历史时，失败请求留下的错误记录仍显示英文兜底（`session-transcript-readers`），本次没改，不影响飞书。

## 8. 没有做的

- **luna 抬到 27.2 万以上**：要先用一次超过 27.2 万的真实 luna 请求验证 ChatGPT 后端是否接受（`max_context_window` 87.2 万），以及是否额外计费，再通过 `models.providers.openai.models[{id: "gpt-6-luna", contextTokens}]` 配置（两份配置都要改）。
  - 当前的风险：DeepSeek 5xx 切到 luna 时（#375），一个 70 万的会话会先在 luna 上按 25.2 万压缩，丢掉更多历史。
- **压缩前绕一次 400**：DeepSeek-flash 的压缩点实际是「真实输入 + 38.4 万 > 1,048,576」，即约 66.4 万，靠 400 触发。
  - 每次只多一次失败请求（约 1 s），等待主要花在压缩本身（25–36 s），提前预检也省不掉这段时间。
  - 不改 `maxTokens`：把压缩推迟到接近 100 万，会让每轮输入更大、首字更慢。
- 三套 token 估算口径不一致（预检 / 传输层 / DeepSeek 实计），这是 midTurnPrecheck 接不住的原因。本补丁让 provider 侧的拒绝也能接住，估算本身没改。
