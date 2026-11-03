# DeepSeek 故障时让 luna 接住（2026-11-03）

V（OpenClaw 2026.9.1 db91.6）主模型 `deepseek/deepseek-flash`（vlab-worker），备用 `openai/gpt-6-luna`（ChatGPT 订阅，窗口 27.2 万）。2026-11-03 16:53–17:47 CST DeepSeek 返回 `503 Service is too busy`，或回 200 后不出 token。本记录回答：失败的回合为什么没切到 luna，luna 能不能接住 40 万以上的大会话，怎么修。

## 1. 现场：切到 luna 的都成功了，问题在没切过去

数据：V journal 16:40–17:55，按 runId 归类（脚本在 session 共享笔记 `luna-fallback-classify-20261103.py`）。只统计 16:45 之后、碰到过 DeepSeek 503 或超时的回合。

| 类 | 回合数 | 过程 | 结果 |
|---|---|---|---|
| A 切到 luna | 8 | worker 503×3 → Gateway `rotate_profile` 再跑一遍 DeepSeek，又 503×3 → `fallback_model` → luna | **全部 `stopReason=stop`** |
| B 轮换后丢失 | 9 | worker 503×3（未跑工具，可重放）→ Gateway `rotate_profile` 再跑 DeepSeek → 这遍挂起，或跑了工具再 503 | 失败，不再可重放，切不过去 |
| C 工具后 503 | 9 | 跑过工具后 503 → 同模型从转录续写 3 次（间隔约 1 s）| 失败（设计如此：换模型重做会重复有副作用的工具） |
| D 回 200 后挂起 | 8 | DeepSeek 回 200 后不出 token，90 s 空闲超时 → worker 内层不抛错，返回 `aborted` | Gateway 看到一个可重放的 aborted 回复，不切 |
| E 用户选了 deepseek-v4-pro | 7 | 用户模型覆盖，`fallbacks disabled by user model override` | 按上游设计不回退 |

另有 11 轮只碰到一次 503，同模型重试就恢复了，不算失败。

**luna 接住了大会话。** A 类里 4 个是 44–50 万 token 的大会话：

| 会话 | 估算 token | 过程 |
|---|---|---|
| 群 oc_5fc52b7e（926 条） | 469,132 | precheck 报溢出 → 压缩 28 s → luna 连续 80+ 次调用做完报告任务 |
| 群 oc_a0f10f1d | 503,468 | 同上，90+ 次调用 |
| 私聊 ou_5eac3ecd | 457,757 | 同上 |
| 私聊 ou_52b437fd | 443,924 | 同上 |

日志里那条 `embedded run agent end isError=true ... Context overflow ... (mid-turn precheck)` 是诊断事件，不是失败（与 10/15 的结论相同，见 `context-overflow-big-sessions.md`）。紧接着是 `attempting auto-compaction`，压缩完就续上了。

**压缩不依赖 DeepSeek。** 两份配置里 `compaction.provider = versa-fast-quality-v1`，它用的模型是插件配置 `fastCompactionModel = azure-openai/gpt-5.6-sol`，输入自己截到 42 万字符以内（`fast-compaction-provider.mjs` 的 `buildBoundedTranscript`）。快速压缩失败时，`compaction-safeguard` 的 LLM 兜底先用**当前回合的模型**（`ctx.model ?? runtime.model`），回退到 luna 的回合就是 luna 自己压缩；`compaction.model = deepseek/deepseek-flash` 只在拿不到回合模型时才用。candidate `s503nocompact`（快速压缩模型也 503）里 A 臂正是由 luna 完成兜底压缩。11/03 生产上没有一次快速压缩失败。

## 2. luna 本身能装多少（Tianyi 提示「luna 支持 1M」）

V 上 luna 的元数据是我们自己的补丁 `v91-gpt6-sol-luna-v1` 写死的：`contextWindow 1050000, contextTokens 272000`（照搬上游给 ChatGPT 订阅通道的默认值）。所以约 25.2 万的预算来自 272000 减预留，不是模型窗口。

**订阅后端实测（共享 VLab，真实账号，2026-11-03 18:30–18:42 CST）**：持 lease，在专用 `vlab-dev-*` 会话（`deliver:false`）里 `/model openai/gpt-6-luna`，发一条大消息，看 `usage.input`：

