# 默认 harness 换 Codex（/vds）：阻塞清单与灰度方案

2026-11-07 CST 复核（初版 11/01）。这里没有切换，V 的配置和进程都没动。切换要 Tianyi 单独点头。

标注：**(V)** 是在生产 V 上只读得到的，**(VLab)** 是 VLab candidate 实测（4 核、同机还有别的任务，数字说明机制，不代表生产收益），**(代码)** 只读了 V 的 dist 没有运行。11/01 的证据在 `docs/evidence/codex-default-rollout-20261101/`（文中写作 `pin-a` 等）和 `docs/evidence/harness-compare-20261031/`；11/07 的回退证据在 `docs/evidence/codex-fallback-chain-20261107/`（PR #534）。没有向测试群发消息，全部用 candidate。

## 11/07 复核

**V 这一周的变化。** Codex 插件字节 11/01 13:35 之后没动过（11/06 存档 72 个文件与 11/01 逐一相同，`run-attempt` 仍是 `71a11b78`），所以 11/01 的 Codex 侧证据仍然适用。变的是 core：luna 接住 DeepSeek 故障（#543/#544）、删会话不再整表读（#558/#559）、/vcc 插话（#561）、cron 默认工具（#563）。#529 的 relay 快路径 11/01 已上 V。回退和并发都在当前字节上重测了。

**V 现状 (V，只读)：**
- 默认 `deepseek/deepseek-flash`（Worker）；`agents.defaults.model` 和 `agents.entries.makaron.model` 的回退都是 `[openai/gpt-6-luna]`，luna 跑在 Worker 上；没有 `channels.modelByChannel`。
- 近 7 天的飞书群会话：59 个在 Worker flash，**20 个已被人手动 `/model` 到 /vds**，9 个在 /vcodex。手动选的模型会关掉回退（`disabled_by_model_override`），11/06 一天有 48 个回合这样跑。所以这 20 个群今天遇到 DeepSeek 故障直接报错，遇到挂起则一直等。
- 11/06–11/07 日志里 `another runner`、`Native hook relay timed out`、413 都是 0；11/07 Worker 有 7 次 flash→luna 回退成功、7 次 DeepSeek 500。
- 近 7 天 makaron 的 Codex 工具调用：`exec_command` 3494 次，`write_stdin` 172 次。

## 结论

1. **不改默认模型。** 用 `channels.modelByChannel` 逐群列 id，把交互群换到 /vds；夜班、cron、子 agent 留在 Worker，不用改代码（`pin-c`）。第 3 批就是目标状态，第 4 批“改默认”不建议做。
2. **回退链保持 V 现在的 `[openai/gpt-6-luna]`，不要改成 `[flash, luna]`**（推翻 11/01 的建议）。DeepSeek 整体挂起时，`[flash, luna]` 要 278.6 s 才到 luna，`[luna]` 只要 95.4 s；整体 503 时两者都约 32 s；只有 Codex 坏时两者都约 95 s 接住（VLab，`codex-fallback-chain-20261107`）。所以第 1 批不用改回退链。
3. **第 1 批新增一项配置：Codex 的 DeepSeek 重试次数。** V 的 `codex-home/config.toml` 没写，Codex 默认请求重试 4 次 × 流重试 5 次，整体 503 时打 30 次请求、32 s 后才交给回退。设成各 1 次后 11.3 s；一次性的瞬时 503 仍在 Codex 内部自愈，不回退 (VLab)。
4. **手动切过 /vds 的群要发一次 `/model deepseek`。** 手动覆盖优先于 `modelByChannel` 且没有回退。列进 map 后选回默认，会话仍跑 /vds，503 时 6.7 s 回退到 luna (VLab)。两个测试群现在都有手动覆盖，第 1 批也要做这一步。
5. **#534（挂起看门狗）建议不等灰度，先单独上线。** 它对那 20 个手动 /vds 群今天就有用：挂起从无限等待变成约 187 s 明确报错（无回退时）；有回退时约 95 s 接上。
6. 安全、语音、长 computer 回合的结论和 11/01 一样，见第 2–4 节。`write_stdin` 一周 172 次是真实用法，建议接受现状，不关 `unified_exec`。

## 阻塞清单（11/07，按批次排序）

