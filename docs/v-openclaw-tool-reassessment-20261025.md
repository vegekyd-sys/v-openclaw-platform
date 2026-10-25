# V 调用 openclaw 工具（内置系统助手）的重新评估 — 2026-10-25

结论：**(c) 不再调用**，用官方配置 `agents.entries.makaron.tools.deny: ["openclaw"]` 让 V（makaron）拿不到 `openclaw` 工具。2026-10-25 第一版提交的是 (b)：往 V 的 AGENTS.md 加规则，再加一个诊断技能。Tianyi 回复：「V现在自己本来就会做诊断，可以不保留或者不用openclaw这个工具。agent.md加内容我不太赞同」，所以改成这一版：不动 AGENTS.md，不加技能，不靠提示词，也不改 dist。冻结本身由 PR #463（doctor 改在子进程跑）解决。

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

## 3. 三个选项与决定

- (a) 让助手把任务做完：不可行。要能诊断这类问题，就得给它日志和命令能力，而 OpenClaw 强制它只有 `openclaw` 一个工具；即使 #463 上线，一轮 120 s 的上限和 V 侧 90–120 s 的超时也不变。
- (b) V 自己诊断，靠 AGENTS.md 规则加技能来引导：第一版做的就是这个。Tianyi 不赞成往 AGENTS.md 加内容，而且 V 本来就会自己诊断（第 5 节里，两组对照都是 V 自己查完的）。
- **(c) 不再调用：采用。** 理由是第 2 节的记录：诊断类请求 0 件解决、三次冻结。能落地的那几次变更都有替代：重启用 `sudo v-self-restart`，配置用 `v-openclaw-config` 技能或官方 `openclaw config` CLI。Tianyi 已确认不需要保留。

## 4. 改动

只有一份配置补丁：`config/v-makaron-deny-openclaw-tool.json`

```json
{ "agents": { "entries": { "makaron": { "tools": { "deny": ["openclaw"] } } } } }
```

- 用的是 per-agent 的 deny，没用全局 `tools.deny`。系统助手自己的运行（agentId `openclaw`，`toolsAllow: ["openclaw"]`）要用同名的 ring-zero 工具，全局 deny 会连它一起禁掉。其他 agent（v-codex、short-v、xiaoai、dealclaw 等）保持不变。
- 9.1 的工具策略（`agent-tools.policy`，`resolveEffectiveToolPolicy`）会把 `agents.entries.<id>.tools` 的 deny 合进这个 agent 每次运行的工具过滤里，在 harness 之前生效，所以 Codex 的动态工具、Gateway 内的 embedded 运行都过同一道过滤。
- V 生产上 `agents.entries.makaron.tools` 目前是 `{}`，全局 `tools.deny` 是 `[]`，合并后只多这一项。
- Worker 那份配置（`worker-openclaw.json`）不手改：10/03 起它由 Worker 插件从主配置自动推导、逐字复制，手改会被下一次推导覆盖。第 5 节验证了推导后的文件里确实带上了这条 deny。vlab-worker 会话原本就没有 `openclaw` 工具（委托工具只给非 embedded 的运行），写进去也不影响它。

## 5. VLab candidate 验证

`lab/candidate/makaron-deny-openclaw-tool.mjs`：一个 candidate Gateway 进程从头跑到尾。

1. 改前跑两个真实回合并记录工具列表：一个 `/vds`（Codex harness，和生产 `/vcodex` 同一个 harness；`openclaw` 工具以动态工具形式出现），一个走 makaron 默认的 Worker 路由。
2. Gateway 运行中，用官方 `openclaw config patch --file config/v-makaron-deny-openclaw-tool.json` 改配置。记录 `config.schema.lookup` 给出的 reloadKind、Gateway 的日志反应，以及推导出的 Worker 配置。
3. 改后在新会话里再跑同样两个回合。

判据：改前 `/vds` 有 `openclaw`；改后 `/vds` 的工具列表正好少了 `openclaw` 这一个；Worker 路由的工具列表不变；四个回合都正常回复「收到」；Gateway 进程没有退出、没有重启。

CANDIDATE_RESULTS

## 6. 上线（合入后，由生产监控 session 安排）

```sh
openclaw gateway call config.schema.lookup --params '{"path":"agents.entries.makaron.tools.deny"}' --json | grep -m1 '"reloadKind"'
openclaw config patch --file config/v-makaron-deny-openclaw-tool.json --dry-run
openclaw config patch --file config/v-makaron-deny-openclaw-tool.json
```

RELOAD_NOTE

验收：在 V 上找一个 `/vcodex` 会话发一条新消息，看它 `systemPromptReport.tools` 里已经没有 `openclaw`、回复正常；Worker 配置里有同样的 deny。回滚：`openclaw config unset agents.entries.makaron.tools.deny`。

## 7. 没覆盖

- candidate 用的是 `/vds`（Codex + DeepSeek）。生产三次都是 `/vcodex`（gpt-6.1-sol），而 candidate 不复制 ChatGPT 登录。工具过滤按 agent 生效、在模型之前，与模型无关；但 `/vcodex` 的实际列表要等上线后核对。
- `/vcc`（claude-cli）没跑：candidate 没有 Claude 登录。claude-cli 拿到的普通工具走同一套 agent 工具策略；另外那个单独的 `openclaw-tools` MCP（`OPENCLAW_TOOLS_MCP_TOOLS=openclaw`）只给系统助手自己的运行用，不给普通 agent。上线后用一个 `/vcc` 会话核对。
- 第一版附带的发现（V 提示里的技能列表截断在 `geelark-…`、TOOLS.md 没有被注入）与本 PR 无关，已另开处理。
