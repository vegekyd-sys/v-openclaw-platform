# 夜班开跑时 V 卡不卡（2026-10-17，生产 V 实测）

结论先说：**派卡开跑本身不卡**。V 上的夜班从来不会「同时开跑」，派卡是一张一张发的，每张只占 Gateway 主线程约 50 ms。真正和夜班有关的卡顿来自另一个地方：夜班的「模板批看护」cron 每 10 分钟跑一次，**启动时卡 4–6.5 s，结束时再卡 3–10 s**。原因是 cron 的启动、结束和每 5 分钟一次的清扫，都要把 makaron 的全部会话条目读出来解析一遍，每次约 2 s CPU，再加约 1 s GC。

本次只读取了数据，没有改代码，也没有动 V（没重启，没发消息）。

## 1. 数据来源

| 来源 | 范围 |
|---|---|
| workboard.sqlite（只读） | 3 天的 attempt 1,966 条，事件 25,435 条 |
| Gateway journal | 10/16 00:00–10/17 14:05：派卡 RPC 1,367 次，用户消息 `[firsttext-e2e.1]` 825 条，liveness 延迟 696 次，重启 11 次 |
| cron_run_receipts（只读） | 最近 2 天，603 条 |
| CPU profile ① | 别的 session 抓的，13:04:12–13:17:33（800 s，1 ms 采样）：`/tmp/gw-stall-2026-10-17T050412072Z.cpuprofile` |
| CPU profile ② | 本次抓的，14:08:38–14:40:41（1,922 s，1 ms 采样，只挂 inspector，结束即断开）：`/tmp/cc-nsb-2026-10-17T060838673Z.cpuprofile` |

分析脚本放在 V 的 `/tmp/cc-nsb-*.mjs`：
- runs：忙碌段；
- win：事件前后窗口；
- callers：调用方；
- cat：分类合计；
- deep：深栈。

## 2. 夜班真的「同时开跑」吗？不会

- **attempt 开始时间**：任意 5 s 或 15 s 窗口里最多 2 个；60 s 窗口里最多 6 个，只出现过两次。
- **派卡 RPC `workboard.cards.dispatchWithOptions`**：10 s 窗口最多 2 次，30 s 最多 2 次，60 s 最多 3 次，5 分钟最多 10 次。
- **Gateway 重启之后夜班接上**（02:45、03:40、04:13、05:06、10:49 等）：派卡也是每分钟 1–3 张，见下表。
  - 重启后会有一阵 moved/claimed/edited 事件，例如 05:09 一分钟 64 条。这些只是改看板状态，不跑回合。

重启后前 20 分钟，每分钟的情况（派卡次数/attempt 数/liveness 最大秒数）：
```
10-17 05:06  0/0/0 0/0/0 1/1/0 1/1/0 2/3/0 2/2/0 1/2/0 2/2/0 2/2/0 2/2/0 2/3/0 1/1/0 ...
10-17 10:49  0/0/0 0/0/0 0/0/0 0/0/0 2/4/0 2/2/0 2/3/5 1/2/0 2/3/0 2/3/0 2/2/0 2/4/0 ...
```

所以 #414 说的「同时开始 N 个回合，首字多等约 N 秒」在 V 的夜班上不会发生：**实际 N=1**，最多偶尔 2。

## 3. 派卡那一刻 Gateway 花多少

profile ② 一共覆盖 29 次派卡：
- `runWorkboardDispatch` 合计 1.4 s，平均每次约 50 ms。
- 每次派卡前后，engine 会调一次 `workboard.cards.list`，约 0.3 s。
  - 这个接口不只是派卡时才调：32 分钟里调了 130 次，约每分钟 4 次，合计 32 s，占主线程 1.7%。

**派卡窗口与普通窗口对比**（各取事件前 2 s 到后 8 s）：

| | 主线程忙碌（中位） | 最长连续占用（中位） |
|---|---|---|
| 派卡窗口（29 个） | 约 20% | 约 0.4 s |
| 随机窗口（15 个） | 约 12% | 约 0.24 s |

有几个派卡窗口最长占用到 5 s，例如 14:16:11 和 14:17:14。逐个看过，都是碰巧撞上了 cron 清扫或 sessions.list，与派卡无关。

**用户首字**（[firsttext-e2e.1]，Gateway 重启后 15 分钟内的不算）：

