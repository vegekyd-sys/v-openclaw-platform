# 超大会话投影反复整段重建：根因与修复（2026-10-17）

## 结论

- 10/16 下午到 10/17 凌晨，马晴私聊 7da00997（25,951 行 / 171 MB）、夜班群 3c3fab41（12,811 行 / 105 MB）等大会话几乎每轮都整段重建投影。
- 起因不是分叉、回退或旁路追加。这两个会话最近 9,000 / 7,000 行里一次都没有。
- 起因是每轮都会发生的两种**原地改写**：
  1. 原生回合开始时，给用户消息写 `__openclaw` 镜像注解：`user-turn-transcript` → `rewriteTranscriptMessageAtAnchor`。
  2. 媒体送达后，给助手消息写展示内容：`chat-transcript-persistence` → `rewriteTranscriptEventRowsExact`。
- 改写走 `rewriteSqliteTranscriptEventRowsInTransaction`，依次做了三件事：
  1. 在全局写事务里对整会话求 `SUM(octet_length(event_json))`，持有跨进程写锁；
  2. 把投影标脏；
  3. 由后台把整个会话读一遍、解析一遍，再把所有 active/FTS 行写回。
- 标脏到重建完成的窗口里，读投影的地方会出问题：
  - 有的直接抛 `Session transcript projection is rebuilding`；
  - 有的在 `waitForSessionTranscriptProjection` 里等到 15 s 超时；
  - Codex 的上下文读取退回整段扫描。
- 修复的原则是“只处理变了的那部分”：
  - 改写如果不改变树的导航字段，也不改变任何投影事实，投影在同一个写事务里原地保持最新，不标脏，不重建；
  - 其他情况仍按原路径走。
  - 等价性有证明：投影是行的纯函数，树只由导航字段决定。单测和 candidate 都逐行核对过，与全量重建一致。

## 证据

### profile（V 生产 Gateway）

| profile | 窗口 | 主线程转录相关单次阻塞（最长） | 同窗口其他大头 |
|---|---|---|---|
| `/root/incident-20261017-freeze-profile/freeze-…17-22-45.cpuprofile` | 00:42–01:22，40 min，忙 807 s | `rewriteTranscriptMessageAtAnchor` → `shouldRebuildSessionTranscriptIndexSynchronously` **5.3 s**（00:46:08，写事务内，持锁）；Codex `openModelContext` 投影不新时整段回退 4.2 s（00:47:28）；`readVisibleTranscriptStats` 1.6 s；`withCommittedHistoryMaintenance` 1.8 s | `listSessionEntriesReadOnly`（会话条目全表解析）累计 **365 s**、单次 ≤3 s；`withAgentDatabaseProcessLeaseSync` 用 `Atomics.wait` 同步等写租约 4.2 s / 4.1 s / 2.4 s |
| Codex `main-cpu-profile.json` | 16:46:12–33 | 无转录读 | 子 agent 注册表全量读 7.1 s（PR #399 已上线） |
| Codex `recurrence-cpu-profile.json` | 18:37:40–38:00 | 无转录读 | sessions.list 可见会话 + workboard 查找 2–4.7 s |

- 00:42–01:22 这段 profile 里没有 ≥20 s 的冻结（采集脚本按超时退出）。
- 16:38–16:57 那次 46–70 s 的冻结期间，Gateway 没有任何 ≥1 s 的慢事务，profile 里也找不到转录相关的帧。
- **所以那次冻结不是本修复能解释的**。会话条目全表解析和同步等写租约，交给另一条线处理。

### 文件日志（V，10/16–17）

- 00:38:56：worker（pid 3069694）先做了一次 `agent.write`，耗时 3.78 s。
- 00:39:09–18：同一会话的三次 `image_generate…:ok:agent-loop` 媒体续跑，都在开跑后 0.2–3 s 失败，报错 `SessionTranscriptProjectionUnavailableError`，当时还没调用模型。
- 抛错位置：`prepareEmbeddedAttemptSessionManager` → `SessionManager.open(target, cwd, {maxBytes, maxEvents})` → `openBounded` → `readSessionTranscriptBoundedActiveContextCore` → `withCurrentProjectionSnapshot`。
- 10/16 的 `failed to mirror codex app-server prompt at turn start`，是 Codex 回合写完注解之后，在 `waitForSessionTranscriptProjection` 里等了 15 s 才失败。
- `drain-close-projection` 慢 10.7 s，也是在等投影。

