# V 的配置：什么热生效、什么要重启、V 怎么事先知道

2026-10-12 调研（起因：17:48 V 在群「V｜音响ESP32动作层｜1012」自己执行
`config set browser.ssrfPolicy.allowedHostnames`）。只读调研：生产 V 没有改动，也没有重启。

## 一句话结论

- **判定规则在 Gateway 里，按配置路径前缀查表**（OpenClaw 2026.9.1 的
  `src/gateway/config-reload-plan.ts`，V 上 dist 与上游逐字节相同）。每个路径归为三类之一：
  `hot`（热生效，可能附带动作）、`none`（什么都不用做）、`restart`（整体重启）。
  **表里没有的路径一律按 `restart` 处理**。插件还能给自己的配置登记规则，例如 browser 插件声明
  `browser.profiles` 为 hot、其余 `browser.*` 都要重启。
- **V 能在改之前准确知道**：问运行中的 Gateway `config.schema.lookup`，返回里的
  `reloadKind` 就是 Gateway 写入后要走的那条路（用的是同一张表，包括插件登记的规则）。
  `openclaw config set --dry-run` 不报告这一点；写入后 CLI 打印的提示也不可靠，见下文。
- **需要重启的键不能在运行中写**：一写入 Gateway 就自己重启，不会等人来安排。
  有在途工作时先等最多 300 秒（写死，不可配），V 上夜班几乎一直在跑，所以每次都会等满
  300 秒，然后强制重启：在途回合全部中止，再停机约 3–5 分钟。
- 不做新工具：2026-10-12 19:03 已把这条查法和「restart 就走 `v-self-restart`」写进 V 的 TOOLS.md
  和 v-openclaw-config 技能（第 6 节）。写的是 shell 命令，codex、Claude Code 等 harness 不需要
  OpenClaw 的 `gateway` 工具也能照抄执行。

## 1. 机制（9.1 源码）

### 1.1 从写入到判定

1. Gateway 监视 `openclaw.json`（防抖 300 ms）。任何写入都算：CLI、Control UI、
   `node -e` 直接改文件都一样。
2. 算出变化的叶子路径，日志 `[reload] config change detected; evaluating reload (<路径>)`。
3. `buildGatewayReloadPlan` 逐条匹配规则，最长前缀优先：
   - 任一路径为 `restart`，或没有匹配到任何规则 → 整体重启；
   - 否则按 `hot` 规则执行附带动作（见 1.3），日志 `config hot reload applied (...)`；
   - 全部为 `none` → 只更新运行时配置快照，**不打印任何 reload 结果日志**。
4. `gateway.reload.mode` 在 9.1 只有 `hybrid`（默认，V 未设置）和 `off`。`off` 会让热生效也失效，
   不能用来防止自动重启。

### 1.2 需要重启时：推迟、超时、强制

`server-reload-restart.ts` + `infra/restart.ts`：

- 统计在途工作：排队操作 + 待投递回复 + embedded run + 后台 exec + Gateway 请求
  + **后台任务 run（夜班 workboard 子 agent、cron 等）**。
- 为 0：立即重启，日志 `config change requires gateway restart (<路径>)` 或 `— preparing`。
- 不为 0：日志 `— deferring until ... complete`，每 500 ms 查一次，每 30 秒打一条
  `restart still deferred after Nms`。
- **上限 300 秒写死**（`DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS = 300_000`；
  `gateway.reload.deferralTimeoutMs` 在 9.1 已经失效，doctor 会把它删掉）。
  超时后以 `force: true` 发出重启，排空时间被设为 0 ms：
  `[gateway] forced restart requested; skipping active work drain` →
  `[shutdown] aborted N active run(s)` → 进程退出 → systemd 拉起（`NRestarts` +1，看起来像崩溃）。
- **推迟期间照常接收消息、照常开新回合**。准入只在发出重启信号那一刻才关闭
  （`[admission] closed: restart-signal fence`，之后入站报 `GatewayDrainingError`）。
  所以推迟期间开始、但在强制重启前没做完的回合都会被中止，用户看到的是「V 不回」。
