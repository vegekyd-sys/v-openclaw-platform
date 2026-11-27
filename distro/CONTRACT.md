# V 发行包接口（v-distro/1）

三条线照这份对接：A 线（`distro/build`、`distro/runtime`、`distro/install`）产包和安装，
B 线（`distro/workspace/`）产工作区，C 线（mirror-v-portal）在沙盒里消费同一个包。
改这份文件要在“变更记录”里写一行，并告诉协调会话。

## 1. 包

```
v-distro-<version>.tgz              解开后是一个目录 v-distro-<version>/
  manifest.json                     见第 2 节；包里其余每个文件都列在 files[] 里
  runtime/core/                     release/captured/<rel>/ 的 manifest.json + dist/**（覆盖层，不是完整 openclaw）
  runtime/core-ai/                  V 改过的 core 依赖 @openclaw/ai 的 4 个文件（见下「发行包自带的覆盖层」）
  runtime/worker/                   <rel>.worker   的 manifest.json + dist/**（vlab-agent-worker-isolation 插件目录）
  runtime/codex/                    <rel>.codex    的 manifest.json + dist/**（完整 @openclaw/codex 包文件）
  runtime/feishu/                   <rel>.feishu   的 manifest.json + dist/**（完整 @openclaw/feishu 包文件）
  runtime/session-relay/            <rel>.session-relay 的 manifest.json + dist/**（v-session-relay 插件目录）
  runtime/locks/<name>/             package.json + package-lock.json：core、codex、feishu 和三个工具的 npm 依赖树
  runtime/components.json           各部分怎么装（覆盖层 / 整包替换 / 插件目录）、插件 id、锁的来源
  runtime/tools.json                Node 与 CLI 工具的钉死版本和校验和
  runtime/gateway.env               V 的行为开关（DB91、Worker 亲和等，无密钥），装进 systemd
  workspace/                        B 线 distro/workspace/payload/** 的内容（只有 payload，B 的工具和测试不进包；没有时为空目录，manifest 里 workspace=null）
  runtime/workspace-render.mjs      B 线的 distro/workspace/render.mjs：首次种工作区时填 @@WORKSPACE@@ 等占位符
  config/openclaw-config.mjs        openclaw.json 生成器，profile=standalone | sandbox
  optional/optional.json            可选组件（desktop、vbrowser、voice）；v0 只登记，不带字节
  install/install.sh update.sh rollback.sh v-ctl v.env.example lib/ systemd/
  runtime/ops/                      V 的记忆实时索引器与 Codex 孤儿登记清理（scripts/ 里与 V 同字节的文件）
```

`<rel>.dingtalk`、`.wecom`、`.meeting-bridge` 是 V 自己的渠道和会议桥，不进包（manifest `notIncluded` 里列出）。

### 发行包自带的覆盖层（`distro/runtime/overlays/<rel>/<component>/`）

平台捕获只覆盖 core 的 `dist/`，不含 `node_modules`。V 还改过 core 依赖里的文件：
2026-11-27 把 V 的 `core/node_modules` 全部 24,861 个文件与同一把锁 npm 装出来的逐个比 sha256，**只有 `@openclaw/ai` 的 4 个文件不同**：

| 文件 | V 的 sha256 | 说明 |
| --- | --- | --- |
| `openai-completions-stream-DZjwK8vp.mjs` | a66edfc5… | #568：工具调用写成文本（DSML）时的修复 |
| `openai-completions-D0QZ0AyB.mjs` | 915ac13d… | |
| `openai-chatgpt-responses-BAJ4gq3i.mjs` | c7957572… | |
| `transports.mjs` | 7d7ae7a8… | |

这些字节从 V 只读拷来，放在 `distro/runtime/overlays/<rel>/core-ai/`（字节在 `files/` 下，因为仓库 .gitignore 忽略所有 dist/；manifest 格式和平台捕获一样，
每个文件带 npm 上游的 `baseSha256`），打包进 `runtime/core-ai/`，安装时盖在 `core/node_modules/@openclaw/ai/dist` 上，
上游字节不对就失败。**发新 release 时必须重新核对**：`components.json` 里 `source: "distro"` 的组件在
`overlays/<新 rel>/` 下找不到就构建失败，不会悄悄漏掉。同一次核对里，core 的 `dist/` 8,619 个文件、
包里其余 847 个文件都与 V 相同（`dist/` 只有脱敏那一个文件不同）。

### 可复现

`node distro/build/build.mjs --release <rel> --version <ver> [--source <commit>] [--workspace-ref <ref>]`

- 所有输入都从 git 对象读：`--source` 提交（默认 HEAD）里的 `distro/` 与 `release/captured/<rel>*/manifest.json`，
  `captured-store` 分支里的 `dist/` 字节，`--workspace-ref`（默认同 `--source`）里的 `distro/workspace/`。
  工作区里没提交的改动不会进包。
