# 生产 V 变更记录

每一节对应一个生产 V 的发版。标题就是 V 上的发版名，也是 git tag，对应 `release/captured/<发版名>{,.worker,.feishu}` 下的完整存档。最新的在最前面。

- **文件变化**：由 `node scripts/release-notes.mjs --from <上一版> --to <这一版>` 生成。它把两个发版在 V 上的完整文件集合逐一比对，所以列出的就是 V 上真实变化的文件，不依赖谁的记忆。
- **来源**：每个变化的文件，都追溯到产生这份字节的 VLab 发版（负责人、dev 提交、验收证据）。追溯不到的，标为**流程外改动**，也就是在 V 上直接改的。
- **摘要**：由上线的人写一两句：为什么上，用户能感知到什么。
- **规则**：发版 PR（dev → main）必须包含这一节。CI（`tests/vlab-static.sh`）会检查：`release/captured/` 下每个发版在这里都要有章节。

流程见 `docs/vlab-v-sync-flow.md`。

---

## v2026.9.1-db91.6-feishu-ask-user-20260930

上线：2026-09-30 08:32 CST  ·  tag `v2026.9.1-db91.6-feishu-ask-user-20260930`

**摘要**：飞书里的 `ask_user` 现在会在回复卡片中出现可点击的提问（单选、多选、折叠的自定义回答），提交后直接回答原问题、会话继续输出；此前只显示工具名，用户无从回答。vCodex / Claude Code / VLab Worker 共用一套实现（PR #114）。只替换飞书插件 `monitor.account-WFdlCDhR.js`（7ea5490f → 4d3ea59b），无配置或依赖变更。08:26 重启 V 生效（08:29 就绪；重启前确认飞书无进行中的对话，4 张夜班卡被打断后由引擎重派）。VLab 验收沿用 PR #114 作者 9/29 在共享 VLab 的四入口真实点击（同一字节）；作者记录过 /vds 首次点击客户端 -356、/vcodex 首次点击未完成，重试成功，根因未定位。V 上飞书实测（08:35–08:38，Tianyi 私聊，lark-cli 以 Tianyi 身份发消息 + 飞书桌面客户端真实点击）：codex / gpt-6-sol 调用 ask_user → `question.request` 成功、`ask_user delivery … inline=true`，卡片出现「灯光 (Recommended)」「色彩」可点选项与「我有其他想法」；两个选项由自动化在客户端点选（每次点击即时勾选并提示「已选择，选好后继续」）；自动化 08:37:13 对「按这些选择继续」的按下没有生效，最终由 Tianyi 手动点击提交 → 08:38:04 `question.waitAnswer` 成功，同一张卡片更新为「✓ 已选择：灯光 (Recommended)、色彩」并续写 `ASK_PROD_0930_DONE 灯光、色彩`。人工点击路径一次成功；自动化按下提交按钮未生效的原因未查（可能是后台 AXPress 未触发卡片回调）。

相对上一版 `v2026.9.1-db91.6-view-image-overflow-signal-20260929`：1 个文件变化。

**经 VLab 发版 `feishu-ask-user-inline-v4`**（claude-release-0930，dev `eeb197af`）
> 验收：Byte-identical to feishu-ask-user-inline-v3 (monitor.account-WFdlCDhR.js 4d3ea59b, same base view-image-overflow-signal-v1), accepted on shared VLab 2026-09-29 by PR #114 author with real Feishu clicks: Worker deepseek-v4-flash multi-select -> ASK_V3_WORKER_DONE; /vds codex single+multi -> ASK_V3_VDS_DONE; /vcc claude-cli custom answer -> ASK_V3_VCC_DONE; /vcodex single -> ASK_V3_VCODEX_DONE (ques…
- `feishu` dist/monitor.account-WFdlCDhR.js  7ea5490f → 4d3ea59b

**这期间合入 dev 的 PR**（4 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #114 feat(feishu): 在流式回复卡片中回答 Ask User 并继续会话
- #113 fix(nightshift): three more ways a system stop reached a person
- #111 feat(nightshift): starts wait while too many new cards are warming up
- #112 release: capture V after view-image-overflow-signal-v1, with CHANGELOG

## v2026.9.1-db91.6-view-image-overflow-signal-20260929

上线：2026-09-29 22:05 CST  ·  tag `v2026.9.1-db91.6-view-image-overflow-signal-20260929`

