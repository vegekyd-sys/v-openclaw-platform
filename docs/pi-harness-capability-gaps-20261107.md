# PI harness 能力缺口与增强建议（2026-11-07）

范围：V 的默认路径是 `deepseek/deepseek-flash`，走 vlab-worker 插件，在 Worker 进程里跑 OpenClaw 内置的 PI 回合循环（builtin-openclaw）。本文对比 Codex（/vds、/vcodex）和 claude-cli（/vcc）两个 harness，列出 PI 的能力缺口，并按「对 V 用户的价值 × 风险」排序给出建议。速度优化不在本文范围，由首字线负责。

## 1. V 上默认路径实际跑的是什么

- **代码目录**：Gateway 跑的是 `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js`，Worker 跑的是同目录下的 `worker/worker.mjs`。不是 `/opt/openclaw-2026.7.1`，那是 unit 文件里的旧 ExecStart。
- **PI 的版本**：2026.9.1 不依赖 pi-agent-core（package.json 里只有 `@earendil-works/pi-tui` 0.84.2）。回合循环早已内化为 `packages/agent-core`（`agent-loop.ts`、`stream-steering.ts` 等），嵌入式 runner 在 `src/agents/embedded-agent-runner/`，也就是 OpenClaw 自己维护的 fork。pi 上游 1.0.0（10/01）也把 harness、压缩、会话存储从 pi-agent-core 拆走了，两边已经不是同一份代码。
- **OpenClaw/V 在 PI 之上补的东西**（按 dist 标记核对，均在 V 上）：
  - 5xx 归类与回退：`upstream-5xx-fallback-v1`（#375）、`luna-fallback-takeover-v1`（#543/#544）。
  - 工具后 NO_REPLY 静默：`v-no-reply-after-tool-v2`。
  - computer 当前回合截图裁剪：`v-computer-frame-prune-v1`。
  - DeepSeek 预算与溢出信号：E3、#108，以及 #434 的配置。
  - 配置里开着 midTurnPrecheck 和飞书工作清单（progress_card → Gateway）。
  - 消息队列 `mode: steer`。

## 2. 缺口对照表

图例：✅ 可用；⚠️ 部分可用，或代码有但 V 上未证实；❌ 缺失。「证据」一栏注明来源。

| 能力 | PI（deepseek-flash，Worker） | Codex（/vds、/vcodex） | claude-cli（/vcc） | 证据与说明 |
|---|---|---|---|---|
| 工具并行 | ✅ 9.1 默认并行；同批里只要有一个工具声明 `executionMode:"sequential"`（computer、node 插件等），整批改为串行 | ✅ | ✅ | `packages/agent-core/src/agent.ts` 中 `toolExecution ?? "parallel"`。上游新增的 async tools 只对 OpenAI Responses 生效，与 DeepSeek 无关 |
| 中途插话（steer） | ⚠️ Worker 代理带 `nativeSteer:true`，9/06 在生产验收过；但 steer91 的 prestart 补丁从 9/20 起每次启动都报错（`ExecStartPre=-` 吞掉了错误），PI 路径插话目前在 V 上是否生效**未实测** | ✅（9/06 验收） | ✅（#561，11/06 上线） | 下一步：在测试群用 deepseek-flash 发长 exec，中途插话复现一次 |
| 计划与进度 | ✅ progress_card 经 Gateway RPC，三种 runtime 共用 | ✅ | ✅ | 9/26 生产确认。遗留问题：Worker 的中间说明在 V 上单独成条，不进卡片 |
| 后台任务与唤醒 | ⚠️ spawn+yield、automations stream/at、on-exit 都通；`exec` 后台完成**唤醒不了**原会话（完成事件只进 Worker 进程） | ⚠️ 同样唤醒不了（心跳 isolatedSession） | ❌ 回环排除了 exec/process | `cross-harness-background-matrix`。方案「Gateway 托管 + 薄工具层」待 Tianyi 拍板 |
| 上下文压缩与超限 | ⚠️ 回合开始超限和 mid-turn 预检能接住。**工具跑完后被 provider 拒（溢出）仍直接报错**：#380 已合 dev，但它的 3 个 core 文件从没上 V | ✅ 原生 auto-compact | ✅ 900k 阈值 | #380 那次发版（noon-batch-20261016b）实际只送了钉钉、企微文件。本次核对 V 的 dist 和 10/16 之后所有捕获的发版，都没有 `context-overflow-settled-tools-v1` |
| 子 agent | ✅ sessions_spawn+yield，announce 6 h（#485） | ✅ | ✅ | — |
| 图片和截图 | ✅ 当前回合只留 2 帧（V 自加，比上游激进，应保留）；view_image 2048 px / ≤1 MB | ✅ | ✅ | 上游从 10.3 起删掉了历史图片裁剪，V 不跟 |
| 失败回退 | ⚠️ 无工具时的 5xx、挂起能到 luna。**工具跑完后再 5xx 只同模型续写，最后出失败卡片**（C 类）；用户手选的模型按设计不回退（E） | ⚠️ #534 挂起看门狗为草稿 | — | **今天 15:00–15:54 有 5 轮飞书回合因此失败** → **PR #566** |
| 长任务恢复 | ⚠️ 重启后靠 restart recovery；可能卡在 `restart recovery claim changed` | ⚠️ | ⚠️ | 上游 #153243 系列依赖 9.5/9.6 的账本重写，升级时一起拿。pi-durable 只借设计（意图先落库、`replay:"safe"`、幂等 requestId） |
| 工具结果裁剪 | ✅ 9.1 `tool-result-truncation` + midTurnPrecheck 的 `toolResultMaxChars` | ✅ | ✅ | — |
| **文本形式的工具调用** | ❌ DeepSeek 偶尔把工具调用写成 `<｜｜DSML｜｜ calls>…` 文本：用户看到一段标记，工具没有执行。**近 14 天 14 次，涉及 7 个飞书会话和 1 个 cron** | 不适用 | 不适用 | 原因有两层：9.1 的 DSML 语法不认识标记后的空格和 `calls` 包装（上游 #169728 已修）；另外 6 次标记前面有一句说明，被 silent-promotion 规则把工具调用丢掉了 → **PR #568** |
| 空回复 / NO_REPLY | ✅ 工具后 NO_REPLY 静默（#317） | ✅ | ✅ | 收尾追问那一轮遇到 503 时仍会发英文兜底句 "no final summary was produced"（11/03 16 次，11/07 2 次） |

