> 本文是 [v-de-openclaw-review.md](../v-de-openclaw-review.md) 的附录，2026-11-20 由只读 review 生成。文中写的 `scratchpad/...` 是当时的临时工作副本（V rollout、dist 拷贝、candidate 抓包），已经删除；需要时用 `lab/candidate/v-prompt-capture.mjs` 或只读读 V 重新取得。
>
> **更正**（以正文为准）：DeepSeek 路径（/vds、/deepseek）和 /vcc 每次请求都带全量工具 schema（/vds 43 个、约 2.4 万 token），只有 /vcodex 按需加载。下文说「Codex 路径大多数工具描述不进每轮」只对 /vcodex 成立。/vcc 的系统提示已经实测抓到，走的是 stdin `initialize.appendSystemPrompt`。

# V「去 OpenClaw 化」清单：V 自有部分里的 OpenClaw 语境

2026-11-20 只读 review。没有改文件，也没有连 V。

## 0. 口径与说明

- 统计词：`OpenClaw` / `openclaw` / `Gateway` / `gateway` / `ClawHub` / `docs.openclaw`（不区分大小写，`gateway` 只按单独成词统计）。另外人工补查了中文「网关」和龙虾符号 🦞。
- token 估算：中文 1.5 字符≈1 token，其余 4 字符≈1 token。
- **功能性**：命令名（`openclaw config set`）、路径（`~/.openclaw/...`、`/home/openclaw`、`makaron-openclaw/.openclaw-local`）、配置键（`gateway.*`）、插件 id、工具名（`openclaw_end_call`）、浏览器 profile 名 `openclaw`、Unix 用户 `openclaw`、日志串 `[gateway] ready`，以及描述真实 OpenClaw 产品或客户 OpenClaw 实例的地方。这些改名会坏，只能改周围的叙述。
- **纯语境**：身份、自我介绍、章节标题、「OpenClaw 运行时 / 凭据库 / Gateway 主机」这类叙述用法，可以直接改。
- 本地拷贝里的技能数量和你给的数字不同：`skills/` 有 290 个，`.agents/skills/` 有 32 个，共 322 个（你给的是 298 + 34）。以下统计都按本地拷贝。
- **注入时机**（按 OpenClaw 2026.9.1 加 V 的 dist 补丁的行为推断）：
  - `AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`MEMORY.md` 是 bootstrap 文件，**每轮注入**。
  - vlab-worker（/deepseek 等）和 claude-cli（/vcc）里，它们放在系统提示的 Project Context 段。
  - Codex 插件（/vds、/vcodex）里分三处：
    - `AGENTS.md` 由 Codex 原生加载，或放进「## OpenClaw Agent Workspace Instructions」。
    - `SOUL/IDENTITY/USER/MEMORY` 放进 developer instructions 的「## OpenClaw Agent Soul」。`MEMORY.md` 能进来是 V 的补丁 `v-bootstrap-memory-everywhere-v1` 的作用。
    - `TOOLS/HEARTBEAT` 放进每轮用户提示前的「OpenClaw runtime context for this turn」。
  - `REDLINES.md` 和 `PROJECTS.md` **不会自动注入**。AGENTS.md 的 Boot Sequence 要求新会话一开始读，所以实际是「每个新会话读一次」。
- 可见性：工作区文件和技能都**只对模型**可见（模型转述时用户才会看到）。卡片、错误兜底、页面文案才是**用户可见**。

---

## 1. 总览：OpenClaw 语境从哪来（按每轮影响排序）

| 排名 | 来源 | 是否 V 自有 | 每轮规模 | 说明 |
|---|---|---|---|---|
| 1 | Codex 插件固定的 developer instructions 和段标题 | 上游代码，但在 V 的 dist 捕获里，V 可以打补丁 | 每轮约 150–250 token 的 OpenClaw 字样，外加 4 个以「OpenClaw」开头的段标题 | /vds、/vcodex 是主力 runtime。第一句是 "You are a personal agent running inside OpenClaw…"；身份文件被包在「## OpenClaw Agent Soul」里，前言说 OpenClaw 加载的文件就是 "who you are"。见附录 A |
| 2 | 技能目录（322 个技能 × name/description/location） | V 自有 | 整个目录约 26.5k token。description 或 name 带 OpenClaw/Gateway 的有 10 个，合计约 640 token | location 路径里都有 `makaron-openclaw/.openclaw-local`，每轮约 640–960 处 `openclaw` 字样（功能性路径，见第 3 节） |
| 3 | `TOOLS.md` | V 自有 | 每轮约 5.5k token，69 处 | 大部分是运维说明（重启、改配置、凭据路径） |
| 4 | `/vds` 的模型目录 `v-deepseek-model-catalog.json` 的 `instructions_template` | V 自有 | 每轮约 4.2k token | 没有 OpenClaw 字样，但第一句是 "You are a coding agent running in the Codex CLI…"，和「我是 V」直接冲突 |
| 5 | `MEMORY.md` 热区 | V 自有 | 每轮约 1.9k token，17 处 | 有 "V is Tianyi's AI partner **inside OpenClaw**"，这是身份句 |
| 6 | `AGENTS.md` | V 自有 | 每轮约 4.6k token，8 处，另有 4 处自称 Makaron | 文件头自称「Makaron Workspace Entry Point」，和 SOUL/IDENTITY 的「V」不一致 |
| 7 | 用户可见文案（飞书审批卡、任务卡、语音页） | V 自有 | 低频 | 「OpenClaw 改动」「Gateway 已重启」「OpenClaw Agent 没有完成」 |
| 8 | memory 目录 | V 自有 | 按需检索 | 233 个 .md 里 194 个提到 openclaw，共 5742 次 |

结论：上游 Codex 插件的固定开头，和 V 自己的 vds 模型目录指令，各从一侧塑造身份；V 自有文件里身份最直接的是 `MEMORY.md` 那一句和 `AGENTS.md` 的 Makaron 自称；`TOOLS.md` 字样最多，但大多是功能性的。

---

## 2. 工作区顶层文件

### 2.1 文件概况与自称

| 文件 | 字符数 | 估计 token | 注入时机 | 命中数（功能性 / 纯语境） | 自称 |
|---|---|---|---|---|---|
| AGENTS.md | 14,442 | ~4,590 | 每轮 | 8（3 / 5） | **Makaron**（标题和文件职责表），正文规则里用 V |
| SOUL.md | 3,187 | ~800 | 每轮 | 0 | I am V，"Tianyi's AI partner across harnesses" |
| IDENTITY.md | 893 | ~310 | 每轮 | 0（但有 🦞 龙虾 pin） | V，"AI partner across harnesses" |
| USER.md | 1,721 | ~660 | 每轮 | 2（1 / 1） | 模板语气「About Your Human」 |
| MEMORY.md | 6,496 | ~1,870 | 每轮（Codex 里也注入，靠 V 补丁） | 17（10 / 7） | AI Name 写 V，但说「inside OpenClaw」 |
| TOOLS.md | 16,441 | ~5,490 | 每轮 | 69（约 43 / 约 26） | V |
| HEARTBEAT.md | 244 | ~60 | 每轮（心跳 `every: 0m` 已停） | 0 | 「the agent」 |
| PROJECTS.md | 10,767 | ~3,750 | 新会话按需读 | 3（0 / 3，都是 Gateway） | V |
| REDLINES.md | 8,114 | ~2,360 | 新会话按需读 | 5（0 / 5） | V |
| **合计** | 62,305 | ~19,900（每轮注入的 7 个文件约 13,800） | | **104（功能性 57 / 纯语境 47）** | |

自称不一致的地方：
- `AGENTS.md` 有 4 处 Makaron（L1、L3、L11、L14），L79 还有「Makaron agents」。
- 配置里 agent 的 `identity.name` 是「V × Makaron」。按 9.1 源码，这个名字只用在群聊 @ 识别、回复前缀模板和用量栏，不进系统提示。
- `MEMORY.md` 说「inside OpenClaw」，`SOUL.md`/`IDENTITY.md` 说「across harnesses」。
- `USER.md` 和 `HEARTBEAT.md` 还留着 OpenClaw 初始模板的措辞（「About Your Human」「the agent」）。
- 隐性品牌：`IDENTITY.md` L7 和 `TOOLS.md` L116 写到头像衣领上有「小橙色 🦞 龙虾 pin」。龙虾是 OpenClaw 的吉祥物。这是 Tianyi 2026-10-07 定的形象，只记录，建议保留，由 Tianyi 决定。

### 2.2 逐项清单

字段：编号 | 原文摘录 | 来源 | 注入时机 | 估计 token | 可见性 | 类别 | 建议 | 机制 | 风险

| 编号 | 原文摘录 | 来源 | 注入 | token | 可见性 | 类别 | 建议 | 机制 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| W1 | `# AGENTS.md — Makaron Workspace Entry Point` / `> This is the first file Makaron reads when a session starts.` | AGENTS.md:1,3 | 每轮 | 25 | 只对模型 | 纯语境（自称） | 改成「# AGENTS.md — V 工作区入口」「这是 V 每次会话最先读的文件。」 | 工作区文件，再同步到 v-core | 低。v-core 会把它同步到所有 harness，改一处全线一致 |
| W2 | `\| SOUL.md \| Makaron's identity, personality, and working style \|`；`\| memory/ai-patterns.md \| Makaron's learned behavior rules \|` | AGENTS.md:11,14 | 每轮 | 25 | 只对模型 | 纯语境（自称） | 改成「V's identity…」「V's learned behavior rules」 | 工作区文件 | 低 |
| W3 | `When Makaron agents create, revise, review, or promote skills…` | AGENTS.md:79 | 每轮 | 15 | 只对模型 | 纯语境（自称） | 改成「When V creates…」 | 工作区文件 | 低 |
| W4 | `` `/home/openclaw/.openclaw/nightshift/` alone holds 29 GB … stalls the Gateway for every session. `` | AGENTS.md:26 | 每轮 | 40 | 只对模型 | 路径是功能性；「the Gateway」是纯语境 | 路径保留；后半句改成「…会卡住 V 的主进程，所有会话一起停」 | 工作区文件 | 无 |
| W5 | `…must not run on this Gateway host: dispatch it to an available paired compute node…` | AGENTS.md:98 | 每轮 | 20 | 只对模型 | 纯语境 | 改成「must not run on V's own host」 | 工作区文件 | 无 |
| W6 | `…because the separately sent card does not count as the Gateway turn reply.` | AGENTS.md:158 | 每轮 | 15 | 只对模型 | 纯语境 | 改成「…does not count as this turn's reply」 | 工作区文件 | 无 |
| W7 | `工具操作前查阅 TOOLS.md 对应章节；OpenClaw 自有能力优先官方 CLI，Skill Workshop 使用 \`openclaw skills workshop ...\`` | AGENTS.md:169 | 每轮 | 40 | 只对模型 | 叙述是纯语境；命令是功能性 | 改成「V 平台自带的能力优先用官方命令行（命令名是 `openclaw`），Skill Workshop 用 `openclaw skills workshop ...`」 | 工作区文件 | 低。命令名必须保留 |
| W8 | `…不要把 V 的产品使用问题默认回答成 OpenClaw 部署或节点配对。` | AGENTS.md:171 | 每轮 | 20 | 只对模型 | 纯语境（这句本身就是在去 OpenClaw 化） | 保留 | — | — |
| W9 | `\| Primary surface \| Feishu / OpenClaw \|` | MEMORY.md:10 | 每轮（Codex 里在 Agent Soul） | 10 | 只对模型 | 纯语境 | 改成「\| Primary surface \| 飞书 / 钉钉 / 企微 / Telegram / 语音 \|」 | 工作区文件 | 无 |
| W10 | `V is Tianyi's AI partner inside OpenClaw: concise, direct, warm, opinionated, and action-oriented.` | MEMORY.md:13 | 每轮（身份区） | 25 | 只对模型 | **纯语境，身份句** | 改成「V is Tianyi's AI partner across harnesses: concise, direct, warm, opinionated, and action-oriented.」，和 SOUL/IDENTITY 一致 | 工作区文件 | 无。**建议第一个改** |
| W11 | `- Core projects: Makaron and OpenClaw.` | MEMORY.md:20 | 每轮 | 8 | 只对模型 | 纯语境 | 改成「- Core projects: Makaron and V itself (the V platform).」 | 工作区文件 | 无 |
| W12 | `- OpenClaw work → local OpenClaw docs/source first, then project memory via \`memory/index.md\`.` | MEMORY.md:34 | 每轮 | 20 | 只对模型 | 纯语境，但指的是真实软件 | 改成「- V 平台/运行时问题 → 先查本地 OpenClaw 文档和源码，再查 `memory/index.md`」。保留「OpenClaw 文档」这个真实对象 | 工作区文件 | 无 |
| W13 | `<!-- project: path:/home/openclaw/makaron-openclaw/.openclaw-local/workspace -->` | MEMORY.md:37,51 | 每轮 | 2×20 | 只对模型 | 功能性（机器标注） | 先确认 `memory-auto-index.py` 等脚本是否读这个标注；不读就删（省 token，也去掉 6 处 openclaw） | 工作区文件 | 中。可能有脚本依赖 |
| W14 | `- **OpenClaw 2026.9.1 migration**: staged migration accepted by Tianyi on 2026-09-05; now in one-week real-business observation…` | MEMORY.md:47 | 每轮 | 80 | 只对模型 | 叙述是纯语境，路径是功能性 | 已经过期（观察期 9 月就结束了）。从热区删掉，只留在 `memory/projects/openclaw/` 索引里 | 工作区文件 | 无 |
| W15 | `` 见 `memory/projects/openclaw/2026-09-23-milestone-multi-harness-runtime.md` ``（L49）及 L51 同类路径 | MEMORY.md:49,51 | 每轮 | 30 | 只对模型 | 功能性（目录名） | 暂时保留。以后如果把 `memory/projects/openclaw/` 改名为 `v-platform/`，要连同链接一起迁移 | 工作区文件加 memory | 中。断链 |
| W16 | `- **OpenClaw operations**: maintain stable agent orchestration, config hygiene, and context/session performance.` | MEMORY.md:54 | 每轮 | 20 | 只对模型 | 纯语境 | 改成「- **V 平台运维**：…」 | 工作区文件 | 无 |
| W17 | `核心项目：Makaron（AI图像/视频平台）、CooClip（视频创作）、OpenClaw（Agent编排）` | USER.md:17 | 每轮（身份区） | 30 | 只对模型 | 纯语境 | 改成「…、V（Agent 平台，运行时基于 OpenClaw）」 | 工作区文件 | 无 |
| W18 | `` X 登录态在 V 电脑上的 `openclaw` profile 浏览器 `` | USER.md:23 | 每轮 | 15 | 只对模型 | 功能性（profile 名） | 保留，可以补一句「（V 的工作浏览器）」 | — | — |
| W19 | `` …Actual tool availability is controlled by OpenClaw/runtime config. `` | TOOLS.md:3 | 每轮 | 15 | 只对模型 | 纯语境 | 改成「controlled by V's runtime config」 | 工作区文件 | 无 |
| W20 | `**OpenClaw 自有能力优先官方 CLI**（Tianyi 2026-10-07）：…有可用 \`openclaw ...\` 命令就直接用…\`openclaw skills workshop ...\`` | TOOLS.md:13 | 每轮 | 60 | 只对模型 | 混合（2 处纯语境、2 处功能性） | 标题改成「**V 平台自带能力优先用官方命令行**」，命令保留。和 W7 是同一条规则，可以只留一处 | 工作区文件 | 低 |
| W21 | `` `wecom-cli` … `~/.openclaw` … `~/.openclaw/media/` … `~/.openclaw/extensions/.openclaw-install-backups/…` `` | TOOLS.md:27–32 | 每轮 | ~210（整节） | 只对模型 | 功能性（5 处） | 内容保留，整节移到 wecom 相关技能或 `memory/tools/`，按需读取 | 工作区文件或技能 | 低 |
| W22 | `This is V's dedicated server. V may use its writable OpenClaw runtime and…` | TOOLS.md:36 | 每轮 | 15 | 只对模型 | 纯语境 | 改成「V may use its own writable runtime and…」 | 工作区文件 | 无 |
| W23 | `- Only the owner identity configured in OpenClaw may authorize \`sudo\`.` | TOOLS.md:41 | 每轮 | 12 | 只对模型 | 纯语境 | 改成「Only V's configured owner may authorize `sudo`.」 | 工作区文件 | 无 |
| W24 | `- Keep Gateway and Codex running as \`openclaw\`; use \`sudo\` only when required.` | TOOLS.md:48 | 每轮 | 12 | 只对模型 | Gateway 是纯语境；用户名是功能性 | 改成「V 主服务（Gateway）和 Codex 保持以 `openclaw` 用户运行…」 | 工作区文件 | 无 |
| W25 | `### 重启 Gateway：只用 \`sudo v-self-restart\`…不要走 openclaw 工具 / system agent 的审批…等 \`[gateway] ready\`` | TOOLS.md:52–66 | 每轮 | ~430（整节） | 只对模型 | 混合：「重启 Gateway」是叙述；`gateway.*`、`[gateway] ready`、`openclaw` 工具名是功能性 | 叙述改成「重启 V」。**整节移到 `skills/v-self-update/SKILL.md`**，TOOLS.md 只留一行指针：「需要重启 V：只用 `sudo v-self-restart`，细节读 v-self-update」 | 工作区文件加技能 | 低。按需读取依赖模型记得去读，一行指针要保留 |
| W26 | `` openclaw nodes status / list / describe `` | TOOLS.md:73–75 | 每轮 | 40 | 只对模型 | 功能性 | 保留 | — | — |
| W27 | `- 普通 \`read\`/\`write\` 仍在 Gateway；节点文件用 \`exec(host=node)\`…` | TOOLS.md:90 | 每轮 | 25 | 只对模型 | 纯语境 | 改成「仍在 V 主机上」 | 工作区文件 | 无 |
| W28 | `- 改 \`gateway.nodes.*\` 策略属 \`reloadKind=restart\`，需重启生效。` | TOOLS.md:95 | 每轮 | 15 | 只对模型 | 功能性（配置键） | 保留 | — | — |
| W29 | `…不依赖 OpenClaw Mac App；旧节点 \`MacBook Air (4)\` 仅保留备用。` | TOOLS.md:102 | 每轮 | 10 | 只对模型 | 功能性（真实产品名） | 保留 | — | — |
| W30 | `` `openclaw secrets store rm MAKARON_KEY_<名字> --yes` ``；`` `~/.openclaw/.env` 的 `MAKARON_API_KEY` `` | TOOLS.md:133–134 | 每轮 | 30 | 只对模型 | 功能性 | 保留 | — | — |
| W31 | `\| Feishu/Lark \| \`lark-cli\` profile + OpenClaw extension/runtime config \|` | TOOLS.md:148 | 每轮 | 12 | 只对模型 | 纯语境 | 改成「V 的飞书插件/运行时配置」 | 工作区文件 | 无 |
| W32 | `` \| Browser Use \| `~/.openclaw/.env` / protected credential store \| `` | TOOLS.md:151 | 每轮 | 10 | 只对模型 | 功能性 | 保留 | — | — |
| W33 | `` 凭据要在所有 harness 里都能用…靠的是两份：OpenClaw 凭据库里一份，`~/.openclaw/secrets/store/<名字>` 镜像文件一份 `` | TOOLS.md:156 | 每轮 | 45 | 只对模型 | 混合 | 「OpenClaw 凭据库」改成「V 的凭据库」；路径保留 | 工作区文件 | 无 |
| W34 | `` 不要只用 `openclaw secrets store set` 存… `KEY=$(cat ~/.openclaw/secrets/store/…)` …只有在 Gateway 里执行的命令才拿得到它 `` | TOOLS.md:159–160 | 每轮 | 120 | 只对模型 | 命令和路径是功能性；「在 Gateway 里执行」是纯语境 | 改成「只有在 V 主进程里执行的命令才拿得到它」，命令保留 | 工作区文件 | 无 |
| W35 | `## Worker 模式下修改全局配置…\`worker-openclaw.json\`…\`/home/openclaw/.openclaw/openclaw.json\`…\`openclaw config set/patch\`…\`openclaw gateway call vlab.workers.roll\`…Gateway 每 5 秒检查一次主配置…OpenClaw 核心代码补丁` | TOOLS.md:174–198 | 每轮 | ~1,100（整节） | 只对模型 | 混合（约 20 处功能性、约 12 处叙述） | **整节移到 `skills/v-openclaw-config/SKILL.md`**（那里已经有大部分内容）。TOOLS.md 只留一行：「改配置前先读 v-openclaw-config；配置分 hot/restart 两类，restart 类先问人」。叙述里的「Gateway」改成「V 主服务」 | 工作区文件加技能 | 低到中。这段写的是 10/12 停机的教训，迁移时要确认技能里内容完整 |
| W36 | `` 凭据从 `~/.openclaw/openclaw.json` 的 `channels.feishu.appId/appSecret` 读 `` | TOOLS.md:211 | 每轮 | 20 | 只对模型 | 功能性 | 保留 | — | — |
| W37 | `…Local Whisper models consume 4GB+ memory and will OOM-kill the gateway on this 2GB machine.` | REDLINES.md:29 | 新会话读 | 20 | 只对模型 | 纯语境，而且已过期（V 早就不是 2GB 机器） | 改成「…会把 V 的主进程挤爆（OOM）」，删掉「2GB」 | 工作区文件。REDLINES 改动要先给 Tianyi 看 diff | 低 |
| W38 | `## OpenClaw System Files` | REDLINES.md:110 | 新会话读 | 5 | 只对模型 | 纯语境（标题） | 改成「## V 核心文件」 | 同上 | 无 |
| W39 | `## Gateway Rules` / `Key configuration changes are Tianyi-only — Gateway、模型/Provider、Worker/runtime、插件…` | REDLINES.md:123,125 | 新会话读 | 15 | 只对模型 | 纯语境 | 标题改成「## 系统与配置规则」，正文改成「V 主服务（Gateway）、模型/Provider…」 | 同上 | 无 |
| W40 | `…00:20 双 Gateway active…`；`Heavy Worker/Gateway/Task Room 可靠性`；`gateway 健康` | PROJECTS.md:19,20,39 | 新会话按需读 | 30 | 只对模型 | L19 说的是客户（小奥）的 OpenClaw 实例，是功能性事实；L20、L39 是纯语境 | L19 保留；L20、L39 可以改成「V 主服务」，优先级低 | 工作区文件 | 无 |

