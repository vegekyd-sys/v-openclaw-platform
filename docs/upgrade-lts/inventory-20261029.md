# 轻量升级第一步：盘点（2026-10-29）

目标版本：上游 LTS 线 `extended-stable` 2026.9.3x（= v2026.9.8 + 后移修复，最新 9.35，2026-10-27）。
本文只做两件事：说清楚 worker 到底要不要；把 V 现在身上的全部改动分好类。不改 V、不改代码。

数据来源：
- 10/11 补丁台账 204 项（`~/v-openclaw-platform-noworker96` 分支 `claude/upgrade-101` 的 `docs/upgrade-101/ledger.json`），分类字段沿用当时的判断，本次未逐项复核。
- 10/11 之后 V 又上了 39 次发版，核心改动文件从 137 个涨到 187 个（`release/captured/*/manifest.json`）。新增项按 `CHANGELOG.md` 摘要初分，未逐文件核对。
- 历次演练和压测记录（记忆库 `openclaw9x/10x` 相关条目、`docs/worker-*.md`）。

---

## 一、worker 到底要不要

### worker 做的是什么

worker 只接默认运行时（deepseek 等 `agentRuntime.id: "vlab-worker"` 的路由）。它把每回合的准备和执行从 Gateway 主线程挪到子进程，多个子进程分摊。
`/vcodex`、`/vds`（Codex）和 `/vcc`（claude-cli）**从来不走 worker**。

### 历次测试，按"测的是什么"排开

| 日期 | 测什么 | 对比的两边 | 机器 | 结果 | 得出的说法 |
|---|---|---|---|---|---|
| 9/12 | 生产 9.1 首字 c1–c15 | 只有带 worker 一边 | V（8 核） | c1 2.8 / c15 10.5 s；增长全在**进 worker 之前** | 慢不在 worker 里 |
| 9/19 | 生产 30 并发真实飞书 | 只有带 worker 一边 | V | worker 冷启动最长 154 s；13 个 worker 占 15 GB | worker 冷启动是瓶颈（有害） |
| 9/19 | worker 并行冷启动 | 同版本新旧池子 | V | 主线程停顿 1.6 → 19 s，已回滚 | worker 启动本身吃主线程（有害） |
| 9/25 | 还原生产 9.1 | 只有带 worker 一边 | 演练机 4 核 | 新 worker 首轮 60–150 s，部分超时 | 有害 |
| 9/27 | **9.6 有/无 worker** | **同版本、同数据** | 演练机 4 核 | 无 worker 120/120、快 2–3 倍；有 worker 9/60 失败、CPU 翻倍 | **没用，反而有害** |
| 10/04 | 9.8 门禁 | 9.1 **带** worker vs 9.8 **不带** | 演练机 4 核 | c1 9.8 好（0.85 vs 1.23 s）；c15 9.8 差（8.7–9.0 vs 6.9–7.1 s） | **有必要**（主线程每回合 0.7 s 串行，worker 能分摊） |
| 10/15 | 10.3 门禁 | 9.1 **带** vs 10.3 **不带** | 演练机 4 核 | c1/c5 持平；c15 11.9 vs 8.7 s；但 9.1 自己两轮之间就能差 8→14 s | **有必要**（同上） |
| 10/17 | /vds 30 并发 | 不涉及 worker 开关 | VLab | 主线程每回合 0.7–1.1 s；它把 worker 对话首字也从 4–6 s 拖到 12–15 s | 主线程才是共同瓶颈 |

### 为什么结论打架

1. **两边量的不是同一件事。**
   - 说"有必要"的只有 10/04 和 10/15 两次门禁，看的都是 c15 首字准备。
   - 说"没用/有害"的看的是冷启动、内存、CPU 和失败率。
2. **说"有必要"的两次，版本和 worker 同时在变。** 都是"9.1 带 worker"对"新版本不带 worker"。c15 输了，可能怪新版本，也可能怪少了 worker，这两次分不开。
3. **唯一一次同版本对照（9/27，9.6）是 worker 输。** 但那次的 worker 是移植到 9.6 的版本，本身有问题，机器也只有 4 核。
4. **所有门禁都在 4 核共享演练机上测。** V 现在是 16 核 64 G。c15 慢的根源是 Gateway 主线程串行，主线程是单核的，核多了不一定变快；但宿主竞争（10/15 记过 9.1 自己就能差 8→14 s）在 16 核上会小很多。这件事从没在 V 规格上测过。

### 结论

- **能确定的：** worker 能做的只有一件事，就是在默认运行时并发高时，把回合准备从主线程分摊出去。它的代价都是实测过的：冷启动 60–154 s、每个 0.7–8 GB 内存、总 CPU 约 2 倍，还有一串专属故障（配置热重载关池子停摆 161 分钟、第二份配置漂移、媒体回传没人消化）。Codex 和 claude-cli 本来就不走 worker。
- **没测过的：** 同一个新版本、有/无 worker、在 V 规格机器上、用 V 规模的数据，c15 到底差多少。前面所有"有必要"的结论都卡在这个空白上。
- **升级时的建议：** 默认不带 worker。原因有三个：
  - worker 在 10.1 上已经起不来。
  - 移植它要带台账里 34 项 worker 专属改动，以后每个版本还要再适配一次。
  - c15 的根源是主线程每回合 0.7–1.1 s 的同步开销，worker 只是绕开它；不带 worker 时，这部分开销可以直接修，profile 已经指出了热点（会话条目反复读写克隆、图片 base64 清理、工具 schema 投影）。

  门禁的第一项，就是在 V 同规格机器上测"9.35 不带 worker"的 c15。够用就不带；不够用，再看是修主线程便宜还是带 worker 便宜。

---

## 二、补丁盘点

总数约 250 项：10/11 台账 204 项，加上之后新增的约 45 项。