| # | 项目 | 挡哪一批 | 现状与证据 | 要做什么 |
|---|---|---|---|---|
| 1 | Codex 对 DeepSeek 503/断流重试 30 次，回退慢 | 第 1 批 | 503：32.4→11.3 s；断流：20.4→9.9 s；瞬时 503 不回退（VLab，`codex-fallback-chain-20261107`） | 第 1 批那次重启里给 makaron 的 `config.toml` 加两行，见下文“第 1 批怎么执行” |
| 2 | 手动 `/model` 过的会话不进灰度、也没有回退 | 第 1 批 | `override-progress.jsonl`：手动 /vds 遇 503 11.0 s 报错；`/model deepseek` 后仍是 Codex，503 6.7 s 回退 | 操作步骤，不用改代码；列进 map 的群各发一次 `/model deepseek` |
| 3 | 上游挂起无回复，Codex 不回退 | 第 2 批起 | PR #534 已 rebase 到 dev；当前 core 上整体挂起 95.4 s、仅 Codex 挂起 96.4 s 回退到 luna（VLab）；11/01 的不误杀证据（`sleep 200`、200 s 动态工具、慢响应头）字节未变仍适用 | 请 Tianyi 审 #534，建议先于灰度单独上线 |
| 4 | 并发时比 Worker 慢 | 第 3 批看指标，第 4 批必过 | VLab：DeepSeek 不慢；Codex 每回合多 1.2–1.6 次模型往返（目录没开并行工具调用）；c10 时整机 CPU 不够。见第 6 节 | 验证并行工具调用（实验被 VLab 失联打断）；V 主线程忙的原因要 V 上 profile，需 Tianyi 同意 |
| 5 | relay 启动晚于 1 s 且 Gateway 9 s 不答时，Codex 照样执行工具 | 第 3 批前 | 补丁在本 PR，在 V 当前快路径字节上仍能打上；快路径后 relay 0.08–0.10 s 起来，触发窗口更小；V 上没有插件用拦截做安全控制 | 上线前要在 openclaw-versa 补源码提交和测试（AGENTS.md 要求），未做 |
| 6 | `write_stdin` 不进钩子 | 第 3 批前 | 一周 172 次真实使用；V 的 shell 本来就是全权限，只影响插件策略，不是提权 | 建议 Tianyi 接受现状 |
| 7 | Workboard 固定不住模型 | 只挡第 4 批 | 补丁在本 PR，11/07 在 VLab 当前字节 `runtime-api-1CCazqtv.js` 上仍能打上 | 不做第 4 批就不需要 |

已解决、不再阻塞：回退链（保持 `[luna]`）；`another runner`（#524，11/01 上 V）；钩子进程开销（#529/#530，11/01 上 V）。#535（`session_status` 范围读）真实流量每回合只省 120–170 ms，不当闸门。

## 附：11/01 的逐项调查

下面第 1–5 节是 11/01 的原文，只更正了第 5 节的回退链。

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

**回退链（11/07 更正）。** 11/01 这里建议改成 `[deepseek/deepseek-flash, openai/gpt-6-luna]`，依据是 503 时 32.5 s 回到 Worker flash（`pin-c`）。11/07 把 DeepSeek 整体故障也测了：flash 和 /vds 是同一个上游，DeepSeek 挂起时 flash 也挂，`[flash, luna]` 要 278.6 s 才到 luna，`[luna]` 95.4 s。flash 在前只在“只有 Codex 坏”时省一次 ChatGPT 额度，而这类故障 #524 之后日志里没再出现。所以**保持 `[openai/gpt-6-luna]`**，证据见 `docs/evidence/codex-fallback-chain-20261107/`。

**来回切的上下文。** Worker 会话切到 Codex，再切回 Worker，暗号都记得（`migrate`）。

### 分批步骤

每批：下表配置走一次 `v-self-restart`，上一批指标没问题才进下一批。

| 批 | 范围 | 前置 | 观察 |
|---|---|---|---|
| 1 | 两个测试群 `oc_260a94509d8464a58c4f66966093356e`、`oc_ede0fdc8e94dc40d7424691ddf80d948`；Codex 重试次数 | 无代码前置；阻塞项 1、2 是这一批自己的操作 | 24 h，自测：文字、多工具、图片、子 agent、定时任务、`/new`、飞书进度卡 |
| 2 | 已经手动用 /vds 的 makaron 群（11/07 有 20 个，名单由 Tianyi 圈定），列进 map 后各发一次 `/model deepseek` | #534 上线；第 1 批通过 | 48 h，含一个夜班高峰。这批的用户本来就在用 /vds，换来的是回退，体验不变 |
| 3 | 其余 makaron 交互群和私聊，逐个列 id，不含 dealclaw、short-v、v-codex 等自带模型的群 | 阻塞项 5、6；第 2 批通过；第 6 节的指标没越线 | 72 h，这就是目标状态 |
| 4 | 改默认（可选，不建议） | 阻塞项 4、7；Tianyi 单独决定 | 见下 |

