# 部署非沙盒版 V：总纲

这份是给人看的。执行部署的 agent 照着 [RUNBOOK.md](RUNBOOK.md) 一步步做，里面有每一步的命令、预期输出、判断标准和失败处理。
发行包本身的结构和安装器的设计见 [README.md](README.md) 和 [CONTRACT.md](CONTRACT.md)。

## 一句话

在客户的一台 Ubuntu 24.04 机器上（默认在海外，通过 SSH 登录），用发行包装一个独立运行的 V：
- 接客户自己的飞书应用，只为客户的老板一个人服务；
- 默认模型是 DeepSeek Flash，主路径是 /vds（Codex），回落到 Worker，和 V 一样；
- key 先全部用我们的，之后逐个换成客户自己的。

## 谁做什么

| 角色 | 做什么 | 不做什么 |
| --- | --- | --- |
| Tianyi（或他指定的 session） | 核对后打正式版本的 tag，给出 tag 和期望的 tarSha256；决定用哪些我们的 key | — |
| 执行部署的 agent（V） | 预检、送包、用管道写入我们的 key、安装、接飞书、验收、写交接 | 不显示任何密钥原文；不用密码登录、不记录客户密码；不在老板的会话和记忆里留测试内容 |
| 客户管理员 | 给 SSH（加我们的公钥）；建飞书企业自建应用、导入权限、配事件和回调、发布；自己把 App Secret 写进客户机 | 不把 Secret 发在聊天里 |
| 老板 | 第一次私聊机器人；在上手引导里点一次飞书授权 | — |

## 阶段

| # | 阶段 | 结果 | 大约用时 |
| --- | --- | --- | --- |
| 0 | 现场信息收集 | 一张信息表；用我们自己的专用 SSH 密钥登录、确认系统和免密 sudo | 15 分钟 |
| 1 | 预检 | `preflight.sh` 确认系统和出网；海外机器全部走官方源 | 2 分钟 |
| 2 | 送包 | V 在自己主机上从 tag 构建，tarSha256 与批准的一致；传到客户机后 tgz 的 sha256 一致 | 5–15 分钟 |
| 3 | 客户飞书应用和 key | 应用发布；App ID 交给我们；我们的 key 用管道写进 secrets.env；客户自己写 App Secret | 30 分钟，主要等管理员 |
| 4 | 安装 | `install.sh --probe` 通过；能力清单 `v-capabilities.json` | 10–25 分钟 |
| 5 | 接飞书和主人 | `feishu-check` 通过；老板的 open_id 已配置；`ws client ready`；老板私聊有回复 | 10 分钟 |
| 6 | 老板上手 | 按 [OWNER-ONBOARDING.md](workspace/OWNER-ONBOARDING.md)：老板完成授权和上手引导，知道哪些能力没开 | 15–30 分钟 |
| 7 | 验收 | 15 项当场验收清单 | 20 分钟 |
| 8 | 收尾 | 每日备份、清理、交接记录、远程支持方式；之后换成客户自己的 key | 10 分钟 |

装完、飞书接通（第 5 步）之后，老板上手的部分看 B 线的 [OWNER-ONBOARDING.md](workspace/OWNER-ONBOARDING.md)：主人 open_id、授权链接、上手引导每一步看到什么、交付后头几天的预期。

## 正式版本

- 正式版本是公开仓库 `vegekyd-sys/v-openclaw-platform` 上的 git tag `distro-<版本号>`。
  - 版本号规则：`<YYYY.MM.DD>-<V release 名去掉日期后缀>.<当天第几个>`，例如 `distro-2026.11.30-db91-lifecycle-proof.1`。
  - tag 指向的提交里有 `distro/release.json`，写明 V release 名和 captured-store 提交。打 tag 前先更新它。
- **不发 GitHub Release 资产，不用 vrelay 传包。** 部署的 V 在自己主机上运行 `distro/build/release-build.sh --tag <tag> --expect-tar <tarSha256>`：从 git 对象重新构建，tar 的 sha256 一致才往客户机传。
- 构建可复现：tar 字节只由提交决定（排序、提交时间作 mtime、不带属主和主机信息）。2026-11-28 实测，arm64/Node 24 和 x86_64/Node 22 构建结果相同。gzip 层随 zlib 版本可能不同，所以批准的是 **tarSha256**；tgz 的 sha256 只用来核对传输。
- 打 tag、合并 dev 在观察期结束、协调人核对以后再做。

## 网络

