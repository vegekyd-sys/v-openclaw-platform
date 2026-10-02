# 后台任务与 Monitor：跨 Harness 方案（待 Tianyi 拍板）

2026-10-02 CST · 分支 `claude/peaceful-volhard-634c46` · 调研与 candidate 验证，**生产 V 未做任何改动**。

## 结论

1. **OpenClaw 里有和 Claude Code 对应的整套机制**，而且全部由 Gateway 托管，与 harness 无关：后台子 agent（`sessions_spawn` + `sessions_yield`）、后台命令（automations `on-exit`）、Monitor（automations `stream`，按行或正则触发）、定时唤醒（automations `at`）、`/loop`。
2. **/vcc 的问题出在 OpenClaw 的 claude-cli 桥，不在 Claude Code。** 9.6 上游已经修了一半：回复先发出去、后台期间不再判卡死，但回合仍然挂到后台结束，期间用户的新消息要排队。这和「回完继续聊、做完再补一条」不是一回事。
3. **推荐方案**：按 10/01 定的理念，后台工作由 Gateway 托管，harness 只负责发起和被唤醒。具体做法是补一个很薄的「后台工具层」，把 `on-exit`/`stream` 包成四个 harness 都能直接调的工具。Claude Code 自带的后台继续关着，改为引导模型用这几个工具。
4. **关键环节已在 candidate 实测通过**：Gateway 托管的后台命令跑着时，用户的第二条消息 3–4 秒就答了；命令结束后 3–7 秒，**原会话、原 harness**（vcc 仍是 claude-cli + opus-5-5）自动起一轮新回合，把输出带给用户。飞书投递还没验，要等拍板后在共享 VLab 上做。

## 1. 对照表：Claude Code ↔ OpenClaw

| Claude Code | OpenClaw 对应 | 托管方 | 完成后 | worker | Codex（vds/vcodex） | claude-cli（vcc） | agent 现在能否自己发起 |
|---|---|---|---|---|---|---|---|
| `Agent(run_in_background)` | `sessions_spawn` + `sessions_yield` | Gateway | 子会话结束后向父会话 announce，起新一轮 | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ |
| `Bash(run_in_background)` | ① `exec background` + `notifyOnExit`<br>② automations `on-exit` | ① 各进程<br>② Gateway | ① 借心跳唤醒<br>② 原会话新一轮，带退出码和输出 | ① ❌ ② ✅ 本次实测 | ① ❌ ② ✅ 本次实测 | ① ❌（没有这个工具） ② ✅ 本次实测 | ① 能发起，但不唤醒<br>② **不能**（上游规定为运维面） |
| `Monitor` | automations `stream`（`line`/`match`） | Gateway | 按批唤醒，批间隔下限 30 s（写死） | ✅ 实测 | ✅ 实测 | ✅ 实测 | 能创建；**不能列出或停止**（同上） |
| `ScheduleWakeup` / `CronCreate` | automations `at` / `every` / `cron`，`/loop` | Gateway | 到点唤醒 | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅（被我们的共享管理补丁限制，见 §4.3） |

「实测」指 candidate 私有 Gateway：后台算一个提示词里没有的乘积，这个数字要出现在**原会话**后续的 assistant 消息里，期间没有人再发消息。前 3 列的证据是 10/01 矩阵（`claude/cross-harness-bg-matrix` @`aad6b89`），`on-exit` 列是本次（§5）。另外，生产 V 10/02 回归时，四个 harness 起的子 agent 都把结果自动发回了飞书群（`docs/acceptance/background-work-20261002.md`）。

**exec 后台为什么三家都不唤醒**（9.1、9.6 一样，都借心跳）：
- 完成事件进 `requestHeartbeat`。V 的心跳是 `every:"0m"`、`isolatedSession:true`、`target:"none"`，所以唤醒跑在 `<key>:heartbeat` 单独会话里，结果不发给任何人。
- worker 的 exec 跑在 worker 进程里，心跳处理器只装在 Gateway，事件永远挂着。
- claude-cli 的回环 MCP 写死排除 `exec`/`process`，理由是「默认交给 Claude 自带的 Bash」（9.1 `mcp-http-*.js:536-562`，9.6 `src/gateway/mcp-http.runtime.ts:186-201`）。
- 近 14 天 V 飞书会话里有 341 个后台 exec，全是 `notify_policy=silent`。