| 时段 | 消息前 30 s 内派卡次数 | 条数 | 收到→开跑（pre-run）中位 | 首次可见中位 | liveness 有延迟的 tick 占比 |
|---|---|---|---|---|---|
| 10/16–10/17 05:06（修复前） | 0 | 432 | 3.3 s | 15.1 s | 12.9% |
| 同上 | 1 | 137 | 3.6 s | 15.4 s | 25.1% |
| 同上 | ≥2 | 6 | 5.8 s | 13.9 s | 42.9% |
| 10/17 05:20–14:05（修复后） | 0 | 32 | 1.6 s | 12.4 s | 12.7% |
| 同上 | 1 | 21 | 1.7 s | 13.6 s | 13.1% |
| 同上 | ≥2 | 3 | 3.2 s | 11.2 s | 18.0% |

**怎么读这张表**：
- 修复前（50–70 s 冻结还在的时候），派卡时段确实更容易碰上停顿。
- 05:06 那次重启（#405 等生效）之后，派卡时段和其他时段已经看不出差别。≥2 那一组只有 3 条，不能下结论。

## 4. 那 V 卡在哪：profile ② 里的分布

主线程 79% 空闲。忙碌段（空闲间隙 ≤15 ms 就算连续，这正是消息或语音帧会排队的时长）按来源分：

| 来源 | 频率 | 每次连续忙碌 | 其中完全不让出主线程的最长一段 | 是否已知 |
|---|---|---|---|---|
| workboard 生命周期 10 分钟全量对账 | 每 10 分钟 | **11.5–13.7 s** | 3.4–3.8 s | 已知，方案 A 在修。liveness 7.6 s（14:09:54）和 8.8 s（14:30:58）都是它 |
| **夜班「NS-BATCHV2-1015-01 · 模板批看护」cron 启动** | 每 10 分钟（14:13:30 / 14:23:30 / 14:33:30） | **4.3–6.5 s** | 1.3–2.1 s | **新** |
| **同一个 cron 结束（删除 run 会话）** | 每 10 分钟，约 30 s 后 | **3–10 s**（2–3 段） | 1.2–2.2 s | **新** |
| cron 运行会话清扫 `sweepCronRunSessions` | 每 5 分钟（6 次） | 2.7–5.3 s | 约 2 s | #404 列为后续，未修 |
| 其他 agentTurn cron（companion 心跳、Heartbeat V2）启动和结束 | 每小时几次 | 4–5 s + 3–7 s | 2.7 s | 同一根因 |
| 每分钟增量对账 / sessions.list | 每分钟 | 1.3–1.8 s，偶尔约 3.5 s | <1 s | 已知 |

profile ① 13:13 那一轮「批看护」的数字基本一样：
- 启动段连续忙碌 4.5 s；
- 结束段 3.6 s。

### 调用栈

**cron 启动**（每个 agentTurn cron 都有）：

```
prepareCronRunContext (isolated-agent-BxeXdw5A.js:834)
 └ resolveCronSession (session-D4AJhdUK.js:96)
    └ listSessionEntriesCore → listSqliteSessionEntriesFromDatabase
       └ readSessionEntryCache → loadSessionEntrySnapshot
          ├ parseSqliteSessionEntryRecord   ~0.9 s
          └ iterateSqliteQuerySync          ~0.7 s
```

单次 CPU 1.8–2.1 s，另外 GC 约 0.8 s。

`resolveCronSession` 只用得到 `store[sessionKey]` 和 `store[sourceSessionKey]` 这两行，却先 `Object.fromEntries(listSessionEntriesCore(...))` 把全部会话读进来，又是「先扫后比」。

**cron 结束**：

```
removeCronRunContinuationSessionIfIdle → deleteSessionEntryLifecycle
 └ deleteSqliteSessionEntryLifecycleLocked (runExclusiveSqliteSessionWrite)
    ├ collectAdmissionProtectedSessionIds (session-history-eviction-d5aiCsHS.js:742)   0.74–0.92 s，整表 SQL
    ├ readReferencedSessionIdsAfterTargetMutation → readReferencedSessionIds          0.58–0.65 s，整表读+解析
    └ runSqliteSessionDeletionTransaction                                              约 0.5 s
```

只删一个 run 会话，却要两次整表扫描。

**每 5 分钟清扫**：

```
onAdmittedTimer → sweepCronRunSessions (service-CzmmKrEg.js:2249)
 └ listSessionEntriesCore ... loadSessionEntrySnapshot
```

