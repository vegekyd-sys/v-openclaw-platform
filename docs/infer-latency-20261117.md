# `openclaw infer` 提速（infer-latency）

状态：2026-11-17 第二轮完成，**未合入 dev、未上 V**。源码在 `vegekyd-sys/openclaw-versa` 分支 `versa/port-infer-latency-20261117`（基于 `1a9308eec02`，即 V 上会话相关 chunk 的源码）：

| commit | 内容 |
|---|---|
| `d6f01a5e06e` | cherry-pick #559 `b0cbe1db060`，V 上已有，用于让分支和 V 的 `session-accessor-K0XuW6ln.js` 同源 |
| `9168f454254` | CLI：infer 不跑状态迁移预检；`--gateway` 只做 core 校验、不走运营代理；`--local` 只加载所选 provider 的插件 |
| `3dfc7c4c4fb` | Gateway：model run 的隐藏会话创建时不触发全库维护，删除时不做全库引用读取和计数 |

## 结论

**V 实测（生产 Gateway，CLI 改动，各 5 次交替）**

| 命令 | 修复前 | 只修预检（第一轮） | CLI 全部改动（第二轮） |
|---|---|---|---|
| `infer model providers --json` | 11.4–23.7 s，中位 11.5 | 3.2–3.3 s | 3.3–3.5 s，中位 **3.4** |
| `infer model run --local`（deepseek-flash） | 11.9–13.6 s，中位 12.2 | 3.7–4.5 s | 3.0–4.6 s，中位 **3.1** |
| `infer model run --gateway` | 13.6–31.1 s，中位 23.3 | 5.1–6.8 s | 4.4–7.9 s，中位 **5.3** |
| 参照：`openclaw agent --model deepseek/deepseek-flash` | 3.0–3.8 s，中位 3.4 | | |

**Gateway 侧改动（VLab candidate，V 规模夹具：21,900 个会话、1.7 GB entry JSON；VLab 是 4 核机，#611 测到同一操作比 V 慢 4–7 倍）**

| 主线程最长阻塞 | 修复前（V 字节） | 修复后 |
|---|---|---|
| 进程内第一次创建隐藏会话 | 56–72 s（触发全库维护） | 0.84 s（夹具进程自己读配置；Gateway 里配置常驻） |
| 删除隐藏会话，第 1 次 | 6.2–13.3 s | 87 ms（墙钟 4.1 s，#611 的分页预热，期间让出事件循环） |
| 删除隐藏会话，第 2–8 次 | 0.66–4.6 s | 53–218 ms（墙钟约 0.45 s） |

- **目标完成情况**：
  - `--local` 额外开销从约 11.3 s 降到约 2.1–2.4 s，未达到 1.5 s。剩下的是 CLI 进程本身的启动（模块加载、带插件校验的配置读取、插件元数据快照、模型目录），见「剩余开销」。
  - `--gateway`：只上 CLI 改动是 5.3 s，比 `openclaw agent`（3.4 s）慢约 2 s，其中 1.3–1.95 s 是隐藏会话删除。Gateway 侧改动去掉这一段后估计约 3.9–4.1 s，仍比 `agent` 慢约 0.5 s（CLI 本地部分 1.2 s 对 0.6 s）。**这是估算，Gateway 侧改动没有在 V 上验证过**，需上线后实测。
- **Tianyi 那次 47.9 s 与 infer 有关**（第一轮报告说「无关」是错的）：11:25:14.918 Gateway 接下这次 infer 请求后 40 ms，主线程进入一个 29.9 s 的同步写事务，调用点 `session-accessor-K0XuW6ln.js:2082`，即 `prepareInternalSessionEffectsSession` 给这次 model run 建隐藏会话时的 `replaceTranscriptEvents`；事务一结束这次 run 才开始。详见下文「29.9 s 复核」。

## 根因

### 1. CLI 的状态迁移预检（本地和 Gateway 两条路都有，8–21 s）

CLI 剖析（`node --cpu-prof`，只剖 CLI 进程）：config guard 对 `infer` 跑 `runDoctorConfigPreflight`：

