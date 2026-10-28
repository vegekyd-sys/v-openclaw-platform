# DeepSeek ↔ Grok 切换（2026-10-28）

V（OpenClaw 2026.9.1 db91.6）日常主模型 `deepseek/deepseek-flash`（vlab-worker），备用 `["openai/gpt-6-luna"]`；`/Grok` = `xai/grok-4.7`（vlab-worker，50 万窗口）。本记录回答两件事：手动切换能不能续上，DeepSeek 出故障时会怎么走。

## 1. 手动切换：V 实测

2026-10-28 22:16–22:37 CST，用 `lark-cli --as user` 在两个测试群里发真实消息。每一步都要求对方说出上一轮 exec 的输出和暗号，并再跑一次 exec。

| 方向 | runtime | 会话 | 结果 | 证据 |
|---|---|---|---|---|
| DeepSeek → Grok | vlab-worker → vlab-worker | worker 测试群，约 8 万 token | ✅ 说对上一轮输出和暗号，exec 正常 | S2 22:19，footer `grok-4.7 / xai / vlab-worker` |
| Grok → DeepSeek | vlab-worker → vlab-worker | 同上 | ✅ 内容续上；❌ **推理被关掉** | S3 22:19：请求无 effort、无 thinking 事件；S1 是 effort=low、有 thinking 事件 |
| GPT-6.1 Sol(codex) → Grok | codex → vlab-worker | /vcodex 测试群，约 16 万 token | ✅ | C1 22:35 |
| Grok → /vds | vlab-worker → codex | 同上 | ✅ | C2 22:35，footer `vds-deepseek-flash / codex` |
| /vds → Grok | codex → vlab-worker | 同上 | ✅ | C3 22:36 |

历史格式在这些方向上都被接受：
- DeepSeek 的推理是明文（`thinkingSignature="reasoning_content"`）。换到别的模型时，9.1 的 `transformMessages` 把它**改写成可见的 assistant 正文**回放（`@openclaw/ai` host-*.mjs `transformAssistant`；上游 main 至今相同）。所以 Grok 不会像 OpenAI 那样拒收，但会把 DeepSeek 的推理当成「自己说过的话」读进去。体积上几乎不变：DeepSeek 自己的请求也带着这些 `reasoning_content`，同一个 48 万 token 会话，Grok 请求 1.40 MB，DeepSeek 请求 1.38 MB（candidate-11153c91）。
- Grok 的推理是 `encrypted_content`。换到 DeepSeek 时只剩摘要文字（有的话转成正文，没有就丢掉）；DeepSeek 要求的 `reasoning_content` 由传输层补成空串（`requiresReasoningContentOnAssistantMessages`）。
- 工具调用 ID 由 `normalizeToolCallId` 按目标 provider 重写，未配对的工具调用补一条 "No result provided"。V 实测两边都能接着用 exec。
- /vds 与 /vcodex 之间仍按 9/22 结论：线程配置指纹不同就开新 Codex 线程，从 OpenClaw 转录投影上下文。

### 1.1 缺陷：切到 Grok 会把会话的 thinking 改成 off，切回来不恢复

- 9.1 给 `xai/grok-4.7` 的 thinking 档位只有 `off`（`extensions/xai/model-id.ts` 的 `isXaiFrontierModelId` 只认 4.5/4.6；上游 main 已按版本号比较，4.7 有 low/medium/high/xhigh）。
- 切模型时，9.1 有三处把「新模型不支持」的档位**钳制后写回会话**：
  - 只有指令的消息（单发 `/Grok`）：`directive-handling.impl-CoR1-5xR.js`
  - 带正文的行内指令、`/model` 选择器：`apply-session-model-selection-CJtWmAQJ.js`
  - Gateway `sessions.patch` 改模型（Control UI、飞书模型卡）：`sessions-patch-iR7MNInU.js`