## 3. 建议（按价值 × 风险排序）

| # | 项 | 价值 | 风险 | 方式 | 状态 |
|---|---|---|---|---|---|
| 1 | **工具后 5xx 交给 luna 从转录续写** | 高：DeepSeek 故障期间用户直接拿到失败卡（今天 5 轮），夜班卡同样受影响 | 中：动回退链（6 个文件），但只在失败路径；用户请求不重发、工具不重跑；没有待用回退时行为不变 | V 设计（上游刻意不换模型）+ fork 源码 | **PR #566**，candidate A/B 8/8 |
| 2 | **DSML 带空格写法 + 前置说明** | 高：工具静默不执行、用户看到乱码，14 天 14 次 | 低：上游回移（#169728）+ 一处窄扩展，只作用于从文本恢复的调用 | 上游回移 + 小补丁 | **PR #568**，fork 单测 886/886；candidate-836310c8 A/B 8/8 |
| 3 | **#380 重新上线**（工具后上下文溢出 → 压缩续写） | 高：大会话工具后超限时直接报错 | 低：Tianyi 已批准合 dev 的改动，补丁对 V 当前字节仍能精确打上；与 #566 叠加已验证 | 重新上线已合入的 PR | 未做：需在当前字节上重跑 #380 的 candidate，并协调上线批次 |
| 4 | 工具后 DeepSeek **挂起**也续写（上游 #147203 `canContinueSettledIdleTimeout`），并纳入 #1 的交接 | 中：D 类挂起要等 2×90 s | 低：与 #1 同一个插槽 | 上游回移 | 未做 |
| 5 | 收尾追问遇 5xx 时：中文兜底句，或同样交给 luna | 中：英文兜底句直接到用户 | 低 | 小补丁（可并入 #1） | 未做 |
| 6 | 验证 PI 路径插话在 V 上是否生效；若坏，修 steer91 prestart（`ExecStartPre=-` 吞错） | 中 | 低（只读验证） | 测试群复现 | 未做：两个测试群当前绑在 gpt-6.1-sol 和 vds，切模型会干扰并行的首字 / vds session |
| 7 | exec 后台完成唤醒（Gateway 托管） | 中 | 中：跨 harness 设计 | 方案已有（`docs/background-tasks-cross-harness-plan.md`） | 待 Tianyi 拍板 |
| 8 | 11.1 固定会话工具列表（#175309/#176167），提高 DeepSeek 前缀缓存命中 | 中（速度 / 成本） | 高（50 文件） | 升级时评估 | 归首字线 / 升级线 |
| 9 | 长任务恢复（durable 设计借鉴） | 中 | 高 | 升级 10.x 时一起拿上游账本 | 不建议在 9.1 上做 |

**不建议做的**：
- 工具并行、流式插话、async tools：9.1 已有，或只对 Responses 生效。
- 历史图片裁剪对齐上游：上游已删，V 的更激进，应保留。
- 循环检测增强：V 未开 `loopDetection`。

## 4. 本次顺带发现

- **#375 的 Worker 转录读取会误判 replay-safe**：带 2 个 exec 的回合被报成 `replaySafe=true`（V 15:12:02，candidate A 臂复现）。当时 Gateway 自己的副作用跟踪把它压了回去，没有造成重放。#566 已让带交接标记的失败一律不可重放；读取本身的问题未修。
- **agentCommand 经 Worker 把用户消息写进转录两次**（candidate A 臂 cli 场景稳定复现，与本次改动无关）。夜班和 cron 走这条路径，模型会看到重复的用户请求。
- **VLab 磁盘**：vdb 曾到 100%，我已清掉共享 VLab 的 Node 编译缓存和 4 份旧运行时基线，恢复到 80%。之后 VLab 主机从本机和 V 都连不上（23:0x 起），11/08 01:19 重启恢复。

## 5. 参考

- 上游对照：`~/openclaw-versa` 的逐版导入（9.1 → 10.10），加上 origin/main（11/07）。
- pi 上游：earendil-works/pi 的 CHANGELOG（0.84 → 1.5）。可借鉴的是重试分类、压缩时机、失败尝试不进上下文，回合循环本身没有新机制。
- 记忆：pi-durable-evaluation、cross-harness-background-matrix、big-session-no-compaction、upstream-5xx-never-triggers-fallback、luna-fallback-takeover、react-no-reply-fallback-text、computer-use-screenshot-context-blowup、deepseek-output-budget-overflow、feishu-progress-stream。