第 4 批的配置：`agents.defaults.model` 和 `agents.entries.makaron.model` 改 /vds，`subagents.model=flash`，Workboard 补丁随发版上。语音会跟到 Codex，要先做一次真实通话。

### 第 1 批怎么执行

前提：Tianyi 点头；选 V 的上线窗口（12:30–13:00 或 22:00 后）。在 V 上：

```sh
# 1. 先只校验，不重启
sudo v-self-restart --check --reason "vds gray batch 1" \
  --set 'channels.modelByChannel={"feishu":{"oc_260a94509d8464a58c4f66966093356e":"deepseek/vds-deepseek-flash","oc_ede0fdc8e94dc40d7424691ddf80d948":"deepseek/vds-deepseek-flash"}}'
```

```sh
# 2. 真正执行：等空闲后停机，写 map，给 Codex 的 DeepSeek provider 加重试次数，再启动
sudo v-self-restart --reason "vds gray batch 1" --requested-by "Tianyi" \
  --chat oc_260a94509d8464a58c4f66966093356e --idle-timeout 900 --if-busy abort \
  --set 'channels.modelByChannel={"feishu":{"oc_260a94509d8464a58c4f66966093356e":"deepseek/vds-deepseek-flash","oc_ede0fdc8e94dc40d7424691ddf80d948":"deepseek/vds-deepseek-flash"}}' \
  --while-stopped 'F=/home/openclaw/.openclaw/agents/makaron/agent/codex-home/config.toml; cp -p $F $F.bak-vds-batch1 && (grep -q "^request_max_retries" $F || sed -i "/^\[model_providers.deepseek\]/a request_max_retries = 1\nstream_max_retries = 1" $F) && grep -A5 "^\[model_providers.deepseek\]" $F'
```

```sh
# 3. 两个测试群各发一次（以 Tianyi 身份，lark-cli），清掉手动覆盖：
/model deepseek
```

验收（每个群各一次，回复要可见）：
- 发一条带 shell 工具的消息，`session_windows` 里该群的 `agent_harness_id=codex`、`model=vds-deepseek-flash`。
- 日志里该回合没有 `configured fallbacks disabled by user model override`。
- `config.toml` 的 `[model_providers.deepseek]` 下有两行重试设置；`v-self-restart` 的 postChecks 全 0，workers 就绪。
- 然后按 `AGENTS.md` 做 capture PR，`scripts/vlab-v-parity.mjs` 到 ALIGNED。`config.toml` 不在 parity 范围里，在 capture PR 里写明。

**回滚：** 同样走 `v-self-restart`，`--set 'channels.modelByChannel={}'`（或删掉两项），`--while-stopped 'cp -p $F.bak-vds-batch1 $F'`。紧急时不重启、只救一个群：在群里 `/model` 选一个 Worker 上的非默认模型（例如 `/model ds-flash`），它是手动覆盖，立刻生效但没有回退；之后删掉 map 项再 `/model deepseek` 回到默认。注意 `/model deepseek` 本身会回到 map 上的 /vds，不能用来回 Worker。

### 指标和回滚线

| 指标 | 回滚线 | 基线 | 怎么看 |
|---|---|---|---|
| Gateway RSS | 持续超 6 GB | 重启 15 分钟后 1.7 GB (V)；c15 五步全 shell，运行 2.5 小时：Worker 2.1–2.2 GB、Codex 2.5–3.2 GB (V)；含 `session_status`、重启前：Worker 2.3–3.1 GB、Codex 6.5–6.9 GB (V) | `ps -o rss= -p <MainPID>` |
| liveness | 超 10 s | V 上压测事故时 18.9 s | 日志 `liveness heartbeat delayed: overdue=` |
| 首字 | 高于同群切换前 2 倍，连续一天 | 串行纯文字 Codex 3.4、Worker 5.9 s (V，10/31) | `scripts/firsttext-e2e-report.mjs` |
| `Codex session became active in another runner` | 出现即查 | 修复后应为 0，生产还没触发过 | 日志 |
| `Native hook relay timed out` | 持续出现就查 Gateway | 10/16 冻结时 24 次 | Codex 工具输出和日志 |
| 413、挂起无回复 | 出现即回滚该群 | 无 | 日志，群里反馈 |
| `model-fallback` 决策 | 每小时超过 5 次 | 无 | 日志 |

读日志只用短时间窗（几十分钟），不要 `journalctl --since` 跨多天，那会占满 V 的磁盘读。

