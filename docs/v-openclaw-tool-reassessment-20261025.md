# V 调用 openclaw 工具（内置系统助手）的重新评估 — 2026-10-25

结论：选 **(b)**。V 遇到自己的系统问题，自己只读诊断，不再交给 `openclaw` 工具；`openclaw` 工具保留，只用于用户明确要求走 OpenClaw 内置审批的配置/渠道/插件变更和引导流程。冻结本身由 PR #463（doctor 改在子进程跑）解决，本文解决的是「这个调用有没有用、该不该调」。

## 1. 调用链（V 运行时 `db91-release-v2026.9.1-db91.6/core/dist`，只读）

| 环节 | 文件 | 事实 |
|---|---|---|
| V 看到的工具 | `openclaw-tools-BODVdJQD.js` `openclaw-delegate-tool.ts` | 名字 `openclaw`，描述「Ask system expert. Gateway restart, config, channels, plugins, agents, models/providers, updates.」参数只有 `message`。在 Gateway 进程内调 `openclaw.chat` RPC，超时 120 s。只给非 embedded 的运行：V 上是 Codex harness（`/vcodex`、`/vds`）和 Gateway 内的 openclaw/claude-cli harness；vlab-worker 会话里没有这个工具。 |
| 助手的一轮 | `onboarding-welcome-n6nqb6Kf.js` `system-agent/agent-turn.ts` | `runId=openclaw-turn-<uuid>`，`runEmbeddedAgent({ toolsAllow: ["openclaw"] })`，一轮超时 `AGENT_TURN_TIMEOUT_MS = 120000`；会话是内存会话。超时后退回一个不带工具的 planner，答案只是复述输入。 |
| 助手的工具 | `system-agent-tool-a5BdkF7s.js` | 唯一工具也叫 `openclaw`（ring-zero），动作固定：status / models / agents / channels / channel_info / config_get / config_schema / gateway_status / plugin_search / validate_config / **doctor** / audit；引导：connect_channel 等；写：setup / set_default_model / config_set / config_set_ref / create_agent / gateway_* / plugin_*，委托来的写操作一律要 operator 审批卡。`selection-BC0YSSFq.js` 强制 `toolsAllow` 必须恰好是 `["openclaw"]`，否则抛错。 |
| 助手的约束 | `assistant-prompts-CpN0ZIvY.js` `SYSTEM_AGENT_SYSTEM_PROMPT` | 面向「装机/修复 OpenClaw」：工作区、Gateway、渠道。禁止 doctor 修复（「tell the user to exit and run `openclaw doctor --fix`」）、禁止改模型路由/auth/models/env/secrets。 |
| doctor | `operations-CTofDiKh.js` | `await doctorCommand(runtime, { nonInteractive: true })` 在 Gateway 主线程跑，含两项全量转录扫描（PR #463 实测 V 规模 264 s 最长单次阻塞）。报告写到 Gateway 的 stdout，工具结果只拿到两行 warning。 |

所以助手**读不了日志、文件、进程、环境变量、插件内部状态，也执行不了命令**；它能做的诊断只有读配置和跑 doctor。这是 OpenClaw 的设计（ring-zero、只给系统助手一个工具），不是配置问题。

官方开关：`agents.defaults.systemAgent` 只有 `agentId`，没有关掉委托的开关；能从工具层限制的只有 `tools.deny: ["openclaw"]`，即选项 (c)。

## 2. 调用记录（全部只读）

来源：`state/openclaw.sqlite` 的 `diagnostic_events`，scope `system-agent-transcript`（助手自己的滚动对话日志，上限 1000 条，现有 250 条，从 2026-09-05 起完整）和 `system-agent-audit`（实际落地的操作，10 条）；Gateway journal（从 2026-10-17 起）；V 会话库只按 `session_windows` 的 `session_key` 索引选出会话、再按主键二分到 10/22 之后读尾部。

去掉验收探针（9/12 五轮「只读验收 + restart + no」、9/13 maxEntries 往返、10/04 审批卡验收的 7 次轮询）后，9/05–10/25 共 **38 件真实请求**：

| 类别 | 件数 | 结果 |
|---|---|---|
| 读配置/状态（TTS provider、realtime 入口、worker 配置、健康检查、键是否存在等） | 9 | 都答了；V 自己用 `openclaw config get`、`config.schema.lookup`、`health` 同样拿得到 |
| 变更，经 operator 审批后落地 | 3 | 9/15 bindings、9/16 重启 Gateway、10/03 `browser.extraArgs`。重启自 10/06 起由 `sudo v-self-restart` 负责；配置有 `v-openclaw-config` 技能 |
| 变更，没落地（等审批过期、受保护路径被拒、中途停下） | 13 | 模型路由/别名 5 件全部被拒；talk/xSearch/cron/desktop-handoff 等一直「Approval pending」 |
| 超出它的工具面（重启单个 worker、中止会话、建 cron、exec、sessions.patch、配对 node） | 6 | 全部「我没有这个动作」 |
| **诊断 V 自身的系统故障** | **8** | **0 件解决**：凭据卡片投递失败、Skill Workshop 不能 apply、群里 secrets 超时、Mac 截图、卡住的 ask_user、UM 同步 ×2、V Browser |

