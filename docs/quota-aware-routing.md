# 订阅额度富余时自动切 /vcc、/vcodex：调研与设计（2026-11-17）

## 背景

Tianyi 的 Claude Max 和 ChatGPT Pro 订阅，每周额度常常用不完。V 上 `/vcc`（claude-cli harness，走 Claude 订阅）和 `/vcodex`（Codex harness，走 ChatGPT 登录）都比默认的 `/vds`（Codex + DeepSeek Flash，按 API 计费）强。

目标：在本周额度预计用不完时，把重要会话自动切到 vcc/vcodex；额度快用完或撞到限额时，再切回 /vds。

本文分四部分：调研结论、设计、原型（`apps/v-quota-router/`）和要拍板的事。V 的配置和运行时都没有改动。

## 1. 结论先说

- **两边剩余额度都能零成本读到，已在 V 上实测。**
  - Claude：用 CLI 自己的登录读 `GET /api/oauth/usage`。11/17 10:04 CST 读到周用量 22%，重置时间 11/22 03:00 CST，当前没有 5 小时窗口。
  - Codex：从 rollout 文件里的 `token_count.rate_limits` 读。11/17 读到周用量 6%，重置时间 11/24 00:28 CST。Pro 套餐只有周窗口。
  - 两个读取都不发生推理。
- **切换用 OpenClaw 原生的会话级换模型，不改 dist。**
  - 做法：Gateway RPC `sessions.patch {key, model}`，效果等同于用户在聊天里打 `/vcc`。下一轮起生效，harness 随模型条目上的 `agentRuntime` 自动换。
  - 两个坑：
    - 原生插件钩子 `before_model_resolve` **切不到 /vcc**：claude-cli 的分派发生在钩子之前。
    - 用带 `operator.admin` 的连接去 patch，9.1 可能把模型「粘」进 `openclaw.json` 的 agent 默认值。所以控制器只申请 read+write 权限。
- **开源社区没有能直接接入的现成方案。**
  - 数据来源和降级顺序借鉴 CodexBar。
  - 「先用订阅、超额再切」借鉴 CLIProxyAPI 的 fill-first。
  - 窗口对齐和冷却借鉴 better-ccflare、LiteLLM。
- **原生 fallback 有缺口。** 用户来源的会话覆盖会关掉 fallback 链：一轮如果正好撞上限额，这一轮会直接失败。设计里的应对是提前停（周用量 90%、5 小时窗口 85%）。要让原生 fallback 也生效，需要一个小补丁，列为拍板项。
- **条款风险在 Claude 一侧。** Anthropic 消费者条款限制用脚本或自动化方式访问订阅，也限制「代表他人」使用。
  - 默认把 Claude 档限定在只有 Tianyi 一个真人的会话。
  - 群聊只给 Codex 档。
  - 这一条要 Tianyi 拍板。

## 2. 调研：怎么拿到剩余额度

### 2.1 Claude（Max，账号就是 V 上 claude-cli 登录的那个）

| 来源 | 成本 | 拿到什么 | 在 V 上能否无副作用使用 |
|---|---|---|---|
| `GET https://api.anthropic.com/api/oauth/usage`，头 `Authorization: Bearer <accessToken>` + `anthropic-beta: oauth-2025-04-20` | 不推理 | 窗口 `seven_day`、`five_hour`、`seven_day_opus/sonnet`，各带 `utilization` 和 `resets_at`；`limits[]` 带 `severity`；还有 `seven_day_breakdown` | **能，已实测**。令牌从 `/home/openclaw/.claude/.credentials.json` 只读取用。限制见下方三点 |
| stream-json 的 `rate_limit_event`（Claude Code 2.1.45 起） | 0，被动 | `status`（allowed/allowed_warning/rejected）、`rateLimitType`、`resetsAt`；`utilization` 只在越过预警阈值时才带 | 9.1 的 claude-cli runner 不处理这个事件，直接丢掉。要用得给 runner 加几行，列为后续 |
| Messages 响应头 `anthropic-ratelimit-unified-{5h,7d}-utilization`、`-status`、`-reset` | 每次推理都带 | 精确百分比 | 要在 CLI 和 Anthropic 之间加透传代理（设 `ANTHROPIC_BASE_URL`），改动面大，不做 |
| CLI 内的 `/usage`、statusline 的 `rate_limits`、stream-json 的 `get_usage` 控制请求 | 同第一行 | 同第一行 | 底层是同一个接口。`/usage` 和 statusline 在无头模式下都用不了 |
| OpenClaw `usage.status` | — | — | **拿不到 Claude**。anthropic 插件故意排除了 claude-cli 的登录：通用的 OAuth 刷新会把 CLI 顶下线 |

