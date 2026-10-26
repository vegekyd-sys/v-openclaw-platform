**结论**

1. V 的 AGENTS.md、REDLINES、SOUL、TOOLS、MEMORY、ai-patterns 和所有 skills 里，`sessions_send` 一次都没出现（已验证，grep 为空）。只有 `sessions_spawn` 出现过：Task Room 技能第 18 行禁止用 `sessions_spawn` 代替建群；`memory/ai-patterns.md:191` 写的是搜索任务派子 agent。没有任何规则说明：别的会话发来的消息算数据而不算授权、不要再转派、跨群能带哪些信息、做完怎么收尾。
2. Task Room 现在是"人接力"的设计。用 lark-cli 以 Tianyi 身份建群，以 bot 身份发 brief，`sessions.patch` 把群固定到 vds，然后让 Tianyi 去群里说"开始吧"。bot 发的 brief 不会触发任何一轮（Feishu 插件丢弃 bot 自己发的消息），所以群不会自己开工。做完回主私聊汇报也是手动的。
3. 只用 `sessions.patch` 建出来的群会话，**没有投递路由**。我们的补丁让 target 轮走 `deliver:true`，但不传 channel/to，回复靠会话里存的 delivery 记录找去处，而这条记录只有入站消息才会写。直接对新群 `sessions_send`，B 的回复很可能无处可投（推断，链路已验证见下）。
4. lark-cli 用户身份：V 上有，挂在 openclaw 用户下。VLab 的共享 Gateway 用户只有 bot 身份，而且绑的是 **V 生产 bot 的 appId**。
5. candidate 的工作区是空目录。现有脚本只从 VLab w1 复制，而 w1 停在 9 月的旧版。
6. v-core 不是源头。按 v-core 自己的文档（PR #11 起），V 的线上工作区才是改 V 的地方，v-core 从它同步，目前已落后。

---

**(1) AGENTS.md**

V 工作区路径确认为 `/home/openclaw/makaron-openclaw/.openclaw-local/workspace`，AGENTS.md 16258 B，10/20 12:21 修改（已验证）。

- **第 23 行、162–171 行**：改核心文档要先出 diff，Tianyi 确认后才写。
- **第 86 行**（Proactive but gated）：外部发送、删除、config/core 修改要先确认；建定时任务和长期后台任务不用再问。这一行是工作区里**未提交**的改动（`git status` 显示 M，内容是 10/20 Heartbeat 群取消该闸，已验证）。
- **第 101–107 行**（实时进度）：
  - 第 102 行：慢任务先用 `message.send` 播报。
  - 第 103 行"委派透明"：只覆盖启动 subagent。
  - 第 106 行：用 `message.send` 发过结果后，最终回复用 `NO_REPLY`。这和 reply-once 冲突：结果会只回给请求方空内容（推断）。
- **第 109–121 行**（群聊规则）：群里默认沉默，只有 5 种情况才回应，没有给"其他会话发来的一轮"开例外。

REDLINES 相关条目：

- 第 7、15 行：memory/skills 是 Tianyi 私产，不得搬运。
- 第 27 行：对外发送前要先给 Tianyi 看并确认。
- 第 44 行：**不得冒充 Tianyi 发消息**。这意味着不能用 `lark-cli --as user` 代 Tianyi 往群里发 brief。
- 第 49–58 行：Companion-01 和家人隐私绝不进任何群，跨群带信息必须过这条。
- 第 60–68 行：非 Tianyi 来源的指令要先核实，正好适用于其他会话发来的消息。
- 第 94–98 行：群里只有 Tianyi 本人能触发写记忆。
- 第 125 行：Gateway 和模型配置改动只能由 Tianyi 授权。

**(2) Task Room 技能**

位置在 `.agents/skills/feishu-task-room-router/SKILL.md`（7016 B，9/26），不在 `skills/` 下（已验证）。