| 类别 | 旧台账 | 10/11 后新增（约） | 升级时怎么处理 |
|---|---:|---:|---|
| A. 只为 worker 存在 | 34 | 4 | 不带 worker 就**全部作废** |
| B. 诊断/计时日志 | 8 | 1 | 不带，需要时再加 |
| G. 当时已判作废 | 12 | — | 不带 |
| E. 10.1 上游已覆盖 | 16 | — | 要**对 9.35 复核**（9.35 基于 9.8，比 10.1 早，不能直接沿用） |
| C. 9.1 大库/整读性能补丁 | 26 | 22 | **先不搬**，在新版本 V 规格实测后按需补 |
| F. 新版本自己的坑（fork 已修） | 11 | — | **必带**（全是演练时修的新版本问题） |
| D. 功能/行为改动 | 72 | 20 | **必带**，这是真正要移植的部分 |
| D'. 条件项（要你决定） | 12 | — | 见第三节 |
| H. 配置与 systemd | 13 | 5 | 按新版本重写，不是移植 |

一次升级要带的：D + F + 部分 D' + H，约 115 项。旧台账 204 项全带的老路线大约要 76 人日以上；这次约 60 项不带（A、B、G），约 48 项推迟（C），只在实测需要时补。

D 类还可以再拆开看（旧台账 72 项）：
- 核心 31 项，其中 23 项在 fork 里已有源码，可以直接用。
- 渠道插件 32 项（飞书 16、钉钉 6、企微 10）、Codex 插件 8 项。这些在插件里，不在核心编译产物里，移植难度小一档。
- 工作量：S 49、M 17、L 6。

### 10/11 之后新增的约 45 项（按 CHANGELOG 摘要初分）

**C. 9.1 热路径整读/主线程性能（约 22 项）**：先不搬，新版本实测后按需补
- 会话投影：#315 镜像查重走 identity、#360 投影重建每行读一次、投影 checkpoint、投影增量、#420 重建窗口
- 子代理与会话：#404 子代理按 key 读、#437 子运行共用读索引、#442 五处热路径整读、#451/#452、sessions.resolve 与语音归属不整读（fullread-doctor）、#475 sessions_search、#500 server-chat 按 id 读、#428 共享可见性只读当页
- 看板：#314 派卡只读需要的卡、#418 对账轻量列表、#487 生命周期巡检
- 其他：归档保留期清理、#383 磁盘预算维护不霸占写队列、重启提速（db91 预检回执复用）、Codex 进程检查预算、#355 历史图片不重复缩放
- 诊断：#397 慢事务日志带调用栈（归 B）

**D. 功能/行为（约 20 项）**：必带
- 会话与子任务：#353 重启恢复认领不卡群、跨会话统一分发与回复（unified-session）、子任务结算（subagent-settle 的 core 部分）
- Codex：#358 群聊换人不换 Codex 线程、#361 /vds 按 DeepSeek 100 万窗口压缩、/vds 累计 40 MiB 换线程、#426 Codex 子 agent 后续任务重新认领
- 模型与回退：#375 上游 5xx/429 切备用模型（回移上游 776f76b4b87，**9.35 可能已带**）、#345 DeepSeek 图片预算补漏
- 语音：#441 语音委派不误判失败、语音挂断与后台任务解耦（voice-task-continuity）
- 记忆与技能：#444 memory_search 超时退关键词、#506 MEMORY.md 全场景预载、#497 agent 直接 apply Workshop 提案
- 工具与夜班：#484 makaron 去掉 openclaw 工具（一行 core）、#454 卡片会话不做 memory flush、notes 12000
- 渠道（飞书/钉钉插件）：#501 自动续接显示在原卡、电话入口三连（session-phone / feishu-conversations / phone-entry）、语音确认卡、钉钉出站会话 ID 大小写

**A. worker 专属（约 4 项）**：#368 worker 内本地解析密钥、#435 配置热更新必换代 worker、#377 worker 推导 core 路径、#454 的 maxWorkers 上限放宽

**H. 运维与旁路（约 5 项）**：#480 技能目录上限（配置）、v-deepseek-web 插件（#422/#423）、向量锁页服务（#445）、硬盘哨兵（#498）、v-memory-indexer 密钥传递（#363）。这些不在核心里，升级时只需核对接口兼容。

---

## 三、要你决定的条件项

1. **小荷/火山 RTC 语音还要不要**（VOICE-RTC 三项 + worker 语音 provider）：10/05 起 /voice 已经换成 GPT Live / SeedDuplex / Grok。不要的话这几项全部作废。
2. **Telegram 还算不算 V 的渠道**（V-EXPERIENCE 里只属于 Telegram 的三项）：只有你一个人在用，不要的话就作废。共用模块 V-EXPERIENCE/module 钉钉、企微也在用，不能删。
3. **门禁口径**：是否改成"在 V 同规格机器上测，用户能感受到的指标不劣于 9.1"，重启时间不超过 9.1 的 2 倍。
4. **测试机器**：能否用 V 的每日镜像开一台同规格的临时机器做门禁（按小时计费，测完就删）。

其余 D' 项（B8 私聊审批、E2/VCODEX-SOL61 模型路由、E3 DeepSeek 预算、F7 飞书工作清单 core 侧）倾向于必带。其中模型路由要先看 9.35 有没有原生支持对应模型。

---

## 四、第二轮：逐项对照 9.35（2026-10-29）

### 做法

- 10/11 台账对 10.1 有逐项证据（上游 PR、提交、源码行号）。这些引用的上游 PR 是否进了 9.35，按 9.35 提交信息全文搜 PR 号来判断。
  - 9.35 是 9.8 的发布分支加上 cherry-pick 的回移，提交哈希和主干不一样，所以"是不是祖先提交"判断不了，只能搜 PR 号。