工作区文件里没有出现 ClawHub、`docs.openclaw.ai`，也没有「OpenClaw agent」这种自我介绍。

---

## 3. 技能

### 3.1 技能目录（每轮进入模型）中命中的技能：10 个

| 编号 | 技能（来源） | 命中位置 | description 原文摘录 | 类别 | 建议 |
|---|---|---|---|---|---|
| S1 | `v-openclaw-config`（skills） | name + description 4 处 | `Safely inspect or change production V OpenClaw configuration. Since 2026-10-03 the Worker config is derived from the Gateway config automatically, so Worker-affecting changes are Gateway-only and roll over in ~10s…` | 混合 | name 保留（被 TOOLS.md、v-core scope 引用）。description 改成「Safely inspect or change V's production runtime config (openclaw.json). Worker config is derived automatically; most changes roll over in ~10 s, a few need one controlled restart.」，从 320 字符压到约 180 |
| S2 | `remote-browser-cdp`（.agents/skills） | description | `…Use when V/OpenClaw needs browser automation for logged-in services, admin dashboards, B站/X/Feishu/customer tools…` | 纯语境 | 「V/OpenClaw」改成「V」（正文 L14、L18 同样处理） |
| S3 | `youtube-video-download`（skills） | description | `下载 YouTube 视频/参考片：新版 yt-dlp + node + EJS 求解器 + openclaw Chrome cookies，输出 mp4 并验片交付。` | 功能性（profile 名） | 改成「…+ V 工作浏览器（openclaw profile）的 cookies…」 |
| S4 | `openclaw-harness-evaluation`（skills） | name + description | `Evaluate whether external coding agents can serve as OpenClaw harnesses and choose ACPX versus native integration.` | 说的就是 OpenClaw 本身（开发向） | 保留措辞。这是平台开发技能，建议移出 V 的日常目录（放平台仓库，或标成不由模型自动调用） |
| S5 | `openclaw-safe-downgrade`（skills） | name + description | `Safely downgrade OpenClaw across incompatible session-storage schemas while preserving chats, Memory, and rollback.` | 同上 | 同 S4 |
| S6 | `openclaw-disk-full-recovery`（skills） | name；description 里有「网关」 | `Agent 不回复但通道仍 connected 时：查数据盘满盘、清可再生缓存、重启网关并分层验收。` | 说的是 OpenClaw 实例运维 | 保留，可以改成「重启 V 主服务」 |
| S7 | `gateway-rpc-adapter-repair`（skills） | name + description | `Repair Gateway RPC adapter drift without broadening mutation scope.` | 功能性（Gateway RPC 协议） | 保留 |
| S8 | `v-self-update`（skills） | description 里的仓库名 | `Change V itself: its code in GitHub (v-openclaw-platform, v-nightshift, v-browser, v-core)…` | 功能性（仓库名） | 保留（这个描述已经以 V 为主语，是正面例子） |
| S9 | `tencentcloud-infra`（skills，第三方） | description 关键词 | `…快照, 镜像, 流量包, 建站, 安全检查, OpenClaw, 退出登录…` | 第三方（腾讯云 Lighthouse 的 OpenClaw 应用模板） | 保留，上游维护 |
| S10 | `channel-message-delivery`（skills） | description 里的普通词 | `When adding structured messages to a channel gateway, trace durable delivery…` | 普通词，不是 OpenClaw | 保留 |