- `assertOpenClawStateWriteAllowedAtPath` → `prepareSqliteReadOnlyLocation`：起一个子进程，对 862 MB 的 `~/.openclaw/state/openclaw.sqlite` 做 `sqlite.backup()`，只为读一行归属信息。5–6 s；Gateway 在写这个库时在线备份会从头再来，所以同一条命令测到过 11.5–25.3 s。
- `refreshMigrationCheckpoint` → 在状态库写协调器下 `assertSqliteIntegrity` 1.4 s。
- `openclaw agent` 快，是因为命令目录里它（非 `--local`）的策略是 `configGuard: "skip"`、`networkProxy: "bypass"`。上游 2026-09-25 `2a1402cd3e3`（#151025）已把这个预检从所有 CLI 命令里移除。

### 2. 预检之外的 CLI 开销

- `run-main` 为「网络命令」启用运营代理时，先读一遍带插件校验的完整配置（0.55 s）；config guard 又读一遍。`--gateway` 只和本机 Gateway 通信，插件配置由 Gateway 校验。
- `--local` 的 simple completion 为了调一个 DeepSeek，加载了 agent 的整套运行时插件：`codex`、`deepseek`、`memory-core`、`vlab-agent-worker-isolation`（配置的 harness runtime `claude-cli`/`codex`/`vlab-worker` + 记忆槽 + context engine），约 0.75 s，`codex` 最贵；`vlab-agent-worker-isolation` 在 CLI 里注册还会报错。

### 3. Gateway 上 model run 的隐藏会话

`infer --gateway` 发 `agent`（`modelRun: true`）→ Gateway 强制 `sessionEffects: "internal"` → 每次建一个 `agent:makaron:internal-session-effects:<runId>` 隐藏会话，回合结束后硬删除，两步都在 Gateway 主线程同步执行。fork 的来源是请求自己的新会话 `agent:makaron:explicit:model-run-<uuid>`（空的），所以走的是 `replaceTranscriptEvents` 只写一个 header，**不会复制 makaron 的大会话**。

- **删除（每次 1.3–1.95 s，V 上 10/10 次）**：`applySessionEntryLifecycleMutation` 的投影阶段调用 #611 的引用索引刷新（对每一行会话算指纹，`collectStaleSessionReferenceKeys`），提交事务里 `deleteMaterializedSessionStatePlans` 再读一次，另外前后各一次 `readSessionEntryCount`（逐行解析）。CLI 要等它结束才拿到结果。
- **创建**：隐藏会话的 `upsertSessionEntryCore` 和普通写入一样会触发自动全库维护（`kickSessionEntryMaintenanceAfterWrite` → `runPendingMaintenance` → `applySessionEntryMaintenance`：整库读取、逐条 `structuredClone`、引用读取），每库每分钟最多一次，但每次都是主线程上的同步长段。VLab 夹具上进程内第一次创建后阻塞 56–72 s。

### 29.9 s 复核（回应 peer 的线索）

| 线索 | 核对结果 |
|---|---|
| 29.9 s 是 d1c322cd 这次 infer 的隐藏会话创建 | **成立**。调用点 2082 = `replaceTranscriptEvents`；开始于 `res ✓ agent 77ms runId=d1c322cd` 之后 40 ms；这次 run 的 prompt 准备在它结束后立即开始。 |
| fork 了 makaron 的大会话 | **不成立**。`resolveInternalSessionEffectsSource` 用的是请求自己的 `explicit:model-run-<uuid>` 会话；fork 没有返回 created，走的是只写一个 header 的整段替换。 |
| 等别的进程的写锁 | **不成立**。29,899 ms 是 `BEGIN IMMEDIATE` 成功之后在事务内花的时间（`runSqliteTransactionSync` 在 BEGIN 之后才开始计时），且这段时间没有 `slow SQLite transaction lock wait` / `lock wait failed`。 |
| 在 V 规模夹具上复现 | 未复现：这一步本身 10–90 ms（首次 0.66–0.94 s）。这次能复现到的长段是同一路径上的全库维护（56–72 s），但维护跑在独立的 `setImmediate` 里，日志里的事务标签会不同。**V 上那 29.9 s 在事务内具体花在哪里，没有 Gateway 剖析无法确定**（按约束不对 Gateway 进程剖析）。 |

修复不依赖这一点：隐藏会话创建不再触发维护，删除不再做全库读取。

## 改动

### CLI（6 个文件，每次 `openclaw infer` 是新进程，**不需要重启 Gateway**）

