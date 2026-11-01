# 默认 harness 换 Codex（/vds）：未决项与灰度方案

2026-11-01 CST。这里没有切换，V 的配置和进程都没动。切换要 Tianyi 单独点头。

标注：**(V)** 是在生产 V 上只读得到的，**(VLab)** 是 VLab candidate 实测（4 核、同机还有别的任务，数字说明机制，不代表生产收益），**(代码)** 只读了 V 的 dist 没有运行。证据文件都在 `docs/evidence/codex-default-rollout-20261101/`，文中写作 `pin-a` 等；旧证据在 `docs/evidence/harness-compare-20261031/`。没有向测试群发消息，全部用 candidate。

## 结论

1. **不要改默认模型。** 用 `channels.modelByChannel` 把交互群换到 /vds，默认仍是 flash，夜班、cron、子 agent 就都留在 Worker，不用改代码（`pin-c`）。第 3 批就是目标状态。第 4 批“改默认”可以不做，要做还得先上 Workboard 补丁。
2. **安全问题的答案：飞书审批没有变宽，但有两种情况比 Worker 宽。** V 上 exec 和原生 shell 都不出审批卡，两边一样；V 没有插件用 `requireApproval`。变宽的是 `before_tool_call` 策略：一是 `write_stdin` 不过钩子，二是 relay 启动晚于 1 s 时 Codex 杀掉钩子后照样执行工具。后者的小补丁在本 PR，已验证；前者要 Tianyi 决定。
3. **语音不阻塞。** consult 跟默认模型走，所以方案 1 下语音留在 Worker。确认门在 Codex 上真的生效，Worker 上被绕开，但 V 现在是默认放行，两边行为一样。
4. **长 computer 回合不阻塞灰度，但更贵。** Codex 没有回合内裁剪：20 帧后请求体 8.42 MB，Worker 是 1.03 MB。要到约 117 帧才碰 48 MiB 上限；碰到时回合报错，下一条消息能恢复。
5. **灰度开关要重启。** 手写配置约 1 s 后 Gateway 就开始自己重启，所以每批都走 `v-self-restart --while-stopped`，一次约 2 分钟（V 启动 91 s）。回退同样一次重启，上下文来回都保留。

### 仍然阻塞切换的项目

| # | 项目 | 挡住哪一批 | 状态 |
|---|---|---|---|
| 1 | 上游挂起无回复：Codex 超过 930 s 不回复也不回退（VLab，旧证据） | 第 2 批起 | 看门狗没做 |
| 2 | relay 启动晚时策略失效（第 3 节） | 第 2 批起 | 补丁在本 PR，未合、未上 V |
| 3 | `write_stdin` 绕过策略（第 3 节） | 第 3 批前 | 等 Tianyi 决定接受还是关掉 |
| 4 | 回退链：V 现在是 `[luna]`，/vds 失败会花 ChatGPT 额度，不会回 flash | 第 1 批 | 配置改一项，见第 5 节 |
| 5 | 高并发 Gateway 开销：V 上 c15 五步 Codex 43.5–46 s、Worker 19–22 s，RSS 6.5–6.9 vs 2.3–3.1 GB（10/31 与 11/01 实测，见记忆 harness-compare-20261031） | 第 4 批。夜班留在 Worker 时只看真实交互并发，第 3 批靠指标决定 | 未 profile 到根因 |
| 6 | Workboard 固定补丁未合未上 | 只挡第 4 批 | 补丁在本 PR |

## 1. 夜班和定时任务

**现状。** 默认一改，Workboard 卡、cron、子 agent 全跟到 Codex。V 的默认模型写在两处，`agents.defaults.model` 和 `agents.entries.makaron.model`，后者才是 makaron 实际生效的 (V)。夜班实例的 `agentBindings` 全是 `makaron` (V)，它只调 `workboard.cards.dispatchWithOptions`，不传模型 (代码，v-nightshift `7fb5d32`)。

规模 (V，近 7 天有更新的会话，按当前窗口计)：Workboard 4022 个里 3903 个 openclaw（Worker 内部的名字）+ 119 个 vlab-worker；cron 活跃 `agentTurn` 任务 48 个没写模型、18 个写死 flash、6 个写了别的。

**证据**（实际运行 harness，VLab）：