近 14 天（10/11–10/25）4 次调用：

| 时间 | 群 | V 问的 | 结果 |
|---|---|---|---|
| 10/12 14:44 | — | 跑 `sessions.patch` 把新群钉到 /vds | 「我没有 shell」 |
| 10/22 21:35:05 | oc_1fb85b7b… | UM 每日同步连续失败，`gateway_exec` 走代理访问本机 22881 `UND_ERR_SOCKET`，NO_PROXY 被禁，求「官方内网直连例外入口」 | V 侧 21:36:52 `OpenClaw dynamic tool call timed out after 90000ms`；助手 21:42:30 一轮超时、planner 也失败，没有答案；Gateway 冻结 310 s；`openclaw.chat` 503 s 后 `agent runtime authority is no longer active` |
| 10/22 22:19:11 | 同上 | 同一问题补充「Worker 没有原生 exec」 | V 侧 22:23:01 超时；助手 22:23:29 给出「都不能由我落地，需宿主改动」，V 已收不到；冻结 158 s，之后 host-thaw 循环 16 小时 |
| 10/25 09:57:22 | oc_2a830814… | V Browser：acquire 返回 `{profile,target}`，原生 browser 却解析到静态 CDP profile `100.82.39.107:24906` | V 侧 10:02:08 `isError`；Gateway 09:58:40–10:02:08 冻结 208 s，期间 V 自己的桌面/命令/配置读取也报 `Native hook relay timed out`；助手 10:02:42 的答案只是复述 V 已查到的证据，加一句「让 acquire 也返回 relay endpoint」——那是插件代码改动，它做不了；`openclaw.chat` 同样 `authority is no longer active`，没送到 |

三次的共同点：V 自己已经查到根因附近，卡在「宿主侧受支持的修法是什么」，于是把证据转给助手。助手看不到宿主配置、环境变量和插件代码，只能跑 doctor 或复述；而 doctor 冻住 Gateway 又让 V 自己的工具也失灵。Tianyi 的判断「它本质上也修不好，最后就不了了之」与记录一致。

## 3. 三个选项

- **(a) 让助手把任务做完：不可行。** 要让它诊断这类问题，得给它日志/文件/命令能力，而 OpenClaw 强制它只有 `openclaw` 一个工具；改这个等于在 Gateway 进程里再造一个权限更高、能力更弱的 V。即使 #463 上线，doctor 子进程也要约 60 s，加上一轮 120 s 上限和 V 侧 90–120 s 超时，答案仍然常常送不到。
- **(b) V 自己诊断：采用。** V 有 shell、sudo（按 TOOLS.md 授权）、日志、插件源码、`openclaw` CLI，助手能读的它都能读，助手读不到的它也能读。缺的只是「按问题类型怎么查、哪些读法会伤生产」的步骤。
- **(c) 禁用：不采用。** 审批卡变更和渠道引导仍是正当用途（9/15、9/16、10/03 三次真实落地），Tianyi 说过保留 V 用 openclaw 的权利。(b) 加上 #463 已经去掉了主要伤害，没有必要再从工具层禁掉。

## 4. 改动

| 文件 | 作用 |
|---|---|
| `ops/v-workspace/skills/v-system-diagnosis/SKILL.md` | 新技能：为什么不交给助手；只读原则（有界 journal、不全表扫会话库、不跑完整 `openclaw doctor`，需要时 `doctor --lint --only <id>`）；A–G 七类问题的具体步骤（定时任务、宿主代理/网络、插件与 V Browser、Gateway/Worker、飞书收发、配置键、卡住的会话）；openclaw 工具还能用在哪；查不出来时给 Tianyi 报什么。所列命令都在 9.1 CLI 上核对过存在。 |
| `ops/v-workspace/agents-md/v-system-diagnosis.md` | 插进 V 工作区 AGENTS.md 的四行规则（505 字符），指向技能路径。 |
| `scripts/install-v-system-diagnosis.py` | 在 V 上安装：备份 AGENTS.md 和旧技能 → 在 `### Real-Time Progress Updates` 之前插入带标记的规则块（再次运行原地替换，幂等）→ 复制技能 → 回读校验；`--check` 只报告，`--uninstall` 按字节还原。拒绝把 AGENTS.md 推过 2 万字符的 bootstrap 上限。 |
| `tests/v-system-diagnosis-install.test.py` | 8 项：只读检查不写、插入位置、块外字节不变、幂等、替换、卸载还原、锚点缺失/重复拒绝、超限拒绝。 |
| `lab/candidate/openclaw-delegate-routing.mjs` + `.plan.json` | VLab candidate A/B，见第 5 节。 |