用 `/api/oauth/usage` 的三个限制：

1. **不能刷新令牌。**
   - access token 有效期约 8 小时，只有 claude-cli 自己用的时候才会续期。
   - refresh token 是一次性的，我们去刷新会让 CLI 掉登录。
   - 所以令牌过期后控制器只用缓存值，并把读数标为 stale；stale 读数不授权新的升级。
2. **按账号限流很严，且和 Tianyi 本机 Claude Code 共用同一个桶。** 本机 statusline 也调这个接口。控制器最多每 15 分钟调一次，遇到 429 就用缓存。
3. **这个账号也是 Tianyi 自己写代码用的账号。** 11/17 的 `seven_day_breakdown` 显示本周用量 100% 来自 Claude Code。所以配速时要给 Tianyi 本人留出余量（`reservePercent`）。

撞到限额时，CLI 的 result 事件是 `is_error:true, api_error_status:429`，文案为 `You've hit your … limit`，同时有一条 `rate_limit_event status=rejected`。

### 2.2 Codex（ChatGPT Pro）

| 来源 | 成本 | 拿到什么 | 在 V 上能否无副作用使用 |
|---|---|---|---|
| rollout 文件 `codex-home/sessions/YYYY/MM/DD/rollout-*.jsonl` 的 `token_count` 事件 | 0，被动；每个 GPT 回合都会写 | `rate_limits.primary/secondary` 的 `{used_percent, window_minutes, resets_at}`，另有 `plan_type`、`rate_limit_reached_type`、`credits` | **能，已实测**。注意两点：/vds 的 rollout 也带一个全空的 `rate_limits`，要跳过；只列出今天和昨天的目录，用文件头的 `model_provider` 先筛一遍，不做递归遍历 |
| app-server `account/rateLimits/read` 和通知 `account/rateLimits/updated` | 不推理 | 字段同上（camelCase） | OpenClaw codex 插件已经在合并这个通知，并通过 Gateway RPC **`usage.status`** 对外提供。rollout 读数过期时用它兜底 |
| `GET chatgpt.com/backend-api/wham/usage`（头 `chatgpt-account-id`） | 不推理 | 窗口加 `limit_reached` | 要拿 OpenClaw 托管的 OAuth 令牌，没有必要 |
| 响应头 `x-codex-primary-used-percent` 等 | 每次推理都带 | — | Codex 已经把它写进 rollout |

撞到限额时返回 HTTP 429，`error.type = usage_limit_reached`，带 `resets_at`；app-server 侧的错误是 `codexErrorInfo = usageLimitExceeded`。

- **共用额度。** `/vcodex`、`/luna`（目前 `/vds` 的 fallback）、`/terra`、`/astra` 都在同一个 ChatGPT 账号上，VLab 也用这个账号。
- **待确认的新闻。** 二手消息说 12 月起 ChatGPT 网页和 Codex 将共用额度。如果属实，Codex 侧也要留余量。

### 2.3 开源方案