**回滚。** 同样的 `v-self-restart --while-stopped`，删掉该批的 map 项，约 2–5 分钟，会话上下文保留（`migrate`）。第 4 批改回两处默认。紧急时可以对单个会话 `sessions.patch` 换模型，不用重启。

## 6. 并发（11/07）

**V 上的旧数字（11/01，bash5 形态）：** c5 /vds 14.8 s vs Worker 9.9 s；c15 23.1–24.6 vs 14.7–16.0 s；Gateway 主线程忙 89–97% vs 39–71%。V 上不再加计时轮次（要 Tianyi 同意）。

**VLab 拆分（`docs/evidence/vds-concurrency-gap-20261107/`，PR #534 分支）：** 两边的 DeepSeek 请求都过本机计时代理，同一个 Gateway 交替跑。

| 档 | 完成 p50 Worker / /vds (s) | 每回合模型请求 | 每回合等模型 (s) | 到首个工具 p50 (s) |
|---|---|---|---|---|
| c1 | 10.9 / 13.9 | 6 / 6 | 9.2 / 8.0 | 4.3 / 5.2 |
| c5（第 2 轮） | 13.9 / 16.9 | 4.8 / 6 | 5.9 / 9.0 | 6.4 / 6.7 |
| c10 | 13.5 / 27.7 | 4.4 / 6 | 7.0 / 9.9 | 5.3 / 11.7 |

- DeepSeek 单个请求两边一样快（首字节 0.4–0.5 s、时长 1.1–1.5 s），Responses 接口不慢。
- **Codex 每回合多 1.2–1.6 次模型往返。** Worker 让 DeepSeek 把互不依赖的工具调用放进一次回复；V 的 `v-deepseek-model-catalog.json` 没写 `supports_parallel_tool_calls`，Codex 一个工具一次往返。这是 c5 差距的大半。打开这个字段的对比实验（`lab/candidate/codex-catalog-parallel-tools.mjs`）跑到一半时 VLab 主机失联，结果待补。
- c10 时 /vds 到首个工具慢一倍，同档 VLab load 到 10（4 核），Gateway 事件循环只占 0.2。VLab 上这段是整机 CPU 不够，与 V 上的主线程忙不是同一个现象；V 上主线程忙的原因仍未拆，需要 V 上的 profile，要 Tianyi 同意。

**对灰度的意义。** 真实交互群在途最多约 10 个回合，夜班留在 Worker。第 1、2 批的并发量很小，不受影响；第 3 批前看 Gateway RSS、liveness 和首字三条线（上面的指标表）。并行工具调用如果验证有效，是一个只改模型目录一个字段的修复，源码在 openclaw-versa 的 `extensions/codex/assets/v-deepseek-model-catalog.json`。

## 未验证

- 真实飞书：审批卡、map 下的群消息、子 agent 回报那一轮的模型。按代码，飞书审批 runtime 收 `plugin` 类事件，与 harness 无关，但这次 candidate 没有飞书通道。
- 真实 `computer` 工具和真实截图大小。这次用探针代替，数字按每帧约 307 KB。
- 真实通话；GPT Live 原生 consult 只读了代码。语音下 /vds 的首字没量。
- Worker 上 `requireApproval` 拒绝的原因 `signed plugin approval owner is unavailable` 是探针插件才有，还是所有插件都有，没查。
- `policy` 里那 1 次自然发生的执行没留转录，归因是推断。
- 关 `unified_exec`、压缩 Codex 帧尺寸，都没测。
- 16 核 V 上高并发的根因（阻塞项 5）。本 PR 的场景都没在 V 上跑；V 上的计时在 `harness-compare-20261031/v-staged-20261101/`。
- 私聊的 `modelByChannel` 匹配。

## 本 PR 的改动

都没有合入，也没有上 V。11/07 的回退和重试实验、并发拆分的压测台改动在 PR #534 的分支上（`CHAIN_COMPARE`、`MODEL_PROXY`），本 PR 只引用其证据。

- `scripts/apply-relay-deadline-process-start-patch.mjs` + 测试：relay 期限从进程启动算。上线时要在目标 dist 上重打，`lab/release-files/cli-startup-fast/` 里那份是整文件替换，发版要一起更新。
- `scripts/apply-workboard-subagent-model-patch.mjs` + 测试：Workboard 读 `subagents.model`。没配这个键时行为不变。
- `lab/candidate/harness-rollout-*`、`rollout-probe-plugin/`，`runtime-concurrency.mjs` 增加 `ROLLOUT_CASE`：本文所有场景。
- `runtime-concurrency.mjs`：npm 装 Codex 时可选依赖失败不报错（磁盘满时发生过），改为检查二进制并重试。
