# `openclaw infer` 慢在哪：CLI 每次整库备份状态库（infer-latency）

状态：2026-11-17 补丁与证据已就绪，**未合入 dev、未上 V**。源码 `vegekyd-sys/openclaw-versa` 分支 `versa/port-infer-latency-20261117` @ `b94693e56a9`（基于 `ca32fca3e29`，即 V 这些 chunk 的源码）。

## 结论

| 命令（V，各 5 次，交替跑） | 修复前 | 修复后 | 中位数 |
|---|---|---|---|
| `infer model providers --json` | 11.35–11.72 s | 3.20–3.31 s | 11.61 → **3.22 s** |
| `infer model run --local`（deepseek-flash，“只回复两个字：收到”） | 11.76–12.64 s | 3.67–4.48 s | 11.96 → **3.92 s** |
| `infer model run --gateway`（同上） | 12.84–14.14 s | 5.09–6.79 s | 13.32 → **5.58 s** |
| 参照：`openclaw agent --model deepseek/deepseek-flash`（同一 prompt，1 次） | 4.92 s（Gateway 内 4.09 s） | — | — |

- 三条命令每次多出的 **8–9 s（偶发到 21 s）是同一个原因**：CLI 的 config guard 对 `infer` 跑了「状态迁移预检」，在子进程里把 862 MB 的状态库 `sqlite.backup()` 一整份，只为读一行归属信息，然后再把这个库完整做一次 integrity check。
- 修复只改一处：`infer` / `capability` 不再进入这个预检（与 `config`、`health`、`logs`、`sessions`、`gateway call` 同列）。上游在 2026-09-25 `2a1402cd3e3`（#151025，「keep legacy state repair in Doctor」）已经把这个预检从所有 CLI 命令里整体拿掉，本补丁只取其中与 infer 相关的最小一块。
- **目标没有全部达到**：本地 infer 额外开销从约 11.3 s 降到约 3.2 s（目标 1.5 s）；`--gateway` 5.6 s，仍比 `openclaw agent` 慢约 0.7 s。剩下的开销逐项列在「修复后还剩什么」，每项都有剖析数据和对应的后续做法。
- Tianyi 实测的 47.9 s（`--gateway`）= CLI 预检约 11 s + **Gateway 主线程被一次与 infer 无关的 29.9 s 同步 SQLite 写入卡住**（大会话 `replaceTranscriptEvents`，liveness overdue 22 s）+ 模型 1.5 s + 收尾删除隐藏会话 1.3 s。今天只出现过这一次 ≥10 s 的写入；这次测速 10 次 `--gateway` 都没有复现，也没有引起 liveness 延迟。

## 现象（2026-11-17 Tianyi 在 V 上实测）

1. `infer model providers --json` 13.1 s，不调模型；`--help` 1.2 s，`--version` 0.03 s。
2. `infer model run --local` 两次都约 13.5 s；同一个 key 直连 DeepSeek 0.6–0.9 s。
3. 同样命令 `--gateway` 47.9 s；`openclaw agent … --json` 走同一个 Gateway 只要 4.5 s。

## 根因 1：infer 的状态迁移预检（本地与 Gateway 两条路共有）

V 上 CLI 就是 core：`/usr/local/bin/openclaw → /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/openclaw.mjs`。对 CLI 进程用 `node --cpu-prof` 剖析（只剖 CLI，不碰 Gateway），汇总见 [`evidence/infer-latency-20261117/cpu-profile-summaries.txt`](evidence/infer-latency-20261117/cpu-profile-summaries.txt)。

`infer model run --local`（12.3 s）的时间线：

| 时间 | 在做什么 |
|---|---|
| 0–1.7 s | 模块加载、读配置（含插件 schema 校验） |
| **1.7–8.0 s** | **主进程空闲，等子进程**：`runDoctorConfigPreflight` → `assertOpenClawStateWriteAllowedAtPath` → `prepareSqliteReadOnlyLocation`，子进程 `createOnlineReadOnlyBackup` 对 `~/.openclaw/state/openclaw.sqlite`（862 MB）做 `sqlite.backup()` |
| **8.0–9.9 s** | `refreshMigrationCheckpoint` → `needsStateMigrationCheckpoint` → `withOpenClawStateStartupCheckpointConnection`（持有状态库写协调器）→ `assertSqliteIntegrity` / `runSqliteCheck` 1.4 s |
| 10.0–11.5 s | 准备模型运行时（插件、目录） |
| 11.5–12.2 s | DeepSeek 调用 |