### 这几个会话为什么变脏

- 数据来源：从 V 只读导出的副本。
- 7da00997：最近一次叶子控制在 seq 16563，之后约 9,400 行没有任何分叉、回退或旁路追加。
- 3c3fab41：最近一次叶子控制在 seq 5762。
- 两个会话最近一次压缩之后的活跃行分别是 1,567 和 7,474 行，可整段重建每次都处理 2.6 万 / 1.3 万行。

## 改动（dist 补丁，before = V 线上字节，10/17 01:40 核对：本地副本与 V 运行中的 8600 个 dist 文件哈希全部相同）

| 文件 | before | after | 内容 |
|---|---|---|---|
| `session-transcript-index-9itOio9h.js` | `5504f5de…` | `d0e05a56…` | ① 同步重建前的大小判断改成按 seq 逐行读 `octet_length`，超过 4000 行或 4 MiB 就停，返回值与原来完全相同；② 新增 `planCurrentProjectionAcrossExactRewriteInTransaction` 和 `applyCurrentProjectionAcrossExactRewriteInTransaction` |
| `session-accessor.sqlite-transcript-store-DV0WFe1a.js` | `0592e1cd…` | `74fba951…` | `rewriteSqliteTranscriptEventRowsInTransaction` 改写前先做计划：计划成立就原地更新 `context_eligible` 后返回；不成立就走原路径，原路径一字未改 |
| `builtin-openclaw-zQV8Wwjr.js` | `71c2310a…` | `a44b846a…` | 回合开始时打开会话，如果遇到“重建中”，就等投影就绪后重开（每次最多等 15 s，最多 4 次）。原来是直接失败 |

原地保持的条件（全部满足才走快路径）：

- 改写前投影是最新的：`needs_rebuild=0`、`indexed_seq` 等于最新 seq、没有未分类行。
- 每一行改写前后，以下导航字段的存在性和值都相同：`type`、`id`、`parentId`、`targetId`、`appendParentId`、`appendMode`。
- 每一行的 `shouldProjectActiveEvent` 和 `hasTranscriptMessage` 不变。
- 对在活跃路径上的行，FTS 条目（messageId、role、text、timestamp）不变。

满足时，树、活跃路径、全部位置、leaf、计数和 FTS 行都与全量重建结果相同，只有 `context_eligible` 可能需要更新为新值。

构建：`node lab/build-transcript-projection-checkpoint.mjs`。fixture 在 `lab/fixtures/transcript-projection-checkpoint/`，产物在 `lab/release-files/transcript-projection-checkpoint/`，计划在 `lab/transcript-projection-checkpoint-plan.json`。

## 验证

### 单测（`node --test lab/transcript-projection-checkpoint.test.mjs`，6/6，已进 platform/catalog）

- release 文件等于补丁器作用在 V 字节上的结果；锚点各命中一次；重复打补丁会报错。也能叠加在 dev 上 #398 的 index 版本之上。
- 等价性：以 V 原版 index chunk 的全量重建为真值，用 V 的真实表 DDL，覆盖下列会话形态：
  - 线性、旁路追加、回退分支、reset、leaf→null、无 parentId 的旧记录、非法叶子控制；
  - 400 行混合会话（离开路径的分支、带图片的 toolResult、压缩、excludeFromContext）。
- 每一行施加 10 种改写：注解、展示元数据、excludeFromContext 翻转、图片数据、正文、时间戳、parentId、type、删 message、改为 side。
  - **1,505 次原地计划，每一次都与全量重建逐行一致**；
  - 2,372 次正确回退：parentId、type、side 这几种改写一次都没走快路径；路径上消息的正文或时间戳变化会回退；注解、展示元数据、excludeFromContext、图片这几种全部走快路径。
- 投影不新的四种情况都不出计划：needs_rebuild、watermark 落后、没有 state、存在未分类行。
- 大小判断：10 组边界（3999/4000/4001 行、4 MiB 上下、带入参事件）与原版结果相同。
- 回合开始时的等待：重建一次后成功；等待超时会重试；第五次放弃；其他错误、其他会话、已中止的 run 都不重试。chunk 的其余部分字节不变。

### candidate A/B（V 数据副本）