- 9.8→9.35 之间 656 个回移提交，按飞书、Codex、computer、语音、子 agent、注册表、重启等关键词逐条扫过。
- 卡升级最狠的子会话冻结（#157935），直接读了 9.35 源码。
- fork 里的源码补丁（51 个）和 10.3 门禁修复（31 个），都用 `git merge-tree` 试套到 9.35 上。
- 范围：上一轮的 D、D'、E、F 类，共 111 项；另外 10/11 之后新增的约 20 项功能改动，按 CHANGELOG 判断。
- **没做**：没有构建、没有跑测试；新增项没逐文件核对。标"实测确认"的项要到门禁时才能定。

### 结论汇总（旧台账 111 项）

| 结论 | 数量 | 说明 |
|---|---:|---|
| 9.35 已有，不带 | 15 | 其中 3 项是 9.35 的回移（10.1 反而没有） |
| 作废 | 2 | |
| 实测确认 | 9 | 可能已有或只看数据，门禁时验证 |
| 部分已有，带剩余部分 | 16 | 大多只剩配置覆盖或一小段 |
| 9.35 没有，要带 | 62 | 飞书 15、核心 19、企微 9、Codex 插件 7、钉钉 6、新版本自身问题 5、worker 插件 1 |
| 要你决定 | 7 | 小荷 RTC 4 项、Telegram 3 项 |

### 几条关键发现

1. **9.35 自带了我们的几项补丁。**
   - COMPUTER-EXEC-IDLE：9.35 回移了 #151127，回合结束就释放 computer 执行，正是 /vcc 桌面永久 BUSY 那个问题。
   - E3c：回移了 #167878，上下文用尽时改抛溢出错误，不再把 max_tokens 钳成 1。
   - MCP 回环 0b1236bb257：回移了 #165428，修了一半。
   - 飞书流式合并：回移了 #166610，修了一半。
   - gpt-6 系列双路由：上游自带，只剩配置覆盖。
2. **子会话冻结（#157935）在 9.35 里还在。** 子会话结束时的钩子加载插件注册表，没有传可复用的注册表，会冷加载全部插件。fork 在 10.3 上的修法（`19df62b` 等 4 个提交）要带过来，试套时冲突都只在 1 个源文件。
3. **会话列表被目录刷新拖慢的问题，9.35 可能还在。** 10.1 靠 #162280（只物化当页的行）缓解，但 #162280 不在 9.35。fork 的 session-row 系列（L 级）要带，门禁时专门测。
4. **试套情况。**
   - fork 源码补丁 51 个，6 个能直接套上，其余冲突。
   - 10.3 门禁修复 31 个，9 个能直接套上，其余大多只冲突 1 个源文件。
   - 冲突主要是上下文移动，不是逻辑重写，但每个都要人工看。
5. **官方插件都有 9.35 版本。** npm 上 `@openclaw/feishu`、`@openclaw/codex`、`@openclaw/ai` 的 `extended-stable` 标签都指向 9.35，"只发 Gateway"不影响 V。
6. **9.35 要求 Node ≥24.22.1。** V 现在是 Node 22.23.1。夜班 CLI、cua node 这些伴随服务要一起换，这是运维项。

### 10/11 之后新增的功能项（约 20 项）

| 改动 | 9.35 | 说明 |
|---|---|---|
| #375 上游 5xx/429 切备用模型 | 部分已有 | 核心 776f76b4b87 在 9.35；worker 跨进程那段随 worker 作废；只剩"同模型重试 1 次"策略 |
| #345 DeepSeek 图片预算 | 部分已有 | 跟 E3 一起处理，上游通用估算已按固定额度算图片 |
| #426 Codex 子 agent 后续任务重新认领 | 实测确认 | 9.35 回移了 #177577 等原生子 agent 修复，可能覆盖 |
| 子任务结算（subagent-settle） | 实测确认 | 9.35 有一串子 agent 结算修复；worker 回传那半作废 |
| #484 makaron 去掉 openclaw 工具 | 实测确认 | 9.35 的 `tools.deny` 配置可能就够，不用改核心 |
| #497 agent 直接 apply Workshop 提案 | 部分 | worker 拦截那半作废；放行规则要看 9.35 的 Workshop |
| #353 重启恢复认领不卡群 | 要带 | V 独有 |
| #358 群聊换人不换 Codex 线程 | 要带 | V 独有 |
| #361 /vds 按 100 万窗口压缩、40 MiB 换线程 | 要带 | /vds 是 V 独有 |
| #441 语音委派、语音任务连续性 | 要带 | V 语音链路 |
| 跨会话统一分发与回复（unified-session） | 要带 | V 独有，L 级 |
| #444 memory_search 超时退关键词 | 要带 | |
| #506 MEMORY.md 全场景预载 | 要带 | |
| #454 卡片会话不做 memory flush、notes 12000 | 要带 | 小 |
| #501 飞书自动续接显示在原卡 | 要带 | 飞书插件 |
| 电话入口、语音确认卡（3 次发版） | 要带 | 飞书插件 |
| 钉钉出站会话 ID 大小写 | 要带 | 钉钉插件 |

### 工作量

按 10/11 台账的 S/M/L 比例，换算到上次"全量 185 项约 76 人日"的估算口径：

| 部分 | 估算 |
|---|---|
| 旧台账要带的（62 + 16 项） | 约 40 人日 |
| 其中：核心 | 约 10 |
| 其中：语音（GPT Live 等 12 项） | 约 10 |
| 其中：飞书 | 约 9 |
| 其中：Codex 插件 | 约 4 |
| 其中：新版本自身问题 | 约 3 |
| 其中：企微 + 钉钉 + Telegram | 约 5 |
| 10/11 之后新增的约 15 项 | 约 12 人日 |
| 10.3 门禁修复移植到 9.35 | 约 3–5 人日 |
| 门禁上还没解决的三件事（停机时 worker 线程租约、插件源码复制、c15 每回合约 1 s） | 未知，要在 V 规格机器上先测有没有 |
| **合计** | **约 55–60 人日，加门禁未知项** |