- 这个预检由 `config-guard` 对所有不在豁免名单里的命令执行（`shouldConsiderStateMigration`），`infer` 不在名单里。
- 子进程备份不是一次性的：Gateway 一直在写状态库，SQLite 在线备份遇到源库变化会从头再来，所以同一条命令在对照组里跑出过 11.5 s、24.5 s、25.3 s。
- `openclaw agent` 快，是因为命令目录里 `agent`（非 `--local`）的策略是 `configGuard: "skip"`：Gateway 派发不碰本地状态，CLI 自身只花约 0.8 s。

## 根因 2：Tianyi 那次 47.9 s 的 Gateway 部分

Gateway 文件日志摘录见 [`evidence/infer-latency-20261117/gateway-log-excerpts.txt`](evidence/infer-latency-20261117/gateway-log-excerpts.txt)。

| 时间（CST） | 事件 |
|---|---|
| ~11:25:03.5 | CLI 启动（退出时间倒推 47.9 s） |
| 11:25:14.918 | `res ✓ agent 77ms runId=d1c322cd…`：Gateway 接下请求（前 11 s 是根因 1 的 CLI 预检） |
| 11:25:14.96–11:25:44.86 | **Gateway 主线程同步 `agent.write` 29,899 ms**，调用点 `session-accessor-K0XuW6ln.js:2082`（`replaceTranscriptEvents`，整段重写某个会话的转录；时间上紧跟在一个飞书群大会话的 codex 回合之后，`codex-bounded-history` 22,393 事件 / 7.8 MB）。`liveness heartbeat delayed: overdue=22344ms` |
| 11:25:47.872 | 本次 model run 才开始（prompt 准备 38 ms） |
| 11:25:48.2–49.4 | DeepSeek 调用、回合结束 |
| 11:25:49.7–51.06 | 删除隐藏会话 `model-run-<uuid>`：同步写 1,341 ms |
| 11:25:51.375 | CLI 输出结果 |

- 这 29.9 s 不是 infer 造成的，infer 只是正好排在后面。11/17 00:00–13:00 `sqlite/transaction` 里 ≥4 s 的只有 7 条，这是唯一一条 ≥10 s 的；`replaceTranscriptEvents` 的整段重写属于「大会话同步读写」这一类老问题，单列为后续。
- **infer `--gateway` 自身每次都有的代价**：`modelRun` 用一次性隐藏会话，回合结束后 `createInternalSessionEffectsCleanup` → `applySessionEntryLifecycleMutation` 硬删除它。这是一次 projected removal，在 Gateway 主线程同步跑 **1.30–1.95 s**（测速 10/10 次），CLI 要等它结束才拿到最终结果。#611（session-reference-index，已在 V 上）的 README 已把 projected removal 的剩余成本列为残留风险（指纹比对 + 全表 `readSessionEntryCount`）。`openclaw agent` 复用固定会话，没有这一步。

## 修复

`src/cli/program/config-guard.ts`（versa `b94693e56a9`）：

```ts
    commandName !== "sessions" &&
    // One-shot inference is a provider surface, not a state owner. ...
    commandName !== "infer" &&
    commandName !== "capability" &&
```

- 测试：`config-guard.test.ts` 新增 5 个用例（`infer model run`、`infer model providers`、`capability` 别名不跑预检；有遗留状态目录时也不迁移、不动目录），不带修复时 5 个都失败。`config-guard` + `preaction*` + `command-path-policy` 6 个文件 200/200 通过（Node 22.23.1）。`capability-cli.test.ts` 在基线 `ca32fca3e29` 上就有 109 个失败，修复前后数目相同，与本改动无关。
- 发布文件：`lab/release-files/infer-latency/config-guard--4cC6uJU.js`，由 `lab/build-infer-latency.mjs` 从 V 字节构建（`before` = npm 9.1 原样字节 `8a221eb3…`，V 上未改过；`after` `27ad3522…`）。`lab/infer-latency.test.mjs` 校验往返、只多两个命令和一行标记注释，并直接求值编译后的条件：`infer`/`capability` 不迁移，其余原先迁移的命令（`message`、`agent`、`gateway run`、`models list`、未知命令等）仍迁移。`release/source-map.json` 已映射到 `versa:b94693e56a9`。
- 修复后的 `infer` 仍读一次完整校验过的配置（`getConfigSnapshot`），和 `config`/`sessions` 等豁免命令一样。

## 测速方法