- 第四处在 vlab-worker 路径上：Worker 把 Gateway 算好的**本轮**档位当作 `thinking` 传给 `agentCommand`（`production-worker/worker.mjs`），而 `thinking` 是持久化覆盖（等同 `openclaw agent --thinking`），每轮都写回会话。V 上 310 个 makaron 频道会话存着 `high` 就是这么来的；Grok 那一轮被钳成 off，也就被写成 off，而且没有任何提示。
- 于是 `/Grok` 之后会话里存的是 `thinkingLevel=off`。`/deepseek` 只清模型覆盖，不动 thinking，DeepSeek 就一直不推理，直到有人 `/think`。
- 实测：
  - worker 测试群原本 `low`，`/Grok` 卡片写「Thinking level set to off (low not supported for xai/grok-4.7)」，切回后 S3 请求没有 effort、没有任何 thinking 事件。
  - /vcodex 测试群原本未设置（继承 GPT 的 medium），`/Grok → /vds → /Grok → /vcodex` 之后会话里是 `off`，且没有任何卡片提示过（第四处：Grok 那轮在 Worker 里跑）。之后 GPT-6.1 Sol 也会按 off 跑。
  - 测完已恢复：worker 群 `/think low`（原值），/vcodex 群 `/think default`（原来未设置），模型都已切回原样。
- V 上的存量（2026-10-28 22:30，makaron 频道会话、默认 DeepSeek）：`off` 4 个、`low` 20 个，近 14 天活跃的分别 2、5 个。无法逐个判断是用户主动设的还是被切换写的。
- 上游已修：b22f886cdc9（#169435，2026-10-12，「切换模型时保留思考偏好」），会话保留用户要的档位，只在运行时钳制。9.1 的运行入口本来就按轮钳制（`get-reply` 里 "Execution fallbacks are turn-local"，只对 API 级显式覆盖报错），备用候选也按候选钳制，所以去掉三处写回就够了。Worker 那一处是 V 自己的代码，上游没有对应：改传 `thinkingOnce`，`agentCommand` 按 `thinkOnce ?? thinkOverride ?? 会话存值` 取档位，本轮生效档位不变，只是不再写回。

## 2. 故障回退：现在会怎么走

V 现在跑的是 #375/#377（10/15 13:01 上线）：对端回复的 503/500/502 判 `server_error`，429 判 `rate_limit`，499/504/空闲超时判 `timeout`；有备用模型时同模型只重试 1 次，worker 在本轮没跑过工具时把失败标成可安全重放，交给 Gateway 的 fallback 链。备用是 `openai/gpt-6-luna`（10/15 Tianyi 定）。

| DeepSeek 的故障 | 现在的行为 | 依据 |
|---|---|---|
| 首 token 前 503 "too busy"、500、502 | 同模型重试 1 次 → 切备用，约 2–5 s 看到备用回复 | #375 candidate 87895664（worker）、cb510391（embedded） |
| 429 限流 | 同上 | 同上 |
| 504 / 回 200 后不出 token | 同模型重试 1 次 → 切备用；挂起要等 2×`timeoutSeconds`（V 现在 90 s，约 3 分钟） | 同上，hang 场景 |
| 已经跑过工具后 429/5xx | **不换模型**：同模型从转录续写，最多 3 次，仍失败给中文提示（换模型重做会重复执行有副作用的工具，上游同样不换） | #375 `toolw`/`toolw1` |
| 流出一半后断流 | 整轮重试，可能切备用，备用回复前面带着前几次的半段（已知遗留） | #375 `mid` |
| 用户手动选过模型（`/Grok`、`/vds`、`/vcodex`、`/luna` 之后） | **没有 fallback**：`configured fallbacks disabled by user model override`，上游设计 | 9.1 `agent-scope.ts` `resolveModelFallbackAvailability` |
| 用户中止、插话（`Worker native attempt is no longer active`） | 日志写 `next=openai/gpt-6-luna`，实际不切（10/23–10/28 共 65 次，luna 成功 0 次来自这里） | V journal |

V 上的实际记录：journal 只保留到 10/23，这段时间 DeepSeek 没有 5xx 事故，没有一次 DeepSeek → luna 的真实回退可看。10/27 有一次 `gpt-6.1-sol` 容量不足 → luna 成功。

**备用模型的窗口才是大问题。** V 近 7 天活跃的 makaron 人类频道会话（默认 DeepSeek，88 个），按 DeepSeek 自己报的 totalTokens：

