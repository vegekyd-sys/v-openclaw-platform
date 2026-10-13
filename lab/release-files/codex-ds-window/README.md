# /vds 按 DeepSeek 真实窗口压缩（2026.9.1，run-attempt + 两个附带文件）

`patch-codex-ds-window.mjs --codex <@openclaw/codex 目录>`，幂等。基线是 V 在 2026-10-13 运行的
`run-attempt-D1hJO4fX.js` bb0b0354（`vds-view-image` 发版产物），产物 `dist/run-attempt-D1hJO4fX.js` 80875cf3（v2：加了 DeepSeek 字节保险；#361 合入的 v1 是 8ab51650，未部署过），
外加 `dist/v-deepseek-model-catalog.json`、`dist/v-deepseek-base-instructions.md`（由
`build-deepseek-model-files.mjs` 从 Codex rust-v0.159.2 的 `prompt.md` 生成）。发版 plan 见 `release.plan.json`。
关闭开关：Gateway 环境变量 `OPENCLAW_V_CODEX_DS_WINDOW=0`（窗口和字节保险一起关）。

这是 `codex-firsttext` README C 段末尾「没有上线的另一半：把 DeepSeek 窗口提到 100 万」。

## 现象

Codex 不认识 deepseek-flash，用兜底元数据：窗口 272,000，可用 258,400（95%），自动压缩线 244,800（90%）。
DeepSeek 接口实际接受 1,048,576。于是 /vds 大会话里：

- 任何新线程（主人第一次说话、换 provider 家族、推迟的记忆整理临时线程）只要整段重放超过 24.48 万，第一次请求后立刻压缩；
- 持久线程每两三轮压缩一次（私聊 ou_0674 两天 16 次）。

## Codex 0.159.2 里窗口和压缩线怎么来的

- `models-manager/src/manager.rs` `construct_model_info_from_candidates`：按 slug 最长前缀在模型目录里找；找不到用
  `model_info.rs` `model_info_from_slug`（`context_window = max_context_window = 272_000`，`effective_context_window_percent = 95`）。
- `model_info.rs` `with_config_overrides`：`model_context_window` 被钳在 `max_context_window` 以内；
  `model_auto_compact_token_limit` 不钳，但 `protocol/src/openai_models.rs` `auto_compact_token_limit()` 取它和窗口 90% 的较小值。
  所以只靠配置项（OpenClaw 插件按线程传参）最多到 272,000。
- 模型目录由 `thread_manager.rs` `build_models_manager` 在 **app-server 进程启动时** 按进程级配置建一次
  （`model_catalog_json` → `StaticModelsManager`，否则 `OpenAiModelsManager` = 内置目录 + ChatGPT 远程刷新）。
  线程级 `model_catalog_json` 进不了这个管理器，这就是 C 段里「经 app-server 时窗口仍是 258,400」的原因。
- 只要配置了任意 `model_catalog_json`，`config.model_catalog.is_some()` 就会关掉 update_plan 说明的剔除
  （`session/mod.rs` `get_prompt_base_instructions`、`session/world_state.rs`）：基础提示从 16,979 字变回 20,751 字，
  这就是 C 段里「基础提示反而换掉」。另外续用（resume）的线程优先用 rollout `session_meta` 里存的基础提示，
  存的是未剔除的原文。

## 三种方案

| | 全局 catalog（CODEX_HOME config.toml） | **app-server 侧覆盖（本补丁）** | OpenClaw 插件按线程传参 |
|---|---|---|---|
| 窗口能否到 100 万 | 能 | 能 | 不能：`model_context_window` 被钳在 272,000；线程级 catalog 不进模型管理器 |
| GPT 条目 | 同一个 CODEX_HOME 的 vcodex 也读它：只放 deepseek 条目则 GPT 全部退回兜底元数据；抄全部 GPT 条目则冻结（`StaticModelsManager` 不再远程刷新），要跟着上游手工同步 | 不受影响：只加在 DeepSeek 线程的 app-server 启动参数上 | 不受影响 |
| 基础提示 | GPT 和 DeepSeek 都不再剔除 update_plan 说明，提示变长 3,772 字 | 用 `-c instructions=` 固定为今天 DeepSeek 收到的剔除版（16,979 字），新线程和续用线程都一样 | 线程级 catalog 会让提示变长（C 段实测） |
| 缓存前缀 | GPT 和 DeepSeek 所有线程的前缀都变一次 | 提示和 developer 文本逐字相同；只有 `spawn_agent` 描述变（见下），上线后每个活跃 DeepSeek 线程失效一次 | 变 |
| 进程 | 不变 | 不变：V 上 DeepSeek 线程本来就在单独的 app-server（API key 认证，与 ChatGPT 登录的不同进程；10/13 实测 2 个进程分别只开 deepseek / openai 的 rollout），启动参数只是让这个进程的 key 多两项 | 不变 |