| 配置 | 聊天 | Workboard 批量派卡 | cron 无模型 | cron 带 `payload.model` | `sessions_spawn` | 文件 |
|---|---|---|---|---|---|---|
| 默认 /vds | Codex | Codex | Codex | Worker | Codex（旧证据） | `pin-a`, `scenarios-progress.jsonl` |
| 默认 /vds + `subagents.model=flash` | Codex | **Codex** | Worker | Worker | Worker | `pin-b` |
| 同上 + 本 PR 的 Workboard 补丁 | Codex | Worker | Worker | Worker | Worker | `pin-d` |
| 默认 flash + `modelByChannel` | Codex | Worker | Worker | Worker | Worker | `pin-c` |

`pin-a` 里 `sessions_spawn` 的子会话两次都没查到记录，所以这一格引用 10/31 的结果。

**是否阻塞。** 走方案 1 不阻塞。改默认则阻塞，因为只有配置项固定不住 Workboard。

**修法。**
- 方案 1（推荐）：默认不动，用 `modelByChannel`。不改代码。
- 改默认时：`agents.entries.makaron.subagents.model=deepseek/deepseek-flash` 固定 cron 和 spawn，加 `scripts/apply-workboard-subagent-model-patch.mjs` 固定 Workboard。不要依赖 `workboard.cards.dispatch` 的 `provider/model` 参数：实测传了 flash 还是跑 Codex（`pin-a`），原因没查，夜班也不走这条。
- 卡上没有模型字段，补丁读的是配置，不用改夜班。

**注意。** 方案 1 下，`explicit` 这种没有投递渠道的会话，子 agent 回报触发的那一轮走默认模型：`pin-c` 的父会话最后一轮落在 Worker。飞书会话带投递渠道，按代码（`agent-command` 的 `sessionDeliveryChannel`）应该仍命中，但真实飞书没验证。

## 2. 语音

**现状。** V 的配置是 `brain=agent-consult`、`consultRouting=provider-direct`，没有 consult 专用模型；`consultThinkingLevel=low`、`consultFastMode=true` (V)。

- `talk.client.toolCall` 走 `chat.send`，跟会话模型走，也就是跟默认走。默认 /vds 时跑 Codex，会话单独切 flash 时跑 Worker（`voice-off`，VLab）。
- GPT Live H5 用的原生 runner（`createTalkClientAgentConsultRunner`）不传模型，用 `runEmbeddedAgent` 的默认值，不查 `modelByChannel` (代码，未运行)。
- 所以方案 1 下语音留在 Worker，前提是 map 里**不要写 `webchat`**。candidate 为了能触发才用它，生产只写飞书群 id。

**确认门**（`OPENCLAW_VOICE_SPOKEN_CONFIRMATION`，V 未设置 (V)）。门只对有用户转录的语音会话生效，所以第一次测试没写转录是假通过，已重测：

| 开关 | harness | 改动类命令 | 文件 |
|---|---|---|---|
| 未设置（V 现状） | Codex | 执行 | `voice-off` |
| 未设置 | Worker | 执行 | `voice-off` |
| =1 | Codex | **拦下**，返回 `VOICE_CONFIRMATION_REQUIRED`，未执行 | `voice-on` |
| =1 | Worker | **执行**（绕开，与 #196 时的结论一致） | `voice-on` |

**是否阻塞。** 不阻塞。默认放行时两边一样。如果以后打开开关，Codex 是真拦，Worker 还是绕开。

**修法。** 不用改。没验证的见文末。

## 3. 飞书审批卡

**明确回答：飞书审批没有比 Worker 变宽；`before_tool_call` 策略有两种情况比 Worker 宽。**

V 现状 (V)：
- `tools.exec` 未配、`exec_approvals_config` 的 defaults 为空，即 `security=full`、`ask=off`，Worker 的 exec 从不出卡。Codex 是 `mode=yolo`、`approvalPolicy=never`、`danger-full-access`，也不出卡。两边 shell 权限相同。
- `operator_approvals` 历史一共 7 行，全是 `system-agent`，最后一条 10/06，没有 exec 或 plugin 类型。
- 线上 v-browser、v-desktop-handoff、v-session-relay 都没有 `requireApproval`。`system-agent` 审批来自 `openclaw` 工具，makaron 上被 deny，Codex 也排除了它。

