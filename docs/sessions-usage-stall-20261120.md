# 2026-11-20 17:51 sessions.usage 卡住 Gateway：#604 为什么没挡住

调查时间：2026-11-20 19:40–（CST）。对生产 V 只做了只读操作：journalctl、`mode=ro` + `ionice -c3` 的 sqlite3、读 dist 和转录文件。没有重启，没有改 V 上的文件，没有发消息。

## 结论

1. **#604 已经在 V 上生效**，不是没发版，也不是被后续发版覆盖。卡住的原因是它没覆盖到的那条路径：
   - **CLI 只申请 `operator.read`。** `openclaw gateway call` 走 `callGatewayCli`，按最小权限申请 scope，`sessions.usage` 只拿到 `operator.read`。#604 只对 `operator.admin` 把整个 RPC 放进子进程（`canRunUsageRpcInWorker`），所以这两次调用都在 Gateway 主线程上执行。
   - **主线程上的 handler 会读整张会话表。** 即使只查一个会话，它也用 full projection 把 makaron 的整张会话表读进来：25,866 行，entry JSON 共 **2.4 GB**，逐行 `JSON.parse`。其中 98% 是 `skillsSnapshot`（平均 62 KB）和 `systemPromptReport`（平均 34 KB）。这个 handler 只用到 `systemPromptReport` 来判断返回行有没有 context weight；去掉这两个字段，整表只有 37 MB。
2. **发起方是 V 自己的一个 /vcc（claude-cli）会话**，在飞书私聊 `ou_38d6420b…`（麦当劳会员项目）里，用户问 token 用量：
   - 17:51:13 执行 `openclaw gateway call sessions.usage --params '{"key":"agent:makaron:feishu:direct:ou_38d6420b…"}'`。CLI 10 s 就超时退出，Gateway 一直算到 17:51:44（29.8 s）。
   - 17:51:45 加上当天日期范围和 `--timeout 60000` 又调了一次。CLI 60 s 超时，Gateway 一直算到 17:52:52（65.9 s）。
   - agent 随后自己说「不再反复打它，以免影响 Gateway」，改为直接读 Claude 转录来统计。
   - 不是 Control UI，不是脚本，也不是运维会话。
3. **修复**（draft PR，见文末）：
   - 单会话只读匹配的那几行；
   - 列表用 list projection，只为返回的行补读 `systemPromptReport`；
   - 没有配置 Gateway 角色时（V 就没有配置），只读调用方也进 usage 子进程。
   - candidate 数字见下文。

## 证据

### #604 在 V 运行的 dist 里

- Gateway 进程 2566381，2026-11-19 21:39:12 启动，NRestarts=0。ExecStart 指向 `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js`，不是 `/opt/openclaw-2026.9.1-v/`。
- 这个 dist 里 5 个文件的 sha256 和 #604 的 release 文件逐一相同（`usage-C3nh9kcO.js` 44c5f048、`session-cost-usage-C_mE_GAE.js` 0581a16d、`usage-offload-v1.js` f54e269d、`usage-offload-child-v1.js` 19297dc3、`commands-session-cost.runtime` 149a2dc5）。mtime 都是 11/14 00:24，与 CHANGELOG `startup-stall-usage-20261114` 一致。之后的发版没有动这几个文件。
- 进程启动晚于安装时间，所以加载的就是这些字节。Gateway 环境里没有 `OPENCLAW_USAGE_*` 回退开关。
- 用量 RPC 只由 Gateway 主进程处理，worker 那份配置和这件事无关。

### 卡住的时间线（journalctl -u openclaw-gateway）

| 时间 | 事件 |
|---|---|
| 17:51:03 → 17:51:40 | 日志空档；17:51:40.88 `liveness heartbeat delayed: overdue=13727ms`，`memory pressure: warning rss=7.69 GiB heap=6.49 GiB` |
| 17:51:44.755 | `res ✓ sessions.usage 29826ms conn=1c91c3f8… id=2:…`（开始于约 17:51:14.9） |
| 17:51:46 → 17:52:40 | 日志空档 54 s |
| 17:52:51.97 | `overdue=41082ms`，`memory pressure: critical rss=9.88 GiB heap=6.58 GiB`，4 条飞书 `ingress catch-up timeout` |
| 17:52:52.838 | `res ✓ sessions.usage 65909ms conn=b7554ef9… id=2:…`（开始于约 17:51:46.9） |
| 17:52:52–17:53:10 | 钉钉重连失败一次后恢复；飞书补收报告「event loop stalled 26s / 54s」 |

请求 id 是 `序号:uuid` 格式，而且是新连接上的第 2 个请求（第 1 个是 connect），说明是一次性的 Node GatewayClient，也就是 CLI。sudo 日志里没有记录，说明不是从 ubuntu 账号 sudo 发起的。