**默认：客户机在海外。**
- 全部走官方源：registry.npmjs.org、nodejs.org、GitHub、Google（Gemini）、dl.google.com 的 Chrome apt 源、Cloudflare 的 GitHub releases。
- 不加任何镜像参数，也不需要部署包。
- 预检应该全部 `OK`，并显示 `INFO region … overseas network`。

**飞书还是 Lark。**
- 客户用 Lark（国际版）时，开发者后台在 `https://open.larksuite.com/app`，install.env 加 `FEISHU_DOMAIN=lark`。
- 渠道插件、lark-cli、`v-ctl feishu-check` / `feishu-owner` 都会改连 `open.larksuite.com`。权限清单和事件、回调与飞书相同。
- 预检两个都探测：只有 Lark 通时会提示。

### 备用：大陆网络

客户机在中国大陆时（预检会显示 `INFO region … mainland China`），常见的情况是：
- 连不上 Google、xAI、GitHub；
- 能连 npmmirror、飞书、DeepSeek；
- npmjs.org 和 nodejs.org 时通时不通。

这些情况都有对应的做法，`preflight.sh` 会自动判断，并告诉你该用哪个：

| 要的东西 | 正常来源 | 大陆做法 |
| --- | --- | --- |
| npm 包（OpenClaw、插件、工具） | registry.npmjs.org | `install.sh --registry https://registry.npmmirror.com`。同时记成 `V_NPM_REGISTRY`，agent 之后自己装 npm 包、升级时都沿用 |
| Node 22.23.1 | nodejs.org | `--node-mirror https://npmmirror.com/mirrors/node/v22.23.1/`（同一个文件，按 tools.json 的 sha256 校验），或部署包里的 Node |
| GitHub 上的全局技能 | codeload.github.com | 部署包里的 `skills/`：在能上 GitHub 的机器上按 skills.json 钉住的提交下载，安装时逐个文件按 sha256 校验 |
| Google Chrome（桌面接管） | dl.google.com 的 apt 源 | 部署包里的 `chrome/`：在能访问的机器上核对 Google 签名钥指纹、apt 元数据签名和 .deb 的 sha256 后下载 |
| cloudflared（公网链接） | GitHub releases | 部署包里的 `cloudflared/`：按 tools.json 的 sha256 校验 |
| 记忆向量检索 | Google（Gemini embedding） | 连不上就关：写进 `V_UNREACHABLE=google`，配置不用这个 key，记忆只按关键词检索 |
| xAI 看图、生图 | api.x.ai | 连不上就关：`V_UNREACHABLE=xai`。看图仍由 DeepSeek Flash 做 |
| Makaron、火山语音、Apify | 各自的服务 | 连不上就记进 `V_UNREACHABLE`；对应 skill 会如实说没开通 |

部署包由 `distro/build/offline-kit.sh` 在能访问上面这些站点的机器上生成：
- 一个目录，带 `SHA256SUMS`；
- 客户机上解到 `/opt/v-kit/<版本>`，安装时加 `--kit`；
- 安装器先核对 `SHA256SUMS`，之后补开桌面、升级时都沿用同一个部署包。

**「关掉了」怎么告诉老板**：
- 每次 configure 都会写 `~/.openclaw/v-capabilities.json`，列出每项能力是开还是关；关的写了原因和打开办法。
- 上手引导读它，用老板听得懂的话告诉他。
- 部署的 agent 在第 6 步也要当面说一遍。

## 密钥怎么走

- 所有 `_KEY`、`_SECRET`、`_TOKEN` 只存在客户机的 `/etc/v/secrets.env` 里（root 0600）。VSync 身份另放 `/etc/v/vsync.env`（root 0600）。
- **先全部用我们的 key**：
  - DeepSeek 来自 V 的 `~/.openclaw/vds-codex.env`；
  - Makaron、Google、xAI、火山、Apify 来自 V 的 `~/.openclaw/gateway.systemd.env`；
  - VSync 身份向 VSync 会话要。
- **写入方式**：部署的 agent 在 V 的主机上 `grep` 出这几行，用管道 `ssh` 到客户机，交给包里的 `install/put-secrets.py` 写入。原文不出现在屏幕、命令行参数、记录和报告里。具体命令见 RUNBOOK 第 3.3 步。
- **App Secret** 由客户管理员自己在客户机上用同一个脚本写入（粘贴，Ctrl+D）。
- **之后换成客户自己的 key**：客户运行 `sudo v-ctl put-secrets` 粘贴新值，然后 `sudo v-ctl reconfigure`，再按 RUNBOOK 第 8.6 步的表逐个确认。
- 执行部署的 agent 只用这几种方式「用」它们，都不打印值：
  - `grep -c` 核对每个 key 有几行，`stat` 看权限；
  - `v-ctl feishu-check` / `v-ctl feishu-owner` 用 App Secret 换一次令牌；
  - 安装器读文件。