| 文件 | 改动 |
|---|---|
| `config-guard--4cC6uJU.js` | `infer`/`capability` 不进状态迁移预检；`--gateway` 时配置只做 core 校验（`observe: false, pluginValidation: "core-only"`） |
| `command-path-policy-qUeic05b.js` | `infer`/`capability` 带 `--gateway` 时不走运营代理（与 `openclaw agent` 一致），`--local` 仍走 |
| `runtime-plugin-load-plan-Bm46qisR.js` | `pluginScope: "provider"` 的选择只加载 provider 的 owner 插件：不加配置的 harness runtime、记忆槽、context engine、harness 插件 |
| `simple-completion-runtime-D9F09LT6.js` | `prepareSimpleCompletionModelForAgent({ runtimePluginScope: "provider" })` 把 scope 写进运行时选择和两次元数据范围 |
| `model-fXXfAcf8.js` | `infer model run --local` 传 `runtimePluginScope: "provider"` |
| `prepared-model-runtime.facts-CEW6RO02.js` | workspace facts 分组键带上 scope，provider-only 的生成不会和完整 agent run 的生成合批 |

scope 是选择对象的一部分，prepared runtime 的 owner 身份（`ownerKey`、`hasSameLifecycleInput` 等都按 JSON 比较选择）自然把两种生成分开，Gateway 里其他调用方不受影响。

### Gateway（3 个文件，**需要重启 Gateway**）

| 文件 | 改动 |
|---|---|
| `internal-session-effects-C8FWqbuL.js` | 隐藏会话创建传 `skipMaintenance: true`；model run 自己的 cleanup 删除时标记 `runOwnedInternalSession` |
| `session-accessor.sqlite-lifecycle-state-CrB_K2kA.js`（#611 版本之上） | 投影：全部是 run-owned 的 internal-session-effects 删除时，不做全库引用读取；提交阶段的 `deleteMaterializedSessionStatePlans` 同样跳过 |
| `session-accessor-K0XuW6ln.js`（#559 版本之上） | 上述删除不做前后两次 entry 计数（结果里计数为 0，唯一调用方不使用） |

标记只对 `internal-session-effects` key 生效；subagent、模型探测、companion ask 等其他调用方不传标记，仍走完整检查。唯一会引用 run-owned 隐藏会话 id 的是同一次 run 的其他隐藏绑定（compaction 轮换），它们由同一个 cleanup 一起删除。

### 测试

- versa（Node 22.23.1）：新增 17 个用例（config-guard 7、命令策略 4、加载计划 2、隐藏会话 4）。去掉对应源码改动后 12 个失败（第一轮 5 个、第二轮 7 个），其余 5 个是对照用例，改动前后都应通过。相关全量：`src/config/sessions` 120 文件 1354 个、agents（harness、runtime-plugins、simple-completion、全部 prepared-model-runtime、internal-session-effects）48 文件 878 个、CLI（config-guard、preaction、command-path-policy）206 个、`capability-cli` 199 个，全部通过。
  - **更正第一轮**：第一轮说 `capability-cli.test.ts` 在基线上有 109 个失败，实际是借用的 `node_modules` 缺少包级依赖（`mdast-util-from-markdown` 等），补上后 199/199 通过。
- platform：`lab/infer-latency.test.mjs` 5/5（9 个文件的 before/after 哈希、往返、编译后条件求值、关键改动断言），`platform/platform.test.mjs` 17/17，`check-source-map` ok。

## 测速方法与证据

- V：修复前用 V 上真实 CLI；修复后用 core 安装的临时副本，只替换 6 个 CLI 文件（`/home/openclaw/.cache/infer-latency/core`，测完已删）。**没有改动 V 上任何生产文件**，Gateway 一直是生产代码，所以 V 的数字不含 Gateway 侧改动。一次只跑一个进程，A/B 交替。`--gateway` 每次后检查 liveness，并避开下文的 612 s 周期停顿窗口。DeepSeek 调用第二轮约 60 次（实验、剖析、测速、`agent` 参照），固定短 prompt，只用 deepseek-flash。
- VLab candidate：`lab/candidate/modelrun-session-ab.mjs`（V 规模夹具只用 VLab 数据，与 #611 同一套夹具），A=V 字节、B=Gateway 3 个发布文件，删除走 model run 的 cleanup（与 `agent-command` 一致）。receipt `candidate-4f75cd13-5e01-4721-a06e-a5c862bdf5ec`。
- 原始数据：`evidence/infer-latency-20261117/`（第一轮）和 `evidence/infer-latency-20261117/round2/`：`bench2-*.txt`（V）、`candidate-modelrun-session.txt`（含维护和删除的剖析）、`liveness-20261117-1443.txt`。