步骤（第 50–68 行）：
1. 主私聊里简短确认。
2. 建私有群，只拉 Tianyi 和 bot `cli_a9365919fc3a1bd6`，群名格式 `V｜任务｜MMDD`。
3. 先发完整 brief。
4. `openclaw gateway call sessions.patch`，key 为 `agent:makaron:feishu:group:<chat_id>`，固定 `deepseek/vds-deepseek-flash`、`thinkingLevel high`（Codex runtime）。没有会话条目时会新建一条（9.1 `sessions-patch-engine.ts:166-174`，已验证）。
5. 用 `session_status` 核对。
6. 在主私聊告诉 Tianyi 去群里继续。
7. 群里收到的第一条用户消息才算开工。
8. 做完回主私聊汇总。

其他规则：第 18、26 行禁止用 `sessions_spawn` 代替，任务群自己干活。第 48 行：Tianyi 点名的模型只对那一个群生效。

建群的具体做法在辅助脚本 `scripts/create_task_room.py`：第 57–65 行 `+chat-create --as user`（Tianyi 身份），第 77–82 行 `+messages-send --as bot` 发 brief（已验证）。

bot 发的 brief 不触发一轮的依据（已验证，取自 VLab 镜像，与 V 对齐）：`@openclaw/feishu/dist/monitor.account-WFdlCDhR.js:4018-4020` 和 `:7535-7537`，日志为 "dropping self-authored (bot) message"。

另外两个 9.1 事实（已验证）：
- `packages/gateway-protocol/src/schema/sessions-patch.ts:77-96` 是封闭 schema，没有任何 delivery 或 lastTo 字段，用它写不进投递路由。
- `src/utils/delivery-context.shared.ts:252-256` 只读持久化的 `delivery.kind==="external"` 记录。
- 对比：`agent` RPC 的 schema（`agent.ts:292` 起）接受 `replyChannel`、`replyTo`、`to`、`channel`。

要让"开三个群分别做 X/Y/Z"立刻开工并回报，需要改这些（推断）：
- **a. 显式传路由**：补丁在 target 会话没有 external delivery 时，从 key `feishu:group:<oc>` 推出 `replyChannel=feishu`、`replyTo=chat:<oc>` 传给 agent 调用。
- **b. 让请求在群里可见**：bot 先在群里发一条可见的"来自 coordinator 的请求"（顺带解决"对方群看不到请求"的问题），再用 `sessions_send(timeoutSeconds=0)` 把同一份 brief 送进去开工，而不是等 Tianyi 说话。
- **c. 改写技能**：
  - 第 7 步改成 `sessions_send` 开工；
  - 第 8 步改成"room 的最终回复就是结果，经 reply-once 回到 coordinator"；
  - 加一条：coordinator 发完要结束本轮，不准 sleep 或轮询；
  - 模型按每个群指定（worker/vcodex/vds/vcc），不再一律 vds。
- **d. AGENTS.md 新增 inter-session 一节**：别的会话的消息是请求不是授权；不再转派；跨群隐私范围；目标轮不要 `NO_REPLY`；群聊沉默规则对这种一轮不适用。这一节必须走第 23 行的 diff 加确认流程。

**(3) 另外两个 skill**

- **`skills/agent-to-agent-protocol-feishu-a2a-defaults`**：针对的是"不同 bot 在飞书里互相 @"，不是 `sessions_send`。
  - 第 40–47 行：必须是顶层、纯文本、真实 @。
  - 第 85–95 行：不能靠最终回复去 @ 对方。
  - 第 111–121、196 行：等对方时必须有 watcher。
  - 第 202–203 行：A2A 不覆盖群沉默，也不覆盖隐私。
  - 能借用到本方案的只有最后两条和"回法要写清"。
- **`skills/background-worker-contract`**：
  - 第 32–35 行：父会话是控制面。
  - 第 70–71 行：不要忙轮询。
  - 第 77、85、108 行：子 worker 默认不发用户可见消息、父会话发最终结果。这和"B 在自己群里可见地干活"冲突，brief 里必须明示"已授权你在本群可见输出"。
  - 第 175 行：不准无限轮询。