- 夜班卡一跑就是 10–20 分钟，300 秒内几乎不可能等到空闲：只要夜班在跑，这条路径的实际效果就是
  「固定拖 5 分钟，然后全部掐断」。（PR #169 的说明里对 9/27–10/03 也得出同样结论。）

### 1.3 热生效不等于没有代价

| 前缀 | 热生效时实际做的事 |
|---|---|
| `plugins.entries.*`、`plugins.slots`、`talk.provider`、`talk.realtime.provider` | **重载全部插件**：所有插件服务停再起，MCP 运行时被丢弃；要换代码的渠道插件，先等在途工作（≤300 s，超时照样继续）再断开重连 |
| `channels.<feishu/telegram/dingtalk-connector/qqbot/wecom/msteams>.*` | 该渠道断开重连，先等在途工作（≤300 s） |
| `agents.defaults.mediaMaxMb` | 所有渠道断开重连 |
| `mcp.*`（`mcp.apps` 除外） | 丢弃 MCP 运行时，下次调用重建 |
| `cron` | 重启定时调度器 |
| `hooks`、`hooks.gmail` | 重新加载 hooks / Gmail watcher |
| `models`、`agents.defaults.model(s)`、`agents.defaults.modelPolicy`、`agents.entries`、`*.heartbeat` | 重启心跳 |
| 其余 hot / none | 只更新运行时配置快照，下一次读取时生效 |

### 1.4 Worker 这一层

- worker 插件每 5 秒检查主配置，推导 `worker-openclaw.json`（overlay v1）。Worker 那份有变化就
  **排空式换代**：旧一代把手上的回合做完再退，新回合交给新一代
  （日志 `Worker config derivation ... rewrote` → `rolled generation N -> N+1`）。
- 这一层与 Gateway 的 hot / none / restart 判定**相互独立**：
  - `none` 键（如 `messages.ackReaction`）也会让 Worker 换代，所以 Worker 回合同样能用上新值；
  - `restart` 键也会先换一次代（10/12 17:48:32），紧接着整体重启，这次换代白做了，但没有害处。
- 9/20、9/23 热重载把 worker 池关掉、只有重启才能恢复的问题，出在 worker 0.2.11 的生命周期上；
  10/04 上线的 0.2.12 已修复。此后插件重载照常换代，例如 10/06 18:17 的
  `plugins.entries.v-browser-device.*`；9/24 至今（journal 保留范围内）`worker pool is closing` 出现 0 次。

## 2. V 上的实际分类（运行中 Gateway 的 `config.schema.lookup`，2026-10-12）

只列 V 的 `openclaw.json` 里实际存在的顶层键，以及常改的子树。

| 路径 | 结果 | 说明、相关事件 |
|---|---|---|
| `agents.defaults.*`、`agents.entries.*`、`agents.ownership` | hot | 模型别名、modelPolicy、身份头像等；9/25、10/04、10/07 实测热生效 |
| `models.*` | hot | provider/模型列表；9/25、10/04 实测 |
| `tools.*` | hot | |
| `cron.*`、`hooks.*` | hot | 带重启调度器 / hooks 的动作 |
| `mcp.servers` | hot | 丢弃 MCP 运行时；**`mcp.apps` 要重启** |
| `plugins.entries.*`（canvas 除外）、`plugins.slots` | hot，**重载全部插件** | 10/04 xai、10/06 v-browser-device 实测；9/20 memory-core 那次把 0.2.11 的 worker 池关死 |
| `plugins.allow`、`plugins.deny`、`plugins.enabled`、`plugins.load`、`plugins.entries.canvas` | **restart** | `allow/deny/enabled` 要重启，是因为 V 装了 canvas 插件、它登记了这几个前缀 |
| `channels.feishu/telegram/dingtalk-connector/qqbot/wecom/msteams.*` | hot，渠道重连 | |
| `channels.defaults`、`channels.modelByChannel`、其余渠道 | **restart** | |
| `browser.profiles.*` | hot | 10/12 17:46 `browser.profiles.ha-lab` 实测 |
| `browser.*` 其余（`ssrfPolicy`、`extraArgs`、`cdpUrl`、`headless`…） | **restart** | 10/03 `browser.extraArgs`、10/12 `browser.ssrfPolicy.allowedHostnames` |
| `desktop.*` | **restart** | 9/27 `desktop.host` |
| `secrets.egressProxy` | **restart** | 9/25 |
| `secrets.providers`、`secrets.defaults` | none | |
| `talk.provider`、`talk.realtime.provider` | hot，**重载全部插件** | 9/23 那次关死了 0.2.11 的 worker 池 |
| `talk.*` 其余（`realtime.transport`、`speakerVoice`…） | none | |
| `session.scope`、`session.store` | hot | |
| `session.*` 其余、`messages.*`、`skills.*`、`bindings`、`meta`、`ui`、`wizard` | none | 改 `skills.*` 会让 skills 快照失效 |
| `gateway.*`（`gateway.reload`、`gateway.remote` 除外） | **restart** | 含 `gateway.nodes.*` |
| `approvals.*`、`auth.*`、`commands.*`、`diagnostics.*`、`env.*`、`memory.*`、`tts.*` | **restart** | 10/03 审批键；`memory.search.*`（例如 FTS trigram） |
| 任何没有规则的新顶层键 | **restart** | 默认值 |

