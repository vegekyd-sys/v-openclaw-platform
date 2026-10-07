# VLab ↔ V 同步流程：共享 VLab 只有两种合法状态

状态：已执行（2026-09-24 12:0x CST），见下方"当前状态"
起草：2026-09-24 04:0x CST
前置：PR #44 已合入 dev（`9c559c7`），生产 V 的运行时字节已在 `release/captured/v2026.9.1-db91.6/`。

## 当前状态（2026-09-24 12:0x CST）

- 共享 VLab = **V + R1**，parity `AHEAD --pending db91-preflight-timeout-env`：比了 9581 个文件，唯一的差异就是 R1；VLab 残留备份 0 个。
- 新基线 `v-db91-6-plus-preflight-env-20260924`（dev `a73ea17`），旧 `current.json` 已作为 receipt 留档。
- 服务器门禁已生效：`align` 因为 R1 被拒；探针 `stage` 被拒，也没留下任何目录。**在 R1 上 V 或者从 VLab 撤掉之前，谁都 stage 不了。**
- 功能验收：真实模型 → exec 工具 → 结果写回会话库并读回（`agent:makaron:explicit:vlab-dev-rebase-to-v-accept-1790222390980`）。

**R1 = `db91-preflight-timeout-env`**：V 版 `db91-integrity-bootstrap.mjs` 的启动前库校验时限写死 5 分钟。VLab 机器更慢，makaron 库 7.1G，实测要 512 秒，所以 V 的原字节在 VLab 上根本起不来（两次超时）。R1 让时限可以由 `OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS` 设置，默认值仍是 300000。VLab 用 drop-in `99-db91-preflight-timeout.conf` 设成 900000。**R1 装到 V 上，行为不变**（V 不设这个变量）。上 V 之后 parity 回到 ALIGNED，再 `vlab.mjs align`。

**这次踩的坑**（工具已修）：
1. 残留判定规则按单词 `.before-` 匹配，把 OpenClaw 自己的 `agent-tools.before-tool-call-*.js` 当成残留移走了，Gateway 报 ENOENT 起不来。已从备份恢复（字节与 V 一致），规则改成按形状判定，并加了测试（`scripts/lib/runtime-residue.mjs`）。
2. 重建工具在 Gateway 起不来时直接退出，把 VLab 留在宕机状态。现在会自动撤销恢复。
3. `nightshift-vlab-production-mirror` 从 9/23 07:43 起就是停止状态，在这次操作之前，不是这次带停的，没有去动它。

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
node scripts/promote-to-v.mjs --release <VLab release> --name <V 发版名> [--owner <o> --apply]   # VLab → V
node scripts/sync-vlab-from-v.mjs --name <V 发版名> --owner <o> [--apply]                       # V → VLab
node scripts/clean-v-residue.mjs [--apply | --undo <dir>]                                          # V 上的 .bak 残留
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

```bash
node lab/vlab.mjs stage / deploy / accept ...                      # VLab 上验收
node scripts/promote-to-v.mjs --release <VLab release> --name <V 发版名>     # 先看计划
node scripts/promote-to-v.mjs --release <VLab release> --name <V 发版名> --owner <o> --apply
# → 装同一份字节到 V（先备份，写 undo.json）→ 捕获组件表里每个组件（core/worker/飞书/钉钉/企微）→ 更新哨兵 → vlab.mjs align
git add release/captured/<V 发版名>*；node scripts/release-notes.mjs --from <上一版> --to <V 发版名> 生成 CHANGELOG.md 一节并写摘要；提交 PR；dev → main 发版 PR，打 tag <V 发版名>
```

`promote-to-v.mjs` 不重启 V：dist 文件在下次 Gateway 启动时才生效，什么时候重启由人决定。V 上的文件不是这个版本的"改动前"字节时，它拒绝执行；需要撤销用 `--undo <V 上的备份目录>`。

不上线，就 `vlab.mjs rollback`：回到父版本，标志随之恢复为 aligned。

## 4.5 反方向：V 自己改了自己

第 0 节的闭环只管"VLab 先改，再上 V"。V 也会自己变：

- 有人在 V 上直接热修（2026-09-25 04:01 的 GPT-6 回迁就是这样）；
- V 自己的 agent 通过 exec 工具改了自己的运行时。

两种情况都一样处理。**先被发现**：漂移哨兵每小时比对组件表里每个被捕获的目录（core / worker / 飞书，钉钉、企微从它们第一次被捕获起）；清单里没声明的文件也必须等于原版（`release/captured/base/`），否则告警。告警到飞书，不经过 Gateway。**然后二选一**：