补充：
- `proactive-agent`（ClawHub 来的第三方技能）的 description 结尾是 `Part of the Hal Stack 🦞`，属于 OpenClaw 生态的品牌残留，可以删掉这半句。
- 另外 2 个技能的 description 含「网关」，指的是计费/租户网关，和 OpenClaw 无关，保留：`credit-gate-trigger-words`、`tenant-page-error-triage`。
- 有 5 个技能的 frontmatter 带 `metadata.openclaw`（`11`、`3d-asset-ar-showcase`、`didi-ride-skill-official`、`meshy-3d-agent`、`tencentcloud-infra`）。这些是技能加载器读的功能键，不进 description，保留。
- 技能目录每条都有 `<location>`，路径在 `…/makaron-openclaw/.openclaw-local/workspace/…` 下，每条带 2 到 3 处 `openclaw`。322 条合计每轮约 640–960 处。属于功能性路径；只有迁移工作区目录才能去掉，代价大，不建议为此改。
- 技能目录整体约 26.5k token/轮（按 name、description、location 估算），本身就是最大的每轮固定成本之一。

### 3.2 正文命中：86 个技能，约 545 处

启发式分类（含 frontmatter 共 552 处）：功能性约 362 处，叙述约 190 处。最典型的 10 个：

| 编号 | 技能 | 命中（功能性 / 叙述） | 典型原文 | 判断与建议 |
|---|---|---|---|---|
| B1 | v-for-meorient-ops | 111（104 / 7） | `Use OpenClaw official background task primitives: spawn a sessions_spawn subagent…`；`Gateway port: …` | 运维的是客户的 OpenClaw 实例，OpenClaw 是真实对象，**保留**。只有 L33、L35 的通用规则可以改成「用 V 平台原生后台任务」 |
| B2 | v-for-tiance-ops | 72–79（52 / 20） | 同上；`Gateway service: openclaw-gateway.service` | 同 B1 |
| B3 | v-openclaw-config | 45（15 / 30） | 见 S1 | 正文叙述里的「Gateway」改成「V 主服务」；命令和键保留；吸收 W35 |
| B4 | didi-ride-skill-official | 25–27（14 / 13） | `**方式二：OpenClaw 配置文件**`；`apiKey 是 OpenClaw 标准字段名…` | 第三方官方技能，**保留** |
| B5 | launch-mirror-v | 15（14 / 1） | `Gateway reachable and service enabled;` | 功能性为主，保留 |
| B6 | openclaw-harness-evaluation | 9–11（1 / 10） | `# OpenClaw Harness Evaluation`；`Inspect the installed OpenClaw documentation and source…` | 讲的就是 OpenClaw 本身，保留措辞；建议移出日常目录 |
| B7 | remote-browser-cdp | 9–10（6 / 4） | `This gives V/OpenClaw enough browser capability…` | 「V/OpenClaw」改成「V」 |
| B8 | computer-use | 9（6 / 3） | `Gateway 主机的桌面（:99）上有两个 Chrome…`；``Default`（名字 openclaw）是空的，**不用**`` | 「Gateway 主机」改成「V 主机」；profile 名保留 |
| B9 | night-shift-operator | 7–8（2 / 5） | `…lets native OpenClaw Workboard own execution…`；`never restart the Gateway (it ends your own turn too…)` | 改成「V 原生 Workboard」「不要重启 V」。这个技能在 v-nightshift 仓库维护，按那边的 change-flow 改 |
| B10 | tianyi-iphone | 8（3 / 5） | `…走官方 OpenClaw iOS app…`；`手机 OpenClaw → Settings → Gateway → 点已保存的网关` | 真实 App 名和界面路径，**保留** |

另外可以顺手改的：`meeting-co-pilot`（「让 Gateway 启动桥接」改成「让 V 主服务启动桥接」）、`openclaw-disk-full-recovery`（真实 OpenClaw 运维，保留）、`gateway-rpc-adapter-repair`（保留）。

### 3.3 OpenClaw 内置技能（和 V 自建技能分开看）

- 工作区技能里**没有**和 OpenClaw 2026.9.1 内置技能（51 个）重名的。
- 内置技能里 description 带 OpenClaw 的有：
  - `clawhub`：`Search ClawHub for skills when a requested capability is not already available…`
  - `healthcheck`：`Audit/harden OpenClaw hosts: SSH, firewall, updates, exposure, backups, disk encryption, gateway security.`
  - `node-connect`：`Diagnose OpenClaw Control UI browser and native Android, iOS, or macOS node connection failures…`
- 正文命中较多的内置技能：node-connect 24、clawhub 14、coding-agent 11、peekaboo 8、healthcheck 8。
- **这些内置技能是否真的出现在 V 的技能目录里，取决于 bins 和 `skills.allowBundled`，本地无法确认。** 要在 V 上跑 `openclaw skills list --eligible` 核实。如果出现了，建议用 `skills.allowBundled` 只放行需要的。改的是配置键，需要 Tianyi 授权。

---

## 4. 模型别名怎么呈现

- 配置里 17 个别名：astra、astra60、deepseek、gpt5.6、luna、luna56、openai-gpt5.5、terra、terra56、ultra、vcc、vcc5、vcodex、vcodex56、vcodex60、vcodex61、vds。description 全是 null。
- **系统提示**（vlab-worker/PI、claude-cli 的完整模式）：9.1 的 `system-prompt-params` 渲染「## Model Aliases」段，一行一个 `- vds: deepseek/vds-deepseek-flash`，前面有一句固定的「Model override: aliases are shortcuts for unqualified model requests…」。约 17 行，约 200 token。**没有 OpenClaw 字样**，只有 provider id `vercel-ai-gateway/…`（功能性）。
- **Codex 插件**（/vds、/vcodex）：没看到别名段，模型看不到别名列表。
- **/model 列表**（用户可见）：显示别名和 provider/model，description 为 null，所以不显示描述，也没有 OpenClaw 字样。
- 用户能看到的「V 的说法」（/vds = Codex + DeepSeek 等）只在 `TOOLS.md` L13 和 `memory/projects/v-user-guide/` 里。
- 建议：保持现状。如果想在 /model 列表里显示「V 的说法」，可以给 description 填中文，比如 vds 填「V 主力：Codex + DeepSeek Flash」。但 9.1 里 description 渲染在哪不确定，要先在 VLab candidate 里看一下。改的是配置，hot 类，需要授权。优先级低。

---

## 5. V 自有插件与 dist 补丁

V 的应用（`apps/*`）总体干净：工具描述都以 V 为主语（如 `browser_fill_secret` 的 "…the login page V is driving…"、`desktop_handoff_request` 的 "Hands V's own desktop browser to a human…"、sessions_send 的 `TOOL_GUIDANCE` 的 "On V the message is posted…"）。`apps/` 里没有 `before_prompt_build` / `prependContext` / 系统提示追加这类钩子。命中大多在代码注释、`Symbol.for("openclaw.v.*")`、包名 `@versa/openclaw-*`、`openclawDist` 配置键这些地方，模型看不到。真正需要处理的是下面这些：

| 编号 | 原文摘录 | 来源 | 注入时机 | token | 可见性 | 类别 | 建议 | 机制 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| P1 | `"system-agent": "OpenClaw 改动",` | 源码：`lab/release-files/feishu-dm-approvals/core.mjs`；生产：feishu 捕获 `dist/v-feishu-approvals.js:30` | 每张审批卡 | — | **用户可见**（飞书私聊审批卡） | 纯语境 | 改成 `"V 系统改动"` | dist 补丁（V 自有文件），飞书插件热更或重启 | 低。只是标签 |
| P2 | `'⚠️ Gateway 已重启，等待原任务恢复或核对执行状态。'` | `lab/feishu-task-presentation.mjs:207`（生产 `v-feishu-task-presentation.mjs:213`） | 重启时 | — | **用户可见**（飞书任务卡） | 纯语境 | 改成 `'⚠️ V 刚重启，正在恢复原任务或核对执行状态。'` | dist 补丁 | 低 |
| P3 | `'Gateway 重启后无法确认原执行状态，请回到原会话核对。'` | `lab/feishu-task-presentation.mjs:259` | 重启后 | — | **用户可见** | 纯语境 | 改成 `'V 重启后没法确认原任务的执行状态，请回原会话核对。'` | dist 补丁 | 低 |
| P4 | `'Gateway 重启打断了任务；请核对原执行状态后继续。'` | 生成方：`lab/candidate/bound-task-plugin/index.js:43`；匹配方：`lab/feishu-task-presentation.mjs:15` 做**全等比较** | 重启后 | — | 用户可能看到 | 功能性（字符串匹配） | 生成方和匹配方要一起改，或者匹配新旧两种文案 | dist 补丁 | **中**。只改一边，旧任务的打断识别就失效 |
| P5 | `` `OpenClaw Agent 没有完成：${result.error}` `` | `lab/volcengine-rtc-managed-room-client.mjs:141`、`lab/seeduplex-realtime-provider.mjs:217`（生产 `control-ui/assets/volcengine-rtc-managed-room-client.js:141`） | 语音后台失败时 | — | **用户可见**（语音页，也可能被语音模型读出来） | 纯语境 | 改成 `` `V 没有完成：${…}` `` | dist 补丁或 Control UI 资源。要换文件名，否则浏览器 immutable 缓存会让改动到不了用户 | 低到中（缓存） |
| P6 | `'- 后台命令用 OpenClaw exec(background:true) 交给任务系统，不要用 nohup 或 shell 的 & 脱离跟踪…'` | `apps/v-session-relay/plugin/core/copy.js:172` | 每个会话协作请求轮 | 50 | 只对模型 | 纯语境 | 改成 `'- 后台命令用受管理的 exec(background:true) 交给任务系统…'` | 插件（apps，发 session-relay） | 低 |
| P7 | `"Completion is owned by the Gateway external task bridge. Use sessions_yield to await the completion event; do not poll files or status to substitute for completion."` | `experiments/agent-worker-isolation-v1/patch-openclaw-sessions-spawn-gateway-proxy.mjs:37` | 每次 worker 里 sessions_spawn 的工具结果 | 35 | 只对模型 | 纯语境 | 改成 `"Completion is delivered by V's task bridge. Use sessions_yield…"` | worker dist 补丁 | 低 |
| P8 | `"You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI…"`（`instructions_template`，16,979 字符） | Codex 插件捕获 `dist/v-deepseek-model-catalog.json`（V 自有） | **/vds 每轮** | ~4,200 | 只对模型 | 不含 OpenClaw，但身份冲突 | 只改开头两句：`"You are V, Tianyi's AI partner, running on the Codex app-server with DeepSeek. Be precise, safe, and helpful."`。删掉 "Within this context, Codex refers to…"。其余工具、沙箱、编辑规则保留 | dist 补丁（V 自有文件）加 source-map | 中。会影响 DeepSeek 的工具习惯，要在 candidate 里对比验证 |
| P9 | 插件清单描述：`"Gateway ledger for sessions_send: …"`（v-session-relay）；`"…meetings survive Gateway restarts…"`（v-meeting-bridge） | `apps/*/plugin/openclaw.plugin.json`、`index.js` | 不给模型（插件列表、Control UI） | — | 运维可见 | 纯语境 | 可选，改不改都行 | 插件 | 无 |
| P10 | 接管电脑、凭据录入、语音入口的公网链接域名里有 `openclaw` | `apps/v-desktop-handoff/config.example.json`、`apps/v-secret-entry/config.example.json`、`lab/gpt-live-h5/server.mjs`（域名这里不写出） | 每次发链接 | — | **用户可见**（链接） | 功能性（域名） | 先保留。要换域名得改 DNS、cloudflared、OAuth 回调和所有卡片，单独立项 | 基础设施 | 高 |
| P11 | 第三方渠道插件的兜底文案：钉钉 `"无法选择处理此消息的智能体，请管理员检查此机器人的 OpenClaw bindings 配置。"`；钉钉群空回复兜底 `"若群聊频繁出现该提示，请联系机器人管理员检查 OpenClaw 配置…"`；企微 `"提示：可在 OpenClaw 配置中提高 channels.wecom.media.maxBytes…"`、`"例如：openclaw config set …"` | dingtalk 捕获 `dist/dist/message-handler-*.mjs:1771`、`dist/dist/utils-*.mjs:29`；wecom 捕获 `dist/dist/src/agent/handler.js:319-320` | 出错时 | — | **用户可见**（钉钉群/企微） | 纯语境（对用户暴露了实现） | 在 V 已有的 `apps/v-experience/dingtalk/patch.mjs`、`wecom/patch.mjs` 里加文本替换，改成「V 暂时没法处理这条消息，已通知管理员」，配置提示只写日志 | 渠道插件 dist 补丁（V 已经在维护这两个补丁） | 低到中。插件升级会冲掉，补丁要有断言 |
| P12 | wecom-cli 工具报错：`` `企业微信凭据请在 openclaw 配置 …` ``、`` `若提示凭据不可用，请检查 openclaw 配置 …` `` | wecom 捕获 `dist/dist/src/cli/argv.js:115,120` | 工具出错时 | 30 | 只对模型（模型可能转述给用户） | 纯语境 | 改成「请检查 V 的企微凭据配置」，或者保持原样 | 同 P11 | 低 |