### 是谁调用的

- agent-shell-cgroup 的日志里，17:49–17:51 有几条命令名只是 `openclaw` 的 `codex-command`。它们是 Codex 的 `hooks relay`：process.title 改写后，cgroup 脚本识别不出来。不是发起方。
- 在 makaron 的 Codex rollout（自 17:50 起修改过的 241 个文件）和 makaron 库中 17:48 之后的转录事件里，都搜不到 `sessions.usage`。
- 最后在 V 上 `/home/openclaw/.claude/projects/-home-openclaw-makaron-openclaw--openclaw-local-workspace/5430b314-….jsonl`（/vcc 的 Claude 转录）里找到：
  - 第 530 行 17:51:02：`openclaw --help | grep usage…`
  - 第 538 行 17:51:13：第一次调用，返回 `gateway timeout after 10000ms`
  - 第 544 行 17:51:45：`openclaw gateway call sessions.usage --timeout 60000 --params '{"key":…,"mode":"specific","startDate":"2026-11-20","endDate":"2026-11-20","timeZone":"Asia/Shanghai"}'`，返回 `gateway timeout after 60000ms`
  - 第 551 行：「Gateway 的用量接口 60 秒也没返回，我不再反复打它」，随后写了 `work/mcd-member/token_report.py`，直接读 Claude 转录统计。
  - crontab 里每天 20:55 跑的 `token_report.py` 就是它写的，不调 Gateway。
- /vcc 的 Bash 命令不经过 OpenClaw exec，所以 agent-shell-cgroup 的日志和 OpenClaw 转录里都看不到；要找这类调用，得查 `~openclaw/.claude/projects/*/…jsonl`。

### 为什么会读 2.4 GB

`usage-C3nh9kcO.js` 里，in-process 的 `sessions.usage` handler 走 `selectUsageSessions`：

```
loadCombinedSessionStoreForGatewayCore(config, effectiveAgentId ? { agentId } : {})
```

不传 projection 时默认是 `"full"`，走 `selectFrom("session_nodes").selectAll()` 加逐行 `JSON.parse`，没有缓存。

V 上的只读统计（makaron，`mode=ro`）：

| | 值 |
|---|---|
| session_nodes 行数 | 25,866 |
| entry_json 合计 | 2,398 MB（平均 97 KB，最大 408 KB） |
| 去掉 skillsSnapshot + systemPromptReport（list projection） | 37 MB |
| 有 systemPromptReport 的行 | 25,535 |

`systemPromptReport` 在 handler 里只用于 `hasContextWeight` / `contextWeight`；`skillsSnapshot` 完全没用到。

同一个 full 读取在 admin 路径（Control UI 用量页）上发生在 usage 子进程里，子进程堆上限 4 GiB。候选测试 C3 量了这条路径。

## 修复（marker `usage-session-select-v1`）

源码：openclaw-versa `versa/port-usage-session-select-20261120` @ `13747d7e018`，基于 #604 的 `45b1333d152`。

- `selectUsageSessions`：
  - 单会话（带 key、instance 分组）用 `match: { sessionKeys, sessionIds }` 只读能匹配上的行，仍然是 full projection，所以 contextWeight 照常返回；
  - 列表、family 分组用 `projection: "list"`。
- 新增 `loadUsageContextWeights`：只为回复里实际返回的前 `limit` 行，按 key 精确批量补读 `systemPromptReport`，所以 `hasContextWeight` / `contextWeight` 与原来一致。
- `canRunUsageRpcInWorker`：管理员保持原样；非管理员在 `operatorSessionCap === undefined`（没有配置 Gateway 角色，也就没有可见性过滤）时也进子进程。子进程以管理员身份回答，在这种情况下结果和 in-process 完全相同。配置了角色的调用方仍留在主进程。
- dist：只改 `openclaw/dist/usage-C3nh9kcO.js`。`before` 是 V 当前的字节 `44c5f048…`；由 `node lab/build-usage-session-select.mjs --base <V 字节>` 生成，plan 是 `lab/usage-session-select.plan.json`。
- 测试：
  - versa：`usage-offload.test.ts`、`usage.sessions-usage.test.ts` 新增 3 条，连同改了期望的 4 条，共 7 条在旧代码上失败、新代码上通过。相关 6 个文件 124 条全过。
  - platform：`lab/usage-session-select.test.mjs`（3 条）已登记进 `platform/catalog.json`。

## candidate A/B（V 规模数据）

数据：共享 VLab makaron 库的一致性副本，按 V 的大小分布补齐到 25,866 行。合成行的形状照搬 V：skillsSnapshot 是 45 KB 级 prompt 加 278 个小对象，systemPromptReport 是 skills/tools 条目列表。目标会话是库里最忙的飞书私聊。

