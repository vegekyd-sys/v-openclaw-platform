# V 发行包（v-distro）

把生产 V 的某个 release 打成一个可以装到别的机器上的包：客户单独部署（Ubuntu 24.04 + systemd + 原生飞书）
和沙盒版 Mirror V（mirror-v-portal 消费同一个包）共用。包的接口见 [CONTRACT.md](CONTRACT.md)。

这条线**不改** V 自己的发布流程：`promote-to-v.mjs`、VLab、捕获和哨兵照旧。它只读 `release/captured/` 和
`captured-store` 分支里已经捕获的 V 字节。

## 目录

| 路径 | 内容 | 归属 |
| --- | --- | --- |
| `build/build.mjs` | 从 git 对象构建 `v-distro-<ver>.tgz`（可复现） | A 线 |
| `build/lock.mjs` | 生成 `runtime/locks/<name>/` 的 npm 锁（要联网，不在测试里跑） | A 线 |
| `build/smoke/smoke.sh` | 在测试机上（ssh）跑 install / update / rollback 冒烟 | A 线 |
| `runtime/components.json` | 各部分怎么装、插件 id、锁的来源、脱敏规则、不进包的捕获 | A 线 |
| `runtime/tools.json` | Node 与 codex / makaron-cli / lark-cli 的钉死版本 | A 线 |
| `runtime/gateway.env` | V 的 Gateway 行为开关（无密钥） | A 线 |
| `runtime/locks/` | core、codex 插件、feishu 插件、三个工具的依赖锁 | A 线 |
| `install/` | install.sh / update.sh / rollback.sh / v-ctl、`lib/`、systemd 模板、`config/` 生成器 | A 线 |
| `workspace/` | 去个人化的 V core + Mirror 上手引导；包里只取 `payload/**` 和 `render.mjs` | **B 线** |

## 构建

```bash
pnpm install          # 拉 captured-store（postinstall），只需一次
node distro/build/build.mjs --release db91-lifecycle-proof-20261127 --version 2026.11.27-db91-lifecycle-proof.r1 --out dist-distro
```

只读已提交的内容：先提交，再构建。输出 `<pkg>.tgz`、`<pkg>.tgz.sha256`、`<pkg>.tgz.json`（含 `tarSha256`）。
B 线的工作区还没合进来时，用 `--workspace-ref <分支或提交>` 指过去（例如 `origin/claude/distro-workspace-cd7827`）。

构建时会：
- 逐个文件按捕获 manifest 校验 sha256；captured-store 上多出或少了文件都失败；
- 套用 `components.json` 的脱敏规则（V 的运行时代码里写死了 V 自己的飞书群 id，见下）；
- 扫描整个包里像密钥、飞书 open_id / chat id / app id 的串，有就失败。

## 安装（客户机器）

```bash
tar xzf v-distro-<ver>.tgz
cp v-distro-<ver>/install/v.env.example v.env && vi v.env      # 主人、模型 key、飞书应用
sudo v-distro-<ver>/install/install.sh --env-file ./v.env --probe
# 国内网络：--registry https://registry.npmmirror.com --node-mirror https://npmmirror.com/mirrors/node/v22.23.1/
```

装好后：`v-ctl status`、`v-ctl health`、`v-ctl probe`、`v-ctl openclaw <命令>`（以服务用户和服务环境跑 OpenClaw CLI）、
`v-ctl pair <code>`（老板第一次私聊机器人时批准配对）。

升级：在新包里跑 `sudo v-distro-<new>/install/update.sh --probe`；回退：`sudo /opt/v/current/install/rollback.sh`。
语义见 CONTRACT.md 第 5 节。

## 可选组件

都在 env 文件里打开（`install/v.env.example`），不打开时什么都不装、不配。