- 数据：从 V 只读导出四个会话的全部行，没有导出其他会话。导出文件只放在 VLab `/var/tmp/projection-checkpoint-20261017/`，用完删除。
  - 7da00997 马晴私聊：25,951 行 / 171 MB，vlab-worker + deepseek-flash；
  - 3c3fab41 夜班群：12,811 行 / 105 MB，/vds；
  - 06d45f08 Tianyi 主群 oc_e76c5073：V 上现在只有 36 行；
  - 2b21b4a0 /vds 最大的私聊：26,564 行 / 278 MB，作为补充对照。
- 同一个 candidate 里，A（V 字节）和 B（本补丁）按 A,B,A,B 交错跑，每轮都从同一份基线库开始，用真实模块执行真实的改写函数。
- 每个进程先做一次热身写入，把 db91 完整性门（约 1.3 s，A/B 相同）排除在测量之外。V 上的进程是常驻的，早已过了这道门。

**`candidate-ea671ae4-98b0-4e05-a0aa-d705d05bf1cb`（ok）**，每格写作 A → B；“窗口”指改写后到投影可读的时间：

| 会话 | 场景 | 改写调用 | 改完读者看到 | 窗口 | 主线程最长停顿 | 投影 = 全量重建 |
|---|---|---|---|---|---|---|
| 7da00997 | 用户消息注解 | 62 ms → 18 ms | 重建中 → 正常 | 4,267 ms → 3 ms | 326 ms → 25 ms | 是 / 是 |
| 7da00997 | 助手展示改写 | 29 ms → 3 ms | 重建中 → 正常 | 3,988 ms → 2 ms | 91 ms → 0 | 是 / 是 |
| 3c3fab41 | 用户消息注解 | 23–56 ms → 14–18 ms | 重建中 → 正常 | 2,799–4,101 ms → 2–6 ms | 70–124 ms → ≤27 ms | 是 / 是 |
| 3c3fab41 | 助手展示改写 | 17–28 ms → 3 ms | 重建中 → 正常 | 2,986–5,130 ms → 1 ms | 79–187 ms → 0 | 是 / 是 |
| 2b21b4a0 | 用户消息注解 | 41–44 ms → 17–23 ms | 重建中 → 正常 | 4,761–5,053 ms → 2–3 ms | 71–103 ms → ≤23 ms | 是 / 是 |
| 2b21b4a0 | 助手展示改写 | 27–31 ms → 3–4 ms | 重建中 → 正常 | 5,322–5,517 ms → 1 ms | 91–102 ms → 0 | 是 / 是 |
| 06d45f08 | 助手展示改写 | 15–51 ms（小会话原本就同步重建） | 正常 | 2 ms | ≤52 ms | 是 / 是 |
| 全部 | 强制全量重建（分叉/回退） | 两边相同 | 重建中 | 1.2–6.2 s | ≤383 ms | 是 / 是 |

说明：

- 7da00997 第一轮每个进程首次改写时页缓存是冷的，A0 834 ms、B0 541 ms，表中没有计入这一轮。
- **模型视图逐字段对比**：四个会话各跑四轮，对比项是 `openModelContext().buildSessionContext()` 的 messages、model、thinkingLevel、leaf、entries，再加上转录尾部 200 条和统计。A1、B0、B1 与 A0 都是零差异。
  - 7da00997：153 条上下文消息；3c3fab41：5,749 条；2b21b4a0：28 条；06d45f08：35 条。

### candidate 真实回合

- 结果见 PR 描述。
- 做法：用私有 Gateway，按 V 的路由，每个会话背靠背发两轮。

## 没解决、留作后续

- 分叉、回退、叶子控制、旁路追加仍然整段重建。重建期间新回合会等待，不再失败，但仍要等 1.2–6 s。
  - 要做到只从分叉点重建，需要从中间状态续扫，并且精确复现 `scanSessionTranscriptNavigation` 的 reset 和 stale 规则。这几个会话已经几千行没出现过这类事件，所以单独评估。
- webchat 的 `rewriteSourceReplyTranscriptMirrors` 和 `rewriteAssistantTranscriptMessageByIdempotencyKey` 仍是整读 + 整会话替换（`withTranscriptWriteLock.readEvents/replaceEvents`）。它们只在 chat.send 路径带媒体时触发，不在本次范围。
- 16:38–16:57 的冻结风暴。profile 指向会话条目全表解析（`listSessionEntriesReadOnly`，40 min 累计 365 s），以及 `withAgentDatabaseProcessLeaseSync` 同步等写租约，交给另一条线。
