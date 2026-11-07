# 工具跑完后 DeepSeek 一直 5xx：交给 luna 从转录续写（2026-11-07）

## 1. 现场（V，2026-11-07 15:00–15:54 CST，DeepSeek Flash 大面积 500/503）

按 runId 复盘 journal（`[vlab-worker:N]` 前缀 + Gateway 决策行）：

- **没跑过工具的回合**都走到了 luna（#375 + #543 的路径），约 50 s 后答完，6 轮 `candidate_succeeded`。
- **跑过工具的回合**全部失败，用户收到「⚠️ 模型服务暂时不可用……这一轮没能完成」，等了 89–128 s。15:09–15:31 有 5 轮（a209d427、8919ccbd、05d97bd1、6220971b、d3464973），全是飞书私聊/群。
  - 例：a209d427 先跑了 2 个 exec（转录 seq 23882–23884 已落库），之后 DeepSeek 连续 6 次：500、500、500、200 后断流、500、500。
  - 用户回「继续喔」，下一轮又是同样的失败卡片。
- 这就是 #543 记录第 6 节留下的 **C 类**。9.1 和上游都只在同一模型上续写有副作用的回合，理由是：回退候选会重发用户请求，可能把工具再执行一遍。上游 main（11/07）至今仍写着 "Side effects still forbid replaying the original prompt or switching models"。

## 2. 思路

换模型本身不危险，危险的是**重发用户请求**。9.1 已有一个不重发的续写方式：工具落定后上下文溢出或传输中断时，用内部提示 `MID_TURN_PRECHECK_CONTINUATION_PROMPT`（"Continue from the current transcript after the latest tool result…"）接着已落库的工具结果往下走。这个提示只发给模型，不写进转录。

本补丁让回退候选也以这种方式启动：luna 拿到的输入 = 已有转录（含工具调用和结果）+ 续写提示。用户请求不再重发，工具也不会重跑。

## 3. 改动（`pi-settled-tool-handoff-v1`，6 个文件，before 均为 V 当前字节）

| 文件 | 进程 | 改动 |
|---|---|---|
| `openclaw/dist/embedded-agent-DaSvA-Yk.js` | Gateway + Worker | attempt-recovery：(a) 工具落定后静默 5xx/overloaded/429，有待用的回退候选时（`isFinalFallbackAttempt === false`），每个 runId 先同模型续写 1 次，再失败就抛带 `vSettledContinuation` 的 FailoverError。计数按 runId（V 上同一回合打出两次 "attempt=1/3"，说明 Worker 会重入 run，in-run 计数被清零）。Gateway 经 Worker 时 Worker 内部已续写过一次，所以 Gateway 首次检测即交接。(a2) 同模型续写那一轮自己没有工具调用，看不到「工具已落定」的证据；它再静默失败时也交接。(b) Gateway 收到 Worker 标记过的失败，抛给回退链，不再按 incomplete turn 出失败卡。session prompt state：(c) 被标记为续写的 run 以内部续写提示启动。 |
| `openclaw/dist/model-fallback-runner-DOsPfj4O.js` | Gateway | (d) 候选因交接失败时，把 runId 标给下一个候选；跳过 `canFallbackAfterError`（它只防重放；已显示的文字保留，luna 接在后面）。 |
| `production-worker/worker.mjs` | Worker | (e) 回应错误时，如果本 run 记录了交接，附带 `vSettledContinuation`。 |
| `production-worker/worker-pool.mjs` | Gateway | 跨 IPC 保留这个标记。 |
| `production-worker/index.mjs` | Gateway | 把标记交给 `buildHarnessFailureAttempt`。带标记的失败一律不算 replay-safe（#375 的转录读取曾把带 2 个 exec 的回合判成 replaySafe=true，见 V 15:12:02 那行；当时 Gateway 自己的副作用跟踪把它压了回去，但交接绝不能走重放路径）。 |
| `production-worker/harness-failure.mjs` | Gateway | 在 attempt 上带 `vSettledContinuation`。 |

**不变的部分**：没有待用回退（用户手选模型、已是最后一个候选），仍是今天的同模型续写最多 3 次。没有工具的失败仍走 #375/#543。正常路径不经过任何新代码。

登记表放在进程全局（`Symbol.for("openclaw.v.settledToolHandoff")`），条目 30 分钟过期。