选 app-server 侧覆盖。改动点只有一个：`run-attempt` 的 `resolveFinalAppServer`（主回合、预热、换绑定都经过它），
provider 是 deepseek 且是 stdio 时，启动参数追加

```
-c model_catalog_json="<dist>/v-deepseek-model-catalog.json"
-c instructions="<dist/v-deepseek-base-instructions.md 的全文>"
```

catalog 只有一个条目，slug `deepseek`（最长前缀匹配 deepseek-flash、deepseek-v4-pro 等），字段逐项等于
`model_info_from_slug` 的兜底值，只改 `context_window = max_context_window = 1,000,000`：可用 950,000，压缩线 900,000。
VLab 上 Codex 0.159.2 `debug models` 读出 window 1,000,000、percent 95、提示 16,979 字。

不覆盖的：bounded/private Codex 回合（settled-turn 收尾、网页搜索 provider、隔离 completion）自己从插件配置建 app-server，
仍用兜底元数据；它们都是短回合。

## candidate（`lab/candidate/codex-ds-window.mjs` W 段，`codex-ds-window-w.plan.json`）

同一个隔离 Gateway（/vds 按 V 配置，DeepSeek 请求经本地记录代理），三个版本依次重启跑同一套步骤：
成员连发 7 段垫底（每段 2.2 万词，开头带每个版本不同的 salt，避免 DeepSeek 前缀缓存跨版本命中）+ 一句话，
然后主人第一次说话（主人比成员多工具，开新线程，把整段会话记录重放进去），主人再说两轮。

- `v`：V 当前字节（`vds-view-image` 的 run-attempt bb0b0354 + thread-lifecycle a9f76cf4）
- `window`：V + 本补丁
- `fixed`：dev（V + #358 codex-toolset-cover）+ 本补丁

candidate-d8fb6f5b（2026-10-13 约 18:15 CST）：

| | v（V 原样） | window（V + 本补丁） | fixed（dev + 本补丁） |
|---|---|---|---|
| Codex 窗口（rollout token_count） | 258,400 | 950,000 | 950,000 |
| 压缩次数 | 2 | 0 | 0 |
| 持久线程（成员）每次请求输入（缓存） | 73k → 254k(209k) → 237k(5k) **压缩** → 105k → 150k | 72k → … → 254k(209k) → 299k(254k) → 345k(299k) → 346k(345k) | 72k → … → 299k(254k) → 344k(299k) → 345k(344k) |
| 新线程（主人）重放 | 344k(28k)，下一轮 320k **压缩** → 68k | 344k(8k) → 345k(344k) → 346k(345k) | 344k(35k) → 345k(344k) → 346k(345k) |
| 各轮耗时 | 平常 2–4 s；压缩那两轮 11 s、14 s | 3–4 s；主人重放那轮 8 s | 3–4 s；主人重放那轮 7 s |
| 主人答出全部暗号 | 是 | 是 | 是 |

即：25 万以上的持久线程连续 4 轮（25.4 万、29.9 万、34.5 万、34.6 万）不压缩；新线程重放 34.4 万后连续 3 轮不压缩，
第二轮起缓存命中 344k/345k。

请求逐字段对比（每个版本成员线程、主人线程的第一个请求 vs `v`）：

- `instructions`：三个版本都是 16,979 字、sha256 3b08633f…，与 `dist/v-deepseek-base-instructions.md` 相同。
- `input` 里的 developer 文本（19,949 / 20,055 字 + 210 字）：完全相同。
- 其余字段只有 `client_metadata`（会话/线程 id）不同；请求里没有 `max_output_tokens`。
- `tools`：数量和顺序相同，**唯一差别**是 `multi_agent_v1` 里 `spawn_agent` 的描述：V 上列出 ChatGPT 目录里可选的
  子代理模型（`gpt-5.6-sol` 等），本补丁后是「No picker-visible model overrides are currently loaded」。原因是 DeepSeek
  app-server 的模型目录不再是 ChatGPT 的远程目录。这些 GPT 覆盖在 DeepSeek 线程上本来就用不了（子代理同样走 deepseek
  provider，DeepSeek 不认 gpt-* 模型名），而且 V 上这段描述本来就会随 OpenAI 远程目录更新而变。上线时活跃线程本来就会换新线程（见 X 段），不另外多一次缓存失效。