- tar 条目按路径排序，uid/gid 0，mtime 取 `--source` 提交的时间，权限只有 0644/0755；gzip 头 mtime=0、OS=255。
- 同样的输入在同一台机器上给出同样的 `.tgz` sha256。**跨平台的身份是未压缩 tar 的 sha256**（`tarSha256`），
  因为不同 zlib 的 deflate 字节可能不同。构建输出和 `<pkg>.tgz.json` 里两个都有。
- 每个捕获文件在打包时按它的 `manifest.json` 校验 sha256，不对就失败。

## 2. manifest.json

```jsonc
{
  "schema": "v-distro/1",
  "version": "<ver>",
  "release": "<rel>",                       // V 的 release 名，与 release/captured/<rel> 一致
  "upstream": { "openclaw": "2026.9.1", "node": "22.23.1" },
  "openclawSchema": { "state": 15, "agent": 19 },   // 决定回滚能否只换代码（第 5 节）
  "source": {
    "repo": "vegekyd-sys/v-openclaw-platform",
    "commit": "<40 位>", "commitTime": "<ISO>",
    "capturedStore": "<captured-store 提交>",
    "workspace": { "ref": "...", "commit": "<40 位>", "tree": "<distro/workspace/payload 树 sha>", "vCoreCommit": "<V_CORE_COMMIT>" | null } | null
  },
  "components": {
    "core":          { "dir": "runtime/core", "capture": "<rel>", "install": "overlay", "base": "openclaw@2026.9.1", "lock": "core-openclaw", "files": 233, "captureSha256": "..." },
    "worker":        { "dir": "runtime/worker", "capture": "<rel>.worker", "install": "plugin-dir", "pluginId": "vlab-agent-worker-isolation", ... },
    "codex":         { "dir": "runtime/codex", "install": "state-overlay", "package": "@openclaw/codex", ... },
    "feishu":        { "dir": "runtime/feishu", "install": "npm-package", "stateOverlay": true, "package": "@openclaw/feishu", "lock": "feishu-plugin", ... },
    "session-relay": { "dir": "runtime/session-relay", "install": "plugin-dir", "pluginId": "v-session-relay", ... }
  },
  "tools": { ...runtime/tools.json },
  "notIncluded": [ { "capture": "<rel>.dingtalk", "reason": "..." }, ... ],
  "files": [ { "path": "runtime/core/dist/...", "sha256": "...", "bytes": 123, "mode": "0644" }, ... ]
}
```

`captureSha256` = 该捕获 `manifest.json` 文件的 sha256，用来和 V 的哨兵/parity 对照。

## 3. 安装后的布局（standalone）

```
/opt/v/node/v<node>/                    Node（tools.json 校验过的官方包）
/opt/v/tools/<name>-<version>/          codex、makaron-cli、lark-cli（各自 npm ci 自己的锁）
/opt/v/bin/                             服务 PATH 第一项：codex、makaron（链接）；lark-cli（小脚本：去掉 OPENCLAW_*、HERMES_*、LARKSUITE_CLI_APP_*，用 ~/.lark-cli/config.json 独立运行）；
                                        openclaw（当前版本的 OpenClaw CLI，agent 的 exec 用它，B 线的 v-schedule.py 靠它建定时任务）
/opt/v/releases/<version>/              解开的包 + 装好的依赖，root 所有，服务只读
    core/                               openclaw@<upstream> 包本身（依赖在 core/node_modules，与 V 同布局），dist 上叠覆盖层
    npm/projects/<V 的项目名>/...        V 的 core 按相对路径引用的插件（符号链接到 plugins/ 下）
    plugins/worker  plugins/session-relay       V 自己的插件，按 plugins.load.paths 加载
    plugins/feishu/node_modules/@openclaw/feishu   只给 V 的 core 按相对路径引用（见上一行）
    .installed.json                     装完写，update/rollback 认它
/opt/v/current -> releases/<version>    systemd 只认 current
/opt/v/previous -> releases/<old>
/etc/v/install.env                      非密钥输入（主人名、时区、profile、可选开关），0644
/etc/v/secrets.env                      密钥（模型 key、飞书 app secret、Gateway token），0600 root
/etc/v/lark.env                         有飞书时由 configure 写：LARKSUITE_CLI_APP_ID/SECRET/CONFIG_DIR（B 线工作区读的接口），0600 root
/etc/v/vsync.env                        install.sh --vsync-env 装的 Portal 身份（NEXUS_VSYNC_URL/AGENT/TOKEN），0600 root
/etc/v/cloudflared.env                  有 CLOUDFLARE_TUNNEL_TOKEN 时由 configure 写：TUNNEL_TOKEN（v-cloudflared.service 读），0600 root
/etc/v/desktop-handoff/                 V_DESKTOP=1：接管链接服务的 config.json 和 admin-token（root:openclaw 0640）
/home/openclaw/.lark-cli/config.json    lark-cli 自己的配置（应用 id + secret，0600 openclaw）；主人授权后的用户 token 也在这里
/home/openclaw/.openclaw/               状态：openclaw.json（生成）、库、会话、记忆索引
/home/openclaw/.openclaw/npm/projects/  OpenClaw 自己从 npm 装的官方插件（feishu、codex、provider）；
                                        安装器把 V 捕获的包文件盖上去（vctl overlay-plugins），升级/回退时换成目标版本的字节
/home/openclaw/.openclaw/workspace/     工作区：首次安装从包里 workspace/ 种下，之后不再覆盖
/var/backups/v/<time>-<version>/        update 前的状态快照
v-gateway.service                       User=openclaw，ExecStart 指 /opt/v/current
```