| 决定 | 做什么 |
| --- | --- |
| **保留** | 1. `capture-production-runtime.mjs` 捕获 V（core 以 `npm:openclaw@2026.9.1` 为基准，加 worker、飞书），提交并开 PR 合入 dev，把改动来源的提交也一起带进来。<br>2. `install-v-release-drift.sh` 用新清单更新哨兵。<br>3. `node scripts/sync-vlab-from-v.mjs --name <新发版> --owner <o> --apply`：从 dev 里的捕获取字节（必须等于 V 的线上字节），走正常的 package → stage → deploy，parity 必须是 ALIGNED 才会 accept，然后 align。VLab 因此留有发版记录，也可以回滚。<br>4. 开 dev → main 发版 PR，打 tag。 |
| **不保留** | 把 V 恢复回去：`promote-to-v.mjs --undo <备份目录>`，或者热改自己留下的备份；然后确认哨兵回到 0。 |

`sync-vlab-from-v.mjs` 故意不处理两种情况：只存在于 VLab 的文件（stage 不能删文件），以及 V 上等于原版、因而不在捕获里的文件。这两种都说明 VLab 带着 V 没有的东西，应该用 `vlab-rebase-to-v.mjs`。

**热修本身是允许的**，线上出事时先止血。但当天必须把它走完上面"保留"那一行，否则第二天它就会变成下一个没人知道来源的补丁。

**范围**：这里管的是代码（三个运行时目录）。V 的配置、skills、workspace、会话数据本来就和 VLab 分开，不在 parity 范围内。例如 2026-09-25 21:56，V 的 `secrets.egressProxy` 配置变更触发了一次自动重启，这不属于代码漂移。

**配置开关（advisory，2026-10-06 起）**：配置不决定 parity 状态，但 parity 会比一小组影响行为的开关，在输出里单列为 `advisory, does not decide the state: config-differs`，退出码不变。比的是两边 Gateway 主配置和 Worker 配置（`plugins.entries.vlab-agent-worker-isolation.config.workerConfigPath`）里：`mcp.servers.<名>.enabled` 和 `plugins.entries.<id>.enabled`，包括哪些名字只在一边有；`enabled` 没写算开。只取名字和布尔值，env、命令参数、URL、token 一概不取不打（`scripts/lib/parity-config.mjs`）。起因：VLab 两份配置里 `voice-memory` MCP 开着，V 上 figma / universal-memory / voice-memory 全关，VLab 每个 Worker 回合多付约 1 秒 MCP 连接，首字测量因此偏慢，而 parity 照样是 ALIGNED。看到这类差异时，测量结论要带上它，或者先把 VLab 的开关对齐到 V。

## 4.6 组件：渠道插件与旁路服务（2026-10-05）

parity、promote、捕获、sync、release-notes、静态检查都只认一张表：`scripts/lib/runtime-components.mjs`。加一个组件 = 表里加一项 + 它的第一次捕获，不再到五个脚本里各写一份路径。

| 组件 | 类型 | V 上 | VLab 上 | stage 目标前缀 | 捕获后缀 |
|---|---|---|---|---|---|
| core | runtime | ExecStart 的 core | `runtime/openclaw` | `openclaw/` | （无） |
| worker | runtime | core 旁的 `worker` | `runtime/production-worker` | `production-worker/` | `.worker` |
| feishu | runtime | `/opt/openclaw-experiments/…/feishu` | `runtime/npm/projects/openclaw-feishu-*` | `npm/projects/openclaw-feishu-*/…/@openclaw/feishu/` | `.feishu` |
| codex | runtime（只上线，不比对、不捕获） | 同名 npm project | — | `npm/projects/openclaw-codex-*/…` | — |
| dingtalk | runtime | `~/.openclaw/npm/projects/dingtalk-real-ai-dingtalk-connector-*`（glob，后缀随重装变） | VLab 配置 `plugins.load.paths` 里那一项 | `npm/projects/dingtalk-real-ai-dingtalk-connector-*/…/@dingtalk-real-ai/dingtalk-connector/` | `.dingtalk` |
| wecom | runtime | `~/.openclaw/extensions/wecom-openclaw-plugin` | 同上 | `extensions/wecom-openclaw-plugin/` | `.wecom` |
| handoff | sidecar | `/opt/v-desktop-handoff/{plugin,service,desktop}` | `/opt/vlab-v-desktop-handoff/…` | 不能 stage | 不捕获 |
| secret-entry | sidecar | `/opt/v-secret-entry` | `/opt/vlab-v-secret-entry` | 不能 stage | 不捕获 |
| v-browser-plugin | sidecar | 主配置 `plugins.load.paths` 里的 `/opt/v-browser/releases/<版本>/openclaw-plugin` | VLab 主配置里同样形状的那一项 | 不能 stage | 不捕获 |
| v-browser-broker | sidecar | `v-browser-broker.service` 的 ExecStart 所在 `broker/` | 同名 unit 的 `broker/`（不含 `tests/`） | 不能 stage | 不捕获 |
| v-browser-gateway | sidecar | `openclaw-vlab-browser.service` 的 ExecStart 所在 `dist/` | 同名 unit 的 `dist/` | 不能 stage | 不捕获 |