## 3. 日志核对（journal 只保留到 2026-09-24，约 18 天）

| 时间 | 路径 | Gateway 行为 | 结果 |
|---|---|---|---|
| 9/25 03:09–04:14 | `models.providers.xai.*`、`agents.defaults.models.*`、`modelPolicy.allow` 等 | hot ×4 | 正常 |
| 9/25 21:56 | `secrets.egressProxy` | restart，推迟 43 s 后排空成功 | 21:59:34 就绪，无回复被切断 |
| 9/27 16:43 | `desktop.host` | restart，当时空闲，立即重启 | 16:46:30 就绪 |
| 10/03 20:10 | `browser.extraArgs` | restart，推迟 303 s 后**强制** | 中止 2 个回合、3 条回复；20:19:43 就绪 |
| 10/03 23:58、10/04 00:42 | `wizard.lastRunCommand`、`messages.ackReaction` | none | Worker 换代 |
| 10/04 02:07 | `skills.entries.didi-ride-skill.*` | none | Worker 换代 |
| 10/04 18:21–18:29 | `models.providers.xai.models`、`plugins.entries.xai.config.xSearch.*` | hot | Worker 换代 |
| 10/06 18:17 | `plugins.entries.v-browser-device.config.principalAliases` | hot（插件重载，telegram 渠道等 90 s 后重连） | Worker 正常换代，池子未死 |
| 10/07 13:14 | `agents.entries.makaron.identity.avatar` | hot | Worker 换代 |
| 10/12 17:46 | `browser.profiles.ha-lab` | hot | Worker 换代 |
| 10/12 17:48 | `browser.ssrfPolicy.allowedHostnames` | restart，推迟 300 s 后**强制** | 见下节 |

9/20（`plugins.entries.memory-core.*`）和 9/23（`talk.realtime.*`）两次 worker 池停摆已超出 journal
保留期，结论沿用当时的记录（`config-hot-reload-kills-worker-pool` 记忆）。

## 4. 10/12 17:48 复盘

| 时间 | 事件 |
|---|---|
| 17:46:53 | V 写 `browser.profiles.ha-lab` → hot，17:47:22 Worker 换代。正常 |
| 17:48:24 | V 写 `browser.ssrfPolicy.allowedHostnames` |
| 17:48:26 | `requires gateway restart — deferring until 30 operation(s), 3 reply(ies), 15 embedded run(s) … 15 background task run(s)`，被夜班 workboard 子 agent 挡住 |
| 17:48–17:53 | **照常收消息、照常开回合**（17:51:02、17:52:07、17:52:31、17:53:14、17:53:24 都有派发），只是在途工作一直清不掉 |
| 17:53:26 | 300 s 超时 → 强制重启；17:53:25 那条私聊被拒（`GatewayDrainingError`） |
| 17:53:27–17:55:06 | 0 ms 排空，中止 7 个夜班 run 和推迟期间开始的回合；进程用 100 s 才退出，systemd 发 SIGKILL 清理残留 |
| 17:55:11 | systemd 拉起（`restart counter is at 1`）。**这不是第二次重启，是同一次重启的后半段** |
| 17:57:46 | 飞书长连接恢复，停机期间的消息被补投递 |
| 17:58:39 | `[gateway] ready`。从强制重启算起，不可用约 5 分 13 秒；加上推迟期，影响约 10 分钟 |