### 上线那一刻：V 字节建的线程换到本补丁（X 段，`codex-ds-window-x.plan.json`，candidate-0375bec6）

同一会话先在 V 字节上垫 4 段（线程到 21.4 万，窗口 258,400），重启 Gateway 换成本补丁后再垫 3 段，最后问开头的暗号。

- 换版后第一条消息**开了新线程**：插件的 `appServerRuntimeFingerprint` 包含 app-server 启动参数（`resolveCodexPluginAppCacheEndpoint`
  里有 `args`），参数一变绑定就按「runtime identity changed」轮换。新线程重放 25.5 万（12 s），之后 29.9 万、34.3 万续用不压缩，
  窗口 950,000；最后答对开头的暗号 OTTER-4。提示两边都是 3b08633f / 16,979 字。
- 所以上线后每个活跃 /vds 会话会**换一次线程、重放一次**（≤ 100 万渲染字符，V 上约 30–48 万 token，无缓存约 $0.05–0.07、
  首字 10–17 s）。以前这种重放超过 24.48 万就立刻压缩，这次不会。之后参数不再变，不会反复轮换。
- 关掉（`OPENCLAW_V_CODEX_DS_WINDOW=0`）或回滚时同样会换一次线程。

第一轮 candidate（candidate-52188514）用的是 `model_instructions_file`，抓到提示少了 2 个字：Codex 读文件时会 trim，
而今天的提示以两个换行结尾。所以改成 `-c instructions=<文本>`（`instructions` 配置项不 trim，来源标记同样是 Custom）。

## 接近 100 万时的首字和成本（`lab/candidate/deepseek-window-probe.mjs`）

VLab 直连 `api.deepseek.com/v1/responses`，按 Codex 的请求形状（流式、reasoning high、**不带 max_output_tokens**），
中英混排的合成记录。每个尺寸先发一次全新内容（无缓存），再发同一前缀换最后一个问题（前缀缓存命中）。
2026-10-13 18:10 CST（非高峰）：

| 实际输入 token | 无缓存：首个 delta / 首个正文 | 缓存命中：首个 delta / 首个正文 | 命中 token |
|---|---|---|---|
| 216,468 | 3.9 s / 4.4 s | 1.8 s / 2.3 s | 216,320 |
| 258,817 | 4.7 s / 5.7 s | 2.4 s / 2.9 s | 258,560 |
| 518,592 | 9.3 s / 11.1 s | 2.8 s / 3.7 s | 518,400 |
| 934,222 | 17.0 s / 17.4 s | 3.8 s / 4.3 s | 934,016 |
| 953,249 | 16.8 s / 17.5 s | 4.7 s / 5.4 s | 953,088 |

- 95 万输入不带输出上限照样被接受（200），首条/末条记录都答对。Codex 对 DeepSeek 从不发 `max_output_tokens`
  （候选抓到的请求字段：client_metadata、include、input、instructions、model、parallel_tool_calls、prompt_cache_key、
  reasoning、store、stream、tool_choice、tools），所以 E3（PR #345）那种「输入 + max_tokens 超窗口被拒/被钳成 1」
  的预算问题不在这条路径上：E3 是 OpenClaw 自己的 transports 给 DeepSeek 估算并设 max_tokens，Codex harness 不经过它。
- 无缓存预填充约 5.5 万 token/s；缓存命中时首字约 1.8 s + 每 100 万 token 约 2–3 s。

价格（DeepSeek 官网 2026-10-13，deepseek-flash，每 100 万 token）：缓存命中 $0.003、未命中 $0.15、输出 $0.6（非高峰；
高峰 UTC 01–04、06–10 工作日加倍）。