| 项目 | 做什么 | 结论 |
|---|---|---|
| [CodexBar](https://github.com/steipete/CodexBar)（MIT，Swift） | 菜单栏显示 Codex 和 Claude 的用量。Claude 依次尝试 OAuth usage → CLI PTY → 网页 cookie；Codex 依次尝试 OAuth → app-server RPC → 网页 | **借鉴**数据来源和降级顺序；代码是 Swift，用不上 |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（MIT，Go） | 把 CC/Codex 订阅包装成 API，多账号 fill-first，`quota-exceeded` 时切到下一个 | **借鉴**「先用订阅、超额就切」的形态；它是独立代理，和 OpenClaw 的 harness 模型不对路 |
| [better-ccflare](https://github.com/tombii/better-ccflare)（MIT） | 多个 Claude OAuth 账号的代理，按 `rate_limit_reset` 对齐 5 小时窗口，在窗口重置时提前开新窗口 | **借鉴**窗口对齐，是最接近 pacing 的实现 |
| [claude-code-router](https://github.com/musistudio/claude-code-router)（MIT） | 按任务类型（background/think/longContext）路由，带有序 fallback | **借鉴**按任务类型分档；它不感知订阅额度 |
| [LiteLLM Router](https://docs.litellm.ai/docs/routing) | rpm/tpm 路由、429 冷却、`order` 分级加 fallbacks | **借鉴**冷却和分级语义；它不懂订阅的周窗口 |
| ccusage、Claude-Code-Usage-Monitor、ccstatusline | 根据本地 jsonl 估算 token 和成本 | **不适用**：拿不到真实利用率 |
| OpenClaw 的 claude-max-api-proxy 文档方案 | 用子进程跑 `claude`，对外暴露 OpenAI 兼容接口 | **不适用**：V 现在的做法就是这样，同样没有额度感知 |

「额度用不完就作废」这类专门的调度器没找到。社区里最接近的是上面「窗口预热」那一类。

### 2.4 条款（摘要，不是法律意见）

- **Anthropic Consumer Terms**（适用于 Pro/Max）：禁止用 bot、脚本等自动化方式访问服务，除非用 API Key 或另有许可；禁止共享账号。
- **Claude Code 合规页**：额度按「普通的个人使用」设计；禁止把他人的请求路由到 Free/Pro/Max 凭据上。
- **2025-07 周限额公告**：点名了「24/7 后台运行」和共享账号。
- **对本方案的影响**：
  - `/vcc` 已经在群聊里给其他人用，这个风险现在就存在，不是本方案带来的。
  - 但「自动把群聊切过去、刻意赶在重置前用完」会放大这个风险。
  - 所以原型默认 Claude 档 `ownerOnly: true`，只升级 Tianyi 本人的私聊，以及只有他一个真人的群。
- **OpenAI 一侧**：条款原文没核实到，没有发现明确禁止。

## 3. OpenClaw 原生机制（9.1）

| 机制 | 能不能用 | 说明 |
|---|---|---|
| `agents.*.model.primary/fallbacks` | 不用来做动态切换 | 改它要写配置：会热重载、worker 换代，还会波及夜班和 cron 等所有会话 |
| `channels.modelByChannel` | 可选，静态用法 | 按群或私聊把模型固定住，只在会话没有覆盖时生效，热加载。适合「某个群永远用 vcc」，不适合随额度变化 |
| 别名 `/vcc` `/vcodex`（inline directive） | 用户自己用的入口 | 写入 `modelOverrideSource=user` |
| **`sessions.patch {key, model}`** | **原型采用** | 与别名效果相同，`model:null` 清除覆盖、回到 agent 默认。`sessions.list` 会回报新的 `agentRuntime.id`，切 vcc 后是 claude-cli，切 vcodex 后是 codex |
| 插件钩子 `before_model_resolve` | 不用 | 在 embedded runner 里执行，claude-cli 的分派更早，所以切不到 /vcc；而且只能拿到 prompt，拿不到会话信息 |
| `modelOverrideSource: "auto"` | 想要，但 RPC 不开放 | 只有 auto 来源的覆盖会保留 fallback 链，user 来源会关掉（`resolveModelFallbackAvailability`）；`sessions.patch` 的协议里没有这个字段 |
| `session-model-auto-revert` | 不适用 | 只在 auth/billing/model_not_found 这几类错误时回滚，rate_limit 不触发 |
| `usage.status` RPC | 用作 Codex 读数的兜底 | 要 operator.read，带缓存；拿不到 Claude（原因见 2.1） |

**admin 权限的坑**（`persistSessionPatchModelSelection`）：9.1 的 `modelSelectionScope` 默认是 `effective`。这时如果调用方有 `operator.admin`，`sessions.patch {model}` 会把模型写进 agent 默认配置，相当于改了生产默认模型，还会触发一次配置写入。

- V 和 VLab 目前都设了 `agents.defaults.modelSelectionScope = "session"`，所以现在不会触发。
- 控制器仍然只申请 `operator.read` 和 `operator.write`，作为第二道保险：以后有人删掉这个字段也不会出事。
- candidate 的第二组把这个字段去掉后又跑了一遍，结果见第 5 节。

## 4. 设计

### 4.1 架构

```
systemd timer (每 15 分钟, openclaw 用户)
  └─ quota-router.mjs tick
       ├─ 读额度：Claude oauth/usage(≤每15分钟, 不刷新令牌) · Codex rollouts → usage.status 兜底
       ├─ 配速：每个订阅一个状态 surplus / hold / brake / exhausted / unknown
       ├─ 列会话：sessions.list(agentId=makaron, activeMinutes=4320, limit=200, 不带消息)
       ├─ 决策：打分 → 升级 / 回退 / 放手
       └─ 执行：sessions.patch {key, model}（read+write scope），账本落盘
```

控制器是 Gateway 之外的独立短进程：

- 它挂了不影响 Gateway。
- 停用只要在状态目录放一个 `PAUSE` 文件，或者把 `mode` 设成 `off`。设成 `off` 会把它切过的会话全部切回。

### 4.2 配速曲线

每个订阅单独计算（Claude 和 Codex 各一份，参数可以分开配），看周窗口：

- **预算终点**：`预算终点 = 100% − reservePercent`。`reservePercent` 默认 15%，留给 Tianyi 本人。
- **速度**：
  - 默认取最近 24 小时的采样斜率（覆盖一个昼夜）。
  - 采样跨度不足 6 小时，就用窗口平均速度；分母至少按 24 小时算，避免周一早上的短时爆发把预测拉得过高。
- **预测与富余**：
  - `预测重置时用量 = 当前用量 + 速度 × 剩余小时`
  - `富余 = 预算终点 − 预测重置时用量`，即预计会白白作废的百分比。
- **状态判定**（从上往下，命中即停）：
  - `exhausted`：周用量 ≥ 90%，或厂商报告已经撞限，或 5 小时窗口 ≥ 85%。→ 立刻把这一档全部切回。
  - `brake`：富余 < 2%。→ 每轮切回一个分数最低的会话（会话至少已经保持 2 小时）。
  - `hold`：富余 < 10%，或 5 小时窗口 ≥ 70%。→ 不加也不减。
  - `surplus`：其余情况。→ 可以升级会话，名额为 `min(maxSessions, ⌊富余 / percentPerSession⌋)`。`percentPerSession` 默认 4%，表示一个升级会话到周末大约用掉多少。
  - `unknown`：没有读数，或读数已经 stale。→ 不升级，但停止规则照样执行。
- **收尾期**：重置前 36 小时内不再看预测，`富余 = 预算终点 − 当前用量`，重要度门槛从 40 降到 25。剩下的额度反正要作废，就把它用掉。
- **实测**（11/17 10:04 CST，V 上只读 probe）：Claude 用量 22%，时间过去 32.8%，按目前速度到周末是 67%，富余 17.9%，状态 surplus，名额 4。Codex 改用 24 小时分母后同样落在 surplus。改之前它被 9.6 小时的短样本推成「预计 105%，brake」。

### 4.3 「重要会话」打分（全部可配，分数是简单加和，每一项都写进日志）

| 规则 | 默认分 |
|---|---|
| Tianyi 的私聊（`commands.ownerAllowFrom` 里的身份） | +50 |
| 只有 Tianyi 一个真人的群 | +25 |
| 配置的 VIP（会话 key、key 尾 `feishu:group:oc_x` 或通配） | 按配置 |
| Control UI 里置顶（`pinned`） | +30 |
| 会话标签含关键词（默认「重要」「vip」） | +40 |
| 最近活跃：30 分钟内 +20，3 小时内 +10，1 天内 +0 | — |
| 已经在跑长任务（会话 token ≥ 12 万） | +5 |

- 9.1 的会话成员都记成 `type:"observation"`。规则用 `senderKind:"human"` 识别真人，CLI 和 agent 不算人。
- **排除**：cron、subagent、heartbeat、语音（talk）、夜班、VLab 测试会话、后台会话、超过 1 天不活跃的会话。
- **门槛**：40 分，收尾期 25 分。
- **分档**：
  - 每轮最多升级 1 个会话（`maxUpgradesPerTick`），慢慢加，因为读数比实际用量滞后。
  - 一个会话两档都符合时，给富余更多的那一档，即「最可能作废的额度先用」。
  - Claude 档默认只接 `ownerOnly` 的会话，最多 2 个。
  - Codex 档最多 3 个。
  - 会话超过 `maxTotalTokens` 不切：Claude 30 万，Codex 25 万。原因是换 harness 后第一轮要把历史投影或重放一遍，大会话一切就会烧掉一大块额度，还可能超出上下文窗口。

### 4.4 切换在哪一层

| 层 | 选择 | 理由 |
|---|---|---|
| 新会话的默认模型 | 不做 | 只能靠改 agent 配置；会触发热重载和 worker 换代，还会把夜班、cron、所有群一起切走 |
| **已有会话的下一轮** | **做** | `sessions.patch`，只对 `hasActiveRun=false` 的会话，从下一轮生效 |
| 按任务类型 | 后续 | 开跑前要先知道任务类型；`before_model_resolve` 只能在 Codex 家族内部按 prompt 切，到不了 /vcc。可以以后让 V 自己判断「这件事值得用 vcc」，再调用会话工具 |

所有权规则：

- 控制器只碰两类会话：没有任何覆盖、正在跑 agent 默认模型的会话；以及它自己切过、模型仍然是它设的那个的会话。
- 用户自己打过 `/vcc`、`/deepseek`，或者原生 fallback 写了 auto 覆盖的会话，都不是它的。账本里只记一笔「放手」，不发 patch。
- 同一个会话至少保持 2 小时才会因为 brake 被切回，避免在两个 harness 之间来回抖动。exhausted 不受这条限制。

### 4.5 回退

1. **提前停**：上面的 exhausted 和 brake 规则，在撞限之前就把会话切回。
2. **撞限后**：
   - 下一轮读数里会看到撞限信号（Claude 的 `limits[].severity`、utilization ≥ 100；Codex 的 `rate_limit_reached_type`），然后整档切回。最迟一个 timer 周期（15 分钟）；Claude 的读数自带 15 分钟缓存，所以最坏约 30 分钟。
   - 缺口：被切到 vcc 或 vcodex 的会话属于用户来源覆盖，原生 fallback 被关掉了。所以正好撞限的那一轮会直接报错，用户需要重发一次。
3. **补这个缺口的两条路**（拍板项）：
   - 小补丁：让 `sessions.patch` 接受 `modelOverrideSource: "auto"`，或在控制器侧用插件写会话条目。这样原生 fallback 链会接住撞限的那一轮。
     - 但 V 的 fallback 链是 `[gpt-6-luna]`，它和 /vcodex 用的是同一个 ChatGPT 额度。Codex 撞限时 luna 接不住，链需要改成 `[luna, deepseek/deepseek-flash]` 一类。这会改变生产默认的 fallback 行为，要单独评估。
   - 被动信号：给 claude-cli runner 加几行，转发 `rate_limit_event`，并让 Codex 的 `account/rateLimits/updated` 推一次。撞限后几秒内就能切回，不用等下一个周期。
4. **跨 harness 切换的已知情况**：
   - vds↔vcodex 互切已在 V 上验证（10/08，见记忆 codex-harness-firsttext-20261007）。
   - 9/27 VLab 上出现过 vcodex→vds 401，之后修好了。
   - claude-cli 每个会话起一个进程，切过去后第一轮是冷启动。

### 4.6 可见性

原型默认静默切换。飞书卡片页脚的 `Runtime:` 能看出这一轮实际用的是什么。每次切换都写进 `events.jsonl`（包括打分理由和配速读数）。

可选项，拍板项 4：

- 切换时往会话里发一句「本会话已切到 /vcc（本周订阅富余）」。
- 每天给 Tianyi 发一次摘要。

## 5. 原型

位置是 `apps/v-quota-router/`，说明见该目录下的 README。包含：

- `lib/pacing.mjs`：配速。
- `lib/quota.mjs`：两边的读数。
- `lib/importance.mjs`：打分。
- `lib/decide.mjs`：决策和账本。
- `lib/gateway.mjs`：只用 read+write scope 的 RPC。
- `quota-router.mjs`：CLI，命令有 `probe`、`tick`、`release-all`。
- systemd 单元：默认 `mode: "dry-run"`。

验证：

- 单元测试 13 项，覆盖：V 上真实的读数形状；DeepSeek 的空 rate_limits；令牌过期时不刷新、只用缓存；429 用缓存；配速四种状态；收尾期；打分和排除；所有权和放手；最短保持时间；运行中不 patch；大会话不切。
- V 上只读 probe：见 4.2。
- VLab candidate：`lab/candidate/quota-router.mjs`，计划文件 `lab/quota-router.plan.json`。起私有 9.1 Gateway，不跑模型回合、不花额度，结果见 PR 描述：
  1. 富余时，私聊切到 /vcc（runtime 是 claude-cli），VIP 群切到 /vcodex（runtime 是 codex）；低分群、cron 会话、用户自己选的 /vcc 都不动；`openclaw.json` 字节不变。
  2. 用户把 VIP 群改成 /deepseek 后，控制器只放手，不发 patch。
  3. Claude 撞限：私聊切回 /vds，覆盖被清除。
  4. `release-all` 会全部切回。
  5. 对照组：用 admin 权限做同样的 patch，看配置是否被改写。

  结果（11/17，两组都通过，含单元测试 14/14）：

  | 组 | candidate | 1–4 步 | 控制器的 patch 改没改 openclaw.json | admin 权限的 patch |
  |---|---|---|---|---|
  | `modelSelectionScope=session`（与 V、VLab 现状相同） | `candidate-7432c429` | 全过 | 没改 | 没改 |
  | 删掉这个字段（9.1 默认 effective） | `candidate-bb443bbc` | 全过 | 没改 | **改了**：makaron 的 `model.primary` 被改写成 `anthropic/claude-opus-5-5` |

  每次 tick 用时约 1.4–1.9 s（在空库上）。第 1 步里，`sessions.list` 回报的 runtime 分别是 `claude-cli` 和 `codex`。第 2 步的账本动作是 `release`，没有发 patch。

  上一版脚本暴露过同一个陷阱：测试里用 admin 客户端模拟「用户改模型」，结果 agent 默认被改写，后面「切回默认」就落到了被改写的模型上。

**V 上一次只读 dry-run**（11/17 10:2x CST）：不发 patch，状态写在临时目录。

- 配速：Claude 预计用到 67%，富余 18%；Codex 预计用到 45.6%，富余 39.4%。两边都是 surplus。
- 结果是**一个会话都不会切**：最近活跃的会话最高只有 25 分（活跃 +20、长任务 +5），没到 40 分的门槛。
  - Tianyi 本人的私聊没有进入候选，因为它已经有手动选的模型；按所有权规则，控制器不碰它。这是对的。
  - 也就是说，在默认规则下，「重要」要靠 Tianyi 指定 VIP 群或置顶，这是拍板项 3。
- 两个当场修掉的问题：
  - 9.1 把群成员记成 `{type:"observation", senderKind:"human"}`，原来的规则因此认不出「只有 Tianyi 的群」。
  - `sessions.list` 的耗时：limit 200 冷调用 7.0 s；limit 30 冷调用 5.8 s；紧接着 limit 60 热调用 1.7 s；修复后再跑一次 limit 60 冷调用 6.0 s。开销主要在冷启动，跟行数关系不大。每 15 分钟调一次，基本都是冷调用。
    - 默认已改成近 1 天、最多 60 行。
    - 阶段 1 要先确认这次调用会不会卡 Gateway 主线程。如果会，就改成只读打开 agent 库来列会话，不经过 Gateway；或者把间隔拉长到 30 分钟。
- 修复后的第二次 dry-run 结论不变：仍然没有会话过门槛。活跃的群里都有其他人，活跃的私聊都是别人的。

**没覆盖**：

- 切换后真实跑一轮。这要花订阅额度，而且 candidate 不该复制 OAuth。留给共享 VLab 用 `vlab.mjs test` 做（需要 lease）。
- sessions.list 对 V 事件循环的影响。

## 6. 上线路径

1. **阶段 1，dry-run**：
   - 在 V 上装 timer，`mode: "dry-run"`，只读。
   - 每 15 分钟一次 sessions.list，Claude 接口最多每 15 分钟一次。
   - 跑满一周，看「它本来会切哪些会话」和配速曲线准不准，并顺带量 sessions.list 的耗时。
   - 需要 Tianyi 批准，因为这是 V 上的新单元。
2. **阶段 2，apply**：
   - Claude 档 `ownerOnly`，最多 1–2 个；Codex 最多 3 个。
   - 先拿一个周末前的收尾期试。
3. **阶段 3**：auto 来源加 fallback 链（或者被动信号）、切换通知、按任务类型分档。

## 7. 要 Tianyi 拍板

1. **Claude 档的范围**：
   - 只升级 Tianyi 本人的私聊和只有他一个真人的群（默认，条款风险最低）；
   - 还是也包括有其他人的群？
2. **给本人留的余量**：两边默认各留 15%；本周 Claude 的用量 100% 来自 Claude Code。要不要分开设？比如 Claude 20%、Codex 10%。
3. **分档偏好**：
   - 私聊优先 Claude、群优先 Codex（默认是哪边富余多就用哪边）；
   - 还是按群或按任务手工指定？
4. **切换时是否在会话里提示一句**，以及要不要每日摘要。
5. **撞限那一轮的处理**：
   - 先接受「提前停 + 最坏失败一轮」；
   - 还是批准做 auto 来源的小补丁，并重新设计 fallback 链（这会影响生产默认的 fallback）？
6. **是否批准阶段 1**：在 V 上装 dry-run timer。只读，但它是生产上的新单元。
