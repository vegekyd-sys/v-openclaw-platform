# 溢出压缩前在主线程缩放全部历史图片（2026-11-09）

## 1. 现场（V，`journalctl -u openclaw-gateway`，CST）

- 14:00:44 Gateway 主进程（pid 702597）开始一个 skill-workshop 复盘回合 `skill-workshop-review:1c39268f-…`，模型 `deepseek/deepseek-flash`，embedded（PI）运行时。
- 14:00:48.7 第一个请求被 DeepSeek 以上下文溢出拒绝：`context-overflow-diag … messages=3530`，随后 `context overflow detected (attempt 1/3); attempting auto-compaction`。
- 14:00:49–14:01:39 连续 208 行 `[agents/tool-images] Image resized to fit limits`，每秒 4–5 行，都在 pid 702597。尺寸以 1920×1080（95 张）、1080×1920（51 张）为主，单张约 0.24 s。
- 14:01:39.46 才发出压缩摘要请求（azure gpt-5.6-sol）；同一毫秒钉钉报「60 秒未确认 socket 可用」并重连；14:01:40 `liveness heartbeat delayed: overdue=41214ms`。
- 14:01:59 压缩成功，重试回合。

11/08 以来 `context overflow detected` 共 14 次，全是 skill-workshop 复盘（`messages=` 803–3530）：7 次在 Worker（11/08 23:47 至 11/09 12:12），7 次在 Gateway（11/08 11:54、22:23、22:38、22:44，11/09 12:15、13:33、14:00）。Gateway 里缩放图多的只有 14:00 这一次，13:33 是 12 张。

## 2. 根因

### 2.1 缩放发生在压缩准备阶段，不在重试准备提示时

调用链（V core dist，`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist`）：

1. `compact-gStBcHDe.js` 的 `executePreparedCompactionSession` 在调用摘要模型之前，先执行 `sanitizeSessionHistory({ messages: session.messages, … })`，对象是整个会话。
2. `history-image-prune-Dg0CDQ4a.js` 的 `sanitizeSessionHistory` → `embedded-agent-helpers` 的 `sanitizeSessionMessagesImages` → `tool-images` 的 `resizeImageBase64IfNeeded`。超过 `imageMaxDimensionPx`（默认 1200）的图都会重新编码。
3. `image-ops` 的 `resizeToJpeg` → `createRastermill({ execution: "auto" })`。Rastermill 0.3.2 的 `auto` 用进程内的 Photon（WASM，同步执行）。所以每张图都卡住调用者的事件循环，并且在尺寸和质量网格上可能编码多次。

#355（`v-history-image-resize-skip-v1`）只给回合 attempt 加了 `skipPrunedImageResize`，压缩这条调用没有带。重试回合本身只缩放最近几轮的图（14:00:46–47 那 3 行就是首个 attempt 的）。

### 2.2 这些缩放结果没有用处

溢出触发的压缩由客户端摘要器完成：

- `attemptServerEndpointCompaction` 一开头遇到 `trigger === "overflow"`、自定义指令，或模型没有 Responses compact 端点时，就直接返回。只有走这条服务端压缩时，才会把 `session.messages`（也就是清洗后的消息）发出去。
- 客户端路径 `AgentSession` 压缩用 `this.sessionManager.getBranch()` 准备，也就是持久化条目、原始字节。`serializeConversation` 把图片换成 `[image data omitted from summary input]`。
- token 估算按图片张数计（`IMAGE_BLOCK_CHARS`），与字节无关。
- 压缩后会话上下文从条目重建。重试回合走自己的 attempt 路径，按 #355 的规则重新清洗。

所以在客户端摘要路径上，208 次缩放全是白做，代价是阻塞主线程 50 s。

### 2.3 为什么复盘跑在 Gateway 主进程

- 复盘由前台回合结束时的 hook 调度，在前台回合所在的进程里，空闲 30 s 后执行（`experience-review-default-*.js`，`EXPERIENCE_REVIEW_IDLE_MS`）。
- 复盘调用 `runEmbeddedAgent` 时写死了 `agentHarnessId: "openclaw"` 和 `agentHarnessRuntimeOverride: "openclaw"`，选的是进程内 PI 运行时，不经过 vlab-worker harness。
- Codex harness 的回合（/vds、/vcodex）在 Gateway 里跑。12:23 默认模型改成 /vds 之后，复盘就都落在 Gateway。按 bundle-prep 记录的 pid 统计当天的复盘：09–11 时 Worker 29 次、Gateway 3 次；12 时以后 Gateway 14 次、Worker 7 次，Worker 的 7 次都在 12:02–12:13，也就是切换之前。
- 复盘以 detached 方式打开前台会话的完整模型上下文（`SessionManager.openModelContext`），压缩结果不落盘。前台是 Codex 会话时，OpenClaw 侧的镜像记录不由 OpenClaw 压缩。所以同一个大会话每次复盘都会再溢出、再压缩一次。这一点本补丁不处理，见第 5 节。