## 2. /vcc 的桥：回合怎么结束

**9.1（生产）** `dist/extensions/anthropic/agent-sdk.runtime.js`：
- OpenClaw 通过 Agent SDK 的 stream-json 常驻进程跑 claude，每个会话一个。Claude Code 2.1.280 一到 `end_turn` 就发 `result`。
- 桥只要看到 `background_tasks_changed` 里有 `local_agent`/`local_workflow`，收到 `result` 就不结束回合（`:300-304`），回复一直扣着不发。
- 回合结束后收到的消息直接丢掉（`:299 if (!turn) return`）。所以后台完成后 Claude 自己开的续接回合、它调的工具，全部被拒或被丢。
- 后台期间没有任何进度，卡死检测在 max(300 s, 3×120 s) 后 `abort_embedded_run`。回复和后台结果一起丢失，这就是 9/27 的事故。
- 启动参数早就禁了 `ScheduleWakeup,CronCreate,Bash(run_in_background:true),Monitor`，只漏了 `Agent` 的后台模式。现在靠 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 补上（PR #74）。

**9.6 上游的改法**（`extensions/anthropic/cli.runtime.ts`，换成了自己的 transport）：

| commit | 内容 |
|---|---|
| `5300e70956c` #132459（9.5） | 后台期间不判卡死：活性截止放宽到上次输出后 15 min |
| `915c6f7ac2c` #154874（9.6） | 后台期间的 `result` 标成 `openclaw_interim_result`，立刻投递；最终拼接时去掉已发段 |
| `aef87fb8e2a` #149967（9.6） | 「前台起、超时转后台」的 Bash 也持有回合 |
| `38dd3c28dd4` #161260（只在 main） | 后台 Bash 完成后回合卡住 |

上游这套改法**仍然没做到**的几件事：
- 回合一直持有到后台结束。持有期间新消息不会写进 CLI，而是进 followup 队列排队（`execute-plugin.ts:524-537` 不提供 queueMessage）。换成 interrupt 模式或 `/stop`，会把进程连同后台子 agent 一起杀掉。
- 父进程超过 15 min 没有输出，照样中止。
- 显式后台 Bash 和 Monitor 仍在禁用列表里，它们在回合结束后才到的完成通知照样丢弃（`:244-247`）。
- 回合外的输出仍然丢弃，没有任何机制把它变成新回合。
- V 9/28 定了暂不升 9.6，要用就得回移到 9.1 的 Agent SDK 版桥，两边结构差别很大。

## 3. 方案比较

| | 做法 | 跨 harness | 改动面 | 主要风险 | 结论 |
|---|---|---|---|---|---|
| **A（推荐）** | Gateway 托管 + 薄工具层：`background_run`（on-exit）、`background_monitor`（stream）、`background_list`/`background_stop`；子 agent 继续用 spawn+yield | ✅ 一套代码四个 harness | 一个插件 + 共享管理补丁一处规则 + 各 harness 的使用说明；不动 core | on-exit 被上游划为运维面，绕开它要定好边界（§4.4）；Gateway 重启会中断后台命令 | 做 |
| B | 回移 9.6 桥：interim 立刻投递 + 后台期间不判卡死，关掉 `DISABLE_BACKGROUND_TASKS` | ❌ 只修 vcc | 9.1 dist 多文件补丁（#132459 3 个文件；#154874 源码 26 个文件，含测试） | 后台期间整个会话排队，违背「继续聊」；子 agent 15 min 无输出照样被杀；升 9.7 时整套作废 | 不做。升 9.7 时随上游自然获得，作为兜底 |
| C | 自研桥：`end_turn` 就结束回合，进程留着；后台完成时 Claude 自己开的续接回合由 Gateway「收养」成新回合 | ❌ 只修 vcc | 桥 + Gateway 新增「无 prompt 附着型回合」入口，上游没有对应概念 | 和上游方向相反，每次升级都要重做；MCP 授权、并发用户消息都要重新设计 | 不做 |
| D | 只放开原生 Monitor / 后台 Bash | ❌ | 改启动参数 | 9.1 和 9.6 都会丢弃回合结束后的完成通知，放开了也唤醒不了 | 不可行 |
| E | 只改配置：心跳 `isolatedSession:false`，让 exec 完成唤醒原会话 | 部分（只修 Codex 的 `gateway_exec`） | 一个配置键，热生效 | 心跳的 model 覆盖（`deepseek-v4-pro`）和 prompt 是否会套到原会话没验证；worker、vcc 仍然不通 | 可作为 A 的补充，单独决定 |