每次 1.9–2.1 s CPU 加 GC，只是为了在全部会话里挑出 `:cron:…:run:` 的键。

## 5. 对普通用户的感知

**文字消息**：
- 首字被拖慢的机会主要来自上面这些忙碌段，不是派卡。
- 「批看护」一项每 10 分钟占 7–15 s 连续忙碌，约占总时长 1.5–2.5%。cron 清扫约 1%，10 分钟全量对账约 2%。
- 消息落进这些段里，进 Gateway 后要多等 1–6 s 才开始处理；10 分钟对账时最多约 13 s。
- 用 journal 对齐 cron 前后 8 s 内到达的用户消息只有 7 条，pre-run 中位 1.9 s，样本太少，不能单独下结论。

**语音**：
- 按 9/18 复现结论，`appendAudio` RTT 超过约 3 s 就会出现吞字、截句、断续。
- 「批看护」启动段（4–6.5 s）和 10 分钟对账（11–14 s）都够得上。
- 所以每 10 分钟有两到三次机会把正在进行的通话卡断。派卡本身（最长约 0.4 s）不会。

**Tianyi 的体感为什么像「开跑就卡」**：
- 「模板批看护」就是夜班的东西，固定每 10 分钟一次，而且看护跑完之后经常紧接着有派卡。
- 另外，过去几天的大批量「开跑」都紧跟在 Gateway 重启之后，而重启本身就会让首字变慢、让会话卡住。

## 6. 修法建议（按收益排序）

1. **cron 启动 `resolveCronSession` 改为只读需要的行**：
   - `store` 改为只含 `sessionKey` 和 `sourceSessionKey` 两行的普通对象，用精确按键读取，语义要与 `listSessionEntriesCore` 的过滤一致。
   - 不能直接复用 #404 的 `createSessionEntryLookupReadOnly`，因为下游 `resolveSessionAuthSelection` 会写 `sessionStore[sessionKey]`。
   - 每个 agentTurn cron 启动省 2–3 s 主线程。
2. **cron 结束的删除路径**：`collectAdmissionProtectedSessionIds` 和 `readReferencedSessionIds` 只看与目标 sessionId 相关的行，可以走 `current_session_id` 索引，不要整表扫。每次删除省约 1.5 s。
   - 这条路径也服务所有 sessions.delete 和重置，收益不止 cron。
3. **`sweepCronRunSessions`**：只列 `:cron:` 和 `:run:` 前缀的键，用键前缀查询，并且先按 `updated_at < cutoff` 过滤再解析 entry_json。另一个办法是把 5 分钟间隔放宽到 30–60 分钟。
4. **夜班「模板批看护」自身**：它是张寒冰 10/15 18:29 在飞书私聊里建的，用来看护 Makaron 模板复刻批次 NS-BATCHV2-1015-01，有事件时私聊播报。这个项目 10/16 14:17 已经 done（3 个 skill 已上架），最终结果也在 14:27 播报过了。但 cron 没有停，至今每 10 分钟空跑一次。最省事的办法是停用这一个 cron（只改 enabled，需要张寒冰或 Tianyi 同意）。在此之外，它是 `everyMs: 600000` 的 agentTurn。在 1–3 修好之前，可以和夜班线商量：
   - 把频率降到 20–30 分钟；
   - 或者改成 command 类 cron。profile ② 里 `resolveCronSession` 的 5 次整表读取全部出现在 agentTurn 启动时（14:13:30、14:20:00、14:23:30、14:33:30、14:35:43）；dealclaw 那几个 command cron 在 14:10、14:15、14:25、14:30 启动时都没有出现。
   - 这是夜班线的改动，不在本仓库，需要夜班线和 Tianyi 拍板。
5. **engine 轮询 `workboard.cards.list`**：每分钟约 4 次，每次约 0.3 s，单次不会造成卡顿，但合计占主线程 1.7%。可以用窄投影或增量查询，优先级低。
6. 10 分钟全量对账已有方案 A 在做，这里不重复。实测它在 V 上现在是 11.5–13.7 s 的连续忙碌段（其中完全不让出主线程约 3.5 s），比之前估的 7–8 s 长。

1–3 是同一类问题：makaron 的会话条目整表读取，每次约 2 s 加 GC。合起来每小时大约省 60–90 s 主线程。按仓库流程，需要做 dist 补丁，并在 VLab candidate 上用 V 规模的会话库做 A/B（等价性 + 耗时）。本次没有动手实现，等 Tianyi 决定是否立项。
