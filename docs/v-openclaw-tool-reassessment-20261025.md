# V 调用 openclaw 工具（内置系统助手）的重新评估 — 2026-10-25

结论：**(c) 不再调用**，用 Codex 插件自带的官方配置 `plugins.entries.codex.config.codexDynamicToolsExclude: ["openclaw"]`，把 `openclaw` 工具从 V（makaron）的 Codex 回合（`/vcodex`、`/vds` 等）里去掉。三次冻结都发生在这条路由上。不动 AGENTS.md，不加技能，不靠提示词，也不改 dist。冻结本身由 PR #463（doctor 改在子进程跑）解决。

过程：10/25 第一版做的是 (b)，往 V 的 AGENTS.md 加规则、再加一个诊断技能。Tianyi 回复：「V现在自己本来就会做诊断，可以不保留或者不用openclaw这个工具。agent.md加内容我不太赞同」，于是改成用配置禁用。之后实测发现，per-agent 的 `tools.deny` 会关掉 Codex 原生工具面（见第 4 节），Monitor session 受 Tianyi 授权选了现在这个方案。

## 1. 调用链（V 运行时 `db91-release-v2026.9.1-db91.6/core/dist`，只读）

| 环节 | 文件 | 事实 |
|---|---|---|
| V 看到的工具 | `openclaw-tools-BODVdJQD.js` `openclaw-delegate-tool.ts` | 名字 `openclaw`，描述「Ask system expert. Gateway restart, config, channels, plugins, agents, models/providers, updates.」参数只有 `message`。在 Gateway 进程内调 `openclaw.chat` RPC，超时 120 s。只给非 embedded 的运行：V 上是 Codex harness（`/vcodex`、`/vds`）和 Gateway 内的 openclaw/claude-cli harness；vlab-worker 会话里没有这个工具。 |
| 助手的一轮 | `onboarding-welcome-n6nqb6Kf.js` `system-agent/agent-turn.ts` | `runId=openclaw-turn-<uuid>`，`runEmbeddedAgent({ toolsAllow: ["openclaw"] })`，一轮超时 `AGENT_TURN_TIMEOUT_MS = 120000`；会话是内存会话。超时后退回一个不带工具的 planner，答案只是复述输入。 |
| 助手的工具 | `system-agent-tool-a5BdkF7s.js` | 唯一工具也叫 `openclaw`（ring-zero），动作固定：status / models / agents / channels / channel_info / config_get / config_schema / gateway_status / plugin_search / validate_config / **doctor** / audit；引导：connect_channel 等；写：setup / set_default_model / config_set / config_set_ref / create_agent / gateway_* / plugin_*，委托来的写操作一律要 operator 审批卡。`selection-BC0YSSFq.js` 强制 `toolsAllow` 必须恰好是 `["openclaw"]`，否则抛错。 |
| 助手的约束 | `assistant-prompts-CpN0ZIvY.js` `SYSTEM_AGENT_SYSTEM_PROMPT` | 面向「装机/修复 OpenClaw」：工作区、Gateway、渠道。禁止 doctor 修复（「tell the user to exit and run `openclaw doctor --fix`」）、禁止改模型路由/auth/models/env/secrets。 |
| doctor | `operations-CTofDiKh.js` | `await doctorCommand(runtime, { nonInteractive: true })` 在 Gateway 主线程跑，含两项全量转录扫描（PR #463 实测 V 规模 264 s 最长单次阻塞）。报告写到 Gateway 的 stdout，工具结果只拿到两行 warning。 |

所以助手**读不了日志、文件、进程、环境变量、插件内部状态，也执行不了命令**；它能做的诊断只有读配置和跑 doctor。这是 OpenClaw 的设计（ring-zero、只给系统助手一个工具），不是配置问题。

官方开关：`agents.defaults.systemAgent` 只有 `agentId`，没有关掉委托的开关。能从工具层去掉它的有两个：agent 工具策略 `tools.deny`，以及 Codex 插件的 `codexDynamicToolsExclude`（只作用于 Codex 回合），见第 4 节。

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
- (b) V 自己诊断，靠 AGENTS.md 规则加技能来引导：Tianyi 不赞成往 AGENTS.md 加内容，而且 V 本来就会自己诊断（第一版对照的两组都是 V 自己查完的，见附录）。
- **(c) 不再调用：采用。** 诊断类请求 0 件解决、三次冻结。能落地的那几次变更都有替代：重启用 `sudo v-self-restart`，配置用 `v-openclaw-config` 技能或官方 `openclaw config` CLI。

## 4. 用哪个配置键

两个官方候选都在 VLab candidate 上实测过（`lab/candidate/codex-exclude-openclaw-tool.mjs`，`DENY_VARIANT=agent|codex`）：

| | `agents.entries.makaron.tools.deny: ["openclaw"]` | `plugins.entries.codex.config.codexDynamicToolsExclude: ["openclaw"]` |
|---|---|---|
| 去掉 openclaw 的路由 | 全部（Codex、Worker、Gateway 内 harness） | 只有 Codex app-server 回合 |
| 其他工具 | **Codex 路由被判为「策略受限」**：Codex harness 只把 `CODEX_TOOL_POLICY_SAFE_DENY_NAMES`（web_fetch、memory_search、gateway、message 等 16 个）当作可安全拒绝，`openclaw` 不在其中；只要 agent 策略里有它不认的 deny，`shouldEnableCodexAppServerNativeToolSurface` 就返回 false，关掉 Codex 原生工具面。`gateway_exec`/`gateway_process` 消失，换成 OpenClaw 的 `read/edit/write/apply_patch/exec/process/*_goal`。对照组（deny 一个不存在的工具）一样会这样，冷启动也一样 | 不变：`/vds` 正好少一个 `openclaw`；对照组（排除一个不存在的工具）列表完全不变 |
| 生效方式 | `agents.entries` 热生效，不重启（约 10 s） | `plugins.entries.*` 热改会全量重载插件（实测约 40 s），和 9/20 停摆是同一条路径，所以上线走重启 |
| 证据 | candidate-bee8efea | candidate-cfea0cb5 |