## 4. 推荐方案 A 的细节

### 4.1 工具层（新插件，暂名 `v-background`）

| 工具 | 底层 | 语义 |
|---|---|---|
| `background_run {command, cwd?, label?}` | `cron.add` on-exit，绑定调用者会话 `session:<key>`，`deleteAfterRun`，`delivery: announce` | 立即返回 id；命令结束时原会话起新一轮，消息里带退出码和输出尾部 |
| `background_monitor {command, mode:"line"\|"match", match?, label?}` | `cron.add` stream，绑定调用者会话 | 输出按批唤醒，批间隔 ≥ 30 s |
| `background_list` / `background_stop {id}` | `cron.list`/`cron.remove`，只列和停**本会话**创建的任务 | 补上 agent 现在看不到、停不了自己 stream 任务的缺口 |

- 工具在 Gateway 里调 `cron.add`。插件 SDK 有 `dispatchGatewayMethod`，也可以像夜班 companion 那样用 Gateway client。具体用哪种，实现时以能拿到运维权限、又只作用于调用者会话为准。
- worker 的工具跑在 worker 进程里，同样走 Gateway RPC。这一点要在实现时实测。
- **防重入**：Gateway 启动时会给所有已启用的 on-exit 任务重新挂监视并**重跑命令**（`cron-exit-watchers.ts` reconcile；V 的 `KillMode=mixed`，重启时后台进程会被杀）。工具实际交给 on-exit 的是一个包装命令，第一次执行时写启动标记。重启后再被挂上来，看到标记就不重跑，直接报告「后台命令被 Gateway 重启中断」，由 agent 决定是否重来。生图、视频这类付费命令不会被悄悄重复执行。
- 限额：每个会话同时最多 N 个（建议 4 个），单个最长 24 h（on-exit 自带上限 `864e5` ms）。输出只回传尾部，原样用上游的 `buildCronCommandSummary`。
- 飞书卡片后台行（10/02 上线）目前只统计 task 账本。cron 任务要补进统计，否则后台命令在卡片上看不到。

### 4.2 各 harness 的使用说明

- **vcc**：保留 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 和上游的禁用列表，不打桥补丁。在 V workspace AGENTS.md 和工具描述里写明对应关系：「要后台跑子 agent → `sessions_spawn` + `sessions_yield`；要后台跑命令 → `background_run`；要 Monitor → `background_monitor`；要定时 → automations `at`」。模型调用 `Agent(run_in_background)` 时仍然会被转成前台执行，结果不会丢，只是慢。
- **worker / vds / vcodex**：同一份说明。原生 `exec background` 不再推荐用于「做完叫我」的场景。
- 是否加一个 PreToolUse 拦截，把 vcc 的 `Agent(run_in_background:true)` 直接拒掉并提示改用 `sessions_spawn`（目前是静默转前台）：建议先不加，看说明生效情况再定。

### 4.3 共享管理补丁要放行一条

`patches/cron-shared-management/runtime.mjs:19-31,55-69` 要求创建者带签名的飞书发送者。`:subagent:` 会话和被唤醒的回合一律拒绝。V 上近 7 天有 10 次 `job agentId outside caller scope`。

- 后果：子 agent，或者 `background_run` 唤醒的那一轮，不能再安排下一个后台任务或定时任务。
- 最小放行改法：父回合受理 spawn 或后台任务时，把已签名身份记在 Gateway 侧。子会话或被唤醒回合能取回这份身份、且 agent 和 account 都一致时放行。`:cron:` 不放开。
- 第一版可以不做：用户在飞书里直接发起的后台任务不受影响。

### 4.4 安全边界（需要 Tianyi 定）

