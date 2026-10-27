# Skill Workshop failed：agent 自己用不了 Workshop，worker 会话从不复盘（2026-10-26）

Tianyi 10/26 晚报告：群 `oc_a59571a2…` 出现「Skill Workshop failed」，「之前似乎出现过，我们绕过了，没根治」；补充「codex harness 这个 skill workshop 是长期不能用的，之前都引导 V 用 `openclaw skills workshop apply` 绕开」。

## 群里那一次

会话 `c064e5ef-…`，Codex runtime（gpt-6.1-sol）。
- 19:00:48 `skill_workshop inspect tk-account-purchase-…`，19:02:23 返回 `OpenClaw dynamic tool call timed out after 90000ms`（Codex 动态工具看门狗）。卡片把出错的工具显示成「Skill Workshop failed」。
- 同一个 inspect 18:59 用了 16 s，19:11 用了 0 s。19:00–19:01 Gateway 处在降级：ELU=1、事件循环延迟 6.6 s、heartbeat overdue 4–8.6 s。这一次是 Gateway 主线程停顿的受害者，不是 Workshop 本身的问题。
- 同群其它 Workshop 调用（create / revise / inspect / evaluate）都成功。apply 没有走工具：19:04 Tianyi 让 V 改用 CLI，V 以「系统规则强制 skill 写入走 skill_workshop」拒绝；19:11–19:12 由 CLI（actor=gateway）apply。
- 另：Codex 原生子线程（spawn_agent）里调 skill_workshop 返回 `OpenClaw did not register a handler for this app-server tool call`。这是 Codex 插件对子线程的所有 OpenClaw 动态工具都不注册 handler（`shared-client defaultServerRequestResponse`），不限于 Workshop，本 PR 不处理。

## 「长期不能用」的真因：所有权门，不是 Codex

在 V 上只读扫了 5 个常用 Workshop 的群（oc_8e44fe52 / oc_d0fdd37a / oc_eb6d0748 / oc_94bb1263 / oc_1f2843b2）的会话库，agent 调 skill_workshop 的报错：

| 报错 | 次数 | 之后 |
|---|---|---|
| `Skill Workshop does not own this skill path: <skill>`（geelark-tiktok-login 12、geelark-open-account 3、makaron 2、creator-factory-tour、feishu-group-avatar） | 19 | 每次改跑 `openclaw skills workshop apply … --agent makaron` |
| patch：`skill "<x>" was not used in this run and cannot be repaired autonomously` | 14 | 改走 update |
| update：`description is too large (… max 160)` | 6 | 缩短后重试 |
| `Skill source is not writable by Skill Workshop: agents-skills-personal` | 7 | — |

Workshop 状态库里 9 月以来的 apply：actor=agent 73 次、actor=gateway（CLI/Control UI）142 次。

规则（9.1 `service-query-Bt8YN8NM.js`；上游 9.5 `apply-transition.ts` 原样保留，注释写明是设计）：agent 只能 apply「由一个已 applied 的 Workshop **create** 提案认领」的 skill 的 update；其它 skill 只认 operator（gateway / system）。V 的大部分 skill 早于 Workshop，是手工建的，所以 agent 一 apply 就被拒。Workshop 自己建的 skill（aochuang-review-mini-report、xiaomi-tv-control 等）agent 一直能 apply。没有配置项或 CLI 能改认领（config 只有 autonomous.mode / approvalPolicy / maxPending / maxSkillBytes / allowSymlinkTargetWrites，CLI 没有 adopt）。

这道门在 V 上不提供安全性：V 的 agent 本来就能通过 exec 以 operator 身份跑 CLI apply。它只造成绕路，以及 10/26 这种 V 按系统提示拒绝绕路的情况。和 runtime 无关，只是这些群恰好都跑 Codex。

## 后台复盘失败（`[skills/workshop] skill experience review failed`）

V 10/26 全天 91 次：87 次 `Worker native attempt is no longer active`，3 次 `Auth profile "openai:…" is not configured for deepseek`，1 次 deepseek profile 冷却。

- 87 次：worker 进程里回合结束 → 复盘调度器在 **worker 进程内**调用 runEmbeddedAgent（新 runId `skill-workshop-review:<uuid>`）→ db91 补丁 `runEmbeddedAttempt` 无条件调 `native-attempt-bridge.prepare(input)` → 这个 runId 不是 IPC 登记的 → `current()` 抛错。worker 上跑的会话从来没有被复盘过。Gateway 侧（Codex 回合）的复盘一直在跑：自主捕获 applied 25 条、pending 5 条。
- 3 次：/vds（Codex + DeepSeek）回合把自己的 OpenAI 认证档带进 provider=deepseek 的复盘。