V 上 /vds 两天（10/12–10/13 18:00，只读统计 codex-home rollout）：82 个 DeepSeek 线程、3,613 次请求、62 次压缩；
输入 5.725 亿 token（缓存命中 94.4%），未命中 3,220 万（新线程首个请求 1,195 万、压缩后重建缓存 205 万、其余 1,823 万），
输出 266 万（其中压缩摘要 17 万）。82 个线程里 37 个第一次请求就超过 24.48 万（立刻压缩）；最大单次输入 48.2 万；
压缩时中位 27.2 万、压缩后中位 11.4 万。按非高峰价两天约 $8（命中 $1.6、未命中 $4.8、输出 $1.6）。

改后的变化：

- 省掉的：压缩后重建缓存（205 万未命中 ≈ $0.3）和压缩摘要输出（17 万 ≈ $0.1）；每次压缩那一轮多出的约 11–13 s
  （候选 V 字节：压缩轮 15–16 s，平常 3–4 s）；以及压缩丢掉的上下文。
- 多出的：上下文不再被压回 11 万，命中缓存的输入变长。持久线程从 11 万长到 90 万才压缩一次，平均上下文从约 19 万
  变成约 50 万，命中部分的费用约 ×2.6（两天 $1.6 → 约 $4.3，多约 $1.3/天非高峰）。首字：每个模型请求（一个回合里
  每次工具调用后都是一个请求）在 50 万时约 2.8 s、90 万时约 3.8 s，比 20 万时多 1–2 s；工具调用多的回合会累加。
- 新线程重放的成本不变：重放量由插件的投影上限（100 万渲染字符，V 上约 30–48 万 token）决定，与窗口无关；
  区别只是重放后不再立刻压缩。

## 请求体字节保险（v2）

压缩线从 24.48 万移到 90 万后，图片在线程里留得久得多；DeepSeek 请求体超过 48 MiB 就 413，而 #322 的 413 处理是
「这一轮失败、清绑定、下一条消息恢复」，不会同轮重试。V 10/10–10/13 的 137 个 DeepSeek 线程里 13 个带图，
图片最多的 4 个线程一生中图片 56 / 48 / 26 / 21 MB（旧压缩线下每次压缩都把图清掉，所以没出事）。

做法：DeepSeek 线程在回合开始前若 rollout 文件 ≥ 40 MiB，就走插件已有的「native transcript exceeded active byte
limit; starting a fresh thread」换新线程（`compaction.maxActiveTranscriptBytes` 有配置时仍以配置为准；V 上没配，
所以这条保险今天对所有 provider 都是关的）。请求体基本是 rollout 内容的子集加约 200 KB 的说明和工具，所以 40 MiB 的
rollout 给一轮新增留了约 8 MiB。纯文字线程不受影响：V 上 45 万 token 的纯文字 rollout 约 3 MB，工具多的最多约
34 字节/token（90 万时约 30 MB）。上限可用 `OPENCLAW_V_CODEX_DS_MAX_TRANSCRIPT_BYTES` 调。

换出来的新线程重放的是插件投影（图片渲染成 `[image omitted]`、文字最多 100 万字符），起始 rollout 只有几 MB，
所以 40 MiB 不会连环换线程；上限只有调到低于重放本身的大小时才会每轮都换。

candidate Y 段（candidate-421f9a72，上限临时调到 300 KB）：线程过线后每轮都在回合开始前换新线程
（日志 `native transcript exceeded active byte limit; starting a fresh thread`），5 轮全部成功、最后答对开头暗号 OTTER-4。
这里每轮都换是因为 300 KB 小于重放本身（新线程起始 376 KB → 1 MB），正说明上面那个条件。
同一 candidate 的 W 段用最终产物 80875cf3 重跑：结果与 d8fb6f5b 相同（V 字节 2 次压缩；修复版 0 次、窗口 950,000；
提示 3b08633f、developer 相同、工具只差 `multi_agent_v1`）。

## 什么时候仍然压缩

- Codex 自己：上下文到 900,000（窗口 90%）时压缩，可用 950,000，DeepSeek 上限 1,048,576，余 9.8 万给输出和一轮内的增量。
  工具输出在兜底元数据里本来就按 10,000 字节截断，单轮很难一次增加 10 万以上。
- 请求体字节：图片多的线程在 token 远没到 90 万时 rollout 先到 40 MiB，回合开始前换新线程（上一节）；一轮内新增
  超过约 8 MiB 时仍可能 413，由 #322 清绑定兜底。
- 如果更在意首字而不是少压缩，可以只改 catalog 的 `auto_compact_token_limit`（例如 600,000；Codex 取它与窗口 90% 的较小值），
  不用改代码。按上表，60 万时缓存命中首字约 3 s，仍然不会让新线程重放（≤ 48 万）立刻压缩。