老路线是 76 人日，加上 10/11 之后的新增和门禁，约 100 人日。这次省了约一半，省在三处：不带 worker、性能补丁推迟、9.35 自带了一部分。但要说清楚：**移植量仍然不小，"轻"主要轻在升级以后**。之后在 LTS 线上换小版本，每次只是一批修复；从现在起新改动先写源码，这个数就不会再涨。

### 可以分期的地方

切换当天必须有的：
- 核心（含新版本自身问题和门禁修复）
- Codex 插件
- 飞书
- 语音

这四块约 35 人日。下面这些用的人少，可以切换后一两周内补上，代价是这段时间这些渠道回到官方体验：
- 企微、钉钉、Telegram 的 V 体验
- 一部分飞书外观项（卡片头、发送人缓存、预建卡片）

### 下一步建议

1. **先跑门禁，后移植。** 在 V 同规格的临时机器上，用 V 的数据快照，跑原版 9.35 + 子会话冻结修复（`19df62b` 等 4 个提交）+ 两个启动迁移参数，用现成的 gate 脚本测：
   - 重启时间
   - 子会话冻结
   - c1/c5/c15 首字（不带 worker）
   - 会话列表

   这一步约 2–3 天，可以先回答"9.35 不带 worker 在 V 的规格上行不行"。不行的话，后面 55 人日也就不用投了。
2. 门禁过了，再按"切换当天必须有"的范围移植，约 35 人日。

---

## 附：旧台账 204 项分类明细

（按 `ledger.json` 的 `workerOnly`、`neededWithoutWorker`、`class` 字段和条目 id 自动分组。格式：`id [层, 当时类别, 工作量]`。当时类别：c1 = fork 已有源码，c2 = 只有 dist 需移植，c3 = 10.1 上游覆盖，c4 = 作废。）

### D. 功能/行为（必带）（72）