### 2.4 上游

- openclaw origin/main（2026-11-09 a73ac603268）的 `compaction-session-execution.ts` 仍然对整个会话调 `sanitizeSessionHistory`，没有跳过缩放的选项。#185340 和 #186804 只缓存校验结果，缩放照做；#188340 只管回放字节一致。
- 官方的另一层机制是 #146094（2026-09-12，`official/v2026.9.6` 起才有）：`createImageProcessor` 改成 `WorkerTaskPool`（最多 2 个 worker_threads），Photon 计算移出调用者的事件循环。9.1 回移它要带 WorkerTaskPool、runtime-process 入口和构建项，改动大。即便回移了，这 208 次无用缩放仍要占约 50 s CPU。9.6 升级线会自带这层机制。
- 结论：先在压缩路径上不做无用缩放（本补丁），线程池卸载留给 9.6。

## 3. 补丁 `compaction-image-resize-skip-v1`

源码：openclaw-versa `versa/port-compaction-image-skip-20261109` @ `9491dac5cd0`（基于 `versa/port-backlog-20261029` @ b61c13eb1a3）。

- 源码改动：`replay-history.ts` 新增 `skipImageResize`；新文件 `server-endpoint-compaction-eligibility.ts` 提供 `serverEndpointCompactionMayRun`，`attemptServerEndpointCompaction` 和压缩清洗共用这一判断；`compaction-session-execution.ts` 在服务端压缩不会运行时传 `skipImageResize`。
- 测试：新增 `compaction-image-resize-skip.test.ts` 4 项，改动前 2 项失败。相关套件 compact*/replay-history/sanitize-session-history/server-endpoint-compaction/overflow-compaction 共 317 项。其中 `compact.hooks.test.ts > refreshes the delegated watchdog before delayed fallback setup` 一项在改动前后都失败，是既有问题。

dist（按 V 字节构建，`node lab/build-compaction-image-skip.mjs --base <dir>`）：

| 文件 | V 当前 | 补丁后 |
|---|---|---|
| `dist/history-image-prune-Dg0CDQ4a.js` | `3e5c9c8b` | `35009274` |
| `dist/compact-gStBcHDe.js` | `54be6901` | `517ec6df` |

- `history-image-prune`：`skipImageResize === true` 时 `keepImageBytesBeforeIndex = messages.length`。沿用 #355 的机制：图片仍做 base64 和 MIME 校验、10 MB 上限，只是不重新编码。
- `compact`：抽出 `serverEndpointCompactionMayRun`，压缩清洗时传 `skipImageResize: !serverEndpointCompactionMayRun(...)`。会走服务端压缩的情况（预算或手动触发，且模型有 Responses compact 端点）行为不变。
- 开关：`OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP=0` 恢复原行为。
- 离线测试：`lab/compaction-image-skip.test.mjs`。
- Worker 也加载 core dist，Worker 里的压缩同样受益。

## 4. candidate 证据

脚本：`lab/candidate/compaction-image-skip-ab.mjs`。plan：`lab/candidate/compaction-image-skip-ab.plan.json`。事件循环探针：`lab/candidate/el-gap-probe.mjs`。

正式一轮：`candidate-f2120ff2-9390-4f9c-be44-9472b1bb64b0`，exit 0，全部断言通过，用时 22 分钟。基线是共享 VLab 的 `noop-mutation-nonterminal-20261109`，两个目标文件的 before 与 V 相同，脚本里做了断言。

**做法：**