## 风险

1. **上线时每个活跃 /vds 会话换一次线程**（X 段）：重放一次、不压缩；`spawn_agent` 描述的变化也随这次新线程一起生效，
   不会再额外失效一次缓存。启动参数里带着 1.7 万字的提示文本，所以每个 DeepSeek 绑定的 `appServerRuntimeFingerprint`
   也约 17 KB（存在插件状态里，只做字符串比较；插件只记录参数的 sha256，不打日志）。
2. **长上下文的首字和费用**：上下文不再在 24 万压回 11 万。90 万时每个模型请求的缓存首字约 3.8 s（20 万时约 2 s），
   工具调用多的回合会累加；命中部分费用估计 ×2.6（约 +$1.3/天非高峰）。要折中就改 catalog 的 `auto_compact_token_limit`。
3. **请求体字节先到上限**：已用字节保险处理（见下节）。一轮之内新增超过 8 MiB 图片的极端情况仍会 413，由 #322 清绑定，下一条消息恢复。
4. **Codex 升级**：catalog 和提示文本固定在 0.159.2。升级 Codex 后不重新生成，DeepSeek 会一直收到 0.159.2 的基础提示，
   不会报错。`build-deepseek-model-files.mjs` 会校验 prompt.md 的 sha256，升级时要换成新版本的 prompt.md 重新生成，
   并重跑 W 段对比。
5. **OpenClaw 侧的 contextTokens**：DeepSeek 会话的 `contextTokens` 会跟着 Codex 报告变成 950,000。记忆整理的周期
   （c9371855：⌊976k ÷ contextTokens⌋ 次原生压缩）从 3 次变成 1 次；原生压缩本身也少了很多，整体整理次数不会变多。
   推迟整理用的临时线程重放后不再立刻压缩，单次整理的输入从约 200 万降到一次重放。
6. **不覆盖的路径**：bounded/private Codex 回合（settled-turn 收尾、网页搜索 provider、隔离 completion）仍用 272,000 兜底；
   它们都是短回合，不受影响。
7. **关闭**：`OPENCLAW_V_CODEX_DS_WINDOW=0`（Gateway 环境变量，需要重启），或用 promote-to-v 回滚这三个文件。
   关掉后 DeepSeek app-server 的启动参数回到 V 现在的样子，线程照常续用。

## 发版

依赖：无（只改 Codex 插件的 run-attempt，另加两个文件）。#358（codex-toolset-cover，thread-lifecycle）在 dev 上、
还没上 V；两者改不同文件，可以合成一个发版，也可以先后发。需要重启 Gateway（9.1 插件重载不换代码）。

`release.plan.json`（before = V 2026-10-13 的字节，只读核对过）：

| 目标（`/home/openclaw/.openclaw/` 下） | before | after |
|---|---|---|
| `npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/run-attempt-D1hJO4fX.js` | bb0b0354… | 80875cf3… |
| 同目录 `v-deepseek-model-catalog.json` | 不存在 | 6df9d13d… |
| 同目录 `v-deepseek-base-instructions.md` | 不存在 | 3b08633f… |

步骤：

1. Tianyi 授权后合入 dev。
2. 共享 VLab：拿 lease，与 `codex-toolset-cover-20261013`（共享 VLab 当前的在途发版）合成一个发版或排在它之后；
   共享 VLab 的 Codex 插件还要同步到 `state/npm` 副本。重启后验收：
   - 日志出现 `codex app-server DeepSeek threads use the DeepSeek model catalog`；
   - DeepSeek app-server 的启动参数带 `model_catalog_json`、`instructions`，GPT app-server 的参数不变；
   - 一个 /vds 会话的 rollout `token_count.model_context_window` = 950,000，超过 24.48 万后续轮不压缩；
   - /vcodex 一轮正常（GPT 不受影响）。
3. `scripts/promote-to-v.mjs` 上 V，重启 Gateway，`vlab.mjs align`，`vlab-v-parity.mjs` 到 ALIGNED；补捕获 + CHANGELOG PR。
4. 上线后看两天：DeepSeek 线程的压缩次数（基线：10/12–13 两天 82 线程 62 次）、`[firsttext-e2e.1]` 里 codex 的首字、
   413 次数、DeepSeek 账单。
