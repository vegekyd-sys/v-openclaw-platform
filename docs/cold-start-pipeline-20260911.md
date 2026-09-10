# 冷启动修复：完整链路与候选边界

## 状态

任务分支 `codex/cold-start-pipeline-20260911`，基线 dev `2e2301f1673337f43d0fe7315b4a5d4e8dde6043`。本轮用户授权自主修复；没有把一般修复授权解释为合入 dev 或生产上线许可。本报告随原生对照补充结果，当前不是冷态 SLA 验收结论。

## 对此前 profile 的审计

此前做过有效的局部 profile，但没有完成完整冷态 C15 的因果解释：

- 新 Worker 的 CPU 采样是在 Gateway 已热、以 hold 请求制造新空闲 Worker 后进行，不能代表整机重启后的 C15。
- 最小原生夹具只有 36 工具、空白数据库和本地模拟模型，不能替代完整配置的首段正文验收。
- 全库扫描和模块解析的局部收益已测出，但不能直接从端到端 P50 扣除。
- 72.211 → 70.272 秒来自一对完整冷态样本；暖池 8.265 秒不能当成冷态通过。
- 已有日志的原生 command 内部仍存在未完全归因的时间段；没有依据将其统称为模型慢、MCP 慢或数据库锁等待。

同一条 P50 请求 `06e95ee7-2c23-4023-9e0c-45bc748252e6` 的连续区间：

| 区间 | 秒 |
| --- | ---: |
| 发起到 Gateway harness | 16.513 |
| 入池等待到 IPC | 10.215 |
| IPC 到 Worker hooks 完成 | 11.857 |
| hooks 完成到 model-call-enter | 30.627 |
| model-call-enter 到可见正文 | 1.060 |
| 合计 | 70.272 |

这张表是单请求可相加的时间线，不是不同请求的阶段中位数之和。该请求嵌套的工具策略耗时 3380ms、会话资源准备阶段 3433ms；bundle observer 本体 41.3ms、prompt observer 33.9ms。阶段墙钟时间不能不经 CPU/等待区分便全部视为可消除的 CPU 工作。

## 候选一：按真实需求、有上限地启动 Worker

原调度只有一个 demand startup Promise，加上一个 speculative spare，形成分批启动。改为按尚未归属 Worker 的独立 session owner key 计算所需槽位，再扣除所有 ready/starting Worker 的已投影空位。

- `maxConcurrentStarts` 将 demand 与 warm spare 的正在启动进程统一计数；候选默认 `min(maxWorkers, 4, availableParallelism())`。
- 重复 pump、同一会话的多条消息不重复计算容量。
- 保留 `minWorkers`、`maxWorkers`、`sessionsPerWorker`、所有权、原生 admission、超时、取消、IPC 与 idle retirement。
- 关闭期间不继续启动；一个 demand boot 失败仍按原合同拒绝未分配请求，不中断已分配到健康 Worker 的请求。

这只是受控候选。更多同时编译的进程可能争抢 CPU，因此单测通过不等于真实冷态更快。不能在完整冷态/控制面测试前建议提高该上限或上线。

## 候选二：同代际首次配置初始化去重

原生 `resolveAgentRuntimeConfig` 在尚未存在 active secrets snapshot 时，每个并发请求都会进入 source config 读取和 snapshot 准备。候选只合并重叠的、完全相同配置对象/插件 generation/运行环境对象下的初始化。

- 只用于已有可信 prepared generation 的 ingress，且不是渠道投递、没有 channel secret scope、没有需要解析的 SecretRef。
- 完成或失败后立即移除 in-flight 记录，不做持久缓存、不跨 generation、不序列化凭据。
- 不跳过配置校验、source 读取、原生 snapshot 准备或激活；相同初始化执行一次并由调用者共同等待。
- 其他路径继续独立解析。已有 hot snapshot 行为不变。
- 没有改会话/数据库所有权、权限判断、恢复 lease、工具策略或真实模型调用逻辑。

`lab/cold-start-pipeline-contract.test.mjs` 将候选变化精确还原后，对完整原文件做 SHA256 校验，确保上述边界之外没有隐含改动：

- native command 原文件：`013390e6d73c91ecfd1ff625fa8c90d3dee988d350ff3948e6c32d35394fac54`。
- release Worker pool 原文件：`9b471ee18ace343f60081f0f8d8f9040fa2c058444ba697aad90a7e1ecc9d046`。

## 候选三：Gateway 复用已验证的模块解析优化

先前 resolver cache 仅安装在 Worker，Gateway 首次 lazy-import 回复执行链路不受益。候选在现有已启用的 `bootstrapGatewayIntegrity` 入口、确认这是 Gateway server 后安装同一 resolver；不改变完整数据库预检、epoch、proof、超时或 admission。原 bootstrap 完整 SHA256 为 `3b0b3e2da8162faca7fba820e56392bf3b9817cc32cd166304730a834024caa3`，去掉一条 import 和一条安装调用后逐字节匹配。

只复用不可变 OpenClaw dist 内同目录相对 ESM 边的原生首次解析结果；不缓存模块内容、exports 权限、插件选择或请求权限。自定义 loader、unsupported runtime 与显式关闭继续走原生路径。它不运行 Agent、模型或工具，不能把启动前的 Agent 预热冒充优化。当前入口要求既有 integrity bootstrap 已启用；没有修改未启用该入口的其他部署。

新增 `scripts/benchmark-gateway-native-import.mjs` 用六个交替的空白状态子进程加载真实 reply module graph，对比 import wall/CPU、原生 export、cache 实际命中和内存。它不是 Gateway，也不接触业务数据库；仍不能替代完整冷态 C15。

## 验证进度

相关回归 247/247，通过，无 skip（包含多 boot 关闭和 boot 失败隔离）。Gateway 候选的三项合同/真实 Node 加载测试另行通过。最终汇总与 Linux 原生对照另补。

原生离线脚本沿用 `scripts/diagnose-worker-first-run.mjs`，新增 `NATIVE_FIRST_RUN_PATCH=cold-config` 模式。该模式两边都使用当前已部署的 resolver cache，避免误把旧模块解析补丁计入新候选收益；两边都通过同一 import hook 观测，候选只替换一个 native command 和 helper 的内存加载内容。脚本检查 native baseline hash、观测到的 command hash、每回合恰好一次模型请求与正确正文，并报告首次 source config 读取次数。

离线夹具必须用私网、只读 runtime、临时空白 state 和资源限制，不复制业务配置/数据库，不运行第二个 Gateway。不将夹具延迟作为 VLab 冷态 C15 性能成绩。

## 与原生执行对照的协调

共享 24993 已明确交给 `native-worker-ab-20260911` 任务独占测试。本任务没有持有 lease，也没有在它的测试窗口运行负载、重启、改配置或部署。原生/Worker 对照的初步结果支持重审定制 Worker 的默认必要性；其最终结果会决定是否值得推广扩容候选，不能为保留已有方案而忽略更好的执行路径。

完整候选集成验收仍须用户明确批准合入 dev 后进行：相同模型/配置/数据库，完整重启、admitted=0、初始 1 Worker、无 Agent 预热，分别记录 restart→ready 与 request→正文；C1/C5/C15 冷暖分开，包含 P50/P95、错误/控制面超时、CPU/内存和真实工具/上下文检查。原生入口若仍存在冷态控制面冻结，也不能以去掉 Worker 宣称全部解决。
