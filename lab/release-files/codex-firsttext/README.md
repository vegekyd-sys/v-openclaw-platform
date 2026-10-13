# Codex harness 首字：答案不等写库 + /vds 持久线程（2026.9.1）

`patch-codex-firsttext.mjs --codex <@openclaw/codex 目录>`，幂等。基线是 V 当前加载的
`@openclaw/codex@2026.9.1`（generation `g-b42d646e5561ece2`，已含 /vds G1 与
codex-native-subagent）：`run-attempt-D1hJO4fX.js` 694e3817…、`thread-lifecycle-DAcEJ_Om.js`
94d5420f…。共享 VLab（db91-parity）上是同一份字节。

## 现象（V，2026-10-04～10-07，[firsttext-e2e.1] 中 codex 59 条）

- /vcodex 私聊：Codex 已经整段答完，卡片还要再等 0.8–8.4 s。例 83bd9daa：Codex 8.0 s 完成，Gateway 16.4 s 才出首字。
- /vds 私聊 16/16：约 4.7 s 时 `pre-bind notification buffer exceeded 256`，整轮作废，换新线程重跑，首字中位 12.7 s。
- /vds 每轮都是新 Codex 线程（29 轮 29 个），整段历史当 prompt 重放：群 oc_fab91 每轮输入约 40 万 token，缓存只命中约 9 万。

## 根因与改法

### A. 答案流等用户消息写库（run-attempt）

`bindProjection` 先 `await promptMirrorPromise`（把用户消息写进会话记录），再 `bindTurn`。在此之前，
app-server 的所有通知都进 256 条的 pre-bind 缓冲。大私聊写一次要几秒：vcodex 的答案被扣住，
vds 的 delta 多，缓冲溢出后整轮重试。

等待的目的只是让持久化的会话记录保持时间顺序（用户消息在回答之前）。改为：

- 回合路由立即绑定，流式内容照常推出。
- `CodexTranscriptCheckpoint` 的写入链排在用户消息写入之后（`orderAfter`）。通知处理和工具调用
  只在用户消息写完之后才等待自己的 flush（`flushInOrder`）；之前不等，写入顺序仍由写入链保证。
- async 用户消息的投递、回合结束时的最终 mirror 也排在用户消息写入之后。

### B. /vds 每轮新开临时线程（thread-lifecycle）

G1 让 deepseek 关掉 code mode（`nativeCodeModeEnabled=false`）。上游把这个值理解成「本回合临时
限制」：保留会话原有绑定，另开临时线程，并把完整历史投影进 prompt。DeepSeek 的 code mode 是永久
关闭的，所以：

- provider 是 deepseek 时，code mode 关闭不再算临时限制（三处判断：`transientNativeToolRestriction`、
  `isTransientWebSearchRestriction`、`deferLegacyWebSearchRotationToTransientNativeSurface`），
  vds 正常创建、续用持久绑定。
- 绑定的 provider 家族（deepseek / 其他）和本回合不同时，轮换线程（`rotating a cross-provider
  thread binding`）。DeepSeek 会把明文 `reasoning_text` 写进线程，OpenAI 拒收
  （`invalid_request_error … input[N].content`），所以两家不能共用一个线程。新线程用完整的 OpenClaw
  会话记录灌入上下文。

顺带修掉一个切换问题：以前 vds 回合不写入 GPT 线程；切回 vcodex 时，续接逻辑
（`selectNewerVisibleHistoryAfterBinding`）又会排除所有 codex 写入的消息，所以 vcodex 看不到 vds
那几轮。现在换家族时开新线程，从完整会话记录灌入，两边都看得到。

### B2. vcodex 之后切 vds 用了 GPT 的认证配置（run-attempt）

启动阶段在没有显式认证配置时退回用线程绑定上的 `authProfileId`，provider 家族变了也照样沿用：
`/vcodex` 之后 `/vds`，DeepSeek 回合拿着 `openai:…` 订阅配置去启动，报 `selected_auth_profile_unavailable`，
回答丢失（V 上记录过「同会话 vcodex→vds 实测 401」）。现在只在同一家族内继承。

代价：每次在 vds 和 vcodex 之间切换，第一轮要重放一次历史（缓存未命中一次）。同一模型连续对话
线程续用，缓存可以命中。

## 验证

- `lab/candidate/codex-firsttext.mjs`：隔离 Gateway，/vds 按 V 原样配置（共享 VLab 本身没有 /vds）。
  只在 candidate 副本里把写用户消息人为延迟 6 s，同一脚本先跑 V 原样字节、再跑补丁版，比较首字、
  pre-bind 溢出、会话记录顺序、线程数和缓存命中。
- vds↔vcodex 来回切换需要 ChatGPT 登录，在共享 VLab 上用 `vlab.mjs test` 验证。

## 共享 VLab 验收（2026-10-07 18:24–18:46 CST）

