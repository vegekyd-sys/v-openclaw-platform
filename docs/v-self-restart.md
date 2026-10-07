# V 自己重启：v-self-restart

2026-10-06 定（Tianyi 选了方案 A）。V 需要重启自己的 Gateway 时，只用这一个命令。

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

## 它做什么（按顺序）

1. 请求阶段：每个 `--set` 先跑 `openclaw config set --dry-run`，有一个不通过就退出码 3，什么都不改。同一时间只允许一次重启；距离上次结束不到 10 分钟的，必须加 `--force`。
2. 等 `--delay` 秒（默认 30 秒），让 V 把这一轮的回复发完。
3. 再跑一遍 dry-run，然后 `systemctl stop`。
4. 备份配置（`openclaw.json.bak-self-restart-<ID>`），在 Gateway 停止期间用 CLI 写入。写在运行中的 Gateway 上会触发热重载，甚至触发需要重启的键自动重启，所以一定等它停了再写。
5. 清理 Codex app-server 的旧登记：只删 parent 和 child 两个进程都已经不在的行。没有这一步，重启后第一次 Codex 回合会报 `Cannot reap registered Codex process`。
6. `systemctl start`，等这次启动的日志里出现 `[gateway] ready`（最多 20 分钟）。systemd 自动重启过（崩溃循环）就立刻判为失败。
7. 失败时：恢复配置备份，再启动一次。结果记为 `rolled-back`，或者 `down`（需要人工处理）。
8. 结果绕开 Gateway，直接发到 `--chat` 群（复用 sentinel 的飞书通道）；再用 `openclaw agent --session-key ... --deliver` 唤醒发起的那个会话，把结果和 `--then` 交给它。

## 给 V 的规则（写进工作区 TOOLS.md）

- 需要重启 Gateway 时（插件代码更新、`plugins.*` / `gateway.*` 改动、环境变量、核心补丁），只用 `sudo v-self-restart`。不要走 openclaw 工具 / system agent 的审批，也不要自己 `systemctl`。
- 授权：Tianyi 在对话里明确说「重启」「上线」，就算授权；`--requested-by` 里写清楚是谁、在哪个群、什么时间说的。
- 调用完立刻用一句话收尾（例如「30 秒后重启，回来接着做」），不要再开新的工具调用；Gateway 停的时候这一轮会被中断。
- 新插件加新配置键：放在同一次 `--set` 里一起提交，它会在停机期间写入，不要先单独改配置。

## 安装与验收

- 安装：`scripts/install-v-self-restart.sh v`（装到 `/opt/v-sentinel/self-restart.py`，链接到 `/usr/local/sbin/v-self-restart`，最后跑一次 `--check`）。
- 单元测试：`python3 tests/v-self-restart.test.py`。
- VLab 演练：`lab/candidate/self-restart.plan.json`。私有 Gateway 以 systemd 单元运行，覆盖三个场景：A 改配置、清理 Codex 旧登记、唤醒会话；B 改动通过 dry-run 但启动失败，自动回滚；C dry-run 不通过，直接拒绝。

## 演练结果（2026-10-06 16:36–16:38 CST，VLab candidate `candidate-5aae9249`）

私有 Gateway 以 runtime unit 文件运行（Restart=always，与 V 相同）：

| 场景 | 结果 |
|---|---|
| A 改 `messages.ackReaction` + 预埋一行 Codex 旧登记 + 唤醒会话 | 成功。从 stop 到 ready 30 秒，PID 换新，配置已写入，旧登记被删，唤醒那一轮跑完并回复（candidate 没有渠道，`--deliver` 被拒后改为不投递唤醒） |
| B 打开 TLS 但证书不存在（dry-run 能过，启动起不来） | 20 秒内发现 systemd 自动重启过，判为失败，配置按字节恢复，再启动 30 秒就绪，结果为 `rolled-back` |
| C 写一个不存在的键 | 请求阶段 dry-run 不通过，退出码 3，Gateway 的 PID 没变 |

演练前几轮发现并已修复的问题：日志带颜色码时匹配不到 `[gateway] ready`；请求的 stdout 里混进了日志行；Gateway 不能投递时整次唤醒都被拒。

**还没验证的**：V 上真实飞书群的 `--deliver` 投递，以及 sentinel 直发群消息。这两项留到上 V 时第一次真实使用时验收。