测试进程加载 runtime 里真实的、带 offload 包装的 `usage-C3nh9kcO.js`，用 V 的 node 参数（`--experimental-async-context-frame --max-old-space-size=12288`）按 V 的调用方式重放：

- C1 = V 的第一次调用（operator.read，只带 key）
- C2 = V 的第二次调用（operator.read，key + 当天 + Asia/Shanghai）
- C3 = Control UI 用量页（operator.admin，30 天，limit 1000）

两组都在 vlab91 上跑，数据完全相同：
- session_nodes 25,866 行，entry JSON 2.33 GB，list projection 72 MB，库 9.3 GB；
- 目标会话是 `agent:makaron:feishu:group:oc_ecabb651…`。VLab 里没有带转录的普通飞书私聊，所以用群会话代替，调用形状不变。

收据：旧 `candidate-71589594…`，新 `candidate-d5a87d00…`。

| 调用 | 旧（V 现在的字节，usage-offload-v1） | 新（usage-session-select-v1） |
|---|---|---|
| C1 operator.read，只带 key | 总 303.9 s，**主线程连续停顿 300.4 s** | 总 151.5 s，全在子进程里（冷库首次汇总，旧版同样要做），**主线程最大 24 ms** |
| C2 operator.read，key + 当天 | 总 22.7 s，**主线程停顿 22.6 s** | **119 ms**，主线程最大 8 ms |
| C3 admin，30 天，limit 1000 | 主线程最大 365 ms，但**子进程超过 4 GiB 堆，OOM（SIGABRT），报表失败** | 42.4 s 返回 78 行（77 行有 context weight），主线程最大 33 ms |
| 测试进程堆峰值 | 3,334 MiB | 116 MiB |

- vlab91 的盘比 V 慢，而且是冷缓存，所以旧版 C1 的 300 s 比 V 上的 30 s 长得多。C2 是热缓存下的同一次全表读取，22.6 s 和 V 上的量级一致（V 上 66 s，叠加了线上负载和内存压力）。
- 新版 C3 子进程 RSS 峰值 3.6 GB。list projection 本身只有 72 MB；推测多出来的是 SQLite 在 `json_remove` 扫 2.3 GB 时读入的页，属于可回收的文件页，不是 JS 堆。这一点没有单独核实。
- C1 新旧回复（不含 updatedAt）的摘要完全相同。C2 的摘要在两组之间不同，原因是两组跑的时候缓存刷新时机不同。下面的逐字段比对确认了这一点。

### 回复一致性（同一进程、同一份数据，新旧 handler 逐字节比对）

收据 `candidate-8d938b1b…`，8,000 行。

把 V 当前的 chunk 以 `usage-old-C3nh9kcO.js` 的名字和新 chunk 放在一起，分别调用两边的 in-process `sessions.usage`，等两边的缓存都是 fresh 后，比较去掉 `updatedAt` 的完整回复：

| 用例 | 旧 | 新 | 回复 |
|---|---|---|---|
| C1 只带 key | 5.8 s | 结果缓存命中 | **完全相同** |
| C2 key + 当天 | 4.5 s | 98 ms | **完全相同** |
| C3 30 天列表，limit 1000 | 10.2 s | 1.8 s | **完全相同**（78 行，77 行 hasContextWeight） |
| C4 key + includeContextWeight | 6.4 s | 163 ms | **完全相同**（contextWeight 照常返回） |
| C5 30 天，groupBy family | 9.8 s | 6.4 s | **完全相同** |

## 上线与验收（待 Tianyi 决定）

- 需要重启一次 Gateway（handler 在启动时加载）。按 `scripts/promote-to-v.mjs` 用 `lab/usage-session-select.plan.json` 发版，`baseRelease` 在 stage 时填。
- 验收：
  - 以 openclaw 用户执行 `openclaw gateway call sessions.usage --params '{"key":"<某个私聊会话>"}'`，应该秒级返回；
  - 期间不出现 `liveness heartbeat delayed` 或 `host timing gap`；
  - 能看到 `usage-offload-child-v1.js` 进程出现，空闲 1 分钟后退出；
  - Control UI 用量页 30 天视图能打开，worker 不 OOM。
- 回滚：恢复 `usage-C3nh9kcO.js` 为 `44c5f048…`。

## 顺带发现（未处理）

- agent 会自己去试 `openclaw gateway call` 这类运维接口。这次它在第二次超时后主动停手，但第一次超时并不代表 Gateway 停止计算。可以考虑在 V 的 AGENTS.md 或 skill 里说明「查用量用转录 / token_report，不要调 sessions.usage」。这条不在本次修复范围内。
- `agent-shell-cgroup.py` 把 process.title 改写后的 `hooks relay` 识别成 `codex-command`，而且日志里只剩 `openclaw` 一个词，排查时容易误导。