共享 VLab 原本没有 /vds：主配置和 Worker 配置（`state/shared-vlab-20260909-v3/` 下，不是 `state/openclaw.json`）
都按 V 补齐后测试。脚本 `lab/codex-firsttext-shared-accept.mjs`，专用 `vlab-dev-*` 会话，`deliver:false`。

| | V 原样代码 | 补丁 |
|---|---|---|
| 同一 vds 会话连续 4 轮 | 每轮一个新线程 | 1 个线程 4 轮，缓存 99.5–99.7% |
| 热的 vds 首字 | 9.7–10.4 s | 3.8–5.0 s（候选重启后的首轮 12.6 s 为冷启动） |
| vds→vcodex→vds→vcodex | vcodex 之后切 vds 失败（auth profile） | 4 步全部成功，每次切换换线程，两边都答出对方那轮的暗号 |
| 会话记录顺序 | 正常 | 正常（先用户后回答） |

A（写库慢扣住答案）在共享 VLab 上只验证不回归：镜像里没有 V 那样的大私聊。复现与对比见 candidate。
重启后第一轮可能报 `Cannot reap registered Codex process`（上一个 Gateway 的孤儿登记，与本补丁无关）。

## C. 大会话里 /vds 每轮都压缩（2026-10-08，run-attempt）

现象：群 oc_64bcd621…（会话约 43 万 token）切到 /vds 后，每条消息都 `native transcript exceeded active token limit; starting a fresh thread`，新线程灌入整段历史，Codex 立刻 `auto-compaction`。

原因：Codex 不认识 deepseek-flash，按兜底窗口 272,000 处理（生效 258,400，自动压缩上限 244,800）。OpenClaw 每轮开始前读线程 rollout 最近一条 token 记录，超过上限就换新线程；而新线程第一轮就要灌入超过上限的整段历史，只要这一轮结束时 Codex 还没压缩，最近一条记录仍是 40 多万，下一轮又换线程，形成死循环（V 日志 nativeTokens 36.7 万–43.8 万，maxTokens 238,400）。

修法：DeepSeek 线程超限时不再换线程（日志 `keeping oversized DeepSeek thread for native compaction`），交给 Codex 自己压缩后续用；DeepSeek 接口本身接受 100 万上下文，压缩前那次大请求不会被拒。字节上限保险和其他 provider 不变。

candidate `lab/candidate/codex-ds-window.mjs`（C 段，约 31 万 token 大会话两轮）：两轮同一线程、只压缩一次（压后 2.6 万、第二轮 6.7 万），回答正常。

**没有上线的另一半：把 DeepSeek 窗口提到 100 万。** `models.providers.deepseek.models[].contextTokens` 会以 `model_context_window` 传给 Codex（`model_context_window_override=true`），但 Codex 把它钳在模型目录的 `max_context_window`（兜底 272,000）以内。按线程传 `model_catalog_json`：`codex exec` 下窗口变 950,000、基础提示不变；但经 app-server 时窗口仍 258,400，基础提示反而换成目录里的（16,979 → 20,751 字）。只有改 makaron CODEX_HOME 的全局目录才行，那要抄全部 GPT 条目并冻结它们，暂不做。

## E. 记忆整理回合把会话绑到自己的线程上（2026-10-08，thread-lifecycle）

C 上线后，大群（oc_fab91、oc_64bcd621）仍然每条消息新开线程。原因：大会话回复后空闲时会跑推迟的记忆整理（#243），这一轮只有 read/write 两个工具；Codex 线程的工具在创建时固定，于是插件给它开了新线程，并把会话的绑定改成这个整理线程。下一条用户消息有 94 个工具，与绑定线程不符，只能再开新线程、重放整段历史（V 实测：14:03 一轮续用了线程，14:05 整理线程 9eb0 只有 2 个工具、提示 104 万字符，绑定随之改写）。

修法：`trigger === "memory"` 的回合按「一回合受限」处理，与 `delegationCapability === "report_only"` 同一条路径：开临时线程、不写回绑定。整理回合本来就是新线程、全量灌入，行为不变；普通回合不受影响。

附带：DeepSeek 线程压缩时，Codex 写的交接摘要会作为一条助手消息存进 OpenClaw 会话记录，压缩后的真实回答在记录里缺失（VLab 两次复现）。当时以为用户只会看到流式的真实回答；10/08 23:30 在 oc_ff5076 上摘要被直接发到了飞书，见 G。

## F. 主人和成员轮流说话时每次换线程（2026-10-08，thread-lifecycle）——已撤回，未上线

2026-10-13：大会话里每次换发言人都会整段重放并立刻压缩（群 oc_88d96b7e），F 在 V 当前字节上重建为 `lab/release-files/codex-toolset-cover/`。

2026-10-09：共享 VLab 对比显示首字没有可测的改善（见本节末尾），Tianyi 决定暂缓。`codex-toolset-cover-20261008` 只装到了 V 磁盘、没有重启生效，由 `codex-compaction-summary-20261009` 把 thread-lifecycle 换回 c0a9ce77；补丁脚本里的 F 已删除，T 场景与 toolset/swap 工具保留。