---

## 6. GPT Live 语音

指令的位置和组装方式：
- 通话规则：`lab/gpt-live-h5/instructions.mjs`（15,268 字符，约 6k token）。
- 人设：`lab/gpt-live-h5/persona.mjs`（`V_FRONTEND_PERSONA`，4,352 字符，约 1.1k token）。如果 V 配置的 `talk.realtime.instructions` 里有 Identity、Self-introduction 等段，会优先用配置里的。
- 来电者上下文：由 `lab/gpt-live-call-lifecycle.mjs` 拼接（生产在 `dist/gpt-live-call-lifecycle.mjs`）。
- 只在 `gpt-live-1-codex` + agent-consult 通话 profile 下生效，每通电话注入一次，作为实时会话的 instructions。

要点：
- 身份：「你是 V 的实时语音层」。人设说明要求被问「你是谁」时说自己是 V、Tianyi 的自我进化 AI 伙伴。全文没有 OpenClaw 自我介绍。
- 委派：需要真实信息、命令或工具时，必须实际发起 native client delegation 交给后台，不能口头答应。列出了后台工具（memory_search/get、web_search/fetch、exec、sessions_spawn）和该不该委派的条件。
- 结束通话：按整句和语境判断。意图明确就委派后台调用 `openclaw_end_call`，不能口头说挂断或伪造 JSON；主机接受之后才道别。
- 附和与打断：用户说话时只做短附和；用户插话就立刻停；停止讲话和取消后台任务是两回事。
- 任务进度：进度问题按已收到的真实进度回答，不重复委派；播报完继续做剩余步骤；动作需要语音确认时，等用户完整确认才执行。
- 最终结果：只有收到主任务的完整结果才报最终结论；数字、日期、人物关系、适用范围原样保留；长结果引导用户看屏幕；不编造执行或成功。
- 来电者：本人入口默认是 Tianyi；普通入口先问对方是谁，名字不改变入口类型；委派时带上说话人和入口类型。

