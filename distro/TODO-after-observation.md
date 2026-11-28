# 待办：24 小时观察期（2026-11-28 03:01 CST 起）结束后再改

测试机冻结在 `2026.11.28-db91-lifecycle-proof.22` 上，以下问题先记在这里，观察期结束后一起修、一起发。

## 1. 「主动推进」02:30 那轮被记成 error（Terminal failed），其实正常完成了

- 现象：cron runs 里，2026-11-28 02:30 的 `distro:heartbeat-proactive` 记成 `status=error`、`summary="⚠️ Terminal failed"`、`deliveryStatus=not-delivered`；08:00 的 Heartbeat 报告据此说上一轮失败。
- 实际经过（Codex 会话 rollout-2026-11-28T02-30-00-…）：
  1. 模型先调了 OpenClaw 的 `terminal` 工具，返回「Terminal session unavailable」，因为这台机器上没有共享终端；
  2. 马上改用 `exec` 跑同一个命令，成功；
  3. 判断现在是主人的静默时段（23:00–08:00），`record --silent` 之后最终回复 `NO_REPLY`，全程 9.6 s。
- 结论：这一轮本身是对的。OpenClaw 把前面那次工具失败当成了整轮的错误摘要。**和升级无关**：这一轮 02:30:09 就结束了，.19 升级 02:33:44 才停网关。
- 第二次（2026-11-28 20:00「Heartbeat 维护」，`status=error`、`⚠️ Terminal blocked`、`not-delivered`）：同一类，变体不同。
  - Codex 会话 rollout-2026-11-28T20-00-00-01a22206…，20:00:02 第一个工具调用是 `terminal`，参数却按 exec 的格式写（`command`、`timeout`），工具返回 `Invalid arguments for tool "terminal": action: must have required property 'action'`。
  - 2 秒后改用 `exec` 跑同一个命令，`heartbeat.py` 正常跑完。之后的反思分析、派工列表、wiki 可达性都做了：补了 1 条入链，可达 26/26；日志写进 `memory/2026-11-28.md` 的 `## heartbeat 维护（20:00）`。
  - 20:01:00 任务完成，用时 60 s。最终回复 `NO_REPLY`，因为这个任务的 prompt 规定「没有需要主人知道或决定的新情况，只回复 NO_REPLY」。所以单聊没收到报告是按设计，不是投递失败。
  - OpenClaw 把开头那次参数错误记成了整轮的结果（`diagnostics` 里 source=tool 的 `Terminal blocked`），于是 `status=error`、`deliveryStatus=not-delivered`。
  - 08:00 那轮 `ok`，是因为它第一个工具调用就直接用了 `exec`。
- 要做：
  - **已做（claude/distro-after-observation-fixes）**：发行包默认禁用 `terminal`（standalone 的 `tools.deny` 是 `portal`、`terminal`）。V 自己的配置没有禁用它（2026-11-29 只读核对：V 的 `tools.deny` 为空），客户版没有共享终端，所以只在客户版关掉。
  - 原评估：在发行包里默认禁用 `terminal` 工具（`tools.deny` 加 `terminal`）。两次误报都是模型先选了 `terminal`：客户机上没有共享终端，而且它的参数格式和 exec 不同，容易用错：客户机上没有操作员打开的共享终端，agent 应该直接用 exec。要先核对 V 上 terminal 的实际用法。
  - **还没做**：cron 的结果判定。最终回复是 NO_REPLY、中间有工具失败但后来恢复了，应该记成 ok，不该记成 error。这是 core 的行为，可能要提给上游或在 V 的补丁里处理。

## 2. update.sh 要处理正在跑的定时任务和回合

- update.sh 现在是直接 `systemctl stop openclaw-gateway`。正在跑的定时任务或回合会被打断，而且升级报告里看不出来。
- **已做（claude/distro-after-observation-fixes）**：update.sh 停网关之前先跑 `v-ctl wait-idle`。
  - 它用 `vlab.workers.status` 和 `cron.list` 看有没有 Worker 回合在跑或排队、有没有 cron 在跑，和 V 的 `scripts/v-self-restart.py` 用的信号一样。
  - 最多等 `V_UPDATE_IDLE_TIMEOUT_S`（默认 900 s）。输出 `waitedFor`（等过的）和 `interrupting`（超时仍在跑、这次会被打断的），写在升级输出里。
- 原计划：停网关之前先看有没有进行中的回合和 cron run，等一会儿（设上限），升级报告里列出等到的和被打断的。

## 3. 网关停止超过 45 s 被强制杀掉

- 03:00:19 的 .22 升级：网关收到 SIGTERM，开始 drain，45 s 内没有退出（单元的 TimeoutStopSec=45s）。systemd 用 SIGKILL 杀掉了网关和它的 Worker、codex 子进程。之后启动正常，探针通过。
- 2026-11-29 查明：
  - V 的网关单元也是 `TimeoutStopSec=45`、`KillMode=mixed`，发行包与 V 一致。
  - 03:00:19 停的时候，03:00 的「Memory 导入补编」刚开跑，有一个 codex 子进程在干活；drain 等它，45 s 内没结束就被 SIGKILL。
- **处理**：不改超时（保持和 V 一样），由第 2 条在停之前等空闲。只有等满上限仍有回合在跑时才会再被杀，升级输出会列出这些回合（`interrupting`）。
- 原计划：核对 V 的网关单元 TimeoutStopSec 是多少，查清 drain 卡在哪里（Worker 池？codex app-server？），再决定是延长超时还是修 drain。