| 区间 | 会话数 | luna（27.2 万）| Grok 4.7（50 万）|
|---|---|---|---|
| < 27.2 万 | 41 | 放得下 | 放得下 |
| 27.2–50 万 | 23 | 溢出 | 放得下 |
| 50–80 万 | 24 | 溢出 | 溢出 |

溢出后 OpenClaw 靠备用模型返回的 400 才发现（不会按备用模型的窗口先压缩），然后压缩再重试：DeepSeek 只是暂时不可用，会话却被永久压缩了。压缩失败时用户看到的是英文「provider rejected the request schema or tool payload」（见第 3 节）。

**Grok 的额度。** V 上 Grok 走共享凭据库里的 `xai:vegekyd@gmail.com` 订阅 OAuth（GrokBuild 周额度，`onDemandCap=0`）。10/04 曾经 98 次调用就把一周额度用光，之后 OpenClaw 把档案标成 billing 停用，**不会自动退回** `.env` 里的 `XAI_API_KEY`，/Grok 和 x_search 一起断了 22 小时。DeepSeek 故障时把全站流量回退到 Grok，一个 48 万 token 的会话一次就是几十万输入 token，额度会很快用光。Grok 进 fallbacks 之前，要先给 xai 加一个 API key 档案（同 provider 内额度用完会自动轮换）或者接受按量计费。

## 3. candidate

`lab/candidate/model-switch-fallback.mjs`（plan `lab/candidate/model-switch-fallback.plan.json`）。私有 Gateway + 1 个 Worker，V 的模型配置（DeepSeek 主、Grok 4.7 备，都在 vlab-worker 上），DeepSeek 和 Grok 都是 loopback 替身：DeepSeek 流出 `reasoning_content`，Grok 返回带 `encrypted_content` 的 reasoning 项；Grok 的估算超过窗口时按 xAI 原文回 400。记录每个请求的 effort、大小、对方推理有没有以正文形式出现。

### 3.1 thinking 档位（小会话，chat.send 发真实指令）

| 臂 | 会话 | `/think high` 或首轮后 | `/Grok` 后 | Grok 一轮后 | `/deepseek` 后 | 第三轮 DeepSeek effort |
|---|---|---|---|---|---|---|
| A（V 字节） | 显式 high | high | **off** | off | off | **无（不推理）** |
| A | 未设置 | high（Worker 写的） | **off** | off | off | **无** |
| B1（只改三处指令写回） | 显式 high | high | high ✅ | **off**（Worker 写的） | off | 无 |
| B1 | 未设置 | high | high ✅ | **off** | off | 无 |
| B2（再改 Worker 转发） | | | | | | 见 3.3 |

candidate-11153c91。B1 证明了第四处写入点，补丁随后加上 `harness-event-contract.mjs`。

### 3.2 48 万 token 的 DeepSeek 大会话交给 Grok

会话 `oc_eb6d0748`（`faa116bd`，336 条 assistant，推理 87 万字、正文 5 万字、工具结果 59 万字），agent CLI 回放整条分支。

| 场景 | 结果 |
|---|---|
| 手动 `--model xai/grok-4.7`，窗口 50 万 | ✅ 9.4 s 答完；Grok 请求 712 项 / 1.40 MB / 估算 47.3 万 token；同会话 DeepSeek 请求 387 项 / 1.38 MB |
| 手动，窗口 27.2 万（luna 的大小） | ❌ Grok 回 400 `maximum prompt length is 272000 but the request contains 472026 tokens` → OpenClaw 识别为溢出、开始压缩 → 快速压缩在 candidate 里鉴权失败（VLab 的 Azure 路由解析成没有登录的 OpenAI），退回 `compaction.model=deepseek-flash` 压缩，摘要没过质检 → 用户看到英文 `LLM request failed: provider rejected the request schema or tool payload.`（reason=format） |
| DeepSeek 一直 503，备用 Grok | 没切过去：镜像会话带着用户模型覆盖，`next=none`，Gateway 同模型重试 3 次、Worker 每次再重试 3 次，共 16 次 DeepSeek 请求，57 s 后中文提示。正好演示了「手动选过模型就没有 fallback」 |