所以今天没有“需要审批的操作”在切换后被放行。下面是假如有插件要审批或拦截时的行为（VLab，探针插件 `rollout-probe`）：

| 情况 | Codex | Worker | 文件 |
|---|---|---|---|
| shell 命令进钩子 | 进，工具名 `exec` | 进 | `policy` |
| `block` | 拦下 | 拦下 | `policy` |
| 无审批路由时 `requireApproval` | 拒绝 | 拒绝 | `policy` |
| 钩子 4 s 才答 | 拦下 | 拦下 | `hook` |
| 钩子 14/30/90 s | 9 s 处拒绝（`Native hook relay timed out`）3/3 | 14 s 拦下，30/90 s 在 15 s 处拒绝 | `hook` |
| 原生 shell 审批，1.7 s 内答复 | 建 `plugin` 行，放行后执行 | 拒绝：`signed plugin approval owner is unavailable`，不建行 | `hookrepeat` |
| 原生 shell 审批，没人答 | 9 s 处拒绝，人来不及点 | 同上 | `hook` |
| 动态工具审批 | **钩子跑两次，要批两次**：第一条 2.1 s 批准，第二条 45 s 超时，工具没执行 | 同上 | `hookrepeat` |
| 命令 base64 编码后执行 | 规则匹配不到，执行 | 同样执行 | `policy` |
| **往运行中的 shell 写命令** | **`write_stdin` 不进钩子，执行** 2/2 | `process submit` 进钩子，被拦 1/1 | `policy`, `policy2` |
| **钩子答不上且 relay 启动晚** | **Codex 10 s 杀钩子后执行工具** 3/3 | 不适用（进程内，超时拒绝） | `hookdelay` |

第二个“更宽”的机制 (VLab + 代码)：relay CLI 的期限是 9 s，但从它自己的代码开始算；Codex 的钩子超时是 10 s，从进程启动算；钩子超时后 Codex 按没有决定处理，继续执行。启动晚 0 或 0.5 s 时 4/4 被拒绝，晚 2.5 s 时 3/3 在第 10 s 执行。`policy` 里还自然出现过 1 次（当时机器忙，没有留下转录），之后同配置 10 次（`hook` 3 次、`hookrepeat` 6 次、`policy2` 1 次）未复现，所以把它归到这个机制是推断。V 上 relay 冷启动约 0.07 s（快路径，见 PR #529 证据），触发条件是钩子 9 s 答不上**且**启动晚 1 s 以上，V 的 Gateway 冻结加上 CPU 紧张时才可能。

**是否阻塞。**
- 审批卡本身不阻塞，都是拒绝方向的失败。缺点是 Codex 上审批基本不可用：原生 shell 只有 9 s，动态工具要点两次。V 目前不用，有人要加审批时才是问题。
- relay 启动晚：第 2 批前修。
- `write_stdin`：第 3 批前由 Tianyi 决定。

**修法。**
- relay：`scripts/apply-relay-deadline-process-start-patch.mjs`，期限改从进程启动算，约 1 行。candidate 验证：启动晚 2.5 s 3/3、6 s 1/1 全部拒绝；晚 11 s 仍执行，这种情况 relay 没开始跑就被杀了，补丁管不到（`hookdelay-fixed`）。
- `write_stdin`：候选做法是关 Codex 的 `unified_exec` 让这个工具消失，代价是没有交互式 shell，**未测试**。也可以接受现状：V 的 shell 本来就是全权限加 sudo，这条只影响插件策略，不是提权。
- 动态工具双钩子：原生 PreToolUse 和工具包装层各跑一次，也可能是 V 上 `session_status` 6.4 vs 2.4 s 的原因（推断）。要改 Codex 插件的钩子匹配，不是小改，本 PR 不做。

## 4. 长 computer 回合

**现状。** Worker 有 dist 补丁 `computer-frame-prune`，回合内只留最近 2 帧。Codex 路径没有 (代码)：历史在 app-server 的线程里，OpenClaw 的裁剪碰不到。

**证据**（VLab，`computer`。一个回合 20 帧，每帧 320×320 噪点 PNG 约 307 KB，用探针工具 `hr_screenshot` 代替真实 `computer`）：