**摘要**：三项修复，21:50 重启 V 生效（21:52:35 就绪）。① `view_image` 每张图在存入会话记录前压到 1 MB 以内（`core/dist/openclaw-tools-BODVdJQD.js` 336aab63 → 637c86f3，PR #105）：此前 1200 px 的 PNG 以 3–4 MB 原样存进会话，单条事件 5–19 MB，拖慢每次整会话读取和写锁；VLab 实测 4.3 MB PNG 存储从 5.6 MB 降到 1.25 MB。② 上下文放不下时报溢出而不是发 `max_tokens=1`（`core/node_modules/@openclaw/ai/dist/transports.mjs` 9b5ab8ff → 7d7ae7a8，PR #108，在 node_modules 下、不在上面的自动比对里）：中文会话估算偏高一倍，48–90 万 token 的会话被钳成 1 个输出 token，DeepSeek 回 length、回退 grok 再真溢出、历史丢失；现在走 OpenClaw 自带的溢出→自动压缩→重试。③ 同时生效的还有 9/29 09:07 已装上的 E3（DeepSeek 图片预算）。**流程外改动（主机上直接改的配置）**：worker 配置 `experiments/agent-worker-isolation-v1/worker-openclaw.json` 的 `session.maintenance.mode` 由 `enforce` 改为 `warn`（备份 `.bak-maint-warn-20260929T214*`）。这份配置与主配置漂移（maxEntries 2000、无 maxDiskBytes→默认 10 GiB，主配置 6000 / 32gb），导致每个 worker 在写锁里做磁盘清理、驱逐会话和全库 ANALYZE（9/29 18:01 一次占锁 24.7 s）；现在只由 Gateway 按主配置维护。VLab 复现与对照见 `lab/candidate/agent-db-lock-holders.mjs`。**已知遗留**：重启时正有一轮在跑的飞书群 `oc_b4346bd5…` 卡在重启恢复中间态（条目 running + 恢复标记、无进程），之后消息全部报 `restart recovery claim changed before agent adoption`，待处理。

相对上一版 `v2026.9.1-db91.6-deepseek-budget-image-20260929`：1 个文件变化。