**为什么规则写进 AGENTS.md 而不是只靠技能描述**：V 的技能目录在提示里被截断。10/25 两个会话的 `systemPromptReport` 都只收进 109 个技能，按字母排到 `geelark-tiktok-login` 为止（默认 `maxSkillsPromptChars` 18000），`makaron`、`v-openclaw-config` 都不在；新技能 `v-…` 也会被截掉。注入的工作区文件只有 AGENTS / SOUL / IDENTITY / USER（TOOLS.md 不在列表里），子 agent 只注入 AGENTS.md。所以 AGENTS.md 是唯一所有会话都看得到的地方，规则里直接写技能路径。AGENTS.md 现为 13132 字符，加上后 13637，离 2 万上限还远。

AGENTS.md 是核心文档，按其「Core Document Modification Rules」，这段 diff 需要 Tianyi 批准后才能装。

## 5. VLab candidate 验证

`lab/candidate/openclaw-delegate-routing.mjs`：独立 candidate Gateway，makaron 用 `/vds`（Codex harness + DeepSeek，和 `/vcodex` 同一个 harness，openclaw 工具同样以动态工具出现；`/vcodex` 需要 ChatGPT 登录，candidate 不复制）。工作区是从 V 只读拿来的 AGENTS/SOUL/IDENTITY/USER/TOOLS/REDLINES 和 `skills/v-openclaw-config`（打包在被 git 忽略的 `tmp/v-workspace-docs.tgz`，不进仓库）。两组交替跑，只差工作区：

- baseline：V 现状；
- fixed：同一份文件跑过 `install-v-system-diagnosis.py`。

每轮新会话，消息复刻 10/22 UM、10/25 V Browser 两次 V 发给助手前的状态（用户请求 + V 已查到的证据 + V 转给助手的那个问题）。判据：Codex rollout 和 OpenClaw 会话镜像里有没有 `openclaw` 工具调用；Gateway 日志里有没有 `openclaw-turn-` / `openclaw.chat`；V 有没有读 `v-system-diagnosis`；有没有自己跑完整 `openclaw doctor`。baseline 必须真的调了 openclaw，结果才有信息量。

结果：见 PR 描述（receipt 在 `tmp/candidate/`，不进仓库）。

重新生成输入：

```sh
ssh v 'sudo -n tar czf - -C /home/openclaw/makaron-openclaw/.openclaw-local/workspace AGENTS.md SOUL.md IDENTITY.md USER.md TOOLS.md REDLINES.md skills/v-openclaw-config' > tmp/v-workspace-docs.tgz
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <task> --plan "$PWD/lab/candidate/openclaw-delegate-routing.plan.json"
```

## 6. 上线（合入后，由生产监控 session 安排）

不需要重启 Gateway：AGENTS.md 和技能每轮都从磁盘读。

```sh
sudo python3 scripts/install-v-system-diagnosis.py --check   # 看 diff 与字数
sudo python3 scripts/install-v-system-diagnosis.py           # 备份到 ~openclaw/.openclaw/backups/workspace-docs/
```

之后在 V 工作区 git 里提交 AGENTS.md 和 `skills/v-system-diagnosis/`。回滚：`--uninstall`，或从备份目录拷回。验收：下一次 V 遇到同类系统问题时，会话里没有 `openclaw` 工具调用、Gateway 日志没有 `openclaw-turn-`，V 读了技能并给出带证据的结论或给 Tianyi 的具体问题。

## 7. 没覆盖 / 顺带发现

- candidate 用 DeepSeek（`/vds`），生产三次都是 gpt-6.1-sol（`/vcodex`）；模型不同，遵从度可能不同。
- 只测了路由（调不调、读不读技能），没测 V 按技能查下去能否真修好 UM 和 V Browser——VLab 没有那两个环境。
- **技能目录截断**：V 的提示里只有 109 个技能，字母序 `geelark-…` 之后全部看不到，包括 `makaron`、`night-shift-operator`、`v-openclaw-config`。影响面远大于本问题，另开处理。
- **TOOLS.md 没有注入**：10/25 两个会话的注入列表里都没有 TOOLS.md（会话过滤逻辑只对群聊去掉 MEMORY.md，原因未查）。TOOLS.md 里「重启只用 `sudo v-self-restart`、不要走 openclaw 工具」那条规则因此只有 V 按启动顺序主动去读时才看得到；TOOLS.md 本身 21783 字节，也超过 2 万字符上限的量级，需要核对。