| 内容 | 实际输入 token | 结果 | 首字（从模型调用开始） |
|---|---|---|---|
| 三份中文记录 | 454,831 | ✅ 三个文件尾部暗号和第 2-500 条的编号全对 | 9.2 s |
| 随机 emoji | 491,681 | ✅ | 9.2 s |
| 随机生僻字 | 520,029 | ✅ | 9.1 s |
| 随机 emoji | 806,326 | ✅ | 12.1 s |
| 随机 emoji | 约 98 万 | ❌ `Your input exceeds the context window of this model` | — |

上限在 80.6 万到 98 万之间，与订阅 Codex 目录的 `max_context_window 872000` 吻合。

**一行配置抬不上去。** 在两份配置的 `models.providers.openai.models` 里给 luna 写 `contextTokens: 1000000` 并重启后，预检日志仍是 `promptBudgetBeforeReserve=252000`：vlab-worker 路径上配置写的 `contextTokens` 只是上限（`resolveAuthoredModelContextTokens` → `authoredContextTokenCap`），预算取模型自己的值。要改 `openai-chatgpt-provider-BApw3_oy.js` 里那一行。

**contextTokens 的旧坑不适用。** 9/29「contextTokens 单独用更糟」是 DeepSeek 的 completions 传输按 `contextTokens − 估算输入` 钳 `max_tokens`，而且那次是把它调到会话以下。luna 走 Responses 传输，只发 `max_output_tokens = maxTokens`，不按上下文钳。

**预检之外还有回合前压缩。** `preflightCompaction` 的阈值同样按 luna 的 272k 算。测试里两条大消息在调 luna 之前都先被它压缩了约 100 s（emoji 那条估算偏低，没触发，消息发出 1.4 s 就开始调 luna）。

## 3. 方案比较

| 方案 | 结论 |
|---|---|
| luna 预算抬到 85 万（Tianyi 的线索） | **采用。** 47 万的大会话直接交给 luna，不压缩、不丢历史，首字约 9 s。只改 luna 一行，sol / astra 不动。 |
| 1. DeepSeek 正常时预存摘要，故障时用「摘要 + 最近几轮」 | **不做。** 有了 85 万窗口，绝大多数会话不需要摘要；超过的少数，故障当下的压缩（Azure，20–30 s）已在生产上接住过。 |
| 2. 临场分段压缩 | **不需要新写。** 快速压缩本身就按预算截断输入；它失败后的 LLM 兜底（`compaction-safeguard`）也已经按窗口分块丢弃旧内容（`buildHistoryPrunePlan`）。 |
| 3. 压缩改用大窗口模型 | **已经是了**：快速压缩用的就是 azure gpt-5.6-sol。 |
| 路由修复（B、D） | **必须做。** 窗口再大，回合走不到 luna 也没用：B、D 两类 17 轮，多数是真人私聊和群。 |

官方机制核对：
- 9.1 的压缩自带模型回退：`compaction.model` **未显式设置**时，独立压缩（`/compact`、溢出恢复）用当前回合的模型，并按 `agents.defaults.model.fallbacks` 走 `runWithModelFallback`（`compact-*.js` `hasExplicitCompactionModel`）。回合内的 safeguard 兜底本来就先用回合模型（见第 1 节），所以回退到 luna 时压缩不依赖 DeepSeek。
- 没有配置项能关掉 prompt 阶段的 `rotate_profile`；`overloadProfileRotationLimit` 只作用于 assistant 阶段的 `overloaded`，而 DeepSeek 的 503 被分类为 `server_error`。
- 回 200 后挂起：上游没有「harness 内层空闲超时 → Gateway fallback」的路径；#375 只覆盖了响应头之前就挂起的情况。

## 4. 改动（`luna-fallback-takeover-v1`）

`lab/patch-luna-fallback-takeover.mjs`，由 `lab/build-luna-fallback-takeover.mjs` 按 V 当前字节生成 `lab/release-files/luna-fallback-takeover/` 和 `lab/luna-fallback-takeover.plan.json`（3 个文件，before 为 2026-11-03 V 的字节）：

