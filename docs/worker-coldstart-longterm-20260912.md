# Worker 冷启动与热态并发长期候选

日期：2026-09-12。状态：**源码候选与合入前测试完成，尚未合入 dev、尚未部署 VLab、尚未触碰生产。**

## 今天生产复测给出的边界

生产保持 `minWorkers=5 / maxWorkers=15 / sessionsPerWorker=3`，允许真实流量并计入总并发。三轮 C1/C5/C10/C15 共 93 个专用 `deliver:false` 请求全部得到预期终态正文；其中一轮连续 C15 同时出现 2 次健康探测错误和约 6.2 秒 event-loop P99，因此该轮不能记为完全健康通过。

三轮各批次首字 P50 的中位数为：C1 2.804s、C5 4.106s、C10 6.887s、C15 10.472s。主要增长发生在客户端送出到 Gateway 进入 Worker harness 之前；pool queue 中位数为 0ms、Worker prepared runtime 通常为 0–1ms。额外常驻的第六个 Worker 在 C15 中没有执行请求，原五个 Worker 各执行三条。因此现有证据不支持“常驻 Worker 数增加本身让首字变慢”；严格的 `minWorkers=1` 对 `5` 因果比较仍需同背景 VLab A/B。

## 候选内容

### 1. 把已验收的 generation lifecycle 投影到当前 release 产物

生产与共享 VLab 留存的 Worker 目录仍是 0.2.11，缺少 `worker-runtime-lifecycle.mjs`；今天 Talk 配置热重载后旧 pool 进入 closing、缓存 harness 仍指向旧 pool，导致后续请求全失败，重启才恢复。源码中的 0.2.12 lifecycle 已有三代 stop/start、注册早于 teardown、late stop、start failure、stop/start race、active/queued shutdown 等回归，并曾在 VLab 完成连续 generation 热重载与真实飞书回复验收。

不能直接用实验目录整套替换当前 0.2.11：当前 release 文件后来叠加了流式回压、public stream、终态 drain、用户身份、持久化及计时修复，部分并未逐字存在于实验目录。本候选从当前精确 0.2.11 `index.mjs` 出发，只投影 generation acquisition/service ownership/admission rebind，并保留这些 release-layer 能力；状态版本仍按既有候选标为 `0.2.12-rc.1`，最终身份以 release ID、commit 与逐文件 SHA 为准。

### 2. 有上限地按冷态真实需求扩容

原 pool 在 ready capacity 用尽后只有一个 demand startup Promise，冷态突发会一波只新增一个进程。候选按尚未归属的独立 session owner key 计算缺口，扣除 ready/starting Worker 的投影容量，并把 demand 与 speculative spare 的并发启动统一限制在 `min(maxWorkers, 4, availableParallelism())`。

同一 session 的多条消息不会重复预留；重复 pump 不会重复 fork；关闭时不再启动；某个 demand boot 失败只拒绝仍未分配的 pending，不中断健康 Worker 已接纳的请求。该并发上限是候选，不把单测成功当作完整冷态性能结论，因为并发编译也可能造成 CPU 竞争。

### 3. 合并同代际、无 SecretRef 的首次配置准备

当尚无 active secrets snapshot 时，并发冷请求可能重复读取 source config 并准备相同 snapshot。候选只 singleflight 同一个 config 对象、plugin generation 与 runtime 对象下，非渠道投递、无 channel secret scope、无 SecretRef 的重叠初始化。成功或失败后立即清除，不做持久缓存，不跨 generation，也不共享凭据解析或重试。

### 4. 复用 Gateway 首次模块解析缓存

既有 resolver cache 只装在 Worker；候选在完整数据库 preflight 已启用并确认是 Gateway server 后，为 Gateway 首次 lazy import 安装同一个有界 resolver。它只缓存固定 dist 内的相对 ESM 解析结果，不缓存模块内容、export、插件选择或权限；完整 DB 校验、epoch、proof、timeout 与 admission 均保留。

### 5. 为 ACK 到 harness 的未知区间增加 VLab 专用分段观测

新增 observer 由 `OPENCLAW_GATEWAY_DISPATCH_PHASES=1` 显式开启，记录以下边界：dispatch function、reply wrapper、media transcript、work admission、inbound body、plugin media await、projected dispatcher，再与现有 `gateway-harness-enter` 拼接。

每行只含校验后的 UUID runId、阶段、进程号、墙钟/单调时钟、累计 CPU 和 event-loop utilization；不含 session key、正文、prompt、工具参数、路径或凭据。写日志使用 error-safe Console，失败不能改变业务控制流。该观测只用于归因，不宣称自身能降低热态延迟。

## 合入前验证

- 长期候选专项：30/30 通过，无 skip。覆盖冷态 C15 同时投影四个进程、相同 session 去重、启动上限、boot failure 隔离、关闭收尾、三代 lifecycle 与 race、配置 singleflight identity/失败重试/SecretRef 隔离、Gateway resolver 真实 Node 加载、release-layer 能力保留、observer 脱敏与 opt-in。
- 当前 catalog 中除平台自审计外的注册回归：231/231 通过，无 fail/skip/todo；包括 Worker 原生执行、权限、媒体/流式、超时隔离、会话归属、Steer、渠道补丁和本轮新增合同。
- 生成后的 Worker index、Gateway handler 与 observer 均通过 `node --check`。
- plan 固定当前 accepted VLab 基线 `native-final-candidate-20260911-v5`，11 个目标均带当前 before SHA 或明确为新增文件。没有修改 VLab 配置、状态、服务或生产。
- 仓库统一 `npm test` 仍在执行测试前被已有 catalog backlog 阻塞；在未改动的 dev 上可复现同一批未登记旧测试/适配项。本分支新增的五个测试已经登记，没有新增该列表中的遗留项。

## 获准合入后的共享 VLab 验收

1. 获取 integration lease，先在当前 accepted Native 基线记录相同 DeepSeek/配置/数据库的冷态与暖态 C1/C5/C10/C15；冷态从完整 Gateway 重启、`admitted=0` 开始，暖态单独统计。
2. 合入精确 task commit 后重新跑测试，package/stage/deploy 同一产物；先保持 Native 配置，验证 Gateway resolver/config singleflight 和新增分段，避免同时切换执行架构。
3. 通过可恢复配置切换到 Worker，使用生产同构 `minWorkers=5 / maxWorkers=15 / sessionsPerWorker=3`，再做三轮交错顺序矩阵；另做 `minWorkers=1` 与 `5` 的同背景 A/B，回答常驻数因果问题。
4. 做至少三代配置热重载；每代核对 generation、PID/pool 变化、旧请求收尾、新请求接纳，确保不再出现 closing pool 持续拒绝。
5. 验证真实模型、Memory/工具、上下文连续性、Web 与飞书可见 process streaming/终态；健康检查只作附加证据。
6. 做连续突发与空闲恢复 soak，记录首字 P50/P95、ACK→harness 分段、HTTP/RPC error、event-loop、CPU、anon/file memory、OOM、Worker 分配和 post-burst 恢复。任何功能回归、控制面失联或资源保护触发均回滚，不接受候选。

VLab 结果通过后再单独报告是否建议推广生产；本文件不构成生产发布授权。