- 私有 Gateway，embedded 运行时，也就是回合跑在 Gateway 主进程，与 V 上 Gateway 里的复盘相同。模型照抄 V：`deepseek/deepseek-flash`，vision，thinking high，safeguard 压缩。请求接到本机的 DeepSeek 替身，摘要也由替身返回。
- 建历史：120 个回合，每回合替身让模型 `view_image` 一张新的 2400×3200 照片。会话里因此留下 120 张 2048 px 的工具结果图，与 #322 之后 V 上的情况相同。建完冻结状态，以下每次测量都从这份状态的副本开始。
- 测量：对同一会话发一条消息。替身对这一轮的第一个请求返回 DeepSeek 的 400 上下文溢出，触发自动压缩，接着重试并作答。三臂依次单独运行，每次只开一个 Gateway，按 ABC、CBA 各跑一轮：
  - A：V 字节；
  - B：装本补丁；
  - C：B 加上 `OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP=0`。
- 停顿：Gateway 以 `--import el-gap-probe.mjs` 启动，50 ms 节拍，记录超过 100 ms 的事件循环停顿。统计区间是注入 400 到摘要请求发出。

**结果：**

| 臂 | 区间内缩放行数 | 最长单次停顿 | 区间内累计停顿 | 溢出 → 摘要请求 | 整回合 |
|---|---|---|---|---|---|
| A1 / A2 | 120 / 120 | 52.9 s / 52.0 s | 54.0 s / 52.9 s | 54.2 s / 53.2 s | 61.7 s / 61.0 s |
| B1 / B2 | 0 / 0 | **1.2 s / 1.1 s** | 1.9 s / 1.6 s | **2.5 s / 2.1 s** | 10.2 s / 9.7 s |
| C1 / C2 | 120 / 120 | 52.7 s / 52.5 s | 53.4 s / 53.4 s | 53.7 s / 53.7 s | 61.4 s / 61.8 s |

- A 的 120 次缩放是一整段约 53 s 的连续停顿，中间不让出事件循环。原因是 Photon 同步执行，`await` 之间只有微任务。这与 V 14:00 的形态一致：208 张、50 s，liveness 超时 41 s。
- B 剩下约 1.1 s 的停顿是 120 张图的 base64 校验与压缩准备本身。
- **请求逐字节相同：** 6 次运行的摘要输入 sha 全部相同（臂标签做了规范化）。压缩后的重试请求除系统提示外全部相同，图片按 sha256 比较。摘要请求里图片数都是 0。每次都发了 2 个摘要请求，三臂一致，重试请求都带 2 张最近的图。
- 所有模型请求都来自 Gateway 进程本身（替身按 socket 反查 pid）；6 次都完成重试并收到替身的回答。
- 开关 C 完整恢复原行为。

小规模试跑：`candidate-e91870df-…`，8 张图。A 缩放 8 张、停顿 3.5 s；B 缩放 0 张、停顿 0.47 s。

证据副本（含完整输出）：`~/v-upgrade-private/compaction-image-skip-20261109/`。

**没有覆盖到的：**

- 摘要用的是替身。V 上实际走 `versa-fast-quality-v1` provider 和 qualityGuard，但它们都在清洗之后，不影响清洗这一步。
- 服务端 compact 端点路径（预算触发，且模型有 Responses compact 端点）行为不变，未单独回归。
- Worker 内的压缩会加载同一份 dist，没有单独测。

## 5. 不在本补丁内的后续

- 复盘对大会话反复溢出：复盘是 detached 的，压缩不落盘，同一前台会话每次复盘都要再压缩一次，每次还要调一次摘要模型。可以考虑前台记录超过模型窗口时跳过复盘，或者只给复盘喂当前回合。
- 复盘固定走 Gateway 进程内 PI：可以考虑让 Gateway 侧复盘也交给 vlab-worker。
- 图片计算移出事件循环：9.6 的 #146094。
- 同日 10:43:46.8–10:44:25.6 的 39 s 停顿：期间 Gateway 自身没有任何日志，也没有图片缩放和复盘回合，前后只有 Worker 的输出和一次 2.8 s 的 `sessions.history.read`（Worker 进程）。原因未定，与本路径无关。

## 6. 上线

- 需要 Gateway 重启加 Worker 换代：两个文件都在 core dist，Gateway 和 Worker 都会加载。
- 用 `promote-to-v` 按 `lab/compaction-image-skip.plan.json` 安装（`baseRelease` 在 stage 时填）。
- 上 V 后的判据：再出现 `context overflow detected` 时，摘要请求之前不再有成串的 `Image resized to fit limits`，也没有 liveness overdue。
- 回滚：`promote-to-v --undo`；或者不回滚，只设 `OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP=0` 再重启。
- 上线后在捕获 PR 里把两个文件的新 sha 映射到 `versa:9491dac5cd0`，写入 `release/source-map.json`。