| 组件 | 打开方式 | 客户机需要 | 做不到的 |
| --- | --- | --- | --- |
| 桌面接管 + computer use | `V_DESKTOP=1` | amd64；约多占 0.5–1 GB 内存；能访问 dl.google.com 和 Ubuntu 软件源。显示器是 Xtigervnc，无界面机器不需要 Xvfb 或显卡 | 接管链接默认只在本机能打开（`http://127.0.0.1:23950`，可以用 `ssh -L 23950:127.0.0.1:23950` 访问）。要在内网或公网打开，需要客户自己的反向代理或隧道，再设 `V_PUBLIC_ORIGIN` |
| 语音消息转文字 | `VOLCENGINE_API_KEY` | 火山新版控制台的 key，并开通「录音文件识别极速版」；能访问 openspeech.bytedance.com | — |
| VSync | `install.sh --vsync-env <file>` | Portal 签发的身份文件，由人带外交付；能用 HTTPS 访问 mirror-v-portal.vercel.app | 要等 Portal 那边启用；启用前 `mirror-vsync.py whoami` 返回 `VSYNC_DISABLED` |

VSync 身份文件也可以直接放到 `/etc/v/vsync.env`（root 0600，只含 `NEXUS_VSYNC_URL`、`NEXUS_VSYNC_AGENT`、`NEXUS_VSYNC_TOKEN`），之后 `sudo systemctl restart openclaw-gateway` 才会进 agent 的环境。不要放进 `secrets.env`：那份文件每次 install/update 都会按 env 文件重写。验收：以 openclaw 用户、在网关环境里运行 `python3 <工作区>/scripts/mirror-vsync.py whoami`，应返回自己的 agent id 和 counterparts `["private-v"]`。

- 控制链接是不记名的，谁拿到都能接管桌面。所以客户版用 `controlAnywhere:false`：主人在群里要链接时，链接通过私聊发给他（V 本身是 true）。
- Chrome 只从 Google 官方 apt 源装：先核对签名钥主指纹 `EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796`，apt 用 `signed-by` 只信这把钥匙。机器上已有的 chromium 和 playwright 浏览器不会被用到。

## 飞书、lark-cli 与 agent 名字

- lark-cli 用 `~/.lark-cli/config.json` 独立运行；configure 用 `config init --app-secret-stdin` 写这个文件，运行时不带任何 OpenClaw 环境变量。
  原因：环境里有 `LARKSUITE_CLI_APP_*` 时，lark-cli 会禁用 auth 命令，也拿不到应用令牌；有 `OPENCLAW_*` 时，它会要求先 `config bind`，并把配置写到另一个 profile 目录，B 线的脚本读不到。
  `/opt/v/bin/lark-cli` 和 B 线的 `feishu-docs.py` 会去掉同一批变量。
- B 线工作区靠 `LARKSUITE_CLI_APP_ID/SECRET/CONFIG_DIR` 判断有没有绑定飞书应用，由 `/etc/v/lark.env` 提供给 Gateway（agent 的 exec 会继承）。缺了这个文件，上手引导会说「接不上飞书」。
- 群聊（主人的 task room）：填了 `V_OWNER_FEISHU_OPEN_ID` 时，群里只有主人的消息会进来，不用 @（`groupPolicy: open` + `groupSenderAllowFrom: [主人]` + `requireMention: false`）。
  注意：这个插件里 `groupAllowFrom` 按群的 chat_id 放行、`groupSenderAllowFrom` 按发送人放行，把 open_id 写进 `groupAllowFrom` 会挡住所有群。没填主人时群聊关闭。
- 卡片页脚显示的名字来自 `V_AGENT_NAME`（默认 `V`）。内部 agent id 仍是 makaron（见 CONTRACT 第 4 节）；`V_OWNER_NAME` 等配置不受影响。

## 依赖与 V 一致的证据（2026-11-27）

- core：`lock.mjs core-openclaw openclaw@2026.9.1 --before 2026-09-04T13:00:00Z` 解出的依赖，与 V
  `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/node_modules` **310/310 个包版本相同**，
  锁里多出的 41 个只是其他平台的可选原生包。
- feishu：同法（`--before 2026-09-09T04:00:00Z`），与 V 的 feishu 目录 **85/85 相同**（依赖是 bundleDependencies）。
- codex 插件与 codex CLI 的锁直接从 V 拷来（`~/.openclaw/npm/projects/openclaw-codex-…`、`/opt/codex-0.169.1-v`）。
- `runtime/ops/` 的三个脚本与 V 上 `/opt/v-sentinel`、`/opt/v-ops` 里的文件 sha256 相同。