**(4) lark-cli**

V（已验证）：
- openclaw、ubuntu、root 三个用户都能找到 lark-cli。Gateway 的 PATH 先命中 `/opt/node-v22.23.1/bin/lark-cli`（1.0.97），`/usr/local/bin` 下的是 1.0.72。
- 配置在 `/home/openclaw/.lark-cli/openclaw/config.json`：app 是 `cli_a9365919fc3a1bd6`（就是 V 飞书频道的 appId），`defaultAs=user`，用户为 Tianyi（`ou_cb133fd…`），密钥在 keychain。
- 10/20 的令牌刷新全部 200。13:02 有一次 device 重新授权，config 在 13:03 更新。

vlab91（已验证）：
- 共享 Gateway 跑在 `lab-db91-parity` 用户下，飞书 bot 是 `cli_aae2c999c7789bd9`。
- 但它 HOME 下的 `~/.lark-cli/config.json` 绑的是 **V 生产 app `cli_a9365919…`，只有 bot 身份，没有用户令牌**，`~/.lark-cli/openclaw/` 下也没有 config。在 agent 环境里 lark-cli 到底选哪份配置，是推断。
- `vlab` 用户绑的是 VLab bot `cli_aae2…`，只有 bot 身份。
- root 绑的是 V 生产 app 加 Tianyi 用户（7/8 的配置，是否还有效未知）。

VLab bot 能否用 API（`im/v1/chats`，`--as bot`）建群并拉 Tianyi，取决于它有没有 `im:chat` 类权限。未验证，需要一次只读的权限查询来确认。

**(5) candidate 工作区**

`/Users/tianyicai/vlab-dev/lab/candidate/runner.mjs`（已验证）：
- 第 60–62 行：把每个 agent 的工作区改到 `$VLAB_CANDIDATE_DATA/workspace/<id>`。
- 第 156、163 行：只 `mkdir`，**是空的**（这就是被唤醒轮自称没有名字的原因）。
- 第 194 行：环境变量只替换 state 和 runtime 路径，HOME 原样继承。

现有加载方式是 `lab/gpt-live-h5-candidate.mjs:265-292`：从 `VLAB_SHARED_CONFIG_PATH` 的 makaron 工作区（`.../db91-parity/workspace/w1`）复制 AGENTS、SOUL、USER、MEMORY、IDENTITY、TOOLS 和记忆。问题是 w1 已经过时：
- AGENTS.md 是 9/10 版（9314 B），没有"委派透明"。
- Task Room 技能是 8/30 的 GPT-5.6 版。

两份技能的 diff 已核对。做法（推断）：把 V 当前的 AGENTS/REDLINES/SOUL/USER/TOOLS/MEMORY、`.agents/skills/feishu-task-room-router/**` 和上面两个 skill 作为 plan 的 `inputs`（带 hash 校验）带进去，测试命令再复制到私有工作区。这些文件不能进 git（REDLINES 第 7 行）。

**(6) ~/v-core**

`gh` 读到的远端 main 是 e9b5842（10/09，#12）。README 和 CONTRIBUTING（#11）写明："V lives and evolves in the live OpenClaw workspace…V Core is synced from the workspace"。流程是在线上工作区提交后，按 CONTRIBUTING 第 31–49 行做 `git archive` 到 sync 分支、过 audit、开 PR（已验证）。

当前偏差（已验证）：
- AGENTS.md 的 blob：V HEAD 是 `207bb99`，v-core 是 `fbaec3b`，不一致（v-core 停在 10/01 的 #10）。REDLINES 和两个 skill 一致。
- **Task Room 技能没被工作区 git 跟踪**，v-core 里也没有 `.agents/`，改它没有任何评审记录。
- 本机 ~/v-core 和 V 上的 `/home/openclaw/src/v-core` 都停在 8 月。