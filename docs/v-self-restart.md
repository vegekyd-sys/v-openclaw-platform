# V 自己重启：v-self-restart

2026-10-06 定（Tianyi 选了方案 A）。V 需要重启自己的 Gateway 时，只用这一个命令。

2026-10-17 起它是 V **所有**重启的唯一入口：V 自己发起的、监控 session 发起的、激活脚本和发版都走它。空闲检查、停服期间改配置、重启后核对都在这里做，激活脚本和发版不再各写一套排空逻辑。不改 OpenClaw 核心。

## 为什么要有它

2026-10-06 V 上线 PR #231（Mac 接管目标）时，花了半小时还是没能重启自己：

- 它走的是 OpenClaw system agent，每一步都要过审批卡。审批卡绑定在发起的那一轮上，V 说完「请批准」这一轮就结束了，卡片也跟着作废（`operator_approvals` 里记的是 `cancelled / run-aborted`），比 Tianyi 点下去早了 1 秒。
- 前面三次配置审批都批准了，也都没有写进去：运行中的 Gateway 还在用旧插件的配置 schema，不认新键，而这条失败路径不写日志。
- V 其实有 sudo，但它所在的 Claude Code 进程跑在 Gateway 的 cgroup 里。如果在回合里直接执行「stop → 写配置 → start」，执行到 stop 就把自己杀掉了，生产会一直停着，没人去把它启动起来。

## 用法（在 V 上）

```sh
sudo v-self-restart \
  --reason "加载 PR #231 的 v-desktop-handoff 新插件" \
  --requested-by "Tianyi 在「V｜接管Mac办事｜1006」15:43 说现在重启" \
  --chat oc_71bddaaf1f813b2ea9a886a92081e977 \
  --session-key agent:makaron:feishu:group:oc_71bddaaf1f813b2ea9a886a92081e977 \
  --set 'plugins.entries.v-desktop-handoff.config.targets=@/tmp/targets.json' \
  --then "发一张 target=tianyi-mac 的真卡片验收"
```

- `--set PATH=JSON` 或 `PATH=@文件`，可重复。值必须是严格 JSON，字符串要带引号：`--set 'messages.ackReaction="eyes"'`。
- `--check`：只校验，不做任何改动。`--status [ID]`：查看最近一次（或指定那次）的记录。
- 命令本身只做校验，然后立即返回。真正的操作放在一个独立的 systemd 单元（`v-self-restart-<ID>.service`）里执行，不在 Gateway 的 cgroup 中。
- `--idle-timeout 秒`（默认 300）和 `--if-busy wait-then-proceed|abort`（默认 wait-then-proceed）：见下面「空闲闸门」。`--idle-timeout 0` 跳过闸门，只用于 Gateway 已经卡死、必须马上重启的情况。
- `--while-stopped "命令"`：Gateway 停着的时候以 root 跑这条 shell 命令，`--while-stopped-timeout`（默认 900 秒）超时就杀掉整个进程组。见下面「停服期间命令」。
- `--settle-timeout 秒`（默认 180）：就绪之后最多等这么久，让 stream cron 和 worker 池回来。

发版或激活（不是 V 自己发起的）这样用：

```sh
sudo v-self-restart --reason "激活 DeepSeek web search" --requested-by "release web-search-deepseek" \
  --delay 0 --if-busy abort --idle-timeout 3600 \
  --while-stopped "node /opt/.../activate-production.mjs --apply-config-only"
```

一小时内等不到空闲就放弃（`busy-aborted`），什么都不碰；放弃不算一次重启，10 分钟间隔不受影响。

## 它做什么（按顺序）