- `install.sh` 和 `update.sh` 不会清掉 secrets.env 里已有的 key。所以安装用的 env 文件里可以完全不写 key。
- 备份文件里有 secrets.env，只存本机或客户自己的加密存储。

## 卸载

重装同一台机器前（比如演练），先卸载：

```bash
sudo v-ctl uninstall --dry-run --keep-config      # 先看计划，不改任何东西
sudo v-ctl uninstall --yes --keep-config          # 先在线备份到 /root/v-uninstall-<时间>/，再删
```

**会删的**：
- 网关、memory-indexer、桌面那三个和 cloudflared 的 systemd 单元，以及网关的 drop-in；
- `/opt/v`、`/var/lib/v-distro`、桌面的运行目录、`/usr/local/bin/v-ctl`、`/etc/cron.d/v-backup`；
- openclaw 用户和它的家目录：`~/.openclaw`（工作区、记忆、会话）、`~/.lark-cli`（老板的飞书授权）。
- 最后核对没有残留的进程、端口（网关、23950）和单元。

**选项**：
- `--keep-config`：保留 `/etc/v`。重装时 install.env 可以复用，secrets 要按 RUNBOOK 第 3.4 步重新核对。
- `--keep-backups`：保留 `/var/backups/v`。
- `--no-backup`：不做卸载前备份。

**不碰的**：
- 系统包（TigerVNC、XFCE、Chrome、cloudflared、git 等）、`/etc/default/google-chrome`、`/opt/v-kit` 下的部署包；
- 机器上任何不属于 V 的东西（比如首尔测试机上的旧服务、`/root/pre-distro-state`）；
- 飞书应用：不用动，重装后用同一个 App ID 和 Secret。

**老板的数据**：
- 工作区和记忆会随家目录删掉，但卸载前的备份里都有。
- 要不要保留、重装后要不要用 `v-ctl restore-backup` 放回来（见 README「备份与恢复」），先问 Tianyi。

## 演练

正式部署前，在一台全新的 Ubuntu 24.04 机器上（或者先按「卸载」清掉测试机上的旧 V），让一个只拿到本仓库和这两份文档的 agent 从第 0 步做到第 8 步。演练里遇到下面这些情况，都要补进 RUNBOOK：
- 手册没写、要靠「之前知道」的事；
- 命令和输出跟手册对不上的地方。

## 这次新加的工具

除 `release-build.sh`、`offline-kit.sh` 在仓库的 `distro/build/` 里，其余都在发行包里。

| 工具 | 做什么 |
| --- | --- |
| `distro/build/release-build.sh --tag … --expect-tar …` | 在部署者主机上从 tag 重新构建正式版本并核对 tarSha256（仓库里，不在包里） |
| `install/preflight.sh [--out FILE] [--env-file v.env]` | 系统和出网预检（含飞书、Lark）；判断海外或大陆；给出安装参数、需要的部署包、要关掉的能力；`--env-file` 把 `V_UNREACHABLE` 和 `V_NPM_REGISTRY` 写进 env 文件 |
| `install/put-secrets.py`、`v-ctl put-secrets` | 从标准输入把 `KEY=值` 写进 secrets.env（或 `--file /etc/v/vsync.env`），只打印 key 名 |
| `v-ctl uninstall --dry-run \| --yes [--keep-config] [--keep-backups]` | 先备份、再卸载，只删安装器建的东西 |
| `distro/build/offline-kit.sh <包> <目录>` | 生成部署包（Node、GitHub 技能、Chrome、cloudflared + SHA256SUMS） |
| `install.sh --kit DIR` / `update.sh --kit DIR` | 用部署包代替联网下载；记成 `V_KIT_DIR`，reconfigure 和 update 沿用 |
| `install/lib/fetch-chrome-deb.sh OUTDIR` | 不走 apt，按 Google 的签名元数据下载并核对 Chrome .deb |
| `v-ctl fetch-skill-sources --out DIR` | 下载 skills.json 钉住的 GitHub 技能源码包 |
| `v-ctl feishu-check` | App ID + Secret 能换到令牌、机器人已发布；不打印 Secret |
| `v-ctl feishu-owner --mobile/--email/--user-id/--union-id … [--write]` | 用这个应用换出老板的 open_id，写进 install.env |
| `v-ctl as-agent <命令>` | 以服务用户、在网关的环境里、在工作区目录跑一个命令（验收用） |
| `~/.openclaw/v-capabilities.json` | 每次 configure 写：哪些能力开、哪些关、为什么、怎么打开 |
