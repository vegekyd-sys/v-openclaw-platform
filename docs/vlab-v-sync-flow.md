# VLab ↔ V 同步流程：共享 VLab 只有两种合法状态

状态：提案（第 1 步已可执行）
起草：2026-09-24 04:0x CST
前置：PR #44 已合入 dev（`9c559c7`），生产 V 的运行时字节已在 `release/captured/v2026.9.1-db91.6/`。

---

## 0. 规则

共享 VLab 在任何时刻只能处于下面两种状态之一：

| 状态 | 含义 | `scripts/vlab-v-parity.mjs` 输出 |
| --- | --- | --- |
| **ALIGNED** | VLab 与 V 逐字节一致 | `ALIGNED`，exit 0 |
| **AHEAD(R)** | VLab = V + 下一个要上线的发版 R，且只有 R | `AHEAD`（带 `--pending <R 的 plan>`），exit 0 |

其他任何状态都是 **DIVERGED**（exit 1）。此时在 VLab 上测出的任何结论，都不能说明 V 会怎样。

一轮发版的顺序：

```
        ┌──────────── 拒绝：vlab.mjs rollback ───────────┐
        ▼                                               │
   ALIGNED ── stage R 到 VLab ──▶ AHEAD(R) ── 验收 ──▶ 同一份 R 字节上 V
     ▲                                                     │
     └──── capture V + 更新漂移期望 + parity=ALIGNED ◀─────┘
```

1. **对齐**：从 ALIGNED 出发。不是 ALIGNED，就先修到 ALIGNED，不能叠新东西。
2. **更新 VLab**：R 必须基于 V 当前字节构建（plan 里的 `before` = V 上的 sha）。stage、deploy、accept 之后，parity 应为 `AHEAD --pending R`。
3. **更新 V**：把**同一份** R 的字节部署到 V，不在 V 上重新拼一份。
4. **回到对齐**：重跑 `capture-production-runtime.mjs`，并用 `install-v-release-drift.sh` 更新 V 上漂移哨兵的期望值。之后 parity 必须回到 `ALIGNED`，这一轮才算结束。

同一时刻只允许一个 R。多个改动要一起上，就合成一个 R，一起验收。

## 1. 实验放在哪

**共享 VLab 不是实验场，是上线前的最后一站。** 实验一律：

- 在自己的 worktree 和分支里开发；
- 用 `vlab.mjs candidate` 在一次性的服务器目录里测（私有快照，不写共享运行时）；
- 只有决定"要上线"时，才打成 R 走第 0 节的流程。

过去共享 VLab 分叉，几乎全是因为实验直接 deploy 到了共享实例，之后没有撤掉（见第 2 节）。

## 2. 2026-09-24 实测：VLab 和 V 差在哪

`node scripts/vlab-v-parity.mjs`（04:0x CST）：**DIVERGED**。比较 9549 个文件，其中字节不同 28 个、只在 VLab 上有 19 个；另有残留备份文件 V 上 24 个、VLab 上 48 个。

每个文件的来源来自 VLab 的 `releases/*/manifest.json` 和 `receipts/`：找出哪个 release 写入了 VLab 当前的字节，再看它的 accept 证据。

### 2.1 建议合入线上（下一轮 R 的候选）

这几条的 plan `before` 恰好等于 **V 当前字节**，可以直接叠加在 V 上，不需要按线上字节重建。

| release | 文件 | 证据 | 建议 |
| --- | --- | --- | --- |
| `agent-db-lease-lifetime-v1`（9/16） | `agent-db-process-coordinator.mjs` | 修复正确性缺陷：租约释放后，回调仍继承 AsyncLocalStorage，被当成"持有租约"，从而跳过跨进程写入准入。3 个新回归在修复前失败、修复后通过；45 并发 p99 608→605ms，在噪声内；真实模型 + exec 验收通过 | **推荐** |
| `ws-heartbeat-backport-91-v1`（9/21） | `websocket-keepalive-*.js`、`server-ws-runtime-*.js` | 上游 PR 145191 的选择性回迁。candidate 2/2；Control UI 连接 >120s 没有心跳超时。V 的语音断连根因是事件循环停顿（停顿期间心跳会超时），两者直接相关 | **推荐** |
| `talk-voice-event-loop-v1` 中的 2 个文件（9/16） | `plugin-state-store-*.js`、`dreaming-state-*.js` | 事件循环修复，在 166MB 真实 `openclaw.sqlite` 副本上 10/10 通过，无关行逐字节不变 | **先量再定**：dreaming 已在 9/20 关掉，`dreaming-state` 的收益大幅下降；`plugin-state-store` 要先在 V 上证明它确实是停顿来源 |

### 2.2 实验：应该撤回到 worktree