## V 字节里的个人内容

- `gpt-live-call-lifecycle.mjs`（core，V 的语音）写死了 V 自己的飞书群会话 key。构建时把群 id 换成
  `oc_redacted_by_v_distro`，manifest 记下原 sha256 和新 sha256。语音不在包里，这个 key 永远不会命中。
- `v-session-relay` 的 `ownerName` 默认 `"Tianyi"`，配置生成器用 `V_OWNER_NAME` 覆盖。
- Worker 插件很多地方默认 agent id `makaron`，所以发行包的内部 agent id 也是 `makaron`（用户看不到）。

## 装的时候踩到的 V 的结构

- V 的 core 用相对路径 `../../npm/projects/openclaw-feishu-…/node_modules/@openclaw/feishu/…` 引用飞书插件
  （V 的 release 目录里有一个同名符号链接）。不管飞书开不开，缺这个链接 Gateway 都起不来。安装器会扫描
  core 覆盖层里所有这种引用并建同样的链接，引用了包里没有的包就失败。
- V 的 `core/` 就是 openclaw 包本身、依赖在 `core/node_modules`；Worker 直接解析 `openclaw/node_modules/<依赖>`，
  npm 默认把依赖提升到外层会让 Worker 的第一轮就报 Cannot find module。安装器 `npm ci` 到临时目录后按 V 的布局摆放。
- 2026.9.1 第一次启动会从 npm 装“配置里提到但缺的”官方 provider 插件（如 `@openclaw/deepseek-provider`、
  `@openclaw/vercel-ai-gateway-provider`，版本跟宿主一致），然后以退出码 1 要求重启一次；systemd 的
  `Restart=always` 会自动重启，`install.sh` 的健康检查等得住。用 `--registry` 时这些安装也走同一个源。

## 测试

```bash
node --test distro/build/build.test.mjs distro/install/lib/release.test.mjs distro/install/config/openclaw-config.test.mjs
```

在 `pnpm test` 里登记为 `v-distro` 套件（`platform/catalog.json`）。全部离线：临时 git 仓库 + 假捕获。

**不要在工作站上起 Gateway 或用 Docker 跑 x86 模拟**：2026-11-27 这样做把一台 24 GB 的 Mac 拖死了，而且
模拟下 systemd 根本启动不了服务。安装冒烟只在测试机上跑：`distro/build/smoke/smoke.sh <ssh 主机> install …`。

## 验收记录（2026-11-27，release `db91-lifecycle-proof-20261127`）

测试机：腾讯云 Ubuntu 24.04.4 x86_64、4 核 7 GB（非全新系统，旧数据未动；Node 用安装器自己下载的）。
模型：`V_MODEL_PRESET=vercel`（Vercel AI Gateway 上的 DeepSeek V4.1 Flash）；飞书用假的应用 id/secret 只验证插件加载。

| 步骤 | 结果 |
| --- | --- |
| 构建 | 4.9 MB、514 个文件；同一提交构建两次 tgz sha256 相同 |
| 从零安装 `install.sh --probe` | 116 s 完成：apt → Node → 校验包 → npm ci → 覆盖层 → systemd → 首次启动装官方插件并自动重启 → 健康 55 s → 飞书盖上 V 的 11 个文件后重启 → 首个记忆索引 → **真实模型调 exec、看到工具输出、最终回复**（Worker 运行时，6.2 s） |
| 飞书插件 | 从 OpenClaw 自己装的官方副本加载（可信），盖上 V 字节后通道启动 WebSocket；没有 trusted-plugins 报错。真实收发要客户的应用 |
| `update.sh --probe`（r6 → r7） | 快照 → 换版本 → 健康 12 s → r6 的会话历史还在 → 工作区与 memory 文件逐个 sha256 不变 → 新一轮真实回合通过 |
| `rollback.sh`（r7 → r6，同 schema 只换代码） | 健康 → r6、r7 两轮会话都在 → 工作区不变 |
| 升级失败自动回退（`V_DISTRO_TEST_FAIL=health`） | 回到 r6 + 恢复快照 → 健康 → 历史在 → `previous` 恢复成升级前的目标 → 两个服务 active |

