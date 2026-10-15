# 上游 503/429/5xx 切到备用模型（2026-10-15）

V 的配置是 `deepseek/deepseek-flash`，fallbacks 为 `[xai/grok-4.6]`。至少从 2026-09-20 起，DeepSeek 返回 503/429/5xx 时从来没有切到 Grok。2026-10-15 09:19 CST（runId `41731011…`）用户看到回复开头后，接着出现一句英文 `⚠️ deepseek/deepseek-flash request failed (provider internal error, HTTP 503). This is usually temporary — try again shortly.`。

## 1. V 当前字节上的实际链路

本节按 10/15 V 的字节（`restart-speed-2-reconcile-20261014`）、V 的 journal 和 `/tmp/openclaw/openclaw-2026-10-15.log` 复核。9/20 的分析有一处不对：分类代码是存在的，问题出在分类结果和 worker 边界上。

**错误分类**（`classify-Dm9sTbZz.js`）
- `classifyFailoverClassificationFromHttpStatus` 的规则：
  - 503/499：文本被识别为 overloaded 才判 overloaded，否则一律判 `timeout`。
  - 500/502/504：文本被识别为 server_error 才判 server_error，否则一律判 `timeout`。
- DeepSeek 的原文是 `503 Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.`，不在 overloaded 模式里，所以判成 `timeout`。日志里 `failoverReason=timeout`，25 次全是这样。
- 上游 9.6 的 776f76b4b87（#141843）把对端已回复的 5xx 改判为 `server_error`，只有 499/504/522/524 仍算 `timeout`。

**为什么判成 timeout 就不切模型**（`embedded-agent-DaSvA-Yk.js`）
- vlab-worker 是持有 transport 的 harness（`pluginHarnessOwnsTransport`）。在这种 harness 下，`timeout` 的处理方式是：
  - assistant 阶段：`shouldRotateAssistant` 返回 false，决定是 `continue_normal`。
  - prompt 阶段：只有 attempt 可安全重放（replay-safe）时才 fallback。
- 结果分类器 `classifyProviderErrorPayloadReason` 不认 `timeout`。

**worker 边界**
- worker 自己跑整轮 `agentCommand`。它内部的 fallback runner 只有 Gateway 选中的那一个模型（`total 1`，`fallbackConfigured=false`）：
  1. 同模型重试 3 次，1/2/4 s 抖动，大约 8–10 s；
  2. 然后抛 `FailoverError`；
  3. 跨 IPC 时只剩 message。
- Gateway 侧的 `buildHarnessFailureAttempt` 固定标记 `replaySafe:false, hadPotentialSideEffects:true`。于是 Gateway 上那条有两个候选的 fallback 链永远不会走，连 429 也不会。日志里的现象：`incomplete turn … replaySafe=no — surfacing error`。

**流出部分内容后再失败**（就是 09:19 那条）
- 这一轮已经先执行了一个工具：exec 后台命令，`tools=1`。
- 下一次模型调用直接拿到 503。attempt 因为有副作用，不可安全重放。
- `handleEmbeddedAssistantFailure` 直接 `proceed`，然后 incomplete turn，用户看到英文错误。
- 9.1 已有一个只针对传输中断（transport drop）的续写分支，但要求 `provider_transport_failure` 诊断，HTTP 503 不满足这个条件。

**candidate 基线**
- candidate-9fba87ba / 0a0bd06d，用 V 的字节，在 loopback 上放一个 DeepSeek 替身。
- 503、429、500 三种情况都是：8–10 s 后给出英文错误，DeepSeek 请求 4 次，Grok 请求 0 次。
- 「写文件工具 → 503」的结果与 09:19 那条完全一致：1.1 s 后给出英文错误。

## 2. 上游的做法

由子代理在 `~/openclaw-versa-main` 对比 9.1、9.5、9.8、10.3 和 main（2026-10-14）。

- **分类**：9.6 的 776f76b4b87 把对端已回复的 5xx 判为 `server_error`。没有任何版本匹配 "too busy"。本次直接回移这一条。
- **工具已执行后遇到 429/5xx**：上游从不换模型。commit 注释的意思是：可能已有副作用，换模型重放会重复执行。
  - 9.3 的 a9e9dec42df（#139397）改成同模型从转录续写，原话是 "never resubmit the original user request"。
  - 本次照这个思路回移：直接扩展 9.1 已有的续写分支，没有另起平行机制。