OpenClaw 字样：

| 编号 | 原文摘录 | 来源 | 注入时机 | token | 可见性 | 类别 | 建议 | 机制 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| G1 | `…让后台真实调用 openclaw_end_call…`；`…后台有真正的 openclaw_end_call 通话主机工具。` | `lab/gpt-live-h5/instructions.mjs:2,12` | 每通电话 | 2×10 | 只对模型 | 功能性（工具名） | 保留。如果想去掉字样，得同时改主机工具名、客户端 `app.js`、`avatar-state.mjs`、`server.mjs` 和测试 | — | 高（协议名） |
| G2 | `"openclaw_end_call 已被当前通话接受。现在用一句简短中文向用户告别…"` | `lab/gpt-live-call-lifecycle.mjs:121,148` | 结束通话时 | 30 | 只对模型 | 功能性 | 可以把开头改成「结束通话请求已被接受。…」，不必出现工具名 | dist 补丁 | 低 |
| G3 | 客户端协议里的其他工具名：`openclaw_live_call_control`、`openclaw_backend_result`、`openclaw_tool` | `lab/gpt-live-h5/server.mjs:212,261`、`avatar-state.mjs:18,23` | 通话中 | — | 模型可能看到函数名 | 功能性 | 保留 | — | 高 |
| G4 | 语音页错误「OpenClaw Agent 没有完成：…」 | 见 P5 | 失败时 | — | **用户可见** | 纯语境 | 见 P5 | — | — |
| G5 | 上游实时语音的默认文案（不是 V 写的）：`"You are the realtime voice surface for the same OpenClaw agent the user can message directly."`、`"Delegate to OpenClaw and treat its result as authoritative."`、`"Briefly tell the person that you are checking with OpenClaw."`；后台咨询提示 `"You are the configured OpenClaw agent receiving delegated requests from a live voice bridge…"` | core 捕获 `dist/realtime-session-harness-*.js` | GPT Live profile 下前三句应该已被 V 的 instructions 替换；**后台咨询那句可能仍发给后台 agent** | ~60 | 只对模型 | 纯语境 | 先在 candidate 抓一次后台 consult 回合的完整 prompt 核实；确实还在的话，在 V 的 dist 补丁里改成「You are V, receiving a request from V's live voice layer…」 | dist 补丁加 versa 源码 commit | 中（要核实） |