- MEMSEARCH-QUALITY [core,c2,L] Rarity-weighted keyword coverage, CJK bigrams, mixed any-term fallback, one-word guards
- B5 [core,c1,S] Agent runtime in reply-prefix context (card footer; F5 depends on it)
- C [core,c1,L] Shared Cron management for policy-named agent namespaces
- E1 [core,c1,S] Never send "delivery uncertain" sentence
- E3b-deepseek-budget-image [core,c1,S] DeepSeek budget counts inline images as 8192 tokens
- E3c-completions-overflow-signal [core,c2,S] Full context reported as overflow (compaction) instead of max_tokens=1
- E5 [core,c1,S] Source-only config commits back to baseline still announce config.changed
- E6 [core,c1,S] Output-limit truncation notice in Chinese
- SEC [core,c1,M] In-chat masked secret entry (core), host-script mirror, runtime-neutral question channel
- MSR [core,c1,S] Non-owner senders may run /model only (Feishu, later DingTalk/WeCom)
- COMPUTER-FRAME-PRUNE [core,c1,S] Keep only 2 newest computer screenshots in the current turn
- COMPUTER-EXEC-IDLE [core,c1,S] Computer execution released after idle (claude-cli loopback)
- BG-WORK-CODEX-SUBAGENT [core,c2,S] Codex native subagents get a scheduled Gateway context resolver
- LOOPBACK-SENDER [core,c2,S] MCP loopback passes requesterSenderId (backport of upstream 9.5)
- NO-REPLY-AFTER-TOOL [core,c2,M] NO_REPLY after a tool is silence (backport upstream 9.5 #149642)
- VDS-VIEW-IMAGE [core,c2,S] OpenClaw view_image capped 2048 px / <=1 MB
- VOICE-RTC/provider-plugin [core,c2,S] Volcengine RTC managed-room voice + Control UI RTC assets/import map; consult owner lifecy
- VOICE-RELIABILITY/classic-process-scope [core,c2,S] Voice exec processes reaped in the executing worker scope
- VOICE-NATIVE-TOOLS [core,c2,S] Server-owned voice client mediates native coding tools
- GPT-LIVE/lifecycle [core,c2,L] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/caller-links [core,c2,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/spoken-confirmation [core,c2,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- V-EXPERIENCE/telegram-background-line [core,c2,M] Feishu-like V experience on Telegram (core side)
- V-EXPERIENCE/command-text-and-secret-entry [core,c2,S] Feishu-like V experience on Telegram (core side)
- GPT-LIVE/consult-continuation [core,c2,L] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/voice-exec-lifetime [core,c2,M] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- FEISHU-visible-progress [feishu,c1,M]
- FEISHU-codex-commentary [feishu,c1,S]
- FEISHU-secret-entry [feishu,c1,M]
- FEISHU-card-header-hidden [feishu,c1,S]
- FEISHU-runtime-footer [feishu,c1,S]
- FEISHU-sender-empty-cache [feishu,c1,S]
- FEISHU-stream-coalesce [feishu,c1,M]
- FEISHU-steer-lane [feishu,c1,S]
- FEISHU-queue-10min [feishu,c1,S]
- FEISHU-progress-stream [feishu,c1,M]
- FEISHU-ask-user [feishu,c2,L]
- FEISHU-task-status [feishu,c2,M]
- FEISHU-dm-approvals [feishu,c2,M]
- FEISHU-card-precreate [feishu,c2,M]
- FEISHU-empty-card-discard [feishu,c2,S]
- FEISHU-model-switch-roles [feishu,c1,S]
- GPT-LIVE/native-progress [core,c2,L] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/document-controller [core,c2,M] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- VOICE-CONTENT [core,c2,M] Full backend document for the screen, short spoken summary, no spoken media URLs
- GPT-LIVE/talk-consult-model [core,c2,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/talk-relay-overflow-cancel [core,c2,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- DINGTALK-work-view [dingtalk,c2,S]
- DINGTALK-questions [dingtalk,c2,S]
- DINGTALK-background-line [dingtalk,c2,S]
- DINGTALK-secret-link [dingtalk,c2,S]
- DINGTALK-link-cards-handoff [dingtalk,c2,S]
- DINGTALK-command-auth [dingtalk,c2,S]
- WECOM-work-view-streaming [wecom,c2,S]
- WECOM-questions [wecom,c2,S]
- WECOM-steer-active-run [wecom,c2,S]
- WECOM-background-line [wecom,c2,S]
- WECOM-secret-link [wecom,c2,S]
- WECOM-link-cards-handoff [wecom,c2,S]
- WECOM-command-auth [wecom,c2,S]
- WECOM-sender-name [wecom,c2,S]
- WECOM-cli-native-config [wecom,c2,S]
- WECOM-package-pins [wecom,c2,S]
- WORKER-fast-compaction [worker-plugin,c2,S]
- CX-G1-vds-deepseek [codex-plugin,c1,M] /vds: DeepSeek on the Codex harness (provider list, transport overrides, route), code mode
- CX-B2-auth-family [codex-plugin,c1,S] Thread binding auth profile inherited only within the same provider family (vcodex->vds se
- CX-B-persistent-vds-thread [codex-plugin,c2,M] DeepSeek code-mode-off is permanent so /vds reuses one thread; provider-family change rota
- CX-C-vds-oversized [codex-plugin,c2,S] Oversized DeepSeek thread kept for Codex native compaction instead of rotating every turn
- CX-E-memory-flush-transient [codex-plugin,c2,S] trigger==='memory' turns use a transient thread, never rebind (#277)
- CX-292-compaction-handoff [codex-plugin,c2,S] Handoff summary during an open compaction item is not the reply (#292)
- CX-322-vds-view-image [codex-plugin,c2,M] DeepSeek Codex threads use OpenClaw view_image (<=1 MB), 413 drops the thread (#322)
- CX-137-native-subagent-relay [codex-plugin,c2,M] Yielded native child keeps its PreToolUse relay when the parent starts a new turn (#137)

### D'. 条件项（12）

- B8 [core,c1,M] Owner DM approvals: owner applies own delegated change from DM; delegated config authority
- E2 [core,c1,S] gpt-6-sol / luna / astra with production values
- E3 [core,c1,M] DeepSeek v4 output budget guard; empty-budget stop
- F7-core [core,c1,S] progressCard.changed listeners for the Feishu checklist stream
- VCODEX-SOL61 [core,c2,S] gpt-6.1-sol + astra dual route
- VOICE-RTC/gateway-managed-room [core,c1,M] Volcengine RTC managed-room voice + Control UI RTC assets/import map; consult owner lifecy
- VOICE-RTC/control-ui [core,c1,M] Volcengine RTC managed-room voice + Control UI RTC assets/import map; consult owner lifecy
- V-EXPERIENCE/module [core,c2,M] Feishu-like V experience on Telegram (core side)
- V-EXPERIENCE/telegram-questions [core,c2,S] Feishu-like V experience on Telegram (core side)
- V-EXPERIENCE/telegram-working-view [core,c2,S] Feishu-like V experience on Telegram (core side)
- WORKER-voice-providers [worker-plugin,c2,S]
- WORKER-port-status [worker-plugin,c2,S]

### F. 新版本自己的坑（必带）（11）

- FORK96-0b1236bb257 [upgrade-line,c1,S]
- FORK96-174bb5d0e60 [upgrade-line,c1,S]
- FORK96-3013cb3112d [upgrade-line,c1,S]
- FORK96-61f7dfee0b3 [upgrade-line,c1,S]
- FORK96-6c9a1549915 [upgrade-line,c2,M]
- FORK96-79e127b74fa+ff3f092bb5f [upgrade-line,c3,S]
- FORK96-8324404c49b [upgrade-line,c4,S]
- FORK96-b82243e4733 [upgrade-line,c2,S]
- FORK96-c7879215b95 [upgrade-line,c1,S]
- FORK96-session-row-catalog-series [upgrade-line,c2,L]
- UPSTREAM-157935 [upgrade-line,c2,S]

### H. 配置与 systemd（13）

- CFG-codex-plugin [config,c2,S] Canva Codex plugin off (#129); appServer.command -> standalone Codex CLI 0.159.2
- CFG-vds-model [config,c2,S] Synthetic /vds model on the codex runtime
- CFG-memory-fts-trigram [config,c2,S] CJK search via trigram FTS
- CFG-xsearch [config,c2,S] X search via Grok
- CFG-desktop-talk-mcp-misc [config,c2,M] V behaviour switches
- CFG-plugins-load-allow [config,c2,L] Load V's own plugins
- SD-node-runtime [systemd,c2,M] All run /opt/node-v22.23.1
- SD-gateway-execstart-chain [systemd,c2,S] Nine stacked ExecStart overrides (12 GiB heap, inspector, async-context-frame, KillMode=mi
- SD-v-patch-env [systemd,c2,S] Env switches for V patches/plugins
- SD-keep [systemd,c2,S] Host and integration settings
- SD-companion-units [systemd,c2,M] Units pinned to the 9.1 dist/behaviour
- SD-memory-indexer [systemd,c2,M] External real-time memory index writer
- SD-repo-drift [systemd,c2,S] Repo does not record most of V's units

### E. 10.1 上游已覆盖（待对 9.35 复核）（16）

- A13 [core,c3,S] Session sharing targets by exact key when warm
- A16 [core,c3,S] Canonical key validation without bulky payloads
- IMAGE-HOLD [core,c3,S] Native-vision probe off the full model catalog
- MEMORY-FLUSH-DEFER [core,c3,S] Pre-reply memory flush deferred until after the reply
- SKILLS-WATCH-READY [core,c3,S] Skills watcher ignores chokidar initial-scan events
- CANONICAL-SCAN-CACHE [core,c3,S] Canonical session keys validated once per file
- SESSIONS-EXACT-READS [core,c3,S] sessions.get / sessions.describe read only the requested session
- EXEC-APPROVALS-READ [core,c3,S] Healthy exec-approvals reads off the state writer
- E4 [core,c3,S] Bundled provider policy artifacts loaded optionally
- X-SEARCH-EFFORT [core,c3,S] x_search low reasoning effort on grok-4.6
- DINGTALK-sdk-compat [dingtalk,c3,S]
- WECOM-sdk-compat [wecom,c3,S]
- CX-H-bounded-history [codex-plugin,c3,S] Codex turn reads only the model-context tail, not the 70-178 MB transcript (PR #301)
- CFG-skills-workshop-symlink [config,c3,M] Workshop writes through symlinked skill dirs
- CFG-web-search-parallel [config,c3,S] Parallel free tier web_search (PR #187)
- SD-codex-orphan-cleanup [systemd,c3,S] Delete dead Codex app-server rows before start (#205/#284)

### C. 性能补丁（先不搬）（26）

- A1 [core,c1,S] Retry a write transaction whose BEGIN lost the lock (incl. initial session writes)
- A4-A5 [core,c1,S] Automatic session maintenance planned read-only, once per store per minute, ~1 s throttle
- A6 [core,c1,S] Reply-setup maintenance after the write, not inside it
- A7 [core,c1,M] Skip memory FTS/provenance schema ensures that cannot change anything
- A9 [core,c1,M] Verify agent DBs once per Gateway lifecycle with cross-process receipts; preflight timeout
- A10 [core,c1,S] Database verifier in its own memory cgroup
- A11 [core,c1,S] Sequential read-ahead of large DBs before full scans
- A12 [core,c1,M] Trajectory retention sweep planned outside the write lock
- A15 [core,c1,S] Explicit session target key: one exact row read
- A18 [core,c1,L] Read-only project memory on the prompt path; memory_search 25 s deadline
- A19 [core,c1,S] sqlite-vec chunk blobs below the page-cache budget
- D1 [core,c1,M] Workboard card-id range reads + lifecycle link index; lifecycle sweeps scoped to linked ke
- D2 [core,c1,S] Night Shift dispatch cap 36 / notes 12000
- D3 [core,c1,S] Workboard lookup cache per SQLite connection
- MEMSEARCH-FAST [core,c2,S] memory_search fixed-cost cut
- MEMSEARCH-1S [core,c2,S] memory_search ~1 s: session catalog skip, spare KNN child
- PLACEMENT-EVIDENCE [core,c2,S] Placement sweep decides absence from indexed columns
- PLACEMENT-SWEEP-LISTS [core,c2,S] Minute placement sweep stops reading every placement row
- GATEWAY-FIRST-MESSAGE [core,c2,S] Prepare first-message reply path after ready
- WORKBOARD-INCR-SWEEP [core,c2,S] Between full sweeps list only recently updated sessions
- WORKBOARD-SWEEP-LINKS [core,c2,S] Partial sweeps load cards by id, 16 at a time
- WORKBOARD-CREATE-INDEXED [core,c2,M] cards.create reads only what it needs (1912->82 ms)
- WORKBOARD-DISPATCH-SLOTS [core,c2,S] Dispatch counts owner slots from eligible cards (2731->1106 ms)
- TRANSCRIPT-INDEX-PREFLIGHT [core,c2,M] Transcript index preflight off the writer (PR #285)
- CONTEXT-WINDOW-READ [core,c2,M] Read only the model-context window of a big session
- CX-A-prebind [codex-plugin,c2,L] Stream the answer without waiting for the prompt transcript write; no pre-bind 256 overflo

### A. 只为 worker 存在（34）

- A2 [core,c1,L] One agent-database writer at a time across processes (Gateway + workers)
- B9 [core,c1,S] Retry session persistence after cross-process CAS conflict
- B1 [core,c1,L] Native attempt bridge / gateway identity for embedded attempts in isolated worker processe
- B2 [core,c1,M] sessions_spawn completion via external task bridge + sessions_yield claim; sessions_send u
- B3 [core,c1,S] skill_workshop runs in the Gateway when called from a worker
- B4 [core,c1,S] setup-inference probes native; worker runs own channel registry
- B6 [core,c1,S] System agent deepseek-flash native when routed to worker
- B7 [core,c1,S] Worker exec pinned to the Gateway control-plane config
- B10-core [core,c1,M] Relay worker media completions to the Gateway
- WORKER-PREWARM [core,c2,M] Prepare first turn before worker ready; canonical keys once per file in prewarm
- WORKER-COMMAND-FACADE [core,c2,S] Re-export prewarmAgentCommandRuntimes for worker cold start
- FORK96-469d5e946ff [upgrade-line,c4,S]
- VOICE-RELIABILITY/worker-process-owner [core,c4,S] Voice exec processes reaped in the executing worker scope
- GPT-LIVE/sessions-spawn-external-task [core,c1,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/worker-voice-projection-tool-order [core,c4,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- GPT-LIVE/completion-context [core,c4,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- WORKER-pool-admission [worker-plugin,c4,S]
- WORKER-prewarm-child-runtime [worker-plugin,c4,S]
- WORKER-memory-recycle-generations [worker-plugin,c4,S]
- WORKER-second-config-exec-env [worker-plugin,c4,S]
- WORKER-harness-routing [worker-plugin,c4,S]
- WORKER-ipc-rpc-bridge [worker-plugin,c4,S]
- WORKER-session-agentdb-access [worker-plugin,c4,S]
- WORKER-media-completion-relay [worker-plugin,c4,S]
- WORKER-subagent-completion-relay [worker-plugin,c4,S]
- WORKER-skills-telemetry-workshop [worker-plugin,c4,S]
- WORKER-voice-process-owner [worker-plugin,c4,S]
- WORKER-secrets-egress [worker-plugin,c4,S]
- WORKER-diagnostics [worker-plugin,c4,S]
- WORKER-core-dependents [worker-plugin,c4,S]
- CFG-agent-runtime-vlab-worker [config,c2,M] Route models to the worker pool
- CFG-worker-config-file [config,c4,S] Second config read by workers
- CFG-compaction-versa-fast [config,c2,M] Compaction provider registered by the worker plugin
- SD-worker-only-env [systemd,c4,S] Worker pool knobs

### B. 诊断/计时（8）

- A21 [core,c1,S] health reports event-loop delayP50
- E7 [core,c1,S] [firsttext-metrics] / [firsttext-ws-metrics] timing lines
- DIAG-bundle-prep [core,c4,S] Diagnostic bundle-prep timing
- DIAG-vbrowser [core,c4,S] Diagnostic [vbrowser-target-identity]
- CODEX-TURN-TAIL [core,c4,S] Diagnostic [codex-turn-tail.1]
- FEISHU-card-phase-log [feishu,c1,S]
- FEISHU-firsttext-e2e [feishu,c2,S]
- CX-J-turn-tail-logging [codex-plugin,c4,S] Diagnostic [codex-turn-tail.1] (PR #310)

### G. 当时已判作废（12）

- A9b-db91-shrink-reuse [core,c4,S] A SQLite shrink no longer forces a full integrity pass on the Gateway main thread (PR #149
- A14 [core,c4,S] tasks.list request-scoped store cache
- A17 [core,c4,S] Dreaming lists the session corpus once per sweep
- A20 [core,c4,S] Gemini web_search citation redirects within one budget
- TASK-STATUS [core,c4,M] Task registry bridge: Feishu card shows running background work
- FEISHU-codex-early-card [feishu,c4,S]
- FEISHU-name-swr [feishu,c4,S]
- GPT-LIVE/talk-session-model-inheritance [core,c4,S] GPT Live calls: lifecycle/hangup, consult continuation through yield/children, voice exec
- CX-289-toolset-cover [codex-plugin,c4,S] Owner/member alternation keeps a covering thread
- CX-vds-switch-guard [codex-plugin,c4,S] Block /vds->OpenAI-on-Codex switch
- SD-db91-env [systemd,c4,S] Toggles for db91 dist patches
- SD-feishu-steer-prestart [systemd,c4,S] Re-patch 9.1 dist before every start


## 附二：第二轮逐项结论（旧台账 111 项，对 9.35）

| 结论 | 数量 | 层分布 | 工作量 S/M/L |
|---|---:|---|---|
| NEED | 62 | core 19, feishu 15, wecom 9, codex-plugin 7, dingtalk 6, upgrade-line 5, worker-plugin 1 | 44/14/4 |
| PART | 16 | core 12, upgrade-line 1, feishu 1, worker-plugin 1, codex-plugin 1 | 8/5/3 |
| DECIDE | 7 | core 6, worker-plugin 1 | 4/3/0 |
| VERIFY | 9 | core 3, upgrade-line 3, wecom 2, dingtalk 1 | 8/1/0 |
| UP | 15 | core 11, upgrade-line 1, codex-plugin 1, config 1, systemd 1 | 14/1/0 |
| DROP | 2 | upgrade-line 1, config 1 | 2/0/0 |

#### NEED

- `CX-292-compaction-handoff` [codex-plugin, S]
- `CX-322-vds-view-image` [codex-plugin, M]
- `CX-B-persistent-vds-thread` [codex-plugin, M]
- `CX-B2-auth-family` [codex-plugin, S]
- `CX-C-vds-oversized` [codex-plugin, S]
- `CX-E-memory-flush-transient` [codex-plugin, S]
- `CX-G1-vds-deepseek` [codex-plugin, M]
- `B5` [core, S]
- `COMPUTER-FRAME-PRUNE` [core, S]
- `E1` [core, S]
- `E5` [core, S]
- `E6` [core, S]
- `GPT-LIVE/caller-links` [core, S]
- `GPT-LIVE/document-controller` [core, M]
- `GPT-LIVE/lifecycle` [core, L]
- `GPT-LIVE/talk-consult-model` [core, S]
- `GPT-LIVE/voice-exec-lifetime` [core, M]
- `MEMSEARCH-QUALITY` [core, L]
- `MSR` [core, S]
- `SEC` [core, M]
- `V-EXPERIENCE/command-text-and-secret-entry` [core, S]
- `V-EXPERIENCE/module` [core, M]
- `VDS-VIEW-IMAGE` [core, S]
- `VOICE-CONTENT` [core, M]
- `VOICE-NATIVE-TOOLS` [core, S]
- `VOICE-RELIABILITY/classic-process-scope` [core, S]
- `DINGTALK-background-line` [dingtalk, S]
- `DINGTALK-command-auth` [dingtalk, S]
- `DINGTALK-link-cards-handoff` [dingtalk, S]
- `DINGTALK-questions` [dingtalk, S]
- `DINGTALK-secret-link` [dingtalk, S]
- `DINGTALK-work-view` [dingtalk, S]
- `FEISHU-ask-user` [feishu, L]
- `FEISHU-card-header-hidden` [feishu, S]
- `FEISHU-card-precreate` [feishu, M]
- `FEISHU-codex-commentary` [feishu, S]
- `FEISHU-dm-approvals` [feishu, M]
- `FEISHU-empty-card-discard` [feishu, S]
- `FEISHU-model-switch-roles` [feishu, S]
- `FEISHU-progress-stream` [feishu, M]
- `FEISHU-queue-10min` [feishu, S]
- `FEISHU-runtime-footer` [feishu, S]
- `FEISHU-secret-entry` [feishu, M]
- `FEISHU-sender-empty-cache` [feishu, S]
- `FEISHU-steer-lane` [feishu, S]
- `FEISHU-task-status` [feishu, M]
- `FEISHU-visible-progress` [feishu, M]
- `FORK96-174bb5d0e60` [upgrade-line, S]
- `FORK96-61f7dfee0b3` [upgrade-line, S]
- `FORK96-c7879215b95` [upgrade-line, S]
- `FORK96-session-row-catalog-series` [upgrade-line, L]
- `UPSTREAM-157935` [upgrade-line, S]
- `WECOM-background-line` [wecom, S]
- `WECOM-cli-native-config` [wecom, S]
- `WECOM-command-auth` [wecom, S]
- `WECOM-link-cards-handoff` [wecom, S]
- `WECOM-questions` [wecom, S]
- `WECOM-secret-link` [wecom, S]
- `WECOM-sender-name` [wecom, S]
- `WECOM-steer-active-run` [wecom, S]
- `WECOM-work-view-streaming` [wecom, S]
- `WORKER-port-status` [worker-plugin, S]

#### PART

- `CX-137-native-subagent-relay` [codex-plugin, M]
- `B8` [core, M]
- `C` [core, L]
- `E2` [core, S] — 上游已带 gpt-6 系列双路由，只剩配置覆盖
- `E3` [core, M]
- `F7-core` [core, S]
- `GPT-LIVE/consult-continuation` [core, L]
- `GPT-LIVE/native-progress` [core, L]
- `GPT-LIVE/spoken-confirmation` [core, S]
- `GPT-LIVE/talk-relay-overflow-cancel` [core, S]
- `LOOPBACK-SENDER` [core, S]
- `NO-REPLY-AFTER-TOOL` [core, M] — #149642 在 9.35；但 #152786 让必答回合不能静默，要做更窄的移植
- `VCODEX-SOL61` [core, S] — 同 E2，只剩配置覆盖
- `FEISHU-stream-coalesce` [feishu, M] — 9.35 回移 #166610（收尾前合并过期预览）；流式中途替换那部分仍要
- `FORK96-0b1236bb257` [upgrade-line, S] — 9.35 回移 #165428（同症状的一半）；剩下的请求作用域那一半仍要移植
- `WORKER-fast-compaction` [worker-plugin, S] — 上游缺 provider 时回退原生压缩；要么拆成独立小插件，要么接受原生

#### DECIDE

- `V-EXPERIENCE/telegram-background-line` [core, M]
- `V-EXPERIENCE/telegram-questions` [core, S]
- `V-EXPERIENCE/telegram-working-view` [core, S]
- `VOICE-RTC/control-ui` [core, M]
- `VOICE-RTC/gateway-managed-room` [core, M]
- `VOICE-RTC/provider-plugin` [core, S]
- `WORKER-voice-providers` [worker-plugin, S]

#### VERIFY

- `BG-WORK-CODEX-SUBAGENT` [core, S] — 9.35 回移了一串 Codex 原生子 agent 修复（#175246/#177577/#179099），可能覆盖，实测
- `IMAGE-HOLD` [core, S] — 主体在 9.35；冷启动无目录时的回退要实测
- `SKILLS-WATCH-READY` [core, S] — 9.35 有 #155724/#155901，10.1 的完整机制还靠 9.35 没有的 #159226
- `DINGTALK-sdk-compat` [dingtalk, S]
- `FORK96-3013cb3112d` [upgrade-line, S] — 配置改用 deepseek-flash 后作废
- `FORK96-6c9a1549915` [upgrade-line, M] — 根因 #156268 在 9.35；fork 的额外加固可选
- `FORK96-b82243e4733` [upgrade-line, S] — 看数据：V 库里还有 9.1 时代的 azure 目录缓存行才需要；可改成升级时一次性清理
- `WECOM-package-pins` [wecom, S]
- `WECOM-sdk-compat` [wecom, S]

#### UP

- `CX-H-bounded-history` [codex-plugin, S]
- `CFG-skills-workshop-symlink` [config, M]
- `A13` [core, S]
- `A16` [core, S]
- `CANONICAL-SCAN-CACHE` [core, S]
- `COMPUTER-EXEC-IDLE` [core, S] — 9.35 回移 c5c9fba2aad（#151127）：受准入的回合结束即释放 computer 执行
- `E3b-deepseek-budget-image` [core, S] — 上游通用估算按固定额度计图片；只有保留 V 自己的 DeepSeek 守卫时才需要
- `E3c-completions-overflow-signal` [core, S] — 9.35 回移 #167878：上下文用尽改抛溢出，不再钳成 max_tokens=1
- `E4` [core, S]
- `EXEC-APPROVALS-READ` [core, S]
- `MEMORY-FLUSH-DEFER` [core, S]
- `SESSIONS-EXACT-READS` [core, S]
- `X-SEARCH-EFFORT` [core, S]
- `SD-codex-orphan-cleanup` [systemd, S]
- `FORK96-79e127b74fa+ff3f092bb5f` [upgrade-line, S]

#### DROP

- `CFG-web-search-parallel` [config, S] — V 已换 DeepSeek Search
- `FORK96-8324404c49b` [upgrade-line, S]