## 剩余开销（未达成的部分）

`--local` 3.1 s 中，模型调用 0.7–1.0 s，其余约 2.1–2.4 s 是 CLI 进程本身：模块加载与求值约 0.7 s、带插件 schema 校验的配置读取约 0.65 s（`--local` 之后还要用插件元数据，改成 core-only 没有收益，实测过）、模型目录与远程目录约 0.3 s，等等。要到 1.5 s 以内，需要给 `infer model run` 做一个像 `hooks relay` 那样的专用启动快路径，改动面大，没有做。

**给会议这类实时场景的建议**：不要每次 spawn CLI。常驻进程保持一条 Gateway 连接，用固定的 explicit session 调 `agent`（不建/删隐藏会话），单次约等于模型时间 + 0.5 s。

## 上线（需要 Tianyi 拍板）

1. **CLI 6 个文件**：随时可上，不需要重启 Gateway；下一次 `openclaw infer` 就生效。上线后核对：`infer model providers --json` 约 3.4 s，`--local` 约 3 s。
2. **Gateway 3 个文件**：需要一次 Gateway 重启（chunk 在启动时加载）。上线后核对：Gateway 文件日志里 `infer --gateway` 回合结束后不再有 1.3–1.95 s 的 `slow SQLite session write`；`--gateway` 实测 5 次和 `openclaw agent` 对比。
3. 两组可以分开上；`lab/infer-latency.plan.json` 是 9 个文件合在一起的计划，`before` 都是 V 当前字节（npm 原样、#559、#611）。
4. 回滚：放回 `before` 字节；CLI 组不需要重启，Gateway 组需要。

## 风险

- `infer` 不再顺手做状态迁移；全新安装、遗留状态未迁移时由 Gateway 启动或 `openclaw doctor` 迁移（上游同样处理）。V 早已迁移。
- `--gateway` 本地不再校验插件配置；插件配置错误由 Gateway 报出。
- run-owned 删除不做引用检查：如果有非隐藏会话引用了隐藏会话的 id（正常流程不会产生），它的转录会被删除而不是保留。
- 只改 core 这份安装；`/opt/openclaw-2026.9.1-v/`（夜班等少数入口）不受影响。

## 本次在 V 上引起的 liveness 延迟（按约束汇报）

**14:43:51 V 记到一次 liveness 延迟，overdue 1.96 s，由我的测速引起。**

- 链路：我的一次 `--gateway` 测速（run `8695d909`，生产 CLI 对照组）14:43:48.47 结束；随后 Gateway 主线程同步删除隐藏会话 1.41 s（14:43:48.5–49.9）；14:43:51 记到延迟。
- 这正是本次 Gateway 侧改动要去掉的那一段。
- 出现后我已停止 V 上的 `--gateway` 运行，并通过消息告知主会话。之后只跑了 5 次 `openclaw agent` 参照。剩余工作都在 VLab 和本地完成。

## 其他发现（未处理）

- **V 上有一个固定 612 s 周期的主线程停顿**（overdue 6–8 s）：12:08:41、12:18:54、12:29:07、12:39:19 …… 14:11:11、14:21:24、14:31:36、14:41:48，误差在 1 s 内，与 infer 无关。
  - 14:11:11 那次的停顿窗口和我的一批 `--gateway` 实验重叠，但时刻完全落在这个周期上。
  - 日志里没有直接线索。可能和上文的全库维护（每库每分钟最多一次、在 V 规模上是长段）有关，**未验证**，建议单独查。
- 每次 `openclaw` CLI（未修复的命令）都会在状态库上记一条约 1.5 s 的 `isOpenClawStateSchemaFastPathEligible` 慢事务，来自同一个预检；其他命令（如 `status`）仍有这项开销。

## 后续

1. 上线后在 V 实测 `--gateway` 与 `openclaw agent` 的对比（Gateway 侧改动只在 VLab 验证过）。
2. 612 s 周期停顿的来源。
3. 如果仍需要 CLI 秒级以内：`infer model run` 的专用启动快路径，或改用常驻进程。