| | Codex | Worker |
|---|---|---|
| 第 20 帧后的请求体 | 8.42 MB，20 张图 | 1.03 MB，2 张图 |
| 一回合累计上传 | 约 90 MB | 约 20 MB |
| 回合耗时 | 67.7 s | 40.0 s |
| 下一轮请求体 | 8.43 MB，20 张图，图还在 | 1.02 MB，2 张图 |
| 报错 | 无 | 无 |

每帧加 0.41 MB，按 DeepSeek 48 MiB 上限（10/10 实测）约 117 帧。V 的出口上限约 45 Mbit（见记忆 v-public-egress-cap），8 MB 请求约 1.5 s。

**413。** 代理把上限压到 3 MB 模拟（只测了 Codex）：第 7 帧后被拒，重试 6 次，25 s 后回合报错，用户看到的是原始 `unexpected status 413`。下一条消息 2.3 s 恢复，换了新线程（请求体 0.21 MB），图没了。40 MiB 换线程只在回合开始检查 (代码)，挡不住回合中途。会话上有手动模型时不回退（日志 `configured fallbacks disabled by user model override`）。

**是否阻塞。** 不阻塞灰度。第 3 批前建议让用 computer 多的群留到最后。

**修法。** 回合内裁剪要在请求发出前改写 Codex 历史，或者让工具结果不进线程，是大改，本 PR 不做。低成本缓解：降低发给 Codex 的帧尺寸，未测试。

## 5. 灰度开关

**范围。**
- `channels.modelByChannel.feishu.<群 id>` 精确匹配。candidate 经 `agent` 入口验证：列出的群跑 Codex，没列的跑 Worker（`migrate`）。
- `*` 通配不看 agent (代码)。V 有 13 个 dealclaw 群、short-v 和 v-codex 各 1 个群的绑定 (V)，它们有自己的模型，用通配会被一起换掉。**只列群 id，不用通配。** 私聊也要逐个列 `ou_`，匹配逻辑读过代码，没运行。
- 已手动切过模型的会话不受影响 (代码)。V 近 14 天有 23 个 /vds、20 个 sol、1 个 grok 的手动会话 (V)，这也意味着 /vds 已经有真实流量，可以当第一批对照。
- 不影响 Workboard、cron（`pin-c`）。

**重启。** `channels.modelByChannel` 的 reload plan 是要重启，`agents.*.model` 和 `subagents.model` 可热更（`migrate`，调 dist 的 plan 函数）。V 没配 `gateway.reload`，是默认的 hybrid；candidate 在 hybrid 下写配置，约 1 s 后 `received SIGUSR1; restarting`，不等空闲。所以：

```sh
# 在 V 上，示意。先 --check，变更内容以当批为准
sudo v-self-restart --if-busy abort --idle-timeout 3600 --reason "vds gray batch N" \
  --while-stopped "<写 channels.modelByChannel 和 fallbacks 的命令>"
```

改完按 `AGENTS.md` 走 capture PR，同步 VLab，`scripts/vlab-v-parity.mjs` 要 ALIGNED。热更的键也放在同一次里，避开热重载碰 Worker 池的老问题（记忆 config-hot-reload-kills-worker-pool）。

**时长。** 今天 13:35:28 停、13:36:59 ready，启动 91 s (V)。加上等空闲，按一次 2–5 分钟算。夜班随重启自动暂停和恢复 (记忆 nightshift-gateway-restart-hold)。

**回退链。** V 现在 `fallbacks=[openai/gpt-6-luna]`，map 上的 /vds 失败会先用 luna（ChatGPT 额度）。改成 `[deepseek/deepseek-flash, openai/gpt-6-luna]` 后：503 时 32.5 s 回退到 Worker flash 且回答正确，下一条回到 Codex（`pin-c`）。flash 为主时这个列表里的 flash 没有影响，cron 正常（`pin-c`）。**只覆盖上游明确报错，挂起不回退**，这就是阻塞项 1。

**来回切的上下文。** Worker 会话切到 Codex，再切回 Worker，暗号都记得（`migrate`）。

### 分批步骤

每批：下表配置走一次 `v-self-restart`，上一批指标没问题才进下一批。