**经 VLab 发版 `view-image-overflow-signal-v1`**（claude-release-0929，dev `b020cd43`）
> 验收：shared VLab 2026-09-29 21:4x CST: runtime markers view-image-bytes-cap-v1, completions-overflow-signal-v1, deepseek-budget-image-v1 present; real turn makaron default model + exec tool -> reply "accept-ok" (session agent:makaron:explicit:vlab-accept-chat-1790689047); real openai/gpt-6-luna view_image on a 1200x1200 4.3 MB PNG -> correct description, stored view_image event 1245362 bytes (before fi…
- `core` openclaw-tools-BODVdJQD.js  336aab63 → 637c86f3

**这期间合入 dev 的 PR**（13 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #108 fix(release): report a full context as an overflow instead of max_tokens=1
- #105 fix(core-patch): cap each view_image image at 1 MB before it is stored
- #110 fix(nightshift): a substrate fault read from the transcript follows the ledger rule too
- #109 fix(nightshift): the ⋯ menu and Archive send who is acting
- #107 feat(nightshift): a project's queue place and concurrency, in a quiet ⋯ menu
- #106 feat(nightshift): an operator or an Agent sets a project's session limit and its place in the queue
- #103 feat(nightshift): first come, first delivered across all projects
- #104 fix(nightshift): only stops a person can act on reach 需要你
- #101 fix(nightshift): accept a handoff artifact cited by absolute path inside its instance
- #100 fix(nightshift): a card blocked before its Agent's first turn retries as a start failure
- #99 feat(nightshift): open on Workflows, and on 已交付 when nothing is in production
- #98 docs(release): CHANGELOG section for the deepseek-budget-image release
- #97 release: capture V after promoting deepseek-budget-image-v1

## v2026.9.1-db91.6-deepseek-budget-image-20260929

上线：2026-09-29 09:10 CST  ·  tag `v2026.9.1-db91.6-deepseek-budget-image-20260929`

**摘要**：DeepSeek v4（deepseek-v4-pro / deepseek-v4-flash）的上下文预算不再把内嵌图片的 base64 当文本计数，每张图固定按 8192 token 计；此前一张生成图片会被估成 80–120 万 token，请求还没发出就报 `V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED`（V 2026-09-28 14:20，回复中途中断）。默认的 deepseek-flash 不经过这段检查、不受影响。改动文件是 `core/node_modules/@openclaw/ai/dist/transports.mjs`（78223d12 → 9b5ab8ff，VLab 发版 `deepseek-budget-image-v1`，PR #94）；它在 node_modules 下，不在上面的自动文件比对里。**文件已于 09:07 装到 V，下一次 Gateway 重启后生效。** 本节同时补记了 9/28 两次没有单独成节的发版（computer-frame-prune、computer-execution-idle）。

相对上一版 `v2026.9.1-db91.6-feishu-progress-20260926`：2 个文件变化。

**经 VLab 发版 `computer-execution-idle-v1`**（v-remote-browser-control-d13c58，dev `15ea7f3f`）
> 验收：Feishu DM to V - Lab as Tianyi (lark-cli), fresh /new session, 2026-09-28 08:45-08:53 CST, after restarting vlab-cua-node so the node process runs the patched contract: /model vcc (claude-cli, claude-opus-5) computer task CUA_OK, then desktop_handoff_request in the DM issued a control link (before: denied, no trusted channel sender identity; plugin owner fallback from PR #76). /model vcodex (codex…
- `core` computer-use-contract-CisZRwLE.js  1043716b → 1f51021f

**经 VLab 发版 `computer-frame-prune-v1`**（claude-desktop-handoff，dev `1148f35a`）
> 验收：Feishu DM to V - Lab (fresh /new session, deepseek-v4-flash on vlab-worker), 2026-09-28 01:34-01:35 CST: long computer-use task on makaron.app, 7 templates clicked with a screenshot after each (21 node.invoke), reply LONG_OK, zero context-overflow/compaction errors. Before the patch the same kind of task died at ~15 screenshots with V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED (2 MB payload, 33 messages). …
- `core` history-image-prune-Dg0CDQ4a.js  a4261a04 → 2811753f

**这期间合入 dev 的 PR**（23 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #97 release: capture V after promoting deepseek-budget-image-v1
- #95 fix(nightshift): a fan-in card keeps at most 20 parents so 30-item projects can deliver
- #94 fix(core-patch): the DeepSeek budget must not count inline image base64 as text
- #92 fix(nightshift): what the engine saw leads a 需要你 card unless the Agent filed a report
- #91 style(nightshift): drop the AGENT WORKING label on running tasks
- #90 fix(nightshift): 需要你 reasons a person can read, from the Agent when it said why
- #89 feat(nightshift): 需要你 reads the engine's queue, with a decide drawer
- #86 feat(nightshift): 需要你 — cards that stop for good become decisions a person answers
- #87 style(nightshift): phones get room to breathe, and menus open as sheets
- #84 test(nightshift): make the Session-inspection budget test deterministic
- #85 fix(nightshift): paused projects are not 在产
- #83 feat(nightshift): play the finished video again, and show project times
- #82 style(nightshift): the drawer's handoff block, as a quiet list
- #81 feat(nightshift): a lights-out factory view for the Night Shift dashboard
- #80 fix(nightshift): recover cards whose Agent run died without a terminal message
- #79 fix(nightshift): remember the concurrency that cut a person's reply
- #77 release: computer-execution-idle-20260928 on V; cua-node unit runs from the Gateway dist; docs
- #76 release: capture V after computer-frame-prune; fix claude-cli handoff links and desktop lock
- #75 fix(core-patch): prune stale computer screenshots within the current turn
- #74 fix(v): stop Claude Code background tasks from swallowing /vcc replies
- #73 docs: desktop handoff production V deployment record
- #72 feat: V desktop handoff — host desktop, shareable takeover links, agent tool
- #71 docs(release): 生产 V 的 CHANGELOG（按存档自动生成 + 补齐已有 tag）

## v2026.9.1-db91.6-feishu-progress-20260926

上线：2026-09-26 01:30 CST  ·  tag `v2026.9.1-db91.6-feishu-progress-20260926`

**摘要**：飞书回复卡片里直接显示会话的进度清单（worker、/vcodex、/vcc 三种运行方式都已验证）。由 `claude-feishu-progress-stream` 按 VLab → V 流程上线。*（摘要由 Claude 根据 PR #67/#68 与验收记录补写）*

相对上一版 `v2026.9.1-db91.6-media-relay-20260925`：2 个文件变化。

**经 VLab 发版 `feishu-progress-stream-v2`**（claude-feishu-progress-stream，dev `cb44ce5e`）
> 验收：Live Feishu DM to V - Lab on shared VLab, 2026-09-26 01:00-01:23 CST, same task on three runtimes: worker (deepseek-v4-flash), codex (/model vcodex, gpt-5.6-sol), claude-cli (/model vcc, claude-opus-5, mcp__openclaw__progress_card). Each run: one streaming card, every progress-card revision rendered exactly once by one dispatcher (progress-stream log lines), commentary present in session history. …
- `core` progress-card-CciYmFS8.js  d32a0caa → b579f12f
- `feishu` dist/monitor.account-WFdlCDhR.js  605b3124 → 7ea5490f

**这期间合入 dev 的 PR**（4 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #69 release: capture V after promoting feishu-progress-stream-v2
- #68 feat(feishu): show the progress card as a plain work checklist
- #67 feat(feishu): stream the session progress card into the reply card
- #66 fix(ops): alert on Gateway crashes and crash loops the sentinel slept through

## v2026.9.1-db91.6-media-relay-20260925

上线：2026-09-25 23:17 CST  ·  tag `v2026.9.1-db91.6-media-relay-20260925`

**摘要**：修复生图完成后不自动回图：worker 里的生图完成通知转交给 Gateway 投递。Tianyi 批准，22:47 在 V 空闲时重启生效，第一次线上生图验证（23:19）正常回图。当晚 23:22 状态库损坏的事故与本次上线无关，结论见 `docs/vlab-v-sync-flow.md` 相关记录和 Monitor 事故报告。

相对上一版 `v2026.9.1-db91.6-gpt6-20260925`：2 个文件变化。

**经 VLab 发版 `media-completion-worker-relay-v1`**（media-completion-wake-fix，dev `6d05c55c`）
> 验收：Shared VLab 2026-09-25 22:06 CST, 5 workers, real deepseek-v4-flash turn + real makaron-image render: session agent:makaron:explicit:vlab-dev-media-completion-relay-2-1790345155128, image_generate started 22:06:09, image posted to session 22:06:29 with no follow-up message; failure-notice path also delivered (vlab-dev-media-completion-relay-1790344473466, 22 s). journal since deploy: 0 "wake faile…
- `core` openclaw-tools-BODVdJQD.js  b20468a2 → 336aab63
- `worker` worker-gateway-events.mjs  fbda3387 → acbb8ed1

**这期间合入 dev 的 PR**（2 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #64 fix(vlab): deploy/rollback 超时从 10 分钟放宽到 30 分钟
- #63 release: 捕获上线 media-completion-worker-relay-v1 后的 V

## v2026.9.1-db91.6-gpt6-20260925

上线：2026-09-25 22:15 CST  ·  tag `v2026.9.1-db91.6-gpt6-20260925`

**摘要**：上线 GPT-6 Sol / Luna（/vcodex、/luna）。**这是一次流程外热修**：9/25 04:01 有会话直接在 V 上运行回迁补丁并重启，来源分支事后才补进 dev（PR #60）。同一版还把 V 上 31 个残留备份移到了 `/opt/v-release-backups/residue-20260925T135800`（不影响运行，没有文件内容变化）。

相对上一版 `v2026.9.1-db91.6-feishu-model-20260924`：2 个文件变化。

**流程外改动**（这些字节没有由任何 VLab 发版产生，是在 V 上直接改的）：
- `core` model-route-contract-B2Q_03Gg.js  b5742a35 → 0524626e
- `core` openai-chatgpt-provider-BApw3_oy.js  f31ddb3e → b464def9

**这期间合入 dev 的 PR**（12 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #61 fix(vlab): 待上线版本和 V 自己的改动并存时不再死锁
- #60 补齐 GPT-6（及 /vcc、飞书过程可见等已上线工作）+ V→VLab 反向同步工具
- #59 fix(release): 哨兵发现对『未声明文件』的原地修改（GPT-6 回迁漏报）
- #58 fix(media): relay Worker media completions to the Gateway on 9.1
- #54 ops: put the V on-host sentinel and production watch tooling in git
- #57 fix(nightshift): accept a group chat as V sees it
- #56 fix(nightshift): give the Feishu sender a writable cache under ProtectHome
- #55 feat(nightshift): tell a project's requester in Feishu when it finishes
- #53 feat(ops): watch Night Shift from the host, beside the sentinel
- #52 fix(nightshift): read a card scope in bounded requests
- #47 fix(nightshift): stop dispatch when the Agent DB lease saturates; reset retry budgets
- #51 fix(release): capture V against the published package, not its patched base

## v2026.9.1-db91.6-feishu-model-20260924

上线：2026-09-24 14:15 CST  ·  tag `v2026.9.1-db91.6-feishu-model-20260924`

**摘要**：第一个有完整存档、可以从 git 重建的 V 发版，也是 main 第一次代表生产。内容等于此前一直在线上运行的 db91.6，加上 9/17 到 9/24 期间原地做过的所有改动（见下方补记）。

首个带完整存档的发版，作为之后比对的起点。
- core：相对 npm:openclaw@2026.9.1 修改 77、新增 19
- worker：94 个文件（整目录存档）
- feishu：47 个文件（整目录存档）

## 事后补记：v2026.9.1-db91.1 → v2026.9.1-db91.6（2026-09-09 ~ 2026-09-24）

> 这段时间 V 的发版没有存档，也没有 tag（db91.1 除外）。以下根据 V 上发版目录的创建时间、目录里记录的来源提交、systemd drop-in 名称、`docs/release-workflow-v2.md` 的体检结果和各线记忆整理而成。**不是逐文件的精确记录**；精确的起点是上面的 `v2026.9.1-db91.6-feishu-model-20260924`。

| 版本 | 上线时间（目录创建） | 来源提交 | 内容 |
| --- | --- | --- | --- |
| db91.1 | 2026-09-09 00:55 | `ffadb2a9` | 数据库顺序预读、锁外轨迹统计、表达式索引查询、Worker IPC 关闭保护；原生 restart intent 作为受控重启入口。详见 `docs/v2026.9.1-db91.1-release.md`（tag `v2026.9.1-db91.1`） |
| db91.2 | 2026-09-14 20:57 | `0eb72065` | 进程级全局写入协调（`db91-process-global-writer-v2`）。之前两次尝试预检失败，目录保留为 `.failed-preflight-20260914-2054/2100` |
| db91.3 | 2026-09-14 21:23 | `0eb72065` | 与 db91.2 同源，目录重建（无独立 drop-in） |
| db91.4 | 2026-09-14 22:05 | 目录记录为 `ffadb2a9`（疑为复用旧 source） | 记忆库 FTS 准入（`db91-memory-fts-v3`） |
| db91.5 | 2026-09-15 00:00 | `de711b5` | 写事务范围收窄（`db91-writer-transaction-scope-v5`） |
| db91.6 | 2026-09-15 08:32 | `f9f4a4b` | 状态库写协调与 fast path（`db91-state-db-fastpath-v6`） |

**db91.6 上线后在原地做过的修改**（没有新版本号，发版目录被直接改写；时间为文件 mtime）：
- 2026-09-16：worker 内存回收（worker-memory-recycle，worker 插件）
- 2026-09-17 11:45：`session-sharing`（会话精确查找，避免全量读 148MB）
- 2026-09-17 21:42：`tasks` / `task-summary`（任务列表存储缓存）
- 2026-09-18 21:32：`dreaming-phases` / `memory-core-host-engine-sessions`（dreaming 会话摄入）
- 2026-09-20：dreaming 通过配置开关关闭（配置层，不是代码）
- 2026-09-22 22:16：`builtin-openclaw`、`dispatch-from-config`、`openclaw-tools`、`question`（飞书密钥卡片），`realtime-session-harness`、`talk`（小何语音、owner-terminal）
- 2026-09-23 01:35–01:55：`control-ui` 与火山 RTC 前端资产（体检过程中被原地修改）
- 2026-09-23 08:24：飞书插件 `monitor.account`（密钥卡片，改在 `/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu`）
- 2026-09-23 ~ 09-24：`/vcc`（Claude Code harness）、飞书过程可见白名单、飞书模型切换权限（配置 + 代码，来源分支见 PR #60 及 `e9411ae`）

## v2026.9.1-db91.6

最早的一次存档（2026-09-23，仅 core，基准是 V 上被改过的原版目录），用于体检，已被上面 `feishu-model-20260924` 的完整存档取代。