服务用户叫 `openclaw`、HOME `/home/openclaw`，与 V 一致，这样 V 的插件、Worker 派生配置里的默认路径不用改。

### 官方插件为什么不按路径加载

按 `plugins.load.paths` 加载的插件 origin 是 "config"，2026.9.1 不给它可信插件的能力：飞书通道会报
`openChannelIngressQueue is only available for trusted plugins` 后反复重启。V 自己也是这样跑的：codex 在
`~/.openclaw/npm/projects/openclaw-codex-…` 里，字节是 V 改过的。所以发行包让 OpenClaw 第一次启动时自己从 npm 装
官方插件（版本跟宿主一致，走 `--registry` 同一个源），再由 `vctl overlay-plugins` 把 V 的捕获字节盖上去（保留它的
node_modules，换完逐文件核对），然后重启一次。版本不是捕获对应的上游版本就拒绝。

## 4. 配置生成器（config/openclaw-config.mjs）

`node config/openclaw-config.mjs --profile standalone|sandbox --release-dir <dir> --env-file /etc/v/install.env`
输出 openclaw.json 到 stdout。**只写环境变量引用（`${NAME}`），从不内联值**；生成器读环境只为判断某个可选 provider 有没有配。

| 输入（环境变量名） | 必需 | 用途 |
| --- | --- | --- |
| `V_OWNER_NAME` | 是 | 主人称呼，写进 `install.json` 给工作区用 |
| `V_MODEL_PRESET` | 否，默认 `deepseek` | `deepseek`（DeepSeek 直连，同 V：`/vds` Codex + Worker）或 `vercel`（Vercel AI Gateway 上的 DeepSeek，仅 Worker） |
| `DEEPSEEK_API_KEY` / `AI_GATEWAY_API_KEY` | 按 preset 二选一 | 模型 key（secrets.env） |
| `OPENCLAW_GATEWAY_TOKEN` | 安装器生成 | Gateway 鉴权（secrets.env） |
| `FEISHU_APP_ID` + `FEISHU_APP_SECRET` | 否 | 有就开原生飞书通道（websocket 长连接）；没有就不开 |
| `V_OWNER_FEISHU_OPEN_ID` | 否 | 有：私聊白名单 + owner；没有：私聊走 pairing，老板第一次发消息后 `v-ctl pair <code>` |
| `GOOGLE_API_KEY` | 否 | 记忆向量检索（gemini-embedding）；没有就只用关键词（trigram FTS） |
| `XAI_API_KEY` | 否 | 看图/生图模型 |
| `V_WORKERS_MAX` | 否，默认 4 | Worker 池上限（V 是 24，一人用的机器 4 够） |
| `TZ` | 否，默认 `Asia/Shanghai` | |
| `V_AGENT_NAME` | 否，默认 `V` | 飞书卡片页脚等处显示的名字（`agents.entries.makaron.identity.name`）。内部 agent id 固定为 makaron：V 的 Worker 插件按它兜底，Heartbeat 的流式守卫也认 `agent:makaron:cron:*` |
| `VOLCENGINE_API_KEY` | 否 | 语音消息转文字，和 V 一样用火山「录音文件识别极速版」；没有就不转写 |
| `V_DESKTOP` | 否 | `1`：桌面接管与 computer use（TigerVNC + XFCE 的 :99、Google 官方源的 Chrome、接管链接、cua node、`computer` 工具），只支持 amd64 |
| `CLOUDFLARE_TUNNEL_TOKEN` | 否 | Cloudflare Zero Trust tunnel 的 token：装 cloudflared（V 的版本，按 sha256 校验）并起 `v-cloudflared.service`；路由在 Cloudflare 后台配 |
| `V_NIGHTSHIFT_URL` | 否 | 在跑的夜班服务地址：打开 core 自带的 workboard 和 V 的 nightshift-feishu 插件（`vplugins/nightshift-feishu`，0.1.4，与 V 同字节） |
| `V_PUBLIC_ORIGIN` | 否 | 接管链接的对外地址。不设时为 `http://127.0.0.1:23950`，只能在本机打开；需要反向代理或隧道把 `/desktop-handoff` 转到 127.0.0.1:23950 |