现象：同一个群里，主人（Tianyi）和其他成员交替发言时，每换一个发言人就新开一个 Codex 线程、重放整段历史。V 上线程 7e2d（主人，106 个工具）和 38b4（成员，94 个工具）同属一个会话。

原因：主人回合多 12 个顶层工具（`nodes`、`gateway`、`terminal`、`conversations_list/send/turn`、`codex_plugins` 等，来自 core 的 `senderIsOwner` denylist 和插件的主人限定），`sessions_send` 的描述里还会提到 `conversations_list`，命名空间 `openclaw_direct` 里也多了 `computer`。Codex 线程的工具在创建时固定，工具指纹不同就换线程。

修法：指纹不同时，读线程 rollout 首行记录的工具。先确认它和绑定上的指纹一致；再检查本回合的每个工具，线程里都有同名、参数 schema 相同的工具（描述可以不同，命名空间按子工具递归比较）。满足就续用这个线程（日志 `keeping thread whose tool catalog covers this turn`）。续用时，热复用和 resume 用线程自己的指纹，绑定始终记录线程真实的工具集。

安全上不放宽：Codex 发来的工具调用只按本回合授权的工具表执行（`dynamic-tools` 的 `toolMap`），成员调用主人专属工具会被拒绝（candidate 实测返回 `Unknown OpenClaw tool: conversations_list`）。代价是成员回合里，模型能看到主人专属工具的声明。

方向是单向的：主人线程能服务成员回合；成员线程服务不了主人回合，主人第一次说话仍然换一次线程，之后两边共用主人线程。supervision 绑定不走这条路径。

candidate `lab/candidate/codex-ds-window.mjs` 的 T 段（`PHASES=T`，2026-10-08 22:02）：同一个 /vds 会话里成员先发言，之后主人、成员交替，共 6 轮。结果只有 2 个线程：成员线程 27 个工具、1 轮；主人一发言就换到 40 个工具的线程，其余 5 轮都在这个线程上。两边都答对了对方那几轮给的暗号。成员调用 `conversations_list` 被拒。缓存方面，第一次从主人切到成员时命中 7k/38k（这一轮刷新开发者说明），之后每轮 94–99%。

## G. 压缩时的交接摘要被当成回复发出（2026-10-08，run-attempt）

现象：群 oc_ff5076（/vds）23:30，「测试测试2」这一轮在回合内压缩。用户收到的回复是一整段 `# Context Checkpoint Handoff — V …`，真正的回答「在，正常 ⚡」既没发出，也没存进会话记录。

原因（candidate 抓了一遍通知顺序）：本地压缩时，Codex 先发 `item/started contextCompaction`；模型写完摘要后发 `rawResponseItem/completed`（role assistant、phase `final_answer`，没有对应的 agentMessage item），然后才是 `item/completed contextCompaction` 和真正的回答。插件的 raw item 路径把这条摘要提升成了本回合的回复候选，后面真正的回答反而被判成被取代。

修法：压缩 item 未结束时（`isCompacting()`），raw item 不进助手回复投影；工具和媒体记录照常。

### F 的首字与缓存对比（共享 VLab，2026-10-09 00:10 CST）

`codex-firsttext-shared-accept.mjs toolset --seedWords 90000 --salt <每次不同>`：先跑修复前（c0a9ce77），再跑修复后（7ee060b1），两次之前都重启，并加 salt，避免 DeepSeek 前缀缓存跨次命中。垫底约 40 万 token，两边第一个成员回合都触发压缩，之后会话约 12–13 万 token。

| | 修复前 | 修复后 |
|---|---|---|
| 线程 | 5 | 2 |
| 压缩后 5 轮首字 | 3.4 / 3.9 / 2.5 / 3.5 / 2.0 s | 4.3 / 3.2 / 3.2 / 2.8 / 2.4 s |
| 压缩后 5 轮未命中缓存的输入 | 约 15 万 token | 约 8 万 token |

结论：F 省的是重放的 token（这次少了约一半），首字没有可测的改善（DeepSeek Flash 处理 7.5 万未缓存 token 只多约 1 s，在噪声范围内）。

第一次对比没加 salt，修复前那次蹭到了修复后那次留下的前缀缓存，数据作废。另外，这两次都在压缩那一轮把交接摘要当成回复发了出来（`**Handoff Summary**`），共享 VLab 上可以稳定复现 G。

candidate `PHASES=S`（2026-10-09 00:04 CST，同一 Gateway 先跑 V 的 run-attempt，再跑修复版；约 31 万 token 的 /vds 会话，第二轮要求原样回复 `ANSWER-OK-7`，两边各压缩一次）：V 原样存下并发出的回复是 `**Handoff Summary** **Current State** …`，修复版是 `ANSWER-OK-7`。