采用右列。按 provider 写的 `tools.byProvider` 不可行：V 上 Codex 路由（`openai/gpt-6.1-sol`、`openai/gpt-6-sol`、`openai/gpt-5.6-sol`、`openai/gpt-6-astra`、`deepseek/vds-deepseek-flash`）和非 Codex 路由用的是同一批 provider，provider 级 deny 会落到 Codex 上，按模型逐个列名单又太脆弱。

### 已知缺口

其他路由还保留 `openclaw` 工具。V 近期有工具记录的会话里，Gateway 内 openclaw harness 约 75 个、vlab-worker 约 47 个、claude-cli 2 个，都带着它（按 `systemPromptReport.tools` 统计）。近 14 天的 3 次调用、9/05 以来的 38 件请求里，找不到这几条路由发起的调用记录（journal 只到 10/17，更早的无法按路由区分）。要连这些路由一起去掉，只有 per-agent deny，代价是上面左列的 Codex 退化。

## 5. 改动

`config/v-codex-exclude-openclaw-tool.json`（同一内容，供 `openclaw config patch --file` 使用）：

```json
{ "plugins": { "entries": { "codex": { "config": { "codexDynamicToolsExclude": ["openclaw"] } } } } }
```

V 现在的值是 `[]`（主配置与 Worker 配置都是），数组整体替换成 `["openclaw"]`，没有其他排除项会被冲掉。

## 6. VLab candidate 结果（candidate-cfea0cb5，`/vds` + makaron 默认 Worker 路由，V 的 reload 设置）

| 阶段 | `/vds`（Codex） | Worker 路由 |
|---|---|---|
| before | 123 个工具，含 `openclaw` | 130 个，含 `openclaw` |
| control（排除不存在的工具，热改） | 不变 | 不变 |
| hot（热改本补丁） | 122 个，只少 `openclaw` | 不变 |
| restart（带本补丁冷启动） | 122 个，只少 `openclaw` | 不变 |

8 个回合全部正常回复「收到」。热改时 CLI 打印 "Restart the gateway to apply"，但 `config.schema.lookup` 给出 `reloadKind: hot`，Gateway 实际在约 40 s 后 `config hot reload applied`，期间全部插件重载、Worker 代际排空换代；Worker 配置约 6 s 后由推导写入同样的值。Gateway 进程全程没换。

## 7. 上线（由生产监控 session 安排）

不要在运行中热改（会全量重载插件）。和其他需要重启的改动放进同一次 `v-self-restart`：

```sh
sudo v-self-restart --reason "PR #479: drop the openclaw tool from Codex turns" \
  --requested-by "<谁、在哪、几点批准>" --chat <oc_群id> --session-key <会话 key> \
  --set 'plugins.entries.codex.config.codexDynamicToolsExclude=["openclaw"]'
```

- `--set` 先 dry-run 校验，停机后用 `openclaw config set <path> '["openclaw"]' --strict-json` 写进**主配置** `/home/openclaw/.openclaw/openclaw.json`；停机前会备份主配置和 Worker 配置两份，失败按字节回滚。
- **Worker 配置** `/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json` 不要手改：10/03 起它在 Gateway 启动和主配置变化时由 Worker 插件自动推导、逐字复制（candidate 里约 6 s，日志 `Worker config derivation (overlay v1): rewrote Worker config, 1 changed path(s): plugins.entries.codex.config.codexDynamicToolsExclude`）。Codex 回合跑在 Gateway 进程里，读的是主配置；Worker 那份只是保持一致。

上线后核对：

```sh
sudo python3 -c 'import json
for p in ("/home/openclaw/.openclaw/openclaw.json","/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json"):
    print(p, json.load(open(p))["plugins"]["entries"]["codex"]["config"]["codexDynamicToolsExclude"])'
```

两份都应是 `['openclaw']`。然后在一个 `/vcodex` 会话发一条新消息，确认回复正常，且该会话 `systemPromptReport.tools` 里没有 `openclaw`、仍有 `gateway_exec`。回滚：同样用 `--set 'plugins.entries.codex.config.codexDynamicToolsExclude=[]'`。

## 8. 没覆盖

- candidate 用的是 `/vds`（Codex + DeepSeek），`/vcodex`（gpt-6.1-sol）要 ChatGPT 登录，candidate 不复制。排除在 Codex 插件构建动态工具列表时按名字过滤，和模型无关；但 `/vcodex` 的实际列表要在上线后核对。
- 其他路由保留 `openclaw`（第 4 节「已知缺口」）。
- 第一版附带的发现（V 提示里的技能列表截断在 `geelark-…`、TOOLS.md 没有被注入）与本 PR 无关，已另开处理（v-skills-truncation session）。

## 附录：第一版 (b) 的对照

candidate-b909e0bf（`/vds`，UM 与 V Browser 各 2 轮 × 两组）：两组都 0 次调用 `openclaw`，DeepSeek 下复现不了生产的触发；装了规则的一组读了技能、中位 320 s 完成，未装的一组 353 s。这说明 V 本来就会自己诊断，也是 Tianyi 不需要那条规则的依据之一。
