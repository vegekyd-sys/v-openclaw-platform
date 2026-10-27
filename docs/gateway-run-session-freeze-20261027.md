# Gateway 事件会话解析全库扫描：2026-10-27

## 结论与证据边界

这次故障中，已确认的主要 CPU 热点是 `resolveSessionKeyForRun` 的持久化兜底：事件没有内存中的会话归属时，为查一个 `runId`，同步读取并解析该 agent 的全部会话，然后才过滤 `entry.sessionId === runId`。事件连续到达、归属查不到或缓存过期时，重复付出全库读取、对象构建和 GC 成本，阻塞 Gateway 的消息分发、网络心跳及 Worker ACK。

证据来自事故已有日志和已经保存在服务器的 `/tmp/gw-prof/freeze-1648.cpuprofile`。本任务没有开启生产性能采样，也没有重启生产。

- 16:37:37 → 16:40:58，Gateway 心跳间隔 **200,964 ms**，期间 Worker 继续产生带独立时间戳的模型事件，直到 Gateway 恢复调度才集中输出。多个 Worker ACK 超时，普通群消息也失败。
- 恢复前留下的 CPU profile 长 **25.286 s**：按样本时间加权，**17.963 s（71.04%）** 在 `resolveSessionKeyForRun → loadCombinedSessionStoreForGatewayCore → listSessionEntriesReadOnly → loadSessionEntrySnapshot` 链路；**7.322 s（28.96%）** 在 GC。没有 idle 样本。GC 无调用父栈，不能把每一毫秒都直接归属某次查询。
- 16:30–16:40 的已有 sysstat：整机 CPU 空闲 84–87%，16:40 可用内存约 30 GiB，iowait 0.32%，无同期 OOM 记录。它是十分钟粒度，不能排除短时资源波动，但与主线程热点证据一致，不能据此要求继续升配。
- 原代码的负缓存仅 1 秒，且按 runId 区分；缓存不能阻止新 ID 或过期 miss 再次触发全量解析。已有在线精确读取 helper 可以走 `session_nodes.current_session_id` 索引，但这个调用点没有传 `match`。

**限制：** profile 是恢复前另一个 25 秒窗口，并非对 16:37–16:40 整个 201 秒窗口的完整采样。因此可以确认并修复这次故障期间的主要热点，不能声称已经重建了那 201 秒内每一个调用，也不能宣布所有卡顿都已根治。

## 修复

只替换 `server-session-key-ZtX3Ble7.js` 一处读取参数：

```js
loadCombinedSessionStoreForGatewayCore(cfg, {
  agentId: requestedAgentId,
  match: { sessionIds: [runId] }
});
```

复用生产已有 `v-session-entries-matching.mjs`，在 SQLite 中选候选行，再走原来的解析、参与者投影、canonical key 检查和调用方最终过滤。没有命中的持久化事件不再解析其他会话的 JSON。

原有 run context 优先级、agent 隔离、别名优选、正缓存、1 秒负缓存、incognito 内存库处理均保留。不把运行 ID 猜成会话 key，不跨 agent 回退，不吞数据库错误，不改超时或并发。

生产 before SHA256：`30a0e1f9884da81e4c4a3d22fd69a025552c8b8419597c940cfe46e35b3cb5ae`

候选 after SHA256：`17414923ff9849230ceb9ca0397e73c673e869af1b08828f3591353d9d64dfdb`

该 helper 的 durable 候选筛选依赖已有写入方维护 `current_session_id = entry.sessionId` 的投影契约；没有新增迁移。Incognito 仍走已有内存库读取，本补丁不宣称其变成索引读取。

## 与已有 PR 的关系

- #487 处理 workboard 周期巡检中的全量会话/卡片读取。本补丁处理 `server-chat` 事件分发的 run → session 解析，文件和调用点不同；没有重复提交 #487。
- #468 已引入可复用的精确候选读取能力，本补丁补上这个遗漏的消费者。
- Worker 扩容、夜班 PR16、生产性能采样仍暂停。本任务不合入 dev、不写共享 VLab、不发布生产、不发送验收消息。

## 验证与发布边界

- 5 项本地测试：生产字节/补丁锚点、100 个未知事件不请求全库、miss 到期重查、晚到持久化映射、内存 run context 优先、agent/别名/global/incognito 等回答与原逻辑一致。
- 加上精确读取 helper 回归与平台目录规则共 27 项测试通过，catalog audit 无错误；产物语法检查通过。
- 私有 VLab candidate 使用数据库副本，直接执行原/新真实 resolver，比较已有会话和不存在 ID 的返回值、墙钟时间、事件循环最大间隔。结果另附，不能用离线测试代替生产真实聊天验收。

合入由 Tianyi 决定。获得授权后核对共享 VLab 当前负责人（已有其他任务占用），在当前基线做本补丁的集成验收；再按相应授权发布同一产物并做真实消息链路验收。回滚只还原这一文件，不改配置或数据。共享集成和生产效果目前未验收。

测试环境记录：标准 candidate 第一轮在测试盘报 ENOSPC，未运行 A/B；第二轮启动中断。后续仅将同一候选 runner 的 ROOT 常量定向到 `/var/tmp/vlab-run-session-exact-20261027`（根盘约 72 GiB 可用），数据库副本也使用本任务 `/var/tmp` 临时目录。没有改服务器安装的控制工具、共享配置或代码。原/新文件 SHA 在 runner 中继续严格校验。
