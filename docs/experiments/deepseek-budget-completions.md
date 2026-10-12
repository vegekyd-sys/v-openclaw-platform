# E3 遗漏：provider 副本的图片计数 + 中文提示到不了用户（2026-10-12）

来源：10/11「V安全升级到OpenClaw」做 10.1 补丁静态核对时报告（`~/v-upgrade-private/20261011-upgrade101/cov-g2/results.jsonl` 的 E3、E3b）。本次在 V 线上字节上核实并修复。

## 1. 第二份预算检查没有图片修复

V（`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core`，2026-10-12 只读核对）：

| 文件 | V 线上 sha256 | 状态 |
|---|---|---|
| `node_modules/@openclaw/ai/dist/transports.mjs` | `7d7ae7a8…` | 有 `deepseek-budget-image-v1`（E3，9/29） |
| `node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs` | `6a34cb79…` | = `lab/release-files/deepseek-compaction-openai-completions-D0QZ0AyB.mjs`，仍按 JSON 字节/2 计，含 base64 |

两份 `applyDeepSeekOutputBudget` 分别挂在两条路径上：

- **transports.mjs** —— OpenClaw 托管 transport。嵌入式 runner 的 `resolveEmbeddedAgentStream` 在有 API key 时走 `boundary-aware:openai-completions`，所以主对话回合、心跳、`/btw`、inference 都走这份（已修）。
- **openai-completions-D0QZ0AyB.mjs** —— `@openclaw/ai/providers` 注册到 API registry 的内置 `openai-completions` provider。走这份的是 registry 派发：core `completeSimple`（`simple-completion-runtime` 的 `prepareModelForSimpleCompletion` 对没有 provider 插件 stream、也没有 proxy/TLS 托管需求的 DeepSeek 原样落到 registry），调用方有 `utility-completion`、`isolated-completion` / `host-prepared-isolated-completion`、`session-companion-ask`、`conversation-label-generator`、`approval-intent`、`exec-auto-reviewer`；还有 agent-core / 压缩里的 `runtime.streamSimple`，以及 runner 在没有 key 时的 `stream-simple` 策略。
- 守卫只管 `^deepseek-v4`。V 的默认模型 `deepseek-flash` 和压缩模型 `deepseek-flash` 都不经过；`deepseek-v4-pro`（short-v、dealclaw、xiaoai、心跳）和 `deepseek-v4-flash`（语音 agentModel）会经过。
- `core/dist/worker/worker.mjs`（42 MB，9/4 的打包）里也有一份 runner 代码，V 上没有进程在跑它（V 的 worker 是 `…/worker/worker.mjs` 插件，加载 core dist），本次不动。

修法：照 E3 同样的一行改法（每张内嵌图片固定按 8192 token 计），从 V 线上字节重建，补丁后的函数与 transports.mjs 里的逐字相同（离线测试断言）。

## 2. 中文提示用户看不到

守卫抛出 `Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] …`。`Context overflow:` 让原生溢出恢复先压缩。恢复用尽以后，用户看到的文字有四个来源，**全部是英文**：

| 位置（V 文件） | 何时 | V 现在给用户的 |
|---|---|---|
| `embedded-agent-DaSvA-Yk.js` `renderOverflowResetGuidance` | 溢出恢复用尽（两个 runtime 都先到这里） | `Context overflow: prompt too large for the model. Try /reset …` |
| `embedded-agent-helpers-CzpaLpCq.js` `formatUserFacingAssistantErrorText` | 不走恢复的 failover 路径 | 匹配前缀 `上下文剩余空间不足，已停止本次生成。`，守卫从不抛这个，所以落到通用英文（fork 062f3e6f181 故意照抄此 bug，090874a1126 是可用版本） |
| `agent-runner.runtime-CAdsMsQt.js` `handleAgentExecutionError` | 渠道回复路径，回合以抛错结束（V worker runtime） | `⚠️ Context overflow — prompt too large for this model. …` |
| 同上，压缩失败分支 / settled meta.error 分支 | 渠道回复路径，in-Gateway runtime（守卫原文被 `isCompactionFailureError` 判成压缩失败） | `⚠️ Auto-compaction could not recover this turn. …` |

修法（标记 `deepseek-budget-notice-v1`）：四处都认出守卫的代码 `[V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]`（或恢复层已经渲染好的中文提示），给出原有的中文文案「上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。」。各分支的副作用（生命周期事件、replyOperation.fail、会话映射保留）不变，只换文字；其他溢出错误的英文文案不变。