## 改动（`lab/patch-skill-workshop-agent-apply.mjs`，标记 `skill-workshop-agent-apply-v1`）

基线是 V 线上字节（release `v2026.9.1-db91.6-unified-session-20261027`；service-query / experience-review 为未改过的 2026.9.1 原文件）。

1. `core/dist/service-query-Bt8YN8NM.js`：agent 显式发起的 update 提案（`autonomousCapture !== true`）可以 apply 到手工 skill。扫描、评估、目标树哈希、锁、回滚不变。仍然挡住：
   - 自主捕获（后台复盘、前台 patch 修复）——自学习不会自己改写手写 skill；
   - composite（目录里有 `COMPOSITE.json`：makaron、scene-cli）——报错改为提示改 parts/ 再跑 install-composites。
   `OPENCLAW_V_WORKSHOP_AGENT_USER_SKILLS=0` 恢复上游行为。用环境变量不用配置键：`skills.workshop` 是 strictObject，新增键在补丁被覆盖后会让配置校验失败、Gateway 起不来。
2. `worker/native-attempt-bridge.mjs`：`prepare` / `bind` 对未经 IPC 登记、runId 以 `skill-workshop-review:` 开头的本地复盘 run 原样放行；其它未知 run 仍然报错，IPC 登记过的同名 run 仍走原检查。
3. `core/dist/openclaw-tools-BODVdJQD.js`：复盘会话（proposalOnly）的 skill_workshop 在进程内执行，不走 worker 的隔离子进程——子进程只拿到 workspace/agent/session，会丢掉复盘的「只能提案、只能改一次」限制和来源。
4. `core/dist/experience-review-default-Dr4f0pMZ.js`：复盘只在认证档属于复盘 provider 时才沿用前台回合的认证档。

需要一次 Gateway 重启（core dist）和 worker 换代（worker 文件）。不涉及配置。

## 验证

VLab candidate，同一脚本 `lab/candidate/skill-workshop-agent-apply.mjs`，两臂并行（10/27 17:3x）。私有 Gateway + 1 个 worker，渠道/cron 关闭；V 的路由：deepseek-flash 在 worker 跑，/vds（Codex + DeepSeek）在 Gateway 跑。工作区放 3 个没有 Workshop 认领的 skill：A 手写（worker 回合改）、B 手写（/vds 回合改）、C composite。脚本先核对 4 个目标文件是 V 字节（baseline）或补丁版（fixed）。

| | baseline（V 字节，candidate-d2d250fa） | fixed（release 文件，candidate-266741ae） |
|---|---|---|
| A：worker 回合 update + apply | 提案 pending；apply 报 `does not own this skill path` | `Applied`，actor=agent，SKILL.md 已更新 |
| B：/vds 回合 update + apply | 同上 | `Applied`，actor=agent，SKILL.md 已更新 |
| C：composite | `does not own this skill path` | 仍被拒，报错提示改 parts/ 并跑 install-composites；SKILL.md 未动 |
| worker 回合后的复盘 | 356 ms 报 `Worker native attempt is no longer active`（与 V 相同） | 在 worker 内发起模型调用，`model-call-ended`，`decision=continue_normal`，无失败 |

离线：`lab/skill-workshop-agent-apply.test.mjs` 6/6（release 文件 = 补丁作用于 V 字节、幂等、非 V 字节拒绝、桥对本地复盘放行且对未知 run 仍报错）。

未覆盖：这次复盘判定无需提案，没有走到「复盘在 worker 进程内调用 skill_workshop」那一步；该路径的条件（proposalOnly 时不走子进程）只有静态检查。/vds 复盘的认证档修复没有在 candidate 里触发（需要 Codex 回合 ≥10 次模型迭代且前台用 OpenAI 认证档）。

## 未处理

- 群里那次 90 s 超时的根因是 Gateway 主线程停顿（workboard 巡检，另一条线在修）。
- Codex 原生子线程里 OpenClaw 动态工具没有 handler。
- patch 的「本轮没用过该 skill」、description 160 字节上限、`agents-skills-personal` 不可写：都是上游有意的门，报错信息已经说清怎么改，不动。
- 大会话复盘 context overflow（10/26 16:58 估算 715k tokens）：上游后来把复盘上下文限制在 32 KB / 64 条事件，9.1 未回移。
