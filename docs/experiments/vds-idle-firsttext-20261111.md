# /vds 空闲后首字慢：「整理上下文」挡在第一个字前面（2026-11-11）

Tianyi 反馈：默认 harness 换成 /vds（Codex 0.159.2 + DeepSeek）之后，飞书首字明显变慢，很长时间花在「📦 正在整理上下文」上，尤其是有一段时间没聊的会话。

结论：**「整理上下文」是 Codex 自己的原生压缩落在了回合开头。** 上一轮停在 Codex 90 万压缩线下面一点（88–90 万），下一条消息开头 OpenClaw 又往线程里注入 6–8 万字符的 developer 上下文，把计数推过 90 万。Codex 于是先压缩、再回答。DeepSeek 上的压缩请求总是冷算（70–81 万 token，缓存命中 0.4–9%），要等 18–32 s，期间用户什么字都看不到。空闲 30 分钟以上的会话，下一条消息开头一定会注入这些上下文，所以最容易撞上。

修法：打开 Codex 自带的 `model_post_turn_compact_threshold_percent = 90`。回合结束时，如果线程已经到了可用窗口的 90%（85.5 万），就在这一回合里、回答发出之后接着压缩，下一条消息从约 15 万开始。这是 Codex 的官方配置，写在 makaron 的 `codex-home/config.toml`，热生效，不改 dist，不重启 Gateway。

## 1. 用户口径分段（V，只读）

数据：`[firsttext-e2e.1]`（飞书 create_time → 卡片第一次推出正文），11/03–11/10 共 4614 条；Codex rollout（`agents/makaron/agent/codex-home/sessions`）；Gateway journald。

### 1.1 首字按空闲时长

| /vds（切默认后 11/09 12:23–11/10 23:59） | n | 首字 p50 | p90 | 入站→runStart p50 |
|---|---|---|---|---|
| 距上一条 <5 min | 643 | 13.4 s | 47.3 s | 2.1 s |
| 5–30 min | 319 | 13.6 | 52.3 | 2.3 |
| 30 min–2 h | 100 | 13.4 | 52.2 | 2.7 |
| 2–8 h | 38 | 15.3 | 44.8 | 3.0 |
| >8 h | 52 | 17.7 | 41.6 | 3.2 |

平均值差得不多。慢的是少数回合：这些回合在出第一个字之前先压缩了 20–30 s。

### 1.2 一次典型的空闲后首条（群 oc_5195cdfe，11/10 23:17，上一条在 6 小时前）

| 时刻 | 段 | 证据 |
|---|---|---|
| 23:17:32.2 | 飞书入站 → 分发 | journald `received message` / `dispatching to agent` |
| 23:17:33.8 | 有界历史读 372 ms | `[codex-bounded-history.1]` |
| 23:17:34.6 | 续用原线程（未换线程） | `keeping thread whose tool catalog covers this turn` |
| 23:17:34.9–36.0 | resume 后注入 developer：通用指令 6,938 字符 + workspace context 75,735 字符 | rollout `thread_settings_applied` + 2 条 developer message |
| 23:17:36.0 | task_started；上一轮结束在 887,365 token | rollout `token_count` |
| 23:17:36.0–56.4 | **Codex 回合前压缩 20.4 s**，请求 732,055 token、命中 72,192 | rollout `compacted`；journald `codex app-server auto-compaction succeeded` 23:17:56.9 |
| 23:18:00.3 | 第一段正文 | rollout assistant message；首字 +29.2 s（e2e） |

压缩之后的第一个请求 152,390 token、命中 64,896（压缩换了前缀，正常）。

### 1.3 回合前压缩有多常见、为什么空闲后更容易撞上

`scripts/codex-compaction-audit.py --since 2026-10-27T00:00:00Z`（只读，DeepSeek 线程）：32 次原生压缩里 **14 次在回合开头**，等待 p50 25.1 s，最长 32.0 s，其余 18 次在工具轮之间（mid-turn），0 次在回合末尾。

14 次回合前压缩的上一轮停在 880,893–904,742 token。其中 10 次本轮开头注入了 60,889–82,673 字符的 developer 上下文，把计数推过 900,000。另外 4 次上一轮已经停在 899,5xx 以上。