| 文件 | 改动 | 修哪一类 |
|---|---|---|
| `openclaw/dist/embedded-agent-DaSvA-Yk.js` | prompt 阶段：harness 已同模型重试过、原因是 `server_error`/`overloaded`、可重放、配了 fallback 时，不再 `rotate_profile`，直接 `fallback_model`。`rate_limit` 照旧轮换（别的 key 可能还有额度）。 | B |
| `production-worker/index.mjs` | worker 回复如果只是 `LLM idle timeout (Ns): no response from model`，且本轮没有工具、没有可见正文、没有投递、不是 Gateway/用户中止，就按 #375 对「请求挂起」的同一方式报给 Gateway（provider timeout，可重放），由现有的 `promptTimeoutFallbackSafe` 规则切到 fallback。 | D |
| `openclaw/dist/openai-chatgpt-provider-BApw3_oy.js` | `gpt-6-luna` 的 `contextTokens` 272000 → 850000（实测上限 87.2 万，留余量给估算误差）。 | 大会话免压缩 |

- 源码：`vegekyd-sys/openclaw-versa` 分支 `versa/luna-fallback-takeover-20261103`（基于 `versa/port-backlog-20261029`）：
  - `4cb653a8` prompt 阶段（#375 的 `harnessAlreadyRetried` 已在那里）：`prompt-failure.test.ts` 10/10，去掉源码改动后 2 项失败。
  - `141c79ad` luna 预算：openai 扩展 959/959，去掉改动后 luna 那条失败。
  - worker 那一处是平台代码。
- 副作用：用户手动选 `/luna` 的会话也会长到 85 万才压缩，单次请求更大（luna 便宜，订阅额度消耗会上升）。
- 没有 fallback 的回合（用户手动选了模型）：B 不变（`fallbackConfigured=false` 时照旧轮换）；D 那一处若触发，提示会从「⚠️ 这一轮没能生成回复」变成与请求挂起相同的超时提示（推断，未实测，见第 5 节）。
- 正常路径不经过这两处代码。
- 上线需要一次 `v-self-restart`（Gateway 进程内代码）。

验证：`node --test lab/luna-fallback-takeover.test.mjs`（5 项：plan 与 V 字节、可解析、不可重复打补丁、prompt 阶段条件、worker 判定的正反例）。

## 5. candidate

`lab/candidate/luna-fallback-takeover.mjs`（plan `lab/candidate/luna-fallback-takeover.plan.json`）。私有 Gateway + 1 个 Worker，V 的模型/回退/压缩配置；会话是镜像里的 `faa116bd`（约 48.4 万 token），用 agent CLI 回放整条分支。三个替身都在 loopback：DeepSeek（`/chat/completions`）、luna（`/responses`，后端窗口按实测 87.2 万，超过按 OpenAI 原文回 400）、快速压缩模型（代替 azure gpt-5.6-sol，返回带五个必需章节的摘要）。DeepSeek `timeoutSeconds` 设 20（V 是 90），让挂起场景快一点。A = V 原字节 + luna 预算 272k，B = 同一 runtime 打补丁 + luna 预算 850k。luna 替身不经过 `openai-chatgpt-provider`（那条路要真实 OAuth），所以 85 万这一处在 candidate 里用替身的模型元数据模拟；真实后端的接受度见第 2 节。

会话：镜像群 `oc_f164f1c7`，DeepSeek 计约 58.3 万 token、从未压缩（原来的 `faa116bd` 已被之前的共享测试压缩过，不再是大会话）。替身估算：DeepSeek 请求约 53.8 万。私有认证库加了 `deepseek:default` 档案、环境里有 `DEEPSEEK_API_KEY`，与 V 一样有两个认证候选（否则复现不了 prompt 阶段的轮换）。