- **runtime 组件**走第 4 节的发版流程：VLab stage/deploy/rollback，`promote-to-v.mjs` 把同一份字节装到 V，捕获成 `<发版名><后缀>`，哨兵按清单盯。V 上的企微插件同时有一个没在用的旧 npm project（2026.5.7），所以企微按扩展目录认，不按 glob。
- **sidecar** 由各自的安装脚本从某个提交装（`install-desktop-host.sh`、`install-secret-entry-host.sh`），提交就是记录，所以不捕获、哨兵不盯；parity 照样逐字节比，所以 ALIGNED 也意味着两边旁路服务是同一份字节。两边都没装 = 相等。
- V Browser 三块（2026-10-06 纳入）的位置不固定，parity 按两边**实际在跑的**找：插件看 Gateway 主配置的 `plugins.load.paths`（Worker 那份配置加载的若不同，打一条 note，只比主配置那份）；Broker 和 Browser Gateway 看各自 unit 的 ExecStart（drop-in 叠加后的结果）。两边解释器不同也会打 note（Broker：V 是 node 22，VLab 是 node 24）。产品代码在 `vegekyd-sys/v-browser`，安装方式见 `docs/v-browser-0.4.7-release-20261001.md`。
- 表里 `blocking: false` 的组件只报告（"advisory"），不决定状态。接管服务现在是这样：V 从更新的提交装过（多 `service/build-viewer.mjs`、`service/vendor/novnc-1.3.0`，46 个文件），VLab 落后。多渠道发版在 VLab 上按 V 的提交重装之后，改成 `blocking: true`。2026-10-06 18:49 V 上又热装了一版（新增 `service/lib/capture.mjs`，24/27 个文件同 `claude/handoff-mac-screenshot`，其余未提交），V Browser 也在同一分钟热修（插件 `0.4.7-wake-lease-20261006`、Browser Gateway 的 `relay-server`）。这四个 sidecar 都先保持 advisory：等这些热修合入各自仓库、VLab 按同一提交重装后再改 `blocking: true`，否则 parity 立刻 DIVERGED，挡住所有人的 align。
- 一个发版带了旁路服务时，在 `--pending` 的 plan 里写 `"sidecars": ["secret-entry"]`，parity 把这些差异算作 pending（AHEAD）。上 V 时**先在 V 上装旁路服务，再跑 `promote-to-v.mjs --apply`**；顺序反了，末尾的 align 会拒绝，脚本会指出是哪个旁路服务没装，而不会建议 `sync-vlab-from-v`（sync 也会拒绝旁路服务差异）。
- `release-notes.mjs`：上一版没有某个组件的捕获（钉钉、企微在 10/05 之前的发版里都没有）时，写成"首次纳入存档"，不逐个列文件。

**一次性准备**：10/05 之前 VLab 从 `capability-alignment-20260911/plugin-sources/…`（runtime/ 外面、9/11 的 V 副本）加载钉钉和企微，stage 碰不到。`scripts/vlab-channel-plugins-prep.mjs` 把它们按 V 的目录名搬进 runtime/（同一文件系统 rename，不复制），有差异的文件换成 V 的字节（V 上只读），改两份配置里的 `plugins.load.paths`，受控重启一次；默认只看计划，`--apply` 要 lease、VLab 已 align、Worker 空闲，`--undo` 原样撤销。之后按它打印的命令 `vlab.mjs baseline` → parity → `vlab.mjs align`。在那之前 parity 照样比对这两个插件（按 VLab 实际加载的目录），只多一条提示。10/05 实测两边逐字节相同，parity ALIGNED（10047 个文件）。

**VLab 上 server 工具的副本**（`labs/shared-workflow/tool/`）没有安装器：`lab/shared/files.mjs` 新增的 `extensions/` 目标前缀要手工更新过去，第一次 stage 企微文件之前做。

## 5. 工具

```bash
node scripts/vlab-v-parity.mjs                      # ALIGNED / AHEAD / DIVERGED
node scripts/vlab-v-parity.mjs --pending plan.json  # 允许的差异 = 这个 plan
node scripts/vlab-rebase-to-v.mjs --owner <o> [--apply | --undo <dir>]
node lab/vlab.mjs align --owner <o>
```

V 的运行时路径从 `systemctl show openclaw-gateway -p ExecStart` 自动取（drop-in 层层覆盖，unit 文件本身不可信）。其余目录见第 4.6 节的组件表。两边都只读，V 上以 nice 19 / idle IO 运行。