源码：`vegekyd-sys/openclaw-versa` 分支 `versa/port-settled-tool-handoff-20261107` @ `ae4f55a1e7e`（基于 `versa/port-backlog-20261029` 头 `b61c13eb1a3`）。
- 新增 `src/agents/settled-tool-handoff.ts`，并改 attempt-recovery / session-prompt-state / model-fallback-runner。
- 新单测 15 条：登记表 8 条 + attempt-recovery 交接 7 条。撤掉源码改动后，其中 4 条交接用例失败。
- 相关老测试 191 + 10 + 25 条全过。
- `tsconfig.core` 类型检查只剩 1 个既有错误（`native-hook-relay-client-store.ts`，backlog 头就有）。
- Worker 的 4 个文件是平台代码，在 source map 里记 `platform:lab/patch-settled-tool-handoff.mjs`。

## 4. candidate（`lab/candidate/settled-tool-handoff.mjs`，candidate-313c90ad，A=V 字节，B=补丁，同一轮）

替身配置：
- 本地 DeepSeek 替身：每轮第一次请求让模型调一次 `exec`（往计数文件追加一行，并回显标记）。
- luna 替身：`/v1/responses`，记录收到的输入。
- 模型和回退配置照 V：`deepseek-flash` 走 vlab-worker，回退 `[luna]`。
- 两个入口：chat（`chat.send`，飞书走的 Gateway 回复管线）和 cli（`openclaw agent`，agentCommand，夜班和 cron 走这条）。

| 场景 | A（V 现状） | B（补丁） |
|---|---|---|
| chat：工具后一直 500 | ❌ 失败卡片，工具后 DeepSeek 5 次，11.1 s | ✅ luna 答完，工具后 DeepSeek 2 次，9.0 s |
| cli：工具后一直 500 | ❌ 失败，DeepSeek 2 次 | ✅ luna 答完，DeepSeek 2 次 |
| chat：工具后 500 一次，然后正常 | DeepSeek 答（500/200） | 相同，luna 0 次（不会因为一次抖动就切走） |
| chat：用户 `/model deepseek-v4-pro`（手选），一直 500 | 失败，DeepSeek 7 次 | 相同（按设计不回退） |
| 正常路径首字中位数（6 次，chat.send→首个 DeepSeek 请求 / 完成） | 937 / 1392 ms | 595 / 764 ms |

正常路径差异来自 VLab 负载噪声，补丁代码不在这条路径上。

所有场景都断言了以下几点：
- 工具恰好执行 1 次；
- 用户请求在转录里的份数与 A 相同（chat 1 份；cli 2 份，A 臂也是 2 份，是 agentCommand 经 Worker 的既有行为，另记）；
- 续写提示没有写进转录。

B 的 tool500 还断言了：
- luna 的输入含续写提示；
- 能看到工具输出；
- 用户请求份数 = 转录份数（没有额外重发）；
- 日志出现交接决策。

验收三条：
- **故障路径确实触发**：A 臂完整复现了 V 的现场，包括两次 "attempt=1/3"、`rotate_profile`、`surface_error` 和 `replaySafe=true` 误判。
- **功能正向成立**：B 臂由 luna 答完，工具只执行一次。
- **撤掉修复会红**：A 臂本身就是撤掉修复的对照；fork 侧另有变异检验。

证据：`docs/evidence/settled-tool-handoff-20261107/candidate-313c90ad.json`；receipt 在 worktree 的 `tmp/candidate/`。中间几轮（a/c 两条路径逐步补齐）见 PR 描述。

## 5. 没覆盖 / 已知限制

- **luna 用的是替身**（`openai-responses` API），不是 V 上真实的 ChatGPT 订阅路线（`openai-chatgpt-responses` + OAuth）。candidate 不能带真实 OAuth（会刷新共享令牌）。真实账号只能在共享 VLab 验：需要 lease 并临时让 DeepSeek 失败（例如把 deepseek baseUrl 指到一个回 500 的替身）。建议合 dev 后在共享 VLab 验收时做。
- **真实飞书投递**没测。工具后交接时，卡片上已有工具状态行，luna 的回答接在同一回合后面。`canFallbackAfterError` 被跳过，所以已经显示的工具前说明会保留。
- **工具后 DeepSeek 挂起（idle timeout）** 不在本补丁范围。上游 #147203 的 `canContinueSettledIdleTimeout` 是同一个续写插槽，可以下一步做。
- **settled-turn finalization**（工具后追问那一轮）遇到 503 时，仍会发英文兜底句 "The tool run finished, but no final summary was produced"。V 上 11/03 出现 16 次，11/07 出现 2 次。另列。
- 交接后会话处在 luna 上，大会话可能触发压缩（与 #543 相同）。

## 6. 上线

需要重启 Gateway（Gateway 进程里的 dist + Worker 插件的 Gateway 侧文件），Worker 进程随之换代。只请求合入 dev 和共享 VLab 验收，上 V 另批。
