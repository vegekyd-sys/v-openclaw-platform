**Harness 矩阵：sessions_send 在各 harness 下的执行位置、渠道体验与测试条件（只读调查）**

## 直接结论

**(1) 执行位置与补丁落点**

| harness | sessions_send 在哪执行 | 补丁要落到哪 |
|---|---|---|
| V worker | worker 子进程内执行，包括异步等待和唤醒发起方那一轮 | V 的 core dist 只有一份，Gateway 和 worker 进程都从这份加载。新 worker 换代或重启后才吃到新字节（已验证） |
| /vcodex、/vds | Gateway 进程里 codex 插件的 dynamic tool | 同一份 core dist。codex 插件目录里没有第二份 openclaw，`openclaw/plugin-sdk` 指回宿主（已验证 VLab） |
| /vcc | Gateway 的 MCP loopback | 同一份 core dist（已验证） |

- 结论：V 上只需要改一个文件，`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/sessions-spawn-tool-1FQMTkIo.js`（runtimeDir 已验证）。codex 插件和 worker 插件目录都不用打。
- 必须注意：发起方是 worker 时，等待（最长 6 h）和唤醒都挂在那个 worker 进程的内存里。worker 池判断"空闲可回收"时看不到这段工作，所以回收、按内存/寿命 recycle、换代 drain 都会把它杀掉（已验证代码，推断后果）。

**(2) 渠道入站 vs Gateway `agent`(deliver:true)**

- 四个 harness 的结果一样：走入站链路时有流式卡、过程流、工作清单、后台任务行和页脚；走 agent RPC 时只有最终出站（文字或图片）。差别不在 harness 层，在 Gateway 的 agentCommand 层：它只传 `onAgentEvent`，不传 `onPartialReply/onBlockReply/onPlanUpdate/onToolResult`（已验证）。
- 飞书所有卡片体验都长在入站时创建的 `createFeishuReplyDispatcher` 上。agent RPC 那一轮即使调用了 progress_card，也没有 dispatcher 订阅，所以看不见（已验证）。
- harness 各自的特殊点：
  - **worker**：入站时这些回调会被桥接（`onPlanUpdate` 在白名单里）。RPC 时没有回调可转发，表现与 embedded 一致（已验证）。
  - **codex**：harness 默认 `visibleReplies:"message_tool"`，只在 dispatch 的 runtime_default 里生效。VLab 的 `messages` 未配置，所以 Codex 私聊入站是 message_tool_only，群是 automatic；补丁显式传了 "automatic"，所以 RPC 那一轮会自动投递最终文字（已验证 VLab 配置，V 为推断）。
  - codex 的开发者指令和直接工具名都随 sourceReplyDeliveryMode 变化。私聊会话在入站（message_tool_only）和 RPC（automatic）之间来回切换，可能改变线程配置指纹，导致重开线程、多出延迟（推断，未测）。
  - **claude-cli**：inter_session 被算作 synthetic turn，CLI 绑定按会话稳定模式哈希，正常应能复用常驻 claude 进程；额外的 A2A 系统提示只算 drift，不会让绑定失效。但 cron on-exit 那次实测出现过 `invalidated:message-policy`，即新起 claude 带历史，sessions_send 这一轮要实测确认（代码已验证，行为推断）。

**(3) 已知坑对测试的含义**

- **loopback 发送者身份**：V 已有 v1 回移（已验证）。但 inter_session 这一轮本来就没有发送者，所以对方那一轮和唤醒那一轮在任何 harness 上都建不了 automations/cron（共享策略要签名的 sender，推断，依据记忆实测）；/vcc 拿接管链接只能靠 owner 兜底。
- **MCP after_tool_call 回移**：V 和共享 VLab 都没有，reply-once 补丁两边也都没有（已验证，标记 grep 均为 0）。纯原生 v2 方案不靠插件钩子，可以不带；凡是要靠插件 after_tool_call 看 /vcc 的结果，就必须带。before_tool_call 在 9.1 本来就跑。
- **/vcc 后台 agent**：V 靠 Gateway drop-in 的 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 关掉，claude 子进程继承，所以 RPC 那一轮也生效。candidate 不会自动带这个变量，要自己设才贴近生产（推断）。
- **Codex 孤儿登记**：V 已由启动前清理根治。reaper 遇到父进程还活着的登记会跳过（已验证），所以 candidate 不会误杀共享 VLab 的 app-server。
- **ChatGPT OAuth**：vcodex 不能放进 candidate 测。复制过去的刷新令牌会触发 `refresh_token_reused`，可能连带 V 的令牌链。
  - candidate 用 /vds 代表 Codex 路径，harness 路径相同，只差模型和认证。
  - vcodex 必须在共享 VLab 测，但 `vlab.mjs test` 是 deliver:false，验不了飞书可见。要验 vcodex 的飞书推送，只能把补丁 stage 进共享 VLab（占唯一 slot、拿 lease，最后必须 promote 到 V 再 align，或 rollback），再用真实飞书消息驱动。
  - VLab 的 vcodex 是 `openai/gpt-5.6-sol`（已验证配置）。

**(4) candidate 跑 vds/vcc 需要什么**（来自已跑通过的脚本）

- **公共部分**：
  - 飞书改 loopback webhook，不开第二个长连接。
  - loader 放行 feishu 插件。
  - worker 第二份配置要同步改写，插件也要在 worker 配置里单独声明。
  - 设置私有 `npm_config_cache` 和短 TMPDIR。
  - 从 `secrets.env` 读 `DEEPSEEK_API_KEY`。
  - 每个实验用一个独立 agent，避免共享记忆串味。