默认模型和 V 相同：`deepseek` 预设，主模型 `deepseek/vds-deepseek-flash`（Codex harness），回落到 Worker 的 `deepseek/deepseek-flash`，直连 DeepSeek 官方 API；
压缩用 Worker 插件带质量检查的 `versa-fast-quality-v1`，最多重试 1 次。缺 `DEEPSEEK_API_KEY` 时 configure 报错，不会静默换成别的模型。`V_MODEL_PRESET=vercel` 是可选项。

`sandbox` profile 给 C 线：不开渠道（`OPENCLAW_SKIP_CHANNELS`）、不开原生 cron（沙盒睡着时不跑定时器）、
禁用 `message` 工具（没有渠道时它发到 internal-ui，图和文字都会丢）、`gateway.reload.mode: off`（沙盒里不热重载）、
Gateway 只绑回环，其余（模型、Worker、记忆、harness）与 standalone 相同。C 线可以再在输出上合并自己的插件。

## 5. update / rollback 语义

- `update.sh <new.tgz>`：校验包 → 解到 `releases/<new>` 并装依赖（不停服务）→ 停服务 → 状态快照到
  `/var/backups/v/` → 换 `current`、重新生成 openclaw.json → 起服务 → 健康检查 + 历史仍在的检查。
  任何一步失败自动回到旧版本（代码 + 快照）。工作区、会话、记忆、密钥不动。
- `rollback.sh`：`current` 换回 `previous`。两版 `openclawSchema` 相同时只换代码（保留升级后的新会话）；
  不同时必须带 `--restore-state <快照>`，否则拒绝（新版本迁移过的库旧代码不一定能读）。
- 工作区只在首次安装时种下：复制包里的 `workspace/`，用 `runtime/workspace-render.mjs` 填占位符（WORKSPACE、AGENT_ID、STATE_DIR、TIMEZONE，
  有剩下的就失败），再 `git init` 提交。之后的更新不碰工作区：新包里工作区的变化不自动合进来（对比命令还没做）。

## 6. 不进包、不进 git 的东西

密钥、`.env`、会话、记忆库、浏览器 profile、V 的个人内容（主人、群、open_id、V 自己的工作区）。
`config/` 生成器的输出只有 `${NAME}` 引用；包构建时扫描所有文本文件，发现像密钥的串就失败。

## 变更记录

- 2026-11-27 v-distro/1 初版（A 线）。与协调会话给的 v0 草案的差别：
  `runtime/locks/`、`runtime/components.json`、`runtime/gateway.env`、`runtime/ops/` 是新增的；
  codex/feishu 不按路径加载，盖在 OpenClaw 自己装的官方插件上（见第 3 节）；core 按 V 的布局摆放；
  `optional/` v0 只登记不带字节；tgz sha256 只在同平台可复现，跨平台以 `tarSha256` 为准。
- 2026-11-27 18:40 加 `runtime/core-ai/`（V 改过的 4 个 `@openclaw/ai` 文件，来源 `distro/runtime/overlays/`）；sandbox profile 禁用 `message`。
- 2026-11-27 20:20 `workspace/` 只取 `distro/workspace/payload/**`（B 线接口），`render.mjs` 作为 `runtime/workspace-render.mjs` 一起打包、种工作区时渲染占位符；
  manifest 记 `vCoreCommit`；sandbox profile 加 `gateway.reload.mode: off`；去掉了没实现的 `v-ctl workspace-diff`。
- 2026-11-27 23:10 `/opt/v/bin` 加 `openclaw` CLI 和 lark-cli 的环境变量映射（B 线工作区要求）。
- 2026-11-27 23:50 加可选组件（`V_DESKTOP`、`VOLCENGINE_API_KEY`、`--vsync-env`）；lark-cli 改为用自己的配置文件独立运行，B 线读的 `LARKSUITE_CLI_*` 由 `/etc/v/lark.env` 提供；V 的压缩设置；显示名 `V_AGENT_NAME`（内部 id 仍是 makaron）。
- 2026-11-28 01:20 去掉 Scene（Tianyi 定）；加可选的夜班插件（`V_NIGHTSHIFT_URL`）和 Cloudflare 隧道（`CLOUDFLARE_TUNNEL_TOKEN`）；`vplugins` 列表移到 components.json，可以钉到本仓库的旧提交并带逐文件 sha256；`v-ctl reconfigure` 用来应用安装后补上的配置。