1. 请求阶段：每个 `--set` 先跑 `openclaw config set --dry-run`，有一个不通过就退出码 3，什么都不改。`--while-stopped` 的可执行文件找不到就退出码 2。同一时间只允许一次重启；距离上次结束不到 10 分钟的，必须加 `--force`。
2. 等 `--delay` 秒（默认 30 秒），让 V 把这一轮的回复发完。
3. **空闲闸门**：等 V 空闲（下一节），再跑一遍 dry-run；dry-run 花了几秒，所以再看一眼是否仍空闲，不空闲就继续等。
4. `systemctl stop`。
5. 有 `--set` 或 `--while-stopped` 时，先备份两份配置：`openclaw.json` 和 worker 自己那份 `experiments/agent-worker-isolation-v1/worker-openclaw.json`（各自旁边的 `.bak-self-restart-<ID>`，属主不变）。然后在 Gateway 停止期间用 CLI 写入 `--set`，再跑 `--while-stopped`。写在运行中的 Gateway 上会触发热重载，甚至触发需要重启的键自动重启，所以一定等它停了再写。
6. 清理 Codex app-server 的旧登记：只删 parent 和 child 两个进程都已经不在的行。没有这一步，重启后第一次 Codex 回合会报 `Cannot reap registered Codex process`。
7. `systemctl start`，等这次启动的日志里出现 `[gateway] ready`（最多 20 分钟）。systemd 自动重启过（崩溃循环）就立刻判为失败。
8. **重启后核对**（下一节）：stream cron、worker 池、启动后日志里的已知错误。
9. 失败时：恢复两份配置备份，再启动一次。结果记为 `rolled-back`，或者 `down`（需要人工处理）。
10. 结果绕开 Gateway，直接发到 `--chat` 群（复用 sentinel 的飞书通道）；没给 `--chat` 时，只有失败或有告警才发到 sentinel 的告警群。再用 `openclaw agent --session-key ... --deliver` 唤醒发起的那个会话，把结果和 `--then` 交给它。

## 空闲闸门

`--delay` 之后、停服之前检查，四条都满足才算空闲，每 15 秒查一次：

| 条件 | 怎么查 |
|---|---|
| worker 池没有在跑或排队的回合 | RPC `vlab.workers.status`：各 worker 的 `active`（不含发起方自己的会话）、`queued`，加上池子的 `pending` |
| 没有在跑的 cron 回合 | RPC `cron.list`（分页拿全）：`state.runningAtMs` 有值的任务。stream 型任务的常驻 watcher 只有 `streamStatus: running`，不算忙；它随重启自动拉起，重启后单独核对 |
| 最近 4 分钟没有分发到一半的消息 | journal 里 `dispatching to agent` 的条数不多于 `dispatch complete (`（`[diagnostic] ... dispatch completed:` 是另一类事件，不算） |
| 最后一条入站消息已超过 90 秒 | journal 里最后一条 `received message` / `dispatching to agent` |

查询用 `scripts/v-self-restart-gateway.mjs`（装在 `/opt/v-sentinel/self-restart-gateway.mjs`）：只读，用正在运行的 Gateway 自己的 `dist/plugin-sdk/gateway-runtime.js` 里的 GatewayClient，以 `operator.read` 连接；node、core 目录、端口都从 Gateway 主进程的命令行取，token 是配置里的 `gateway.auth.token`，其中的 `${VAR}` 用 Gateway 进程环境展开。这和 2026-10-17 V 上手写的 busy-probe 是同一套做法。

**发起方自己不算忙**：`--delay` 本来就是留给发起方说完话的，闸门只在 delay 之后检查；发起方会话（`--session-key`）在 worker 里的回合不计入；它所在的群/私聊在**请求之前**的入站和分发日志也不计入（请求之后这个群里再来的新消息照样算忙）。没有 `--session-key` 的重启（监控、发版）不做任何排除。

查询失败（Gateway 不回 RPC）算忙。Gateway 没有 worker 池插件（`unknown method`）时这一条视为没有 worker 回合。Gateway 根本没在运行就直接算空闲。

等不到空闲时：`wait-then-proceed`（默认）照常重启，并在通知里告警「等了 N 秒仍在忙（原因），照常重启」；`abort` 什么都不改，结果 `busy-aborted`。V 自己发起的重启默认最多多等 5 分钟。