注入有两个来源，都是 `thread/inject_items` 写进线程历史的 developer 消息，追加后不会删除：

1. **V 补丁 `v-codex-turn-context-handoff-v1`**：`<openclaw_workspace_context>` 约 7.5 万字符（SOUL/IDENTITY/USER/MEMORY + 技能清单），sha 一变就整份重发。切默认后 36 小时内重发 193 次（另有 15 次是压缩后补发，属正常）：技能清单新增 99 次；「Remote macOS node available (…)」只是节点换了顺序 56 次（core `remote-*.js` 按 Map 插入顺序列节点，节点重连就换序）；节点+技能 20 次；节点增减 17 次。
2. **上游 `refreshCodexThreadPolicy`**：每次 `thread/resume` 都注入 6,938 字符的通用指令，内容不变也会注入。Codex 插件的 live thread 空闲 30 分钟（`CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS = 18e5`）就卸载，所以下一条消息一定会走 resume。

空闲 ≥30 分钟后的回合 **158/158** 开头都有 developer 注入（平均 5–8 万字符），<30 分钟的只有 15%。这就是「空闲后的第一条」更容易撞上回合前压缩的原因：只要上一轮停在 88 万以上，空闲后的第一条消息就会把线程推过线。

11/01 之后的 DeepSeek 线程里，两次压缩之间被重复注入的 workspace context 占历史字符的 10–37%（一个线程两次压缩之间注入了 10 次，共 75 万字符），会让压缩来得更早。这一点本 PR 不处理，见 §5。

### 1.4 压缩为什么这么慢

Codex 0.159.2 `core/src/compact.rs` 构造压缩请求时 `Prompt { input, base_instructions, ..Default::default() }`，不带 tools。DeepSeek 的前缀缓存在基础提示之后就断了，所以 70–81 万 token 几乎全部冷算（32 次的命中都在 3,456–72,192）。这与空闲无关，不空闲时的 mid-turn 压缩一样冷。

## 2. 其他怀疑点（逐一核对）

- **(a) 推迟整理 #243/#277 挡路**：排除。11/07 起推迟整理只在 5 次撞上用户消息，`yielded` 后不到 1 s 就让出。其中一次（11/10 23:30 同一个群）入站 → runStart 8 s，同一时段 `sessions.list` 每次 6–7 s 卡住主线程，是另一回事。
- **#301 整理周期**：/vds 会话的 contextTokens 是 950k，阈值 926k，所以 max(1,⌊926/950⌋)=1，每次原生压缩对应一次整理。日志里 trigger 全是 `transcript_bytes`（>2 MiB）。11/10 共整理约 15 次，同日原生压缩 9 次，都推迟到回复后 2 分钟、跑 36–72 s，不挡首字。
- **(b) 空闲后换线程、整段重放**：部分成立，但起因不是空闲。空闲 >2 h 后的首条 69 条中 52 条新开了线程，集中在 Gateway 重启或发版之后（11/09 切默认、11/09 16:20 和 23:03、11/10 02:04 和 17:32），同一线程也有跨两次重启续用 36 轮的。新线程重放 100 万字符，只命中系统提示约 13 万，首个请求慢 5–10 s。卡片上不显示「整理上下文」。绑定换掉的具体指纹项没有查实（只有 debug 日志），列为后续。
- **(c) reset / idle 策略**：排除。`session.reset.idleMinutes = 43200`（30 天）。
- **(d) DeepSeek 前缀缓存空闲后失效**：影响小。空闲 2–8 h 后首个请求命中 p50 94%，>8 h 的 8 条里有 2 条掉到约 1%。压缩请求的冷算跟空闲无关（§1.4）。

## 3. 修法

`scripts/configure-v-codex-post-turn-compact.mjs check|apply|restore`（root）在 makaron 的 `codex-home/config.toml` 顶层加一行：

```toml
model_post_turn_compact_threshold_percent = 90
```

