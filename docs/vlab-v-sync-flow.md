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

## 1. 实验放在哪，要用共享数据怎么办

**共享 VLab 不是实验场，是上线前的最后一站。** 默认：

- 在自己的 worktree 和分支里开发；
- 用 `vlab.mjs candidate` 测。它已经是"共享数据"：用 VLab 的配置快照和选定 SQLite 备份，在一次性目录里跑 worktree 的代码，不写共享运行时，不需要 lease。

candidate 做不到的，是**一个常驻、能被真人或真实渠道访问的 Gateway**：飞书群里发消息、手机打开小何 H5 说话、Control UI 长连接。这类测试以前只能 deploy 到共享 VLab，测完没有任何东西逼它上线或撤回，于是一层层叠上去，这就是 VLab 和 V 分叉的来源（第 2 节）。

现在的规则：这类测试**可以**用共享 VLab，但它占用的就是第 0 节里唯一的那个 R 槽位：

1. 从 ALIGNED 出发 stage + deploy（工具强制，见第 4 节）；
2. 测；
3. 只有两个出口：**上线 V**（然后 `vlab.mjs align`），或 **`vlab.mjs rollback`**。
   在走出其中一个出口之前，**任何人都 stage 不了下一个版本**。

也就是说，实验可以上共享 VLab，但不能"挂"在上面。共享 VLab 被占着的时间，就是别人排队的时间，所以测完尽快出口。

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

### 2.4 飞书密钥卡片、小何 RTC：到底哪些上了 V

对 9/14 以来 VLab 的每个发版逐文件判定（V 上的字节 = 发版之后的字节 → 已上；= 发版之前 → 没上；都不是 → V 上是另一个版本）：

| 线 | 已上 V | 没上 V | V 是另一个版本 |
| --- | --- | --- | --- |
| 飞书密钥卡片（`feishu-secret-entry*`） | core 6 个文件全部；`fe0a753`（从规范会话路由密钥卡片）的逻辑也已在 V 的飞书插件里 | — | 飞书插件 `monitor.account-*.js`：V 在自己的"过程可见"血脉上打了同样的补丁，字节不同 |
| 小何 RTC provider / managed-room | `volcengine-rtc-agent-provider.mjs`、`volcengine-rtc-managed-room-client.js`、RTC SDK | — | — |
| 小何 H5 页面 | `/opt/openclaw-voice-h5/releases/6505198…`，业务文件与 VLab 逐字节一致 | — | — |
| 小何页面层（Control UI 内） | — | `…-rtc-v5.js`（9/21 音频缓存修复） | `talk-*.js`（V 带 9/22 owner-terminal 手工补丁）、`realtime-session-harness`、`control-ui-*`、`boot-chat`、`asset-manifest` |
| 更早的语音修复（9/16–17） | — | `talk-playback-buffer`、seeduplex 整条线（V 上没有 `seeduplex-realtime-provider.mjs`） | `talk-voice-overflow` 等 |

`~/vlab-dev` 上那 2 个只在本机的飞书提交（`fe0a753`、`5e1b7eb`）已推上 origin/dev（`7813f57`）。

## 3. 第 1 步：以 V 重建 VLab

`vlab.mjs stage` 只会替换文件、不会删文件，所以对齐用专门的工具：

```bash
node scripts/vlab-rebase-to-v.mjs --owner <lease-owner>            # 只看计划
node scripts/vlab-rebase-to-v.mjs --owner <lease-owner> --apply    # 执行
node scripts/vlab-rebase-to-v.mjs --owner <lease-owner> --undo <VLab 上的目录>
```

它比较 core `dist`、worker 插件、飞书插件三对目录：不同的文件装 V 的字节，VLab 独有的文件和残留备份移走。所有被替换、被移走的文件都进 `shared-workflow/tmp/rebase-to-v-<ts>/backup/`，附 `undo.json`，可以一键撤销。之后：

```bash
node lab/vlab.mjs baseline --id <新基线> --owner <o> --sourceCommit <dev 提交> --replaceCurrent true
node lab/vlab.mjs align --owner <o>
```

`baseline` 把当前运行时登记为新基线，旧的 `current.json` 作为 receipt 留档。`align` 在本机跑 parity，只有 `ALIGNED` 才会在服务器上记下"VLab = V"。

**配置**：之前说"配置键路径 V 512 条、VLab 136 条"是比错了文件。VLab 实际加载的是 `state/shared-vlab-20260909-v3/openclaw.json`。按正确文件比，差异集中在通道、凭据、浏览器 profile、模型 provider，这些按 AGENTS.md 本来就要分开。代码对齐会不会让配置失效，逐项查过：worker 的 `openclaw.plugin.json` 两边一致；core 里不同的文件都不是配置 schema；飞书的 schema V 是 VLab 的超集（只多一个 `visibleProgressRuntimes`）。

## 4. 机器怎么强制

- **服务器端**（`lab/shared/server.mjs`）：`current.json` 带一个 `v.aligned` 标志。
  - `stage` 要求 `v.aligned === true`，否则拒绝，并提示"先上线 V 再 align，或者 rollback"。
  - 每次 `deploy` 把标志清成 `{aligned:false, aheadBy:<id>, since:<时间>}`；`rollback` 恢复父版本的标志。
  - `align` 只接受本机 parity 跑出来的 `ALIGNED`，并且校验运行时指纹没变过。
- **本机**（`lab/vlab.mjs align`）：parity 要 SSH 到 V 和 VLab 两台机器，所以只能从本机跑，VLab 自己不应该能连 V。
- **V 侧**：`v-release-drift.timer` 每小时比对 V 的字节和期望值，任何不经发版流程的改动 1 小时内在飞书告警。上线 V 之后要重新 capture，并用 `install-v-release-drift.sh` 更新期望值。

一次上线的完整命令顺序：

```
vlab.mjs stage → deploy → (测) → accept
→ 把同一份文件装到 V（R 的 plan 里 before 就是 V 的字节）
→ capture-production-runtime.mjs（core / worker / 飞书）+ install-v-release-drift.sh
→ vlab.mjs align                         # parity 必须 ALIGNED，否则说明 V 装的不是同一份
```

不上线，就 `vlab.mjs rollback`：回到父版本，标志随之恢复为 aligned。

## 5. 工具

```bash
node scripts/vlab-v-parity.mjs                      # ALIGNED / AHEAD / DIVERGED
node scripts/vlab-v-parity.mjs --pending plan.json  # 允许的差异 = 这个 plan
node scripts/vlab-rebase-to-v.mjs --owner <o> [--apply | --undo <dir>]
node lab/vlab.mjs align --owner <o>
```

V 的运行时路径从 `systemctl show openclaw-gateway -p ExecStart` 自动取（drop-in 层层覆盖，unit 文件本身不可信）。V 的飞书插件在 `/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu`，VLab 的在 npm project 里。两边都只读，V 上以 nice 19 / idle IO 运行。