- 上游把 on-exit 和 stream 定为「运维面」：agent 工具不能建 on-exit，也看不到 stream（9.1 `cron-tool-*.js assertNoCronShellExecution`、`cron-*.js isOperatorCommandCronJob`）。理由是被监视的命令绕过 agent 的 exec 策略，在回合结束后继续运行。
- V 上 agent 本来就能直接跑任意命令：Claude Code 的 Bash、Codex 自带 shell、worker 的 exec。V 主配置 `tools.profile:"full"`、`deny:[]`，`tools.exec` 未设置（用默认值）。所以方案 A 新增的不是「能执行什么」，而是「回合结束后还能继续跑多久」，对应的约束就是 §4.1 的限额和防重入。
- 如果要更严：`background_run` 只允许 workspace 内的 cwd，或者命令走 exec 的审批策略。

## 5. 本次 candidate 证据

脚本 `lab/candidate/bg-onexit.mjs`，plan `lab/candidate/bg-onexit.plan.json`。私有 Gateway，配置取共享 VLab，Claude Code 私装 2.1.280，带 V 的 `DISABLE_BACKGROUND_TASKS=1`，**保留** V 的 cron 共享管理策略。

流程：
1. 先跑普通的第一轮。
2. 驱动程序扮演 `background_run`：用 Gateway API 建一个绑定该会话的 on-exit 任务，命令 45 s 后打印 `RESULT A*B`。
3. 8 s 后用户再发一条消息。
4. 等原会话里出现带乘积的 assistant 消息。

candidate `candidate-5b9aa4d8-af36-4321-8da4-3d4e330faad0`（worker + claude-cli，13:18–13:20 CST），`candidate-45708883-6317-4566-8760-3e0b0092f6ab` 和 `candidate-97dfbe98-f7e0-4bf0-8eb4-550e26975dac`（Codex，13:21 和 13:24，第二次多采集了 harness 证据）：

| harness | 后台期间第二条消息 | 命令结束 → 原会话回复 | 唤醒那一轮的 harness | 结果 |
|---|---|---|---|---|
| worker（deepseek-v4-flash） | 3.1 s「收到」 | 3 s，`RESULT 11611281` | deepseek（同会话） | PASS |
| claude-cli（opus-5-5，2.1.280） | 4.4 s「收到」 | 7 s，「…RESULT 后面的数字是：23115174」 | claude-cli / claude-opus-5-5 | PASS |
| Codex（vds，deepseek-flash） | 3.7 s「收到」 | 3 s，`28665408` | Codex app-server（三轮都有 `codex app-server …` 启动日志） | PASS |

看到的细节：
- 注入的消息是 `[cron:<id> <name>] <我们的提示> Watched command finished. Exit code: 0 Reason: exit Output: RESULT …`。
- vcc 那一轮日志是 `cli exec: provider=claude-cli … trigger=cron … reuse=invalidated:message-policy historyPrompt=present`：没有复用常驻进程，新起了一个 claude 并带上了会话历史。上下文是完整的，但多一次冷启动。
- 三格的 cron run 都记了 `not-delivered: Channel is required`，因为 candidate 清空了渠道。在飞书会话里应该走会话路由投递（`run-delivery.runtime-*.js commitCurrentSessionCronCompletion` → `requiresExternalDelivery`），这一点**还没有实测**。

## 6. 拍板项与下一步

请 Tianyi 决定：
1. **是否采用方案 A**（Gateway 托管 + 薄工具层；vcc 保留关后台开关，不打桥补丁）。
2. **安全边界**：允许 agent 通过 `background_run` 起回合结束后继续运行的命令，按 §4.1 的限额；还是要更严（§4.4）。
3. **共享管理补丁**是否放行「子 agent 和被唤醒回合继承原发起人身份」（§4.3），还是第一版先不做。
4. **方案 E**（心跳 `isolatedSession:false`）要不要顺手做。

拍板后的顺序：
1. 实现插件和说明，candidate 覆盖四个 harness（含 vcodex）、重启防重入、`background_stop`。
2. 共享 VLab 用 lark-cli 真实飞书验收，每个 harness 都要满足：主回复不被扣住、后台结果出现在飞书、卡片后台行正确。
3. 合 dev → promote 到 V → 生产回归。