Codex 0.159.2 的行为（`core/src/session/turn.rs` 约 710 行，`session/context_window.rs`）：回合不再需要后续请求时，如果活跃上下文 ≥ 90% × 可用窗口（DeepSeek：1,000,000 × 95% = 950,000，乘 90% 得 855,000），并且没有排队的输入，就在这一回合里压缩（`CompactionPhase::PostTurn`）。压缩失败只记 warn，回合照常完成。

- 855k 比 900k 的线低 4.5 万，能容下一次 workspace context 重发（约 2–3 万 token）加用户消息。
- GPT 线程（vcodex、luna 回退）共用这个 CODEX_HOME，规则相同，按它们自己的窗口算。
- 压缩期间发来的消息不会被吞。实测（§4 的 T0b）：消息被 steer 进正在压缩的回合，Codex 压完后在同一回合里接着回答，要等压缩做完，16–23 s。
- 代价：跨过 85.5 万的那一回合，回答发出后卡片多挂 20–30 s「📦 正在整理上下文」再收尾。压缩本身照样冷算、照样花钱，只是从下一条消息开头挪到了这一回合末尾。

### 生效与回退

- app-server 每次 start/resume 线程都会重新读取 config.toml（`app-server/src/config_manager.rs` `load_latest_config`），所以不用重启。正在 live 的线程沿用已加载的配置，空闲 30 分钟卸载后再 resume 时生效（§4 的 hot 臂验证过）。
- 回退：`configure-v-codex-post-turn-compact.mjs restore`，或用脚本留下的 `config.toml.bak-post-turn-compact-*` 覆盖回去。

## 4. candidate A/B

`lab/candidate/codex-post-turn-compact.mjs`，计划文件 `codex-post-turn-compact-{v,post,hot}.plan.json`。隔离 Gateway，codex 插件用 V 的字节（thread-lifecycle bdb000d5、run-attempt 23705af0、DeepSeek catalog），真实 DeepSeek 经本地代理转发，/vds 配置同 V。

流程：用一组列表消息把线程种到 84 万（在 85.5 万以下，种的过程中不会压缩）。T0 再带一段列表加一个短问题，回合结束在约 89.3 万。然后改 SOUL.md 一行，触发 workspace context 重发。T1 是被测量的那一条消息。T2 问开头的暗号。post 和 hot 两臂另外在 T0 压缩期间发一条 T0b。

首字的口径：从 chat.send 到这个 run 的第一个 assistant 文本事件。这里没有飞书，V 上卡片还要再加 0.5–1 s。

### 4.1 结果（2026-11-11 00:25–00:57 CST，每臂 3 轮）

| 臂 | T0 首字 | T0 结束 | 压缩在哪、多久（请求 / 命中） | **T1 首字（被测的那一条）** | T0b（压缩中发出）回答 |
|---|---|---|---|---|---|
| v（V 现状） | 3.6 / 3.0 / 3.7 s | 3.9 / 3.4 / 4.0 s，停在 89.4 万 | **T1 开头**，18.5 / 18.1 / 16.2 s（87.8 万 / 4,608） | **20.8 / 19.9 / 18.5 s** | — |
| post（90%） | 3.1 / 3.9 / 3.8 s | 24.9 / 29.3 / 23.2 s | **T0 回答之后**，19.5 / 21.9 / 16.9 s（87.0 万 / 4,608） | **1.6 / 1.9 / 2.7 s** | 19.2 / 22.7 / 16.6 s，未丢 |
| hot（运行中改配置） | 4.4 / 3.9 / 4.3 s | 27.6 / 22.4 / 24.6 s | T0 回答之后，20.3 / 16.2 / 16.7 s（87.1 万 / 4,608） | 2.1 / 1.9 / 2.5 s | 20.6 / 16.0 / 17.7 s，未丢 |