- **配置开关**：`openclaw.json` 里没有。只有 `<agentDir>/settings.json` 的 `retry.provider.maxRetries`，它是全局重试预算，管不到「有备用模型时只重试一次」，也覆盖不了工具执行后的情况。
- **备用模型提示**：`↪️ Model Fallback: xai/grok-4.6 (selected deepseek/deepseek-flash; server error)` 是上游原生的提示，只在私聊里显示，本次不改。

## 3. 改动

改动集中在 `lab/patch-upstream-5xx-fallback.mjs`，每条都对 V 的字节做精确锚点替换。由 `lab/build-upstream-5xx-fallback.mjs` 生成 `lab/release-files/upstream-5xx-fallback/` 和 `lab/upstream-5xx-fallback.plan.json`。

| # | 文件 | 改动 | 来源 |
|---|---|---|---|
| 1 | `classify-Dm9sTbZz.js` | 对端回复的 503/500/502 判为 `server_error`，499/504 仍判 `timeout`；CDN HTML 页走同一套状态码规则 | 回移上游 776f76b4b87 |
| 2 | `embedded-agent-DaSvA-Yk.js` | 还有备用模型时（`isFinalFallbackAttempt === false`），429/5xx/timeout 都只做一次同模型快速重试（没有备用模型时仍是 9.1 原来的 3 次）。harness 已经重试过、又配置了 fallback 时，Gateway 的 prompt 阶段不再重试同一模型 | V |
| 3 | `embedded-agent-DaSvA-Yk.js` | 工具已执行、下一次调用拿到 429/5xx 且没有输出时：同模型从转录续写，最多 3 次，按 transient 退避。续写过一次以后，本轮后续 attempt 一律视为不可安全重放，防止 fallback 重新提交原始请求 | 回移 a9e9dec42df 的思路，形式沿用 9.1 的续写分支 |
| 4 | `agent-command-DPfawBbr.js` | worker 内层 fallback runner 只有一个候选，会把 `isFinalFallbackAttempt` 写成 true；这里保留 Gateway 转发来的 false | V |
| 5 | `embedded-agent-helpers-CzpaLpCq.js` | 429/5xx/timeout 的失败文案改成中文：说明没完成，以及怎么接着做 | V |
| 6 | `builtin-openclaw-zQV8Wwjr.js` | 未完成轮次（incomplete turn）的两句英文改成中文。同一函数里 V 已有一句中文（length 那句） | V |
| 7 | worker：`worker.mjs`、`worker-pool.mjs`、`index.mjs`、`harness-failure.mjs` | 跨 IPC 保留 status/provider/model/reason。worker 内层判定的 provider 失败（server_error/overloaded/rate_limit/timeout，或 HTTP 429/5xx），并且本轮转录里没有任何工具调用或工具结果时，失败的 attempt 才标为可安全重放，交给 Gateway 原有的 fallback 链。其余情况不变 | V |

**场景 (b) 选了哪种方案**
- 选的是「同模型续写，仍失败就给中文提示，用户回复「继续」即可接着做」，不选「换 Grok 重做这一轮」。原因：
  - 工具已经执行。换模型重做会重新提交原始请求，可能重复执行有副作用的操作（09:19 那条就是 exec 后台命令）。上游明确不这样做。
  - 续写不重做，卡片上的文字自然往后接，不存在拼接问题。
  - DeepSeek 在 10/15 事故里是间歇性 503，续写一次大多能接上（`toolw1` 场景）。如果持续不可用，用户 5–6 s 内会看到中文提示。下一句话（例如「继续」）会重新走 DeepSeek → Grok 的 fallback 链；这一条按场景 (a) 推断，本次没有单独测「继续」。

**timeout 怎么处理**（10/15 11:00 按 Tianyi 定的优先级追加：首 token 前的超时也要能切备用）
- 分类不变：499/504、空闲超时、流中断仍判为 `timeout`。
- 有备用模型时，同模型只重试 1 次，然后走 Gateway 原有的 timeout fallback 规则（`promptTimeoutFallbackSafe`，它本来就要求 attempt 可安全重放）。worker 在本轮没有执行工具时提供这个条件。
- 工具执行后的 timeout 不续写，仍是不可安全重放，行为不变。
- 没有备用模型的 run，超时重试次数仍是 3 次。

## 4. candidate A/B