- 修复前：V 上真实 CLI（`openclaw`）。修复后：V 上 core 安装的临时副本（`/home/openclaw/.cache/infer-latency/core`，`cp -a`，与 core 只差这一个文件，`diff -rq` 核对），用同样方式启动。**V 上的生产文件没有改动**，副本测完已删除。先试过用 Node 加载钩子在内存里改文件，钩子本身拖慢模块解析 2–4 s，数据作废。
- 一次只跑一个 CLI 进程；A、B 交替；`--gateway` 每次跑完都查 liveness，脚本遇到新的延迟就中止（10 次都没有）。DeepSeek 调用共约 33 次（测速 20 次，其余为剖析、参照和冒烟），prompt 固定，只用 deepseek-flash。
- 原始输出：[`bench-providers.txt`](evidence/infer-latency-20261117/bench-providers.txt)、[`bench-local.txt`](evidence/infer-latency-20261117/bench-local.txt)、[`bench-gateway.txt`](evidence/infer-latency-20261117/bench-gateway.txt)。最终发布字节（sha `27ad3522…`）在副本上再跑一遍：providers 3.17 s、local 3.94 s、gateway 5.34 s。

## 修复后还剩什么

`--local` 3.9 s（CLI 剖析，[摘要](evidence/infer-latency-20261117/cpu-profile-summaries.txt) 的 after 段）：

| 段 | 约 | 说明 / 后续做法 |
|---|---|---|
| 模块加载与求值 | 0.7 s | 已有 compile cache；再降要拆 import 图 |
| 读配置 + 插件 schema 校验 | 0.65 s | `validateConfigObjectWithPlugins` → 插件元数据快照、已装插件索引。可对 infer 用 `pluginValidation: "core-only"`，但会放过插件配置错误，需要拍板 |
| 加载 agent 的整套运行时插件 | 0.75 s | `prepareSimpleCompletionModelForAgent` → `loadAgentRuntimePluginRegistryHandle`：为了一个 DeepSeek 补全，加载了 Codex 插件（含 `compileCodexSchema`）、`vlab-agent-worker-isolation`（在 CLI 里注册失败、报错）、memory-core 等。只加载所选 provider 的插件可省约 0.7 s，改动在 prepared-model-runtime 的插件归属设计里，单独做 |
| 模型目录 / 远程目录 / 密钥解析 | 0.3 s | |
| DeepSeek 调用 | 0.65–1.0 s | |

`--gateway` 5.6 s：CLI 本地 2.0 s（同上前两段 + 目录）+ 连接与准备 0.5 s + 模型 1.0–1.3 s + **隐藏会话删除 1.3–1.95 s**（见根因 2，也是每次 infer 对 Gateway 主线程的阻塞）+ 退出 0.3 s。把这一步挪到回复之后或做便宜，`--gateway` 就会快于 `openclaw agent`。

**给会议这类实时场景的建议**：每次 spawn 一个 CLI 至少付 2–3 s 启动成本，再怎么削也很难到 1 s 以内。实时用法应改用常驻进程：保持一条 Gateway WebSocket 连接，用固定的 explicit session 调 `agent`（不付隐藏会话删除），或在常驻进程里直接调 provider。

## 上线（需要 Tianyi 拍板）

- 改动：core `dist/config-guard--4cC6uJU.js` 一个文件（`lab/infer-latency.plan.json`）。
- **不需要重启 Gateway**：CLI 每次是新进程，下一次调用就用新文件；Gateway 进程的命令名是 `gateway`，这个判断对它结果不变。
- 生效后核对：V 上 `openclaw infer model providers --json` 约 3.2 s（修复前 11–25 s），`infer model run --local` 约 4 s。
- 回滚：放回 `before` 字节（npm 原样），同样不需要重启。

## 风险

- 全新安装、遗留 JSON 状态还没迁移进 SQLite 时，`infer` 不再顺手迁移；它读到的是迁移前的状态。Gateway 启动和 `openclaw doctor` 仍会迁移，上游也已经这样处理。V 的状态早已迁移完。
- 只改了 core 这一份安装；`/opt/openclaw-2026.9.1-v/` 那份旧安装（夜班等少数入口还在用）不受影响。

## 后续（未做）

1. 隐藏会话删除：`modelRun` 的硬删除在回复之后再做，或把 projected removal 的剩余全表成本去掉（#611 残留）。省 1.3–1.95 s/次，并去掉每次 infer 对 Gateway 主线程的阻塞。
2. simple completion 只加载所选 provider 的插件：约 0.7 s。
3. 11:25 那次 29.9 s 的 `replaceTranscriptEvents` 同步重写：找出是哪个会话、为什么整段重写。