| 场景 | A（V 字节，luna 预算 272k） | B（本补丁，luna 预算 850k） | 记录 |
|---|---|---|---|
| DeepSeek 一直 503 | 11.7 s 由 luna 回复；回退前**压缩 2 次**（会话被永久压缩），luna 收到约 37 万 | 8.2 s 由 luna 回复；**不压缩**，luna 收到完整约 55 万 | candidate-c1d0a1d5、64d56e34 |
| 503 一次尝试后挂起（B 类） | Gateway `rotate_profile` 又打 DeepSeek，挂起 2 次，**72.2 s** 才到 luna；共 6 次 DeepSeek 请求 | `[luna-fallback-takeover-v1] skipping profile rotation`，**7.5 s** 到 luna；3 次 DeepSeek 请求 | candidate-87f1e6b5 |
| 一直挂起（`timeoutSeconds` 20 / 90） | 68.7 s / 280.9 s 后由 luna 回复 | 67.8 s / 278.3 s 后由 luna 回复 | candidate-87f1e6b5、7f25adfc |
| 挂起 + 用户手动选了模型（无 fallback） | 约 223 s 后失败，不切 | 相同 | candidate-87f1e6b5 |
| 快速压缩模型也 503 | 由 luna 自己做兜底压缩后回复（12.7 s） | 不需要压缩（8.2 s） | candidate-64d56e34 |
| DeepSeek 正常，小会话 8 轮中位数（去掉第 1 轮冷启动） | 首字 558 ms，完成 638 ms | 首字 573 ms，完成 657 ms | candidate-87f1e6b5 |

- 「修复前失败」：在替身环境里 A 臂的 luna 最后都能回复，因为替身压缩是瞬时的。生产上 A 臂的代价是压缩：11/03 的大会话每次 20–30 s（Azure），共享 VLab 真实账号测试里回合前压缩约 100 s，而且会话历史永久丢失；B 臂没有这一步。真正失败的是 B 类：生产上 9 轮在轮换后挂起或跑工具再 503，candidate 里 A 臂因为替身没有让第二遍跑工具，挂起后仍然切了过去，但多花了 65 s。
- **D 类没复现。** candidate 里替身挂起总是变成可抛出的 `request timed out`（`surface_error` 后抛 FailoverError），A 臂按 #375 已有路径切到 luna，所以 `hang` 两臂结果相同；生产上的 `LLM idle timeout` → aborted、不抛错这一形态在 loopback 替身上没出现（loopback 主机不受空闲看门狗约束，换成 `lvh.me` 并放行私网后仍是请求超时先触发）。D 的补丁只有单测和 11/03 的 8 轮生产日志作依据，代码只在回复恰好是「无工具、无正文、`LLM idle timeout … no response from model`」时生效。
- 正常路径：两臂差异 15–19 ms，在噪声内（第 1 轮冷启动 2.0 s / 2.2 s）。补丁代码只在失败路径上。
- 第一轮 candidate 的失误：agent CLI 没设 `OPENCLAW_GATEWAY_PORT`，大会话轮次打到了共享 VLab Gateway，在镜像群会话 oc_eb6d0748 里追加了约 7 条测试问答（真实 DeepSeek 回答，未投递）。脚本已修，并加断言：某一轮替身一个请求都没收到就中止。

## 6. 没修的和建议

- **C 类（跑过工具后 503，9 轮，多为夜班卡）。** 现在只能同模型续写 3 次，间隔约 1 s，DeepSeek 一挂几十分钟就必然失败。要让 luna 接手，需要「从当前转录续写」的回退：换到 luna 时不重发用户消息、不重做已完成的工具，而是用内部续写 prompt 接着做。这要同时改 Gateway 的 fallback runner（允许不可重放但已落定的失败进入下一个候选）和 worker 转发。单独立项。
- **E 类（用户手动选了模型，7 轮）。** 上游设计不回退。是否对「用户选的模型」也开放 fallback，需要 Tianyi 定。
- **`compaction.model`。** 回合内的压缩兜底不受它影响（先用回合模型）。它只影响独立压缩路径；要不要删掉这个显式设置、让独立压缩也跟随回合模型和 fallbacks，可以另议，本 PR 不改。
- **挂起要等 2×`timeoutSeconds`。** V 的 DeepSeek 是 90 s，回 200 后挂起要约 3 分钟才切。可以调低，但会误伤正常的长推理首 token。
- **压缩是永久的。** luna 接手大会话时会话被压缩，DeepSeek 恢复后也回不到原始历史。这是 OpenClaw 的设计。