直接原因：V 的工作区 TOOLS.md 在「Worker 模式下修改全局配置」一节，把 browser 列入
「只改主配置，Worker 会自动换代，不用重启 Gateway」的范围，而「仍需要重启」的清单只写了核心补丁、
`gateway.*`、`plugins.load`、环境变量和插件代码。V 照规则做了，规则本身是错的。

## 5. V 怎么事先知道

| 办法 | 准确吗 | 说明 |
|---|---|---|
| **`config.schema.lookup`（运行中 Gateway）** | **准确** | shell：`openclaw gateway call config.schema.lookup --params '{"path":"<路径>"}' --json \| grep -m1 '"reloadKind"'`（顶层的 `reloadKind` 排在 `children` 前面，所以第一行就是要的结果）；OpenClaw 的只读 `gateway` 工具也有同样的动作，但 codex / Claude Code harness 未必能调用，所以规则里写 shell。还不存在的 map 键（新的 profile 名、新插件 id）也能直接查到 |
| `openclaw config set --dry-run` | 不报告 | 只校验 schema，然后返回；完全不提是否需要重启 |
| 写入后 CLI 的提示 | **不可靠，而且已经晚了** | 提示在写入之后才打印，此时 Gateway 已经开始重启。CLI 进程里没有加载插件，判断会出错：`browser.profiles.*` 提示「Restart the gateway」（实际是 hot）；`plugins.allow` 提示「apply without restarting」（V 上实际要**重启**）；`plugins.entries.*` 一律提示要重启（实际是 hot）。另外 "Restart the gateway to apply" 这句话读起来像「之后由你来重启」，实际上 Gateway 已经自己重启了 |
| V 的 TOOLS.md / v-openclaw-config 技能 | 过时 | 见上一节；技能里的 `v_config_txn.py --restart safe` 和 TOOLS.md 的自动换代说法也互相矛盾 |

2026-10-12 在 V 上按 harness 执行命令时的环境（openclaw 用户、非登录 shell、只带 Gateway 的环境变量）实测：
`browser.ssrfPolicy.allowedHostnames` → `restart`，`browser.profiles.ha-lab` → `hot`，
`messages.ackReaction` → `none`；`browser.profiles.<不存在的名字>`、`plugins.entries.<不存在的 id>.config.x`
都能直接返回 `hot`。

## 6. 已写进 V 的规则（2026-10-12 19:03）

V 工作区 `/home/openclaw/makaron-openclaw/.openclaw-local/workspace`，改之前的备份在
`/home/openclaw/.openclaw/backups/workspace-docs/*.bak-20261012190343`。工作区 git 里本来就有别人
未提交的 TOOLS.md 改动，所以这次也没有提交。

- **TOOLS.md「Worker 模式下修改全局配置」**：原来写着「修改……browser、media 等……Worker 会自动换代，
  不用重启 Gateway」。改为：
  - 每次改配置之前，对每个路径先跑
    `openclaw gateway call config.schema.lookup --params '{"path":"…"}' --json | grep -m1 '"reloadKind"'`，
    不要凭印象，也不要信 `config set` 写完之后打印的提示；
  - `hot` / `none`：照常改；`plugins.entries.*`、`talk(.realtime).provider` 会重载全部插件，渠道配置会让渠道重连，
    尽量避开有人正在对话的时候；
  - `restart`：不要直接写，也不要手改文件，改用 `sudo v-self-restart --set`；并说明直接写的后果（最多等 5 分钟，
    然后强制重启、掐断所有在途工作，以 10/12 为例）；
  - 列出常见的 restart 键作为举例，注明以查询结果为准。
  
  「仍需要重启 Gateway 的」清单改为：查出 `restart` 的配置、核心补丁、环境变量、Gateway 进程里的插件代码。