---

## 7. v-core（Grok bot、豆包、ChatGPT Web 等 harness 读它变成 V）

`origin/main` 最新提交 `0a4057b`（2026-11-10，「daily workspace -> v-core sync as a reviewed rolling PR」），共 311 个文件、66 个技能。

| 编号 | 原文摘录 | 来源 | 注入时机 | token | 可见性 | 类别 | 建议 | 机制 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| C1 | `AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`REDLINES.md` 和工作区**逐字相同**，所以 `# AGENTS.md — Makaron Workspace Entry Point` 也会进所有 harness | v-core 根目录 | 各 harness 启动时 | 同 W1–W3 | 只对模型 | 纯语境 | 在工作区改 W1–W3，等每日同步 PR 带过来 | 工作区文件，经 v-core 同步 PR | 低 |
| C2 | `TOOLS.md`（15,699 字符，约 5.2k token，67 处）和工作区几乎一样，只是去掉了 Makaron key 相关行 | v-core `TOOLS.md` | 各 harness | ~5,200 | 只对模型 | 大多功能性，但**对别的 harness 不成立**（`openclaw` 命令、`~/.openclaw` 路径、`sudo v-self-restart` 在 Grok bot、豆包上都不存在） | 把 TOOLS.md 拆成两部分：「V 通用工具规则」和「V 服务器专属运维（只在 OpenClaw 宿主上有效）」。v-core 只同步前者，或者在后者开头写清楚适用范围 | v-core PR 加同步脚本 `.workspace-sync-scope` | 中。会影响其他 harness 的能力认知 |
| C3 | `HEARTBEAT.md`：v-core 是 7,219 字符的旧版（「Async Task Queue Status: ON ⚡」「Every 6 hours」），工作区是只有注释的空模板 | v-core vs 工作区 | 各 harness | ~1,800 | 只对模型 | 不一致 | 同步脚本注释写着「HEARTBEAT.md excepted, pending Tianyi」。请 Tianyi 决定，在那之前其他 harness 会以为还有心跳任务队列 | v-core PR | 中（行为不一致） |
| C4 | `MEMORY.md`：v-core **没有** | — | — | — | — | — | 「inside OpenClaw」那句不会外溢，但其他 harness 也没有身份热表。改完 W10 以后，可以考虑把「Hot Identity」那一小段同步过去 | v-core PR | 低 |
| C5 | `USER.md`：v-core 去掉了收货地址、电话、生日等私人行 | — | — | — | — | 符合隐私设计 | 保留。另外工作区 `USER.md` 每轮注入到所有会话，包括群聊，里面有这些私人信息，建议单独评估是否挪到按需读取的私有文件 | — | — |
| C6 | `V Core is what makes a harness become V… in a form any harness can load: OpenClaw on the V server, Grok bot, Doubao, ChatGPT on the web…`；`V lives and evolves in the live OpenClaw workspace on the V server.` | v-core `README.md:3-5,12`（另有 `CONTRIBUTING.md` 13 处、`docs/source-boundaries.md` 4 处） | 看 harness 包装器是否读 README；通常是给人看的 | ~430 | 维护者可见 | 纯语境（但事实准确） | 改成「the V server (runtime based on OpenClaw)」「V lives and evolves in its workspace on the V server」。运维路径保留 | v-core PR | 低 |
| C7 | 技能范围：`.workspace-sync-scope` 的 ops 组包含 `skill openclaw-*`、`skill v-openclaw-config`、`skill gateway-rpc-adapter-repair`、`skill tencentcloud-infra` | v-core | 各 harness 技能目录 | — | 只对模型 | 功能性但不适用 | 这些技能在 Grok bot、豆包上跑不了。建议从 v-core 的 scope 移出，或者在 description 开头注明「仅限 V 服务器」 | v-core PR | 低 |