为什么要做进来：2026-10-17 04:13 一次重启只看了整体负载，打断了 Tianyi 刚发的一轮（转录停在工具结果上，没有续跑，只能重发）。之前每次重启前都是监控 session 手写等待脚本检查，口径各不相同。另外 `lab/shared/lifecycle.mjs` 的 `acquireIdleFence` 用的是 Gateway 的 `gateway.suspend.prepare` 排空，而 Gateway 把常驻的 stream watcher（GrokBot 双向桥）算成在跑的 cron，排空永远到不了，45 秒后放弃，期间不接新任务。这个工具不走那个排空，自己按上面四条判断。

## 停服期间命令（`--while-stopped`）

给必须在 Gateway 停着时改配置的操作用，例如激活脚本。

- 以 root 通过 `/bin/sh -c` 执行，环境里有 `V_SELF_RESTART_RUN_ID`、`V_SELF_RESTART_CONFIG`、`V_SELF_RESTART_WORKER_CONFIG`。
- 执行前两份配置都已备份。执行后，root 写文件时换了 inode 导致属主或权限变了的，按备份时的属主和权限改回去（Gateway 以 openclaw 用户运行，读不了 root 的 0600 文件）。
- 然后两份配置都要过 JSON 解析和 `openclaw config validate`（以服务用户、分别指定 `OPENCLAW_CONFIG_PATH`）。校验器自己超时不算失败，交给启动就绪判断。
- 命令退出码非 0、超时、配置校验不过、或者 Gateway 起不来：两份配置按字节恢复，再按原配置启动，结果 `rolled-back`。命令失败时 Gateway 不会先在改了一半的配置上启动。
- 记录里有 `whileStoppedResult`：命令原文、退出码、是否超时、耗时、stdout/stderr 末尾 1500 字节。通知里写命令和退出码。
- **只回滚这两份配置**。命令改的其他文件（插件代码、dist 补丁）不会回滚，命令自己要保证这些改动可以重复执行、或者在旧配置下无害。

## 重启后核对

就绪之后，在 `--settle-timeout`（默认 180 秒）内每 5 秒查一次，直到全部满足：

- 所有 enabled 的 stream cron 都回到 `streamStatus: running`；重启前在跑、重启后不见了或被停用的也算没恢复。
- worker 池就绪的 worker 数不少于 `minWorkers`。

然后统计这次启动（同一个 InvocationID）以来日志里的已知错误：`Cannot reap registered Codex process`、`InvalidConfigError`、`restart recovery claim changed`、`Worker stream acknowledgement timed out`（stream-ack）、`Cannot inspect Codex processes`、`is rebuilding`，以及 `"stage":"pool-ready"` 的 worker 数。

这些都写进记录和飞书通知。有任何一项不对，结果仍是 `ok`（Gateway 已就绪），但 `outcomeText` 写「有 N 项告警」，通知里逐条以 ⚠️ 列出，例如「⚠️ stream cron 没有恢复：GrokBot｜群内双向桥 v2（stopped）」。

## 给 V 的规则（写进工作区 TOOLS.md）

- 需要重启 Gateway 时（插件代码更新、`plugins.*` / `gateway.*` 改动、环境变量、核心补丁），只用 `sudo v-self-restart`。不要走 openclaw 工具 / system agent 的审批，也不要自己 `systemctl`。
- 授权：Tianyi 在对话里明确说「重启」「上线」，就算授权；`--requested-by` 里写清楚是谁、在哪个群、什么时间说的。
- 调用完立刻用一句话收尾（例如「30 秒后重启，回来接着做」），不要再开新的工具调用；Gateway 停的时候这一轮会被中断。
- 新插件加新配置键：放在同一次 `--set` 里一起提交，它会在停机期间写入，不要先单独改配置。

## 安装与验收