- **修法确实走到了**：post 和 hot 两臂的 rollout 里，`compacted` 记录都落在 T0 第一段正文之后、T0 结束之前，T1 开头没有压缩。v 臂三轮 T1 都在第一段正文之前压缩。
- 压缩本身没变快（都是约 87 万 token 冷算，16–22 s），只是挪了位置。挪到了用户刚看完回答、还没发下一条的时间里。
- T0b 在 T0 压缩期间发出。V 的 queue 模式是 steer，T0b 被 steer 进 T0 的回合，压缩结束后在同一回合里回答（T0 的 run 先后出了「391」和「4」），没有丢。代价是这条消息要等压缩做完，16–23 s。
- hot 臂：会话在没有这项配置时建成，然后改 config.toml、停掉 DeepSeek app-server，下一回合 resume 线程就生效了。这和 V 上「空闲 30 分钟卸载后再 resume」走的是同一条加载路径。
- 暗号回忆（T2）：v 1/3，post 2/3，hot 2/3。能不能答出来取决于压缩摘要本身，三个臂发出的压缩请求是一样的。
- **v 臂 3 轮里有 2 轮**：T1 回答出字以后又发了一次请求，被 DeepSeek 400 拒绝，run 回退 openai，而 candidate 里没有 openai 授权，于是报错（脚本对这种情况只记录，不判失败）。这只在回合前压缩之后出现，post/hot 六轮一次也没有。V 上 11/09 以来没有 failover 决策日志，列入 §6。

### 4.2 收据

最终脚本 sha256 `da904791cc6e…`（之后只改了第 17 行的注释，改正 T0b 的说明）：`candidate-edaf7869`（v）、`candidate-8b1ef6cf`（post）、`candidate-3678cc68`（hot），三个都是 ok。
前两轮（脚本只改了记录和断言）：`candidate-6bb374b5`、`-44092812`（v），`-6725ee9f`、`-583c4dd4`（post），`-62c12692`、`-f9f3b1af`（hot）。
基线都是 `turnend-registry-20261110`（= V），codex 插件 thread-lifecycle `bdb000d5`、run-attempt `23705af0`。

## 5. 上线与核对（合入和上线由 Tianyi 批准，上线由监控 session 执行）

1. 共享 VLab（可选，只改配置）：用 `VLAB_MAKARON_CODEX_HOME=<Gateway 实际用的 makaron codex-home> node scripts/configure-v-codex-post-turn-compact.mjs apply`。
2. V：把脚本放到 `/opt/v-ops/`，然后执行 `sudo node /opt/v-ops/configure-v-codex-post-turn-compact.mjs check`，再执行 `apply`。不用重启。脚本会在同目录留一份 `config.toml.bak-post-turn-compact-*`。
3. 核对：
   - 一天后在 V 上跑 `sudo ionice -c3 python3 codex-compaction-audit.py --since <上线时刻>`。预期 `pre-turn` 接近 0，出现 `post-turn`；`mid-turn` 不变。
   - `[firsttext-e2e.1]` 里空闲 2–8 h、>8 h 两档 /vds 首字的 p90。
4. 回退：执行 `restore`（删掉这一行），或用备份文件覆盖回去。不用重启。

## 6. 本 PR 不处理、值得单独做的

- **workspace context 重发导致上下文膨胀**：两次压缩之间被重复注入的上下文占 10–37%。节点仅换序（56/193）可以在 core 里排序节点名去掉，这同时也能稳定 PI harness 系统提示的缓存。新增技能（99/193）每次都整份重发 7.5 万字符，需要改成分段或增量发送。另外上游每次 resume 都重注 6.9k 字符的策略文本。
- **回合前压缩之后的 400 与回退**：§4.1 的 v 臂 3 轮有 2 轮，回答之后多发一次请求被 DeepSeek 400。V 上要查有没有对应的 luna 回退或重复回复。
- **重启或发版后换线程**：空闲 >2 h 后的首条 69 条中 52 条新开线程，整段重放 100 万字符，首个请求慢 5–10 s。需要查清是哪一项指纹在变（只有 debug 日志）。
- **回合刚结束时 steer 进来的消息**：Codex 在 `on_task_finished` 里只把这类输入记进历史，不会回答。v 臂第一版测试里出现过（T3 在 T2 收尾的 0.3 s 内发出，没有收到回答）。这是 V 原有的窗口。
- 11/10 23:30 `sessions.list` 每次 6–7 s，卡住主线程，同时拖慢了一条入站消息（runStart 8 s）。
