# bundle-tools 只读排查：2026-09-08

## 当前结论

线上慢准备样本的最大项仍为 bundle-tools，但尚未定位其中 30.041 秒的具体子函数。不能宣布某 MCP、数据库或 9.1 某一代码变更为根因；也不能把之前冷启动 10 并发的模型前均值 27.8 秒说成升级后每条消息的固定增量。

本次没有部署修复、启停实例、修改配置/数据库或发送新的 Agent 测试消息。仅增加本工作树的只读采集脚本和本文。生产 Gateway 核对仍为 PID 2725163、active。

## 证据

1. 用户提供的生产报告：09:00–12:00 CST 的 16 条慢准备日志中，bundle-tools 占准备总耗时 94.21%，中位 8.921 秒、最大 30.041 秒。样本是选择性慢日志，不是全量用户延迟分布。
2. 复用此前基线（非 token 优化）10 并发数据 `hi-1788840395538.json`：10 条均出现 Universal Memory connect/list 计时，连接开始到列工具完成约 1.631–3.349 秒；例如 dm_0 为 2.103 秒连接加 1.033 秒列工具。该样本 bundle-start 到 policy-normalized 为 3.485 秒，metadata 为 0 毫秒、LSP 区间 0 毫秒。policy-normalized 不是整个函数返回点。
3. 生产 Gateway 与实际两个 Worker 的配置均启用 universal-memory（requestTimeoutMs=120000）和 voice-memory（60000）；figma 禁用。共享实验 Gateway 与 Worker 配置仅启用 universal-memory，未包含 voice-memory。配置不是每条请求经过权限投影后实际工具集合的证明，但已证实两边配置不同。
4. voice-memory 使用独立 Node stdio 服务。源码 `mcp-server.mjs` 的 listTools 返回两个静态定义；MemoryReader 构造函数仅赋值，数据库/CLI 搜索在真正的 memory_search 调用时才发生。因此不能仅凭它与实验不同就认定初始化在扫描数据库。进程启动、SDK import 和实际 connect/list 延迟仍未测。
5. 重新按时间戳解析到 CST 09:00–12:00，生产日志含 14171 条记录和相同的 16 条 prep 日志；`bundle-mcp:` 告警 0 条。它只说明该日志文件未观察到 MCP 报错，不能排除成功但很慢的请求、其他日志出口或事件循环调度延迟。脚本不输出正文、URL、凭据或原始日志。
6. 保留的 8.1 产物和生产 9.1 产物均在模型前 await getOrCreateSessionMcpRuntime → materializeBundleMcpToolsForRun；runtime 中已有 catalog 缓存、首次等待连接和 listTools、失败后后台重试。忽略空白后的 runtime 差异主要是 import、approval 投影与任务列表重构；默认 catalog list 超时两者均为 1500 毫秒，显式 requestTimeoutMs 可覆盖。这里没有发现能直接解释新增固定 30 秒等待的变更。保留目录不能独立证明其字节与升级前完整运行实例一致，也没有进行旧版本运行对照。

## 下一步需要的最小观测

在生产实际 Worker 对自然到来的请求补仅计时观察：bundle 进入/结束；normalize、metadata、runtime 获取、getCatalog、materialize、LSP、policy；每个 MCP 的排队、连接、listTools、缓存/重用/失效与成功/异常/取消；记录 runId、attempt、workerPid、单调时钟、进程 CPU 与事件循环延迟。不记录消息、工具参数、schema 内容或密钥。

先在独立实例验证观察器不改变返回值、异常和取消，再经明确授权部署到生产，保留原文件 hash 和回滚。不要同时改缓存、超时、权限、模型、工具目录或 token 策略。生产可能需要 Worker 换代/服务重启，必须先评估空闲交接；本次未执行。

捕获实际慢样本后再决定修复：连接/目录慢、重复初始化、同步计算或跨任务调度阻塞分别处理。成功捕获应能把每条 bundle 总时长与子阶段对齐，并区分缺失区间，不能把所有差额归为网络时间。

## 入口

- 原报告：`/Users/tianyicai/makaron-openclaw/reports/v-ttft-profile-20260908/report.md`
- 只读生产采集：`scripts/inspect-bundle-mcp-readonly.mjs`；默认统计日志，`--config` 只输出 MCP 配置白名单和 Worker 配置路径。
- 既有细分观察器：`scripts/db91-hi-deep-plan.mjs`；当前只对指定 DB91 测试请求记录，不适合作为已经覆盖生产自然消息的声明。