未改：Control UI 历史里对已存错误消息的显示（`session-transcript-readers` 的 `GATEWAY_ASSISTANT_CONTEXT_OVERFLOW_FALLBACK_TEXT`，「this conversation is too large…」），只影响 Control UI 回看，飞书不经过。

## 产物

- `lab/patch-deepseek-budget-completions.mjs` —— 四个补丁函数，锚点必须恰好命中一次。
- `lab/release-files/deepseek-budget-completions/` —— 从 V 线上字节构建（`openai-completions` 6a34cb79→915ac13d，`embedded-agent-helpers` 342e6269→f0a87832，`embedded-agent` 22dad1ef→142d248f，`agent-runner.runtime` 75b5b4b1→8c192b9d）。
- `lab/deepseek-budget-completions.test.mjs` —— 离线：发布文件 = 补丁(V 字节)；V 现状下图片用例被拒、提示是英文；补丁后通过。
- `lab/candidate/deepseek-budget-completions.mjs` + 两个 plan —— VLab candidate 端到端。

## Candidate 验证（VLab，baseRelease voice-content-product-20261011-v3，三个目标文件与 V 字节相同）

**provider**：core 自己的 `completeSimple` → 内置 provider → 本机 DeepSeek 替身，deepseek-v4-flash + 2.4 MB 内嵌图片。

| | 结果 | 替身收到的请求 |
|---|---|---|
| V 现状（DS_PATCH=0） | `stopReason=error`，`Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]` | 0 |
| 补丁（DS_PATCH=1） | `stop`，回复「看到了一张图片」 | 1 个，2,400,316 字节，max_tokens=384000，带 1 张图 |

**notice**：私有 Gateway（无渠道、无 cron，压缩设置按 V：deepseek-flash、midTurnPrecheck 开），makaron，2.1 MB 文本让守卫真实拒绝（日志 `rawError=Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]`，压缩 `Nothing to compact`，恢复用尽）。`chat.send` 是渠道用的回复路径，记录 Gateway 推给用户的每条 chat 终态文字；`openclaw agent` 是 CLI/RPC 路径。

| 路径 / runtime | V 现状用户收到 | 补丁后用户收到 |
|---|---|---|
| chat.send / worker（v4-flash） | `Context overflow: prompt too large…` + `⚠️ Context overflow — prompt too large for this model…` | 两条都是中文提示，无其他文字 |
| chat.send / in-Gateway（v4-pro） | `Context overflow: prompt too large…` + `⚠️ Auto-compaction could not recover this turn…` | 两条都是中文提示，无其他文字 |
| agent CLI / worker | `Context overflow: prompt too large…` | 中文提示 |
| agent CLI / in-Gateway | `Context overflow: prompt too large…` | 中文提示 |

**回归**：同一私有 Gateway 上，补丁后普通短回合（「只回复：收到」）worker / in-Gateway 都在 7–8 s 内收到「收到」，没有出现预算提示。

receipt：基线 `candidate-118aef80-74e2-42eb-b02d-c7121f1ba7a8`，补丁 `candidate-f22c46ee-1d02-4cd8-b312-afdbc4c9ca2c`，补丁 + 回归 `candidate-a54803f2-6547-4569-a179-da57fe20fc87`（均 exit 0，断言通过；补丁后四个文件哈希与发布文件一致）。

VLab 数据盘 vdb 空闲约 5 GB，只够一个带私有 Gateway 的 candidate 同时跑（约 4.3 GB）；与别的会话并发时会出现 ENOSPC / `database or disk is full`，与被测代码无关，排队重跑即可。

## 上线注意

dev 里待上线的 `early-tool-status` 也整文件替换 `agent-runner.runtime-CAdsMsQt.js`（64d01d3a）。两者一起发时，必须对最终要上线的字节重新执行 `node lab/patch-deepseek-budget-completions.mjs agent-runner <in> <out>`（已验证可以套在 early-tool-status 版本上，增量相同），不能直接用本目录里基于 V 字节的文件，否则会互相回退。

没有覆盖：真实飞书渠道投递（channels 在私有 Gateway 里关闭；chat.send 与飞书共用 auto-reply runner，差别只在渠道发送层）；真实大图在 utility/isolated completion 调用方里的触发（用 core completeSimple 直接驱动了同一 provider 路径）。