| 批 | 范围 | 前置 | 观察 |
|---|---|---|---|
| 1 | 两个测试群 `oc_260a94509d8464a58c4f66966093356e`、`oc_ede0fdc8e94dc40d7424691ddf80d948`，加回退链 | 阻塞项 4 | 24 h，自测：文字、多工具、图片、子 agent、定时任务、`/new`、飞书进度卡 |
| 2 | 2–3 个低风险 makaron 群，由 Tianyi 选 | 阻塞项 1、2；第 1 批通过 | 48 h，含一个夜班高峰 |
| 3 | 全部 makaron 交互群和私聊，逐个列 id，不含 dealclaw 等 | 阻塞项 3；第 2 批通过 | 72 h，这就是目标状态 |
| 4 | 改默认（可选，不建议） | 阻塞项 5、6；Tianyi 单独决定 | 见下 |

第 4 批的配置：`agents.defaults.model` 和 `agents.entries.makaron.model` 改 /vds，`subagents.model=flash`，Workboard 补丁随发版上。语音会跟到 Codex，要先做一次真实通话。

### 指标和回滚线

| 指标 | 回滚线 | 基线 | 怎么看 |
|---|---|---|---|
| Gateway RSS | 持续超 6 GB | 重启 15 分钟后 1.7 GB (V)；c15 五步 Worker 2.3–3.1 GB、Codex 6.5–6.9 GB (V) | `ps -o rss= -p <MainPID>` |
| liveness | 超 10 s | V 上压测事故时 18.9 s | 日志 `liveness heartbeat delayed: overdue=` |
| 首字 | 高于同群切换前 2 倍，连续一天 | 串行纯文字 Codex 3.4、Worker 5.9 s (V，10/31) | `scripts/firsttext-e2e-report.mjs` |
| `Codex session became active in another runner` | 出现即查 | 修复后应为 0，生产还没触发过 | 日志 |
| `Native hook relay timed out` | 持续出现就查 Gateway | 10/16 冻结时 24 次 | Codex 工具输出和日志 |
| 413、挂起无回复 | 出现即回滚该群 | 无 | 日志，群里反馈 |
| `model-fallback` 决策 | 每小时超过 5 次 | 无 | 日志 |

读日志只用短时间窗（几十分钟），不要 `journalctl --since` 跨多天，那会占满 V 的磁盘读。

**回滚。** 同样的 `v-self-restart --while-stopped`，删掉该批的 map 项，约 2–5 分钟，会话上下文保留（`migrate`）。第 4 批改回两处默认。紧急时可以对单个会话 `sessions.patch` 换模型，不用重启。

## 未验证

- 真实飞书：审批卡、map 下的群消息、子 agent 回报那一轮的模型。按代码，飞书审批 runtime 收 `plugin` 类事件，与 harness 无关，但这次 candidate 没有飞书通道。
- 真实 `computer` 工具和真实截图大小。这次用探针代替，数字按每帧约 307 KB。
- 真实通话；GPT Live 原生 consult 只读了代码。语音下 /vds 的首字没量。
- Worker 上 `requireApproval` 拒绝的原因 `signed plugin approval owner is unavailable` 是探针插件才有，还是所有插件都有，没查。
- `policy` 里那 1 次自然发生的执行没留转录，归因是推断。
- 关 `unified_exec`、压缩 Codex 帧尺寸，都没测。
- 16 核 V 上高并发的根因（阻塞项 5）；V 上没有做压测，这次也没有。
- 私聊的 `modelByChannel` 匹配。

## 本 PR 的改动

都没有合入，也没有上 V。

- `scripts/apply-relay-deadline-process-start-patch.mjs` + 测试：relay 期限从进程启动算。上线时要在目标 dist 上重打，`lab/release-files/cli-startup-fast/` 里那份是整文件替换，发版要一起更新。
- `scripts/apply-workboard-subagent-model-patch.mjs` + 测试：Workboard 读 `subagents.model`。没配这个键时行为不变。
- `lab/candidate/harness-rollout-*`、`rollout-probe-plugin/`，`runtime-concurrency.mjs` 增加 `ROLLOUT_CASE`：本文所有场景。
- `runtime-concurrency.mjs`：npm 装 Codex 时可选依赖失败不报错（磁盘满时发生过），改为检查二进制并重试。