- **skills/v-openclaw-config/SKILL.md**：「If uncertain, use the `gateway` tool…」改为「每次写入前都用上面的
  shell 命令查；restart 就走 `v-self-restart`」。

## 7. 等 5 分钟和掐断在途工作的问题：可选改法

按风险从低到高：

| 方案 | 做法 | 效果 | 代价 |
|---|---|---|---|
| A 规则（已做） | 第 6 节：改之前先查 `reloadKind`，restart 就走 `v-self-restart` | 不再在运行中写 restart 键，从源头上避免 | 靠 V 遵守规则；Control UI、人手改文件绕得过去 |
| B CLI 外壳拦截 | `/usr/local/bin/openclaw` 外面包一层：`config set/patch/unset/apply` 前先查 `reloadKind`，Gateway 在跑且含 restart 键时拒绝，并提示改用 `v-self-restart`（`v-self-restart` 是在停机时写的，不受影响） | 四种 harness 只要走 CLI 就都拦得住 | 要维护一个外壳；Control UI 的 `config.patch` RPC、`node -e` 改文件仍拦不住 |
| C 让 `v-self-restart` 等空闲（并入 #169） | 停机前等用户可见的工作（排队回合、待投递回复、embedded run、Worker run）清空，夜班和 cron 只报告不阻塞；等不到就拒绝，除非显式 `--allow-interrupt`；停机用有上限的排空，不用 0 ms | 计划内重启不再掐断用户对话 | #169 尚未在 V 上实跑 |
| D 核心补丁：推迟期间不再接新回合 | 推迟一开始就回复「V 正在重启，几分钟后回来」，消息排队，重启后再处理；或者推迟计数不算夜班后台任务（夜班有 #125 重启暂停，会自己停下再接上） | 不再出现「收了、开始做、然后被掐断」 | 改 9.1 core dist（重启发布 + VLab candidate 验证）；要能覆盖 9.x 升级 |
| E 核心补丁：只记下、不自动重启 | hybrid 模式下 restart 键只记为「待重启」并发通知，由人或 `v-self-restart` 选时间 | 写配置不再等于重启 | 改变原生语义；「写了却没生效」本身也会造成误判 |

建议：**A 已做**；**C 接着做**（#169 已写好，主要是验证）；B 视 A 的执行情况再定；
D、E 等到确实还有人在运行中写 restart 键时再考虑。

## 8. 另外发现：今天有 5 个会话被重启恢复卡住

与配置无关，调研时顺带看到，单独处理：今天共 309 次 `restart recovery claim changed before agent adoption`：

| 会话 | 次数 | 时段 |
|---|---|---|
| `agent:makaron:feishu:group:oc_59b2f26c…` | 73 | 13:59–17:19 |
| `agent:makaron:feishu:group:oc_a0f10f1d…` | 72 | 14:00–17:19 |
| `agent:makaron:feishu:direct:ou_52b437fd…` | 71 | 14:07–17:19 |
| `agent:makaron:feishu:group:oc_102afdb8…` | 68 | 14:12–17:19 |
| `agent:makaron:feishu:group:oc_39d9f852…` | 25 | **17:27 至今（18:28 还在发生）** |

这几个会话里，用户发的每条消息都会派发失败（记忆 `v-restart-recovery-wedge`）。前 4 个在 17:2x
那次重启后恢复，`oc_39d9…` 从 17:27 卡到现在。这也是「群里发消息 V 收不到」的一个独立原因。

## 9. 没做 / 局限

- 没有在 candidate 上重放「推迟期间收消息」的场景：生产日志已经逐条给出了这个过程，源码也一致。
- journal 只保留到 9/24，9/20、9/23 两次事件依据的是当时的记忆记录。
- `config.schema.lookup` 查不到的路径（报 path not found），按 restart 处理，这与 Gateway 对未匹配路径的默认行为一致。
- 第 2 节是 V 当前加载的插件下的结果。插件增减会改变规则（例如卸掉 canvas 后，`plugins.allow` 会变成 hot），
  所以每次都实时查，不要背这张表。