| 实验线 | VLab 上的文件 | 为什么不上线 |
| --- | --- | --- |
| worker 冷启动 / readiness（9/11–12，`worker-coldstart-longterm`、`worker-command-readiness`、`worker-session-readiness`） | `agent-command-*` ×2、`chat-send-handler-*`、`session-diff-baseline-*`、`db91-integrity-bootstrap.mjs`、`cold-config-singleflight.mjs`、`gateway-dispatch-phase-observer.mjs`、`gateway-module-resolution-cache.mjs`、`native-module-resolution-cache.mjs`；worker 侧的 `runtime-prewarm.mjs`、`worker-runtime-lifecycle.mjs`、`native-module-resolution-cache.mjs` | receipt 只有 "Gateway readiness only"，**从来没有 accept**。V 后来走了 db91 + worker-memory-recycle 另一条路 |
| 离线程会话维护（9/12，`offthread-session-maintenance` v1–v11） | `automatic-session-maintenance*.mjs`、`automatic-maintenance-quiet-window.mjs` | 11 次迭代，**没有一次 accept** |
| `db91-lock-rootcause-v2`（9/14） | `session-accessor.sqlite-entry-*.js` | 没有 accept；V 上的 db91.2→db91.6 已经走了另一条路径 |
| `session-store-hotpaths-v1`（9/18） | `session-accessor-*.js`、`dreaming-session-cleanup-*.js` | 验收人自己的结论："correct but small … NOT promoted to production" |
| 诊断工具（9/10） | `gateway-concurrency-profiler.mjs`、`concurrency-cpu-memory-profiler.mjs`；worker 侧的 `db91-hi-trace.mjs`、`db91-hi-deep.mjs` | 排障工具，需要时在 candidate 里挂 |
| 小何 / 火山 RTC 语音（9/16–22） | `talk-DkFuKRod.js`、`realtime-session-harness-*.js`、`control-ui-*.js`、`control-ui-boot-*`、`asset-manifest.json`、`…-rtc-v5.js`；worker 侧的 `seeduplex-realtime-provider.mjs` | 功能还在开发中，"Audio/microphone UX remains separate user acceptance"。**而且血脉已经分叉**：V 的 `talk-DkFuKRod.js` 带着 9/22 的 owner-terminal 手工补丁，VLab 没有；VLab 有 rtc v4/v5，V 没有。上线前必须以 V 的字节为底重建 |
| worker harness 模型路由 | worker 侧的 `worker-harness-model-routing.mjs`、`index.mjs`（0.2.12-rc.1，V 上是 0.2.11） | **待确认**：`/vcodex`、`/vcc`、`/vds` 在 V 上已经可用，要先查 V 是用什么方式实现的，再决定 |

### 2.3 VLab 自己的旧字节（不是实验，直接对齐）

`agent-runner-memory-*`、`agent-runner.runtime-*`、`model-fallback-attempt-*`、`openclaw-agent-db-readonly-*`、`session-entry-persistence-*`、`parity-slow-sync.mjs`、`readonly-initialization-cache.mjs`：这些是 9/10 基线 `shared-20260910-base` 的原始字节，V 之后已经往前走了。对齐到 V 即可。

## 3. 第 1 步怎么做：以 V 重建 VLab 基线

`vlab.mjs stage` 只会替换文件，不会删除文件，所以不能用一个"反向补丁"把 19 个多余模块撤掉。做法是给共享实例换基线：

1. **补齐捕获范围**：PR #44 只捕获了 core `dist`。V 的 worker 插件目录（`…/db91.6/worker`，0.2.11）也要进 `release/captured/`，否则"本地代码 = V"只成立一半。
2. **打新基线**：以 V 的 `core` + `worker` 字节为 VLab 的新基线（例如 `shared-20260924-v-db91.6`），通过服务端 `baseline` 命令切换。状态目录和对话保持不动。
3. **配置**：配置层差异很大（按键路径算，V 有 512 条、VLab 有 136 条）。VLab 的配置里如果引用了 2.2 节里被撤掉的 provider（例如 `talk.realtime` 指向 volcengine-rtc），切基线会 `78/CONFIG` 起不来。必须先用 `config set --dry-run` 逐项验证再切。凭据、通道、端口、状态路径按 AGENTS.md 保持分开。
4. **验收**：parity = `ALIGNED`；Gateway RPC、真实模型 + 工具执行、可见回复都要过；另外确认 `nightshift-vlab-production-mirror` 已被重新拉起（它 `Requires=` Gateway）。
5. **通知在用的线**：小何 RTC、飞书密钥卡片等线正在共享 VLab 上验收。切基线之前先看 integration lease 的持有人，并提前告知对方改用 candidate。

## 4. 让规则由机器执行（后续）

- `vlab.mjs stage` 前置检查：parity 必须是 `ALIGNED`，或者是 `AHEAD` 且 pending 的正是本次 plan，否则拒绝 stage。
- VLab 也装一份漂移定时器，发现 DIVERGED 就告警。V 上已有 `v-release-drift.timer`。
- 发版 PR（dev → main）必须附上 parity 输出。

## 5. 工具

```bash
# 两种状态的判定（对两台机器只读；在 V 上以 nice 19 / idle IO 运行）
node scripts/vlab-v-parity.mjs
node scripts/vlab-v-parity.mjs --pending /abs/path/plan.json
node scripts/vlab-v-parity.mjs --json
```

V 的运行时路径从 `systemctl show openclaw-gateway -p ExecStart` 自动取（drop-in 层层覆盖，unit 文件本身不可信）。VLab 路径默认是 `db91-parity/runtime`。
