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
| `workspace/` | 去个人化的 V core + Mirror 上手引导 | **B 线** |

## 构建

```bash
pnpm install          # 拉 captured-store（postinstall），只需一次
node distro/build/build.mjs --release db91-lifecycle-proof-20261127 --version 2026.11.27-db91-lifecycle-proof.r1 --out dist-distro
```

只读已提交的内容：先提交，再构建。输出 `<pkg>.tgz`、`<pkg>.tgz.sha256`、`<pkg>.tgz.json`（含 `tarSha256`）。
B 线的工作区还没合进来时，用 `--workspace-ref <分支或提交>` 指过去。

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
