# 2026-11-26：Gateway 任务数打满后崩溃，启动预检超时重启循环，恢复后主线程又卡 22 分钟

时间均为 CST。结论来自 V 上的 journald、`/tmp/openclaw` 文件日志、Codex `logs_2.sqlite`（只读）和进程表。

## 概要

- **15:17:35 崩溃**：`spawn /opt/node-v22.23.1/bin/node EAGAIN` 未处理，Gateway 退出。Gateway unit 的 `TasksMax=4096`（进程 + 线程）被用满。这一轮 Gateway 是 11-25 22:39 上线的，已运行 16.5 小时。
- **15:17–15:39 起不来**：
  - 非正常退出后，DB91 预检对 8 个 agent 库做完整校验。makaron 库已有 49 GB（10/13 时 16 GB、预检 110 s），校验超过 300 s 默认上限即失败退出。
  - 这次失败退出本身又算一次非正常退出，下次启动还是要完整校验，于是每 5 分钟重启一次，没有尽头。
  - 期间 V 完全不回复，约 37 分钟。
- **恢复**：15:39 把预检上限放宽到 1 小时后重启。完整校验用了 716 s，15:54:43 `[gateway] ready`，5 个 worker、重启恢复 6 条全部 settled。
- **16:07:02–16:29:49 再次不回（22.7 分钟）**：记忆库准备阶段在 Gateway 主线程对 makaron 库做完整校验（`memory-database-preparation` `integrity` 1,361,689 ms）。
  - 预检的完整校验在子进程里做，结果不写成 Gateway 这一生命周期的收据。Gateway 的生命周期目录 `c4f9600e…` 里，16:29:49 之前没有任何收据。
  - 所以 makaron 第一次被记忆检索打开时，主线程又从头校验一遍。
  - 干净重启时会沿用上一生命周期的收据，碰不到这条路径；只有非正常退出后才会出现，所以这是 V 上第一次。

## 任务数被谁占满

退出时 systemd 列出的残留进程：93 个 chrome、74 个 node、35 个 `npm exec xcodebuildmcp`、9 个 ssh 等。每个 node/npm 进程带十来个线程。

- **`build-ios-apps` 远程插件**（最大头）：
  - 11-19 18:51，ChatGPT 账号上安装的一批远程插件同步进了 makaron 和 v-codex 的 Codex 主目录（`plugins/cache/openai-curated-remote/`）。
  - 其中 `build-ios-apps` 声明了 MCP 服务 `npx -y xcodebuildmcp@latest mcp`。Codex 每开一个线程就起一份（npm + sh + node），线程不结束不退出。
  - 它只能在有 Xcode 的 macOS 上工作，V 是 Linux，纯属负担。
  - 崩溃前半小时的 Codex 日志里，有 51 个线程加载了它。
- **每会话 MCP**（设计如此，规模随会话数增长）：
  - `xiaomi-tv-remote`：`openclaw.json` 的 `mcp.servers`，每个会话一个 ssh 到 VLab 的进程。
  - `openai-developers` 插件：每个 Codex 线程一个 `node ./mcp/server.mjs`。
- **GeeLark 账号开通流程的 Chrome 漏标签页（今天的触发因素）**：
  - agent 在 agent-shell 里起了专用 Chrome（CDP 22900，profile 在 `memory/projects/geelark-provisioning-workflow/.state/chrome-profile`）。
  - 它写的临时脚本每次 `ctx.newPage()`，结束时只 `browser.close()`。对 `connectOverCDP` 来说这只是断开连接，页面不会关。
  - Gateway 恢复后 agent 在 16:31 又起了这个 Chrome，13 分钟里已经开了 11 个页面，其中同一个 loongproxy 管理页开了 8 个，渲染进程每 5 分钟多一个。
  - 崩溃时残留了 93 个 chrome 进程。
- **为什么是今天**：
  - 不是运行时长：11-21 到 11-23 连续运行 68 小时没出事。
  - 也不是对话量：11-23 到 11-25 每天 1500–1800 个 Codex 线程，今天到 16 点只有 271 个。
  - 今天群里在密集做 TikTok/Outlook 开号登录，这个 Chrome 一直在漏；再叠加 11-19 起每个 Codex 线程多出来的 xcodebuildmcp，第一次顶到 4096。

## 修复