- **vds**：
  - 把共享 `state/npm` 复制进 candidate。
  - 在 state 和 runtime 两份 codex 插件上打 /vds 的 3 个 DeepSeek 补丁（harness、run-attempt、thread-lifecycle）。
  - 在 agent 的 `codex-home/config.toml` 里加 `[model_providers.deepseek]`。
  - 不复制 `auth_profile_*` 表。
  - 注意：10/20 的 `session-relay-native.mjs` 把 codex 插件关掉了，所以 v2 原生推送目前只验证过 worker。
- **vcc**：
  - VLab 自带的 claude 是 2.1.273，跑不了 opus-5-5。要私装 2.1.280，设 `OPENCLAW_PATH_BOOTSTRAPPED=1` 让它排在 PATH 前面，并在共享 HOME 下检查 `claude auth status` 为已登录。
  - 设 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`。
  - 10/07 的实验用的是 `claude-opus-5` 加 VLab 自带的 claude，与 V 不一致。
- **渠道保真**：VLab 飞书是 `renderMode:card`、`streaming.block` 开（已验证）；V 记载为 `auto`、block 关。candidate 里看到的"最终出站是卡片还是 post"与 V 不同，验收前要先对齐。

## 证据

**执行位置**
- worker 只把 `sessions_spawn` 代理到 Gateway，其余代理目标只有 skill_workshop：
  - `release/captured/...-20261020.worker/dist/gateway-owned-tool-proxy.mjs:63`
  - core `openclaw-tools-BODVdJQD.js:14607`
  - 而 `createSessionsSendTool` 没有代理：`:17617`（已验证）
- worker 的 agent runtime 取自 Gateway 自己的 dist：
  - `worker/dist/index.mjs:394,490`
  - `runtime-path.mjs:4-41`（argv[1] 所在包的 `dist/plugin-sdk/agent-runtime.js`）
  - worker 捕获的 101 个文件里没有 sessions-spawn-tool
  - `patch-openclaw-sessions-*.mjs` 只是安装期脚本，只被 test 引用（已验证）
- 异步等待在进程内起：`lab/release-files/sessions-send-reply-once/generated/sessions-spawn-tool-1FQMTkIo.js:1236-1243`；上游 `src/process/gateway-work-admission.ts:429` 的 admission 是进程内状态。
- worker 池看不到这段工作：
  - 空闲判定只看 active/queue/owner/detached：`worker-pool.mjs:1425-1434`
  - 回收：`:1384-1400`
  - 换代 drain：`:1737-1752`
  - detached 只由事件登记：`:1080`；事件类型只有媒体生成和 skill：`worker-gateway-events.mjs:7-12`
- MCP loopback：`tool-resolution-Con11qMn.js:11`（createOpenClawTools）；`:103,113,180`（requesterSenderId 回移）。
- codex：
  - 工具在 Gateway 构建：`.codex/dist/dist/dynamic-tools-BU9tmlYm.js:686-708`
  - VLab 的 `state/npm/projects/openclaw-codex-*/node_modules` 只有 `@openclaw`（ssh 只读 ls）
  - 上游 `src/plugins/sdk-alias.ts:435`

**渠道体验**
- 上游 v2026.9.1 `src/agents/command/attempt-execution.ts:1378-1396` 只有 `onAgentEvent`；对 `src/agents/command/*.ts` 和 `server-methods/agent.ts` grep 流式回调为 0 条；最终投递在 `delivery.ts:570`。
- `runtime-preparation.ts:536-545` 与 `dispatch-from-config.prepare-context.ts:336`：runtime_default 只出现在 dispatch。
- `source-reply-delivery-mode.ts:117-125`（私聊默认取 harness 设定）、`:138-146`（synthetic 判定）。
- codex 默认 `message_tool`：`harness-DXVZ5II5.js:75`；回复模式进开发者指令和工具名：`thread-lifecycle-DAcEJ_Om.js:2631`、`run-attempt-D1hJO4fX.js:5582`。
- claude-cli 绑定：
  - `src/agents/command/prepare.ts:315-334`
  - `cli-runner/prepare.ts:758-786,1730`
  - `cli-session.ts:236-238`（message-policy 失效）、`:258-270`（system-prompt 只算 drift）
- 飞书：`.feishu/dist/dist/monitor.account-WFdlCDhR.js`
  - 进度监听：`:480-509`、`:3258`
  - dispatcher 定义：`:2810`
  - 两处创建都在入站处理里：`:4972`、`:5063`
  - 后台任务行：`:8851`
- worker 桥接回调白名单：`harness-event-contract.mjs:27-54`。

**补丁现状**
- `mcp-http-BL3X6y4w.js` 不在 V 捕获清单里（与 npm 原版相同）；VLab mirror 上该文件和 sessions-spawn 文件的标记 grep 均为 0。
- reaper 跳过父进程还活着的登记：`.codex/.../transport-stdio-CyPldczm.js:449-451`。

**candidate 脚本**
- `lab/candidate/session-relay-experiments.mjs`：
  - harness 设定：`:34-35`
  - 补丁与插件接线：`:73-92`
  - worker 配置改写：`:93-106`
  - vds 准备：`:146-185`
  - 环境与 key：`:188-190`
- `vcc-background-tasks.mjs`：`:36-66`（私装 2.1.280、登录检查）、`:98`（PATH 设置）。
- `session-relay-native.mjs:58`（关掉 codex 插件）、`:87-103`（worker 配置改写）。
- 危险示例：`vcodex-sol61-live.mjs:86` 复制了 `auth_profile_*`。

**记忆依据**：`candidate-stale-oauth-refresh.md`、`cross-harness-background-matrix.md`、`vcc-background-agent-swallows-reply.md`、`feishu-progress-stream.md`（V 是 `renderMode: auto`）。