# 2026-11-26：Gateway 任务数打满后崩溃，启动预检超时导致重启循环

时间均为 CST。结论来自 V 上的 journald、`/tmp/openclaw` 文件日志、Codex `logs_2.sqlite`（只读）和进程表。

## 概要

- **15:17:35 崩溃**：`spawn /opt/node-v22.23.1/bin/node EAGAIN` 未处理，Gateway 退出。Gateway unit 的 `TasksMax=4096`（进程 + 线程）被用满。这一轮 Gateway 是 11-25 22:39 上线的，已运行 16.5 小时。
- **15:17–15:39 起不来**：
  - 非正常退出后，DB91 预检对 8 个 agent 库做完整校验。makaron 库已有 49 GB（10/13 时 16 GB、预检 110 s），校验超过 300 s 默认上限即失败退出。
  - 这次失败退出本身又算一次非正常退出，下次启动还是要完整校验，于是每 5 分钟重启一次，没有尽头。
  - 期间 V 完全不回复，约 37 分钟。
- **恢复**：15:39 把预检上限放宽到 1 小时后重启。完整校验用了 716 s，15:54:43 `[gateway] ready`，5 个 worker、重启恢复 6 条全部 settled。

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
- **V Browser 的 Chrome**。

## 修复

| 项目 | 位置 | 状态 |
|---|---|---|
| `TasksMax=16384` | `systemd/openclaw-gateway.service.d/gateway-capacity.conf` | 15:44 已 `set-property` 生效；由 `scripts/install-v-gateway-capacity.sh` 改为仓库管理 |
| `OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS=3600000` | 同一 drop-in | 15:39 先用 `/run` 运行时 drop-in 应急；安装脚本会删掉应急文件 |
| 停用远程插件 `build-ios-apps`、`defense-factory` | V 上 makaron、v-codex 的 `codex-home/config.toml`（运行状态，不在 git） | 见下 |

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

- 每会话 MCP 进程随会话数线性增长，16384 只是把上限推远。长期办法是给 MCP 运行时设空闲回收，或者让 Codex 线程空闲后卸载。
- 预检完整校验的耗时随 makaron 库增长：49 GB 需要约 12 分钟。任何一次崩溃都意味着至少 12 分钟不可用。
- 11-19 以来账号同步的其他远程插件（gmail、google-drive、github 等连接器）仍保留，没有逐个评估。