- 运行：candidate-f647a53d（最终版），每个场景 3 次；输入与 receipt 在 `~/v-upgrade-private/upstream-5xx-fallback-20261015/`。
- 跑法：`lab/candidate/upstream-5xx-fallback.mjs`。
  - 两个私有 Gateway，各带 1 个 worker，用 V 的 deepseek-flash/vlab-worker 配置，fallbacks 为 `[xai/grok-4.6]`。
  - DeepSeek 和 Grok 都换成 loopback 替身。Grok 替身实现了 openai-responses SSE。
  - A = 共享 VLab 当前字节，即 V 加上已暂存的 history-image-e3。e3 与本补丁没有交集。
  - B = 同一 runtime 用同一组补丁函数打补丁。
- 时间口径：从 `chat.send` 到看到第一段正文 / 到结束。

| 场景 | A（V 现状） | B（本补丁） |
|---|---|---|
| ok | DeepSeek，0.7–1.5 s | DeepSeek，0.7–1.6 s（无回退） |
| 首 token 前 503 too busy | 7.6–9.8 s 后英文错误；DS 请求 4 次，Grok 0 次 | **Grok 2.7–3.4 s 可见**；DS 2 次，Grok 1 次 |
| 429 | 9.0–10.3 s 英文错误 | **Grok 2.8–4.3 s** |
| 500 | 7.7–10.5 s 英文错误 | **Grok 2.3–2.8 s** |
| 503 一次后恢复 | DeepSeek 1.8–2.0 s | DeepSeek 1.9–2.3 s |
| 写文件工具后 503 一次再恢复（`toolw1`） | 1.1–1.7 s 英文错误，本轮丢失 | **续写成功，DeepSeek 2.3–2.8 s 答完** |
| 写文件工具后 503 持续（`toolw`，即 09:19） | 1.0–1.5 s 英文错误 | 续写 3 次后 5.9–6.5 s 给中文提示 |
| 读文件工具后 503 持续（`tool`） | 8.8–12.4 s 英文错误；读工具被重放 4 次 | 2.6–4.2 s 中文提示；重放 2 次 |
| 流中断（`mid`，timeout） | 10.4–13.3 s 英文 timeout | 8.0–13.6 s 英文 timeout（相同语义） |

- 在 candidate 的真实 9.1 模块上跑 `lab/upstream-5xx-fallback.test.mjs` 第 7 项（分类前后对照）：通过。
- 本地 `node --test lab/upstream-5xx-fallback.test.mjs`：6/6 通过，含按 V 字节重建并逐字节比对。
- `npm test` 2271/2274。唯一失败的是 `scripts/node-async-context-frame.test.mjs` 的 `--inspect` 用例，本分支没有改到这个文件，在本机单独跑也失败。

## 5. 发版

- `lab/upstream-5xx-fallback.plan.json`：底本是 V 当前字节（10/15 10:35 CST 在 V 上核对过 9 个 sha256）。
- `lab/upstream-5xx-fallback-on-e3.plan.json`：如果 history-image-e3（#372）先上 V，用这一份。
  - 其中 `embedded-agent` / `helpers` 两个文件以 e3 的发布文件为底本，其余文件相同。
  - 测试检查了两份 plan 各自对应的底本。
- 动的是 Gateway 和 worker 进程内代码，需要一次 `v-self-restart`。

**V 和 VLab 的差异（与本补丁无关，顺带发现）**
- V 的 `worker/worker.mjs`（`18c949c3`）有 heartbeat-v2 stream guard。
- 共享 VLab 是 `3e66b4b3`，没有这一段。
- 本补丁对两边都能套上。

## 6. 没有覆盖、留作后续

- **重试后文字堆叠**：流出部分正文后整轮重试（`mid` 场景，以及任何可安全重放的重试），chat 流的快照会把前一次 attempt 的正文和新的拼在一起，A 臂出现「前半段×4」。这是 V 现有的问题。飞书卡片对完全相同的快照会去重，但内容不同时会按新段落追加。要修需要 core 发出 attempt 边界信号，飞书卡片再据此重置，另起一项处理。
- **流挂起**：DeepSeek 回 200 后一直不出 token，要等 `timeoutSeconds=300` 的空闲超时。10/15 的两条 616 s 和 909 s 主要耗在这里。本次不改 timeout 语义。
- **英文的备用模型提示**：`↪️ Model Fallback: …` 是上游原生的，私聊里可见，可以考虑本地化。
- **共享 VLab 回归、上 V**：由发版协调 session 拿到授权后执行。