v-core 和 V 说法不一致会造成的问题：
- 工作区和 v-core 都自称 Makaron（C1），而 SOUL/IDENTITY 写的是 V。
- V 自己的 MEMORY 说「inside OpenClaw」，v-core 没有这一句，SOUL 说「across harnesses」，其他 harness 不会受影响。
- HEARTBEAT 两边不一致（C3）。
- 其他 harness 会读到一大段只在 OpenClaw 宿主上成立的运维说明（C2），可能误以为自己能 `openclaw config set` 或重启 Gateway。

---

## 8. memory 目录（233 个 .md，194 个提到 openclaw，共 5,742 次）

- 不建议批量替换。大部分是历史记录、项目事实（`memory/projects/openclaw/`）、路径和命令，改写会失真，也会断掉索引和链接。
- 建议：
  1. **只处理热区**：`MEMORY.md`（W9–W16）、`memory/user-patterns.md`、`memory/ai-patterns.md`。这三个是 Boot Sequence 每个新会话都会读的，单独检查有没有身份句（「V in OpenClaw」「OpenClaw agent」之类）。
  2. `memory/projects/v-user-guide/main.md` 是用户问「V 怎么用」时的入口（AGENTS.md L171），确认它对外的说法是 V，不是 OpenClaw。
  3. 新写的记忆约定：说身份、产品时用「V / V 平台」；说运行时组件时用「V 主服务（Gateway）」；真实的 OpenClaw 版本、源码、上游行为照常写 OpenClaw。可以把这条写进 `AGENTS.md` 的记忆写作规范，一行就够。
  4. 不要为了去字样重命名 `memory/projects/openclaw/` 目录。真要改，先跑索引和反向链接检查，单独立项。