| 项目 | 位置 | 状态 |
|---|---|---|
| `TasksMax=16384` | `systemd/openclaw-gateway.service.d/gateway-capacity.conf` | 15:44 已 `set-property` 生效；由 `scripts/install-v-gateway-capacity.sh` 改为仓库管理 |
| `OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS=3600000` | 同一 drop-in | 15:39 先用 `/run` 运行时 drop-in 应急；安装脚本会删掉应急文件 |
| 停用远程插件 `build-ios-apps`、`defense-factory` | V 上 makaron、v-codex 的 `codex-home/config.toml`（运行状态，不在 git） | 见下 |
| agent-shell `pids.max=10240` | `systemd/v-agent-shell-cgroup.service`、`scripts/v-agent-shell-cgroup.py --pids-max` | 16:56 已用 `scripts/install-v-agent-shell-cgroup.sh v --enable` 装上 V。agent 再漏，先失败的是 agent 自己的命令，Gateway 至少保留约 6000 |
| 关掉 GeeLark Chrome 的 8 个重复标签页 | V 运行状态 | 每个网址留最新一个，chrome 进程 21 → 13 |
| GeeLark 流程笔记加「复用标签、新开的页用完关」 | V 工作区 `memory/projects/geelark-provisioning-workflow/main.md` 第 88 行，备份 `main.md.bak-20261126` | agent 下次读笔记生效 |
| `last-lifecycle.json` 指回运行中的 Gateway | V `.db91-integrity/` | 见下 |

**生命周期记录被 agent 命令覆盖**：
- 16:34:16 和 16:35:46，agent 通过 OpenClaw exec 起了两个 `core/dist/index.js` 进程，其参数被 `isGatewayServer` 判定为 Gateway。
- 它们各自建了一个新生命周期，并改写了 `last-lifecycle.json`。下次重启时，沿用上一轮检查结果要靠这个文件。指向错误的生命周期，干净重启也会退回完整预检，耗时 12 分钟。
- 已手工把它指回运行中的 Gateway（`c4f9600e…`，pid 3591187），原文件备份在 `~/.cache/last-lifecycle.json.bak-20261126`。

**Codex 远程插件**：这是 Codex 的运行状态，不进仓库，只在这里记录做法。

1. 两个 `codex-home/config.toml` 都追加了以下配置，原文件备份为 `config.toml.bak-remote-plugin-20261126`：

   ```toml
   [features]
   remote_plugin = false

   [plugins."build-ios-apps@openai-curated-remote"]
   enabled = false

   [plugins."defense-factory@openai-curated-remote"]
   enabled = false
   ```

2. 只关 `remote_plugin` 不够：已经下载的远程插件照样被加载，15:54 新起的 app-server 仍在为新线程拉起 xcodebuildmcp。
3. 所以又把这两个插件目录移到了 `/home/openclaw/.cache/codex-remote-plugins-disabled-20261126/`。之后 3 分钟、10 次新回复，没有再起新的 xcodebuildmcp。
4. 恢复办法：把目录移回原处，并删掉上面这几行配置。

## 遗留

- `db91-integrity-bootstrap.mjs`：Gateway 的子进程（环境里已有 `OPENCLAW_DB91_INTEGRITY_EPOCH`）不应再开新生命周期、改写 `last-lifecycle.json`。这是 dist 改动，要走 VLab 和重启。
- 预检的完整校验结果应发布为 Gateway 生命周期的收据，主线程才不会再做一遍。另一条路是记忆库准备阶段永远不在主线程同步跑整库校验。
- 以上两条的修复：分支 `claude/db91-integrity-child-and-preflight-proof`（`lab/release-files/db91-lifecycle-proof/`，源码 `versa:ca494f9134f`，含 11670ce12b6）。补充调查：
  - 预检其实一直在发布收据（11-11 几次非正常重启的生命周期目录里都有预检时刻的收据）；VLab 上 SIGKILL 后重启，第一次记忆检索也复用了收据。
  - 这次 15:54 就绪后到 16:07 之间，makaron 的会话一直在处理，16:00:32 主进程还有一次 18 ms 的记忆库准备（复用了某个库的收据，日志没写是哪个库）；16:07 记忆检索新开 makaron 连接时收据已不可用。目录里没有撤销标记，makaron 的 schema cookie、inode 几周未变，文件缩小也能被头部识别（本机实验确认），所以最可能是「收据文件不在」，但没找到是谁、何时删的，也不能排除预检那次发布就没写成。
  - 修复按「收据缺失」处理：启动时把准入所依据的校验结果写进只写一次的 `admission.json`，收据缺失时按同样规则核对后补回；每次整库校验都会记录原因，下次再出现能直接定位。

- 每会话 MCP 进程随会话数线性增长，16384 只是把上限推远。长期办法是给 MCP 运行时设空闲回收，或者让 Codex 线程空闲后卸载。
- 预检完整校验的耗时随 makaron 库增长：49 GB 需要约 12 分钟。任何一次崩溃都意味着至少 12 分钟不可用。
- 11-19 以来账号同步的其他远程插件（gmail、google-drive、github 等连接器）仍保留，没有逐个评估。