两点要注意：
- 备用模型溢出时，压缩的退路是 `compaction.model`。V 上它是 `deepseek/deepseek-flash`，DeepSeek 故障时这条退路也是坏的；主路是 versa-fast-quality（Azure gpt-5.6-sol），V 上 10/04 实证可用。
- OpenClaw 不会按备用模型的窗口先压缩，先发一次超长请求、拿到 400 再压缩。

### 3.3 第四轮（补丁 B2 + 清掉镜像会话的模型覆盖）

（VLab 数据盘被其他会话的 candidate 占满，排队中）

## 4. 修复（本 PR）：切模型不再改写会话的 thinking 档位

`thinking-preserve-on-switch-v1`，`lab/patch-model-switch-thinking.mjs`，由 `lab/build-model-switch-thinking.mjs` 按 V 当前字节生成 `lab/release-files/model-switch-thinking/` 和 `lab/model-switch-thinking.plan.json`（4 个文件，before sha256 均为 2026-10-28 从 V 取的字节）：

| 文件 | 改动 |
|---|---|
| `openclaw/dist/directive-handling.impl-CoR1-5xR.js` | 单发 `/Grok` 不再把钳制后的档位写回会话；「Thinking level set to off (… not supported …)」提示保留，它对刚选的模型仍然成立 |
| `openclaw/dist/apply-session-model-selection-CJtWmAQJ.js` | 行内指令、`/model` 选择器同上 |
| `openclaw/dist/sessions-patch-iR7MNInU.js` | `sessions.patch` 只改模型时不再改写档位；显式改档位且不支持时仍然报错 |
| `production-worker/harness-event-contract.mjs` | Gateway 转发给 Worker 的本轮档位从 `thinking`（持久化）改成 `thinkingOnce`。仓库源码 `experiments/agent-worker-isolation-v1/` 同步修改（与 V 字节一致） |

- 前三处是上游 b22f886cdc9（#169435）的核心；第四处是 V 自己的 Worker 代码。
- 运行时行为不变：9.1 的回合入口和备用候选本来就按轮钳制，Grok 那一轮照样按 off 跑，只是不再写回。
- 已经被写成 off/low 的会话不会自动恢复（分不出是用户设的还是被切换写的），需要的人发 `/think default`。
- 需要一次 `v-self-restart`（Gateway 与 Worker 进程内代码）。

验证：`node --test lab/model-switch-thinking.test.mjs`（6 项，含按 V 字节重建逐字节比对）；`node --test experiments/agent-worker-isolation-v1/harness-event-contract.test.mjs`。candidate 见 3.1、3.3。

## 5. 需要 Tianyi 拍板

1. **fallbacks 放什么。** 现在是 `["openai/gpt-6-luna"]`。
   - luna：27.2 万窗口，近 7 天活跃的人类会话 53% 放不下；走 ChatGPT 订阅。
   - Grok 4.7：50 万窗口，27% 放不下；但走 GrokBuild 订阅周额度，全站回退会很快用光并连带 /Grok、x_search 一起停用。要用就先加 xai API key 档案（按量计费）。
   - 建议：短期保持 luna 不动；如果要 Grok，顺序 `["xai/grok-4.7", "openai/gpt-6-luna"]` 并先补 API key 档案。
2. **`compaction.model`。** 现在是 `deepseek/deepseek-flash`，是快速压缩失败时的退路。DeepSeek 故障时它也不可用。建议改成和快速压缩同一个不依赖 DeepSeek 的模型（`azure-openai/gpt-5.6-sol`）。配置项，两份配置都要改，需要停 Gateway 写入。
3. **手动选过模型的会话没有 fallback**（上游设计）。`/vds` 用户在 DeepSeek 故障时只能等或手动切。是否接受。
4. **Grok 4.7 的推理档位。** 9.1 只给它 `off`（上游 main 已改为 low/medium/high/xhigh）。现在 Grok 4.7 不发 reasoning effort，用 xAI 默认值。要不要回移，单独决定。