---

## 附录 A：不是 V 自有，但对 /vds、/vcodex 每轮可见的上游 OpenClaw 语境（在 V 的 Codex 插件 dist 里）

这些是上游代码，但 V 已经在捕获和补丁这些文件（`release/captured/*.codex/dist/dist/`）。按 AGENTS.md 规则，改 dist 要有 `openclaw-versa` 的 `versa/main` 源码 commit，并在 `release/source-map.json` 里登记。

| 编号 | 原文 | 文件 | 注入 | 建议 |
|---|---|---|---|---|
| A1 | `"You are a personal agent running inside OpenClaw. OpenClaw has dynamic tools for OpenClaw-owned messaging, cron, sessions, media, gateway, and nodes."` | `thread-lifecycle-*.js:2612` | 每个 Codex 线程的 developer instructions 第一句 | 改成 `"You are V, Tianyi's AI partner. The host provides dynamic tools for messaging, cron, sessions, media, gateway, and nodes."`。**这是 /vds 的第一句身份声明，影响最大** |
| A2 | `"## OpenClaw Agent Soul"` 加前言 `"OpenClaw loaded these workspace instruction files… They are the canonical definitions of who you are…"` | `attempt-context-*.js:480` | 每轮（包住 SOUL/IDENTITY/USER/MEMORY） | 改成 `"## V's Identity"` / `"These files define who you are (V)…"` |
| A3 | `"## OpenClaw Agent Workspace Instructions"` / `"OpenClaw loaded this bounded snapshot…"` | `attempt-context-*.js:99,166` | 线程级 | 改成 `"## V Workspace Instructions"` |
| A4 | `"OpenClaw runtime context for this turn:"`、`"## OpenClaw Workspace Context"`、`"Treat this OpenClaw-provided context as…"`、`"OpenClaw delivery metadata:"`、`"## OpenClaw Skills"`、`"OpenClaw loaded these user-editable workspace files…"` | `attempt-context-*.js:354–444` | 每轮 | 统一改成 `V …`。**注意** `prependCodexOpenClawPromptContext` 用 `startsWith("OpenClaw assembled context for this turn:")` 做判断，改文案要连同判断一起改 |
| A5 | `` "Deferred searchable OpenClaw dynamic tools available: …" ``；`` "Use OpenClaw `sessions_spawn` only for OpenClaw or ACP delegation…" ``；工具命名空间 `openclaw_direct.sessions_yield` | `thread-lifecycle-*.js` | 每轮 | 叙述可以改；命名空间是功能性，保留 |
| A6 | 9.1 core 系统提示（vlab-worker/claude-cli）：`"You are a personal assistant running inside OpenClaw."`、`Docs: https://docs.openclaw.ai`、`OpenClaw behavior questions: docs first…`、`## OpenClaw Control`、`Diagnosis: run \`openclaw status\`…` | core `system-prompt-params-*.js:798` 等 | vlab-worker、/vcc 每轮 | 第一句改成 V 的身份；文档指向保留（运维需要），但可以收进「运维」小节 |
| A7 | 媒体理解等子任务：`"You are OpenClaw's bounded image-understanding worker…"`、`"…structured-extraction worker…"` | `media-understanding-provider.js:61,99` | 子任务 | 优先级低 |

## 附录 B：推荐先改的顺序

1. **W10、W9、W11、W16**（`MEMORY.md` 身份句和热区）：纯语境，每轮，在身份区，零风险，只改工作区文件。
2. **W1–W3**（`AGENTS.md` 的 Makaron 自称改成 V）：每轮，v-core 会带到所有 harness。要先给 Tianyi 看 diff（AGENTS.md 规则 2）。
3. **P8 加 A1、A2**（/vds 的开头身份句：V 自有的 vds 模型目录，加上 Codex 插件的「running inside OpenClaw」和「OpenClaw Agent Soul」）：主力 runtime 每轮的身份。要走 candidate 验证、versa 源码 commit、source-map。
4. **W25、W35 迁出 TOOLS.md，W19–W24、W31、W33–W34 改叙述**：每轮省约 1.5k token，同时去掉大部分「Gateway / OpenClaw 运行时」叙述；顺带解决 C2（v-core 上不适用的运维说明）。
5. **用户可见文案 P1、P2、P3（同时改 P4）、P5**：「OpenClaw 改动」改成「V 系统改动」，「Gateway 已重启」改成「V 刚重启」，「OpenClaw Agent 没有完成」改成「V 没有完成」。P5 要注意 Control UI 资源的缓存。