没覆盖到的：`V_MODEL_PRESET=deepseek` 下的 /vds（Codex harness，需要 DeepSeek key，codex 官方插件的覆盖路径因此没在真机上走过）；
真实飞书收发；国内网络下的 `--registry`/`--node-mirror`；可选组件（desktop、vbrowser、voice）。

### 测试机说明与「没有借用旧环境」的证明（2026-11-27 18:08 CST，版本 `2026.11.27-db91-lifecycle-proof.1`，提交 f5818332）

测试机是**非全新系统**：腾讯云首尔轻量服务器「V from Versa」，Ubuntu 24.04.4 x86_64，4 核 8G。
机器上原有的 OpenClaw 服务都已停用，没有删除，恢复步骤见机器上的 `/root/pre-distro-state/RESTORE.md`。
安装器没有碰这些旧数据：`/root/.openclaw`、`/root/makaron-openclaw`、`/opt/vlab`、root 的 nvm（node v22.22.1）、
`/home/ubuntu/.cache/ms-playwright`。

- 发行包装的是**系统级** `/etc/systemd/system/openclaw-gateway.service`（User=openclaw）。root 下另有一个同名的**用户级**
  unit（`/root/.config/systemd/user/openclaw-gateway.service`），处于 disabled 状态，与这个包无关；排查时看
  `systemctl`，不要看 `systemctl --user`。
- Gateway 进程 `/proc/<pid>/exe` 是 `/opt/v/node/v22.23.1/bin/node`（v22.23.1，安装器按 sha256 校验后下载的）；
  openclaw 用户的全部 5 个 node 进程都是这一份。
- 进程环境里的 PATH 是 `/opt/v/bin:/opt/v/node/current/bin:/home/openclaw/.local/bin:/home/openclaw/.npm-global/bin:/usr/local/bin:/usr/bin:/bin`，
  不含 `.nvm`；`/usr/local/bin` 里也没有 node、npm 或 chromium；openclaw 用户读不了 `/root`；Gateway 没有打开任何 `/root` 下的文件。
- 没有用机器上的 chromium 或 playwright：进程环境里没有相关变量，也没有起 chromium 进程。浏览器能力不在这次验收里。
- 旧服务（openclaw-vlab-gateway、openclaw-dashboard、openclaw-memory-auto-index、nginx）仍是 inactive / disabled。

### 补 `@openclaw/ai` 覆盖层后重装（2026-11-27 19:05 CST，版本 `2026.11.27-db91-lifecycle-proof.2`，提交 d319ecac）

先卸载再从零重装：94 s，真实模型 → exec → 最终回复通过（9.2 s）。
测试机上 `core/node_modules/@openclaw/ai/dist` 的 4 个文件与 V 的 sha256 一致（c7957572 / 915ac13d / a66edfc5 / 7d7ae7a8）；
整个 `core/node_modules` 的 24,861 个文件与 V **0 个不同**。Gateway 仍用 `/opt/v/node/v22.23.1`，进程环境里没有 nvm。
这个安装保留在测试机上，给飞书上手验收用。

### 只打包 `workspace/payload` 后重装（2026-11-27 20:21 CST，版本 `2026.11.27-db91-lifecycle-proof.3`，提交 ed8f1093）

工作区取自 B 线 `origin/claude/distro-workspace-cd7827` @ 59bf9d55（`vCoreCommit` 09f4aa59）。包 678 个文件，`tarSha256` 201606d7…；
包里没有 B 的 `tests/`、`build.mjs`、`sync.mjs`，密钥扫描通过。先卸载再从零安装：74 s，探针（真实模型 → exec → 最终回复）通过。
种下的工作区 16 项，渲染了 12 个文件，剩下的 `@@X@@` 为 0，首个提交 `seed: v-distro …proof.3`。
用包里的生成器出 sandbox 配置：`gateway.reload = {mode:"off"}`，`tools.deny` 含 `message`。
Gateway 仍是 `/opt/v/node/v22.23.1`、进程环境无 nvm；4 个 `@openclaw/ai` 文件与 V 的哈希一致；两个服务 active，保留给飞书验收。