- 安装：`scripts/install-v-self-restart.sh v`（装到 `/opt/v-sentinel/self-restart.py` 和 `/opt/v-sentinel/self-restart-gateway.mjs`，链接到 `/usr/local/sbin/v-self-restart`，最后跑一次 `--check`）。
- 单元测试：`python3 tests/v-self-restart.test.py`。
- VLab 演练：`lab/candidate/self-restart.plan.json`。私有 Gateway 以 systemd 单元运行，带一个常驻 stream cron，覆盖七个场景：A 改配置、清理 Codex 旧登记、唤醒会话；B 改动通过 dry-run 但启动失败，自动回滚；C dry-run 不通过，直接拒绝；D 有一个 cron 回合在跑，闸门等它结束再停；E `--while-stopped` 改两份配置成功；F `--while-stopped` 改了两份配置后失败，按字节恢复；G `--if-busy abort` 碰到忙碌直接放弃。每次重启后都核对 stream 回到 running。

## 演练结果（2026-10-06 16:36–16:38 CST，VLab candidate `candidate-5aae9249`）

私有 Gateway 以 runtime unit 文件运行（Restart=always，与 V 相同）：

| 场景 | 结果 |
|---|---|
| A 改 `messages.ackReaction` + 预埋一行 Codex 旧登记 + 唤醒会话 | 成功。从 stop 到 ready 30 秒，PID 换新，配置已写入，旧登记被删，唤醒那一轮跑完并回复（candidate 没有渠道，`--deliver` 被拒后改为不投递唤醒） |
| B 打开 TLS 但证书不存在（dry-run 能过，启动起不来） | 20 秒内发现 systemd 自动重启过，判为失败，配置按字节恢复，再启动 30 秒就绪，结果为 `rolled-back` |
| C 写一个不存在的键 | 请求阶段 dry-run 不通过，退出码 3，Gateway 的 PID 没变 |

演练前几轮发现并已修复的问题：日志带颜色码时匹配不到 `[gateway] ready`；请求的 stdout 里混进了日志行；Gateway 不能投递时整次唤醒都被拒。

## 演练结果（2026-10-17 23:03–23:10 CST，VLab candidate `candidate-f65c5797`）

空闲闸门、停服期间命令、重启后核对上线前的演练。私有 Gateway（runtime `disk-budget-stall-20261017`）带一个常驻 stream cron（`sh -c 'while true; do sleep 20; done'`，match 模式），和 V 的 GrokBot 双向桥同形。忙碌用一个 `sleep 75` 的 command 型 cron 回合模拟。

| 场景 | 结果 |
|---|---|
| A 改配置 + Codex 旧登记 + 唤醒 | `ok`，闸门 2 秒判空闲（stream 没被算忙），35 秒就绪，stream 1/1 回到 running |
| B dry-run 能过、启动起不来 | `rolled-back`，配置按字节恢复，stream 1/1 |
| C dry-run 不通过 | 退出码 3，PID 不变 |
| D cron 回合在跑 | 闸门记下「cron 回合在跑」，等了 84 秒（查 6 次），那个回合 75.0 秒正常跑完（`ok`）后才停服；`ok`，stream 1/1 |
| E `--while-stopped` 改两份配置 | 退出码 0，两份配置都生效并通过 `config validate`；命令用 rename 写文件把权限变成 0644，工具按备份改回 0600；`ok`，stream 1/1 |
| F `--while-stopped` 改了两份配置后退出 7 | `rolled-back`，两份配置按字节恢复，没有在改了一半的配置上启动，stream 1/1 |
| G `--if-busy abort --idle-timeout 20`，cron 回合在跑 | `busy-aborted`，21 秒后放弃，PID 和配置都没变 |

当天 VLab 数据盘只剩 1.8 GB，放不下一份 1.7 GB 的 candidate 副本，所以这次用的是把 runner 的工作目录改到系统盘的副本（其余逻辑与 `lab/candidate/runner.mjs` 相同），跑完已删除。

**还没验证的**：V 上的真实空闲判断（飞书日志行、多 worker、发起方会话排除）只在单元测试里覆盖，候选里没有渠道。V 上真实飞书群的 `--deliver` 投递，以及 sentinel 直发群消息。这两项留到上 V 时第一次真实使用时验收。
