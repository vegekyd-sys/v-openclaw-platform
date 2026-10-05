# 生产 V 变更记录

每一节对应一个生产 V 的发版。标题就是 V 上的发版名，也是 git tag，对应 `release/captured/<发版名>{,.worker,.feishu}` 下的完整存档。最新的在最前面。

- **文件变化**：由 `node scripts/release-notes.mjs --from <上一版> --to <这一版>` 生成。它把两个发版在 V 上的完整文件集合逐一比对，所以列出的就是 V 上真实变化的文件，不依赖谁的记忆。
- **来源**：每个变化的文件，都追溯到产生这份字节的 VLab 发版（负责人、dev 提交、验收证据）。追溯不到的，标为**流程外改动**，也就是在 V 上直接改的。
- **摘要**：由上线的人写一两句：为什么上，用户能感知到什么。
- **规则**：发版 PR（dev → main）必须包含这一节。CI（`tests/vlab-static.sh`）会检查：`release/captured/` 下每个发版在这里都要有章节。

流程见 `docs/vlab-v-sync-flow.md`。

---

## v-experience-channels-20261005

上线：2026-10-05 23:19 CST  ·  tag `v-experience-channels-20261005`

**摘要**：飞书式体验带到钉钉、企业微信、Telegram（过程卡、Ask User、插话、切换 Harness、「电脑」接管卡带截图和 接管/完成/跳过、凭据一次性链接卡），钉钉/企微的非主人只开放 `/model`（core command-auth V3）；同一次重启带上 X search 在 grok-4.6 上用 effort low（#186）和 GPT Live 本人电话接续指定飞书会话（#194）。

- 运行时：18 个文件（下表）；配置 `activate.mjs production`：`commands.allowFrom` 加 telegram / dingtalk-connector / wecom = `*`，Gateway 23:16:29 受控重启一次。
- 旁路服务（同一 dev 提交 717e1449）：`v-desktop-handoff` 更新（渠道卡片、按渠道告诉 agent 按钮名 #211）；新装 `v-secret-entry`（127.0.0.1:23960/23961），cloudflared `v-dashboard.yml` 加 `openclaw.tianyi.live/secret-entry`。
- 电话入口 `https://openclaw.tianyi.live/voice/`（`openclaw-rtc-h5`）切到 `gpt-live-717e1449…`，用 `lab/gpt-live-voice-entry-release.mjs`；shared proof 只带 core/worker 文件（脚本还不认渠道插件路径，插件已由 promote-to-v 核对并 ALIGNED）。
- 验收：VLab 真机见下方引用；V 上 23:23–23:26 x_search 真实回合 deepseek-flash 23 s / grok-4.7 33 s / vcc 44 s，tookMs 11.9–12.7 s、failures 0（改前 28–51 s、12 次中 8 次超时）；Telegram（@ClawdTY_bot）接管卡是公网「接管」按钮 + 完成 / 跳过。
- 重启后清了 4 行旧 Gateway（pid 1995562）的 Codex app-server 登记（进程均已退出），之后无 `Cannot reap`。
- 待办：钉钉提问卡模板导入自有应用（未导入时 V 上退回普通消息）；接管组件表 `handoff` 可改 `blocking: true`；非主人 `/status` 回的是上游通用「No reply was generated」。

相对上一版 `v2026.9.1-db91.6-firsttext-runid-20261005`：18 个文件变化。

**经 VLab 发版 `v-experience-channels-20261005-d`**（claude-v-experience-d0ff74，dev `717e1449`）
> 验收：Shared VLab 2026-10-05 21:15-22:52 CST, release v-experience-channels-20261005-d (dev 717e1449; same channel bytes as -c on which real-client tests ran). Real clients on Tianyi's Mac: WeCom Vlab bot - 电脑 card (screenshot + 接管/完成/跳过), 完成 tap answered as new message (846605 fix), full takeover h_8cee41d112ab 22:03 control_taken_by -> handed_back_from_page -> wake_claimed, V reported the page; ask_us…
- `core` bot-message-DC6p8sB3.js  8af1697a → f37781c4
- `core` bot-native-command-builtins-mQhamMB9.js  20c55fca → 8b7908bd
- `core` bot-native-command-dispatch-7hG7WSS2.js  c42a0baf → 58c78cb2
- `core` builtin-openclaw-zQV8Wwjr.js  029eae85 → 84456470
- `core` command-auth-DmNN2m2f.js  d24a6081 → 8b4858e3
- `core` helpers-DEd6NfQU.js  18a6c7fc → 8ee65399
- `core` talk-DkFuKRod.js  560d5cf2 → 91cf0741
- `core` telegram-ingress-drain-factory-DJM2Jqrc.js  aff8b436 → acdf98ee
- `core` x-search-shared-CJa_QAnc.js  72e642f3 → bdb1ab1e
- `core` gpt-live-call-lifecycle.mjs  73198276 → 47afe3df
- `core` v-experience.js  — → 5d939fa7
- `dingtalk` dist/connection-DCvu-l09.mjs  860176dd → 397c42c3
- `dingtalk` dist/message-handler-BUoLSylZ.mjs  5db2b71d → d914cbce
- `dingtalk` dist/runtime-C81EKBS1.mjs  d2515aab → af93e121
- `dingtalk` dist/v-experience.mjs  — → 5d939fa7
- `wecom` dist/src/channel.js  079f5c6c → 30eb4a17
- `wecom` dist/src/monitor.js  99efa7d6 → d4fe3561
- `wecom` dist/src/v-experience.mjs  — → 5d939fa7

## v2026.9.1-db91.6-gpt-live-voice-20261005

上线：2026-10-05 01:34 CST 受控启动 Gateway，01:41 公网语音服务就绪。tag `v2026.9.1-db91.6-gpt-live-voice-20261005`。

**摘要**：原小何入口 https://openclaw.tianyi.live/voice/ 改为 GPT Live。保留桌面布局；手机拨号后头像连续上移缩小，第一条真实字幕到达才显示对话。接通问候、后台任务续做和模型调用挂断工具随同上线。每次拨号创建独立会话，不复用十二家群会话。

**来源**：PR #189，dev `21894155`；共享发版 `gpt-live-voice-20261005-2189415`，artifact SHA256 `e2f3c5290cadbca2e384eae727422c7f82c39adb03ffdf81c423b192d3260268`。三个实际生产 capture 位于同名 `release/captured/` 目录。完整运行时逐字节 capture、漂移哨兵与共享 align 已执行。

**验收范围**：按用户“你上线吧”授权发布已观察到的业务核心，保留历史 strict FAIL。公网原 H5/WebRTC 实测接通问候、同后台任务 Memory→Web 成功非空工具结果和语音返回；独立 controls-only 通话观察真实零参数挂断工具、告别及自动关闭。Memory/Web 严格观察器仍 FAIL（Web 原结果 envelope 在约 8000 字符截断，完整体未验证），不把它改记通过。最终答案保真和双向声学验收按用户要求暂停。

**重启与回退**：Gateway 受控重启至 PID 1116064，H5 至 PID 1124391；数据、配置与访问授权保持。原 H5 unit 的 symlink 启动不满足新 server main guard，新增受控 ExecStart drop-in 指向冻结真实路径。回退同时检查并恢复 pointer 与 drop-in；只恢复已记录身份，不覆盖并行任务。发布记录见 `release/voice/gpt-live-20261005/`，相关控制器回归 27/27 通过。

相对上一版 `loopback-requester-sender-20261004`，实际三个完整 capture 比较：7 个运行文件变化。

- `core` ./builtin-openclaw-zQV8Wwjr.js  d6cfa039 → 029eae85
- `core` ./embedded-agent-DaSvA-Yk.js  128a61c9 → 94fc21cb
- `core` ./gpt-live-call-lifecycle.mjs  713e1ba6 → 73198276
- `core` ./gpt-live-consult-continuation.js  db2ea459 → 2f2bcda1
- `core` ./realtime-quicksilver-delegation-controller-B0yPpiHp.js  ad9f99e8 → a5a06fdb
- `core` ./realtime-session-harness-CEO5kVAJ.js  eee6e604 → 02f37cb2
- `core` ./session-transcript-reconcile-j5qhAafV.js  b0200676 → e95bb26a

## loopback-requester-sender-20261004

上线：2026-10-04 11:26 CST 安装，11:27:27 重启 Gateway（V 空闲时）  ·  tag `loopback-requester-sender-20261004`

**摘要**：/vcc（claude-cli）从此能用定时任务工具了（#181）。原来 claude-cli 走的 MCP loopback 不传发送者，共享定时任务策略拿不到 `{channel, accountId, senderId}`，makaron 的 `cron.add` 一律报 `job agentId outside caller scope`，`list` 也是空的；9/27 起就这样，当时 V 改用 `openclaw cron add`（不过权限、任务无 owner）掩盖了问题。补丁回移上游 v2026.9.5 的 `requesterSenderId: senderId`，并让 loopback 上的非 owner 与 Worker/Codex 同规则。VLab 群内验收四个入口（vcc/Worker/vds/vcodex）建、列、删全通过。

本节另外记下上午已在 V 生效、但还没提交捕获的 GPT Live 三个发版（08:38 安装，08:39 重启生效）。

**同日补丁（14:43）**：接管页手机体验（#183，dev `90d57c9e`）——手势、键盘栏、接管时桌面临时竖屏、交还前先复原。只更新了 `/opt/v-desktop-handoff/service`（不在捕获的三个运行时目录内，来源以仓库 `apps/v-desktop-handoff` 为准），重启 `v-desktop-handoff.service`，没有重启 Gateway；V 上新装 `wmctrl`。备份 `/opt/v-desktop-handoff/service.bak-20261004144257`。生产验收：接管后桌面变为 528x992 且窗口铺满，公网整屏画面 0.8 s 到齐，handBack 628 ms 应答时已是 1280x800、Chrome 回到 1277x760。

**发版后配置改动（2026-10-04 21:29 CST，不改运行字节，代码仓库有迁移脚本）**：V 的 `web_search` 从 Gemini（gemini-3.5-flash-lite + Google 搜索 grounding）换成 Parallel 免 key 档（`tools.web.search.provider` gemini → `parallel-free`，新装官方 npm 插件 `@openclaw/parallel-plugin@2026.9.1` 并锁定版本，`plugins.entries.parallel` 启用并加入 `plugins.allow`；Gemini 搜索配置保留以便回退）。Gateway `openclaw.json` 和 Worker `worker-openclaw.json` 两份都改（备份 `.before-web-search-parallel-*`）。新插件装在 `npm/projects/openclaw-parallel-plugin-*`，不在捕获的三个运行时目录内。原因：60 条真实查询的基准测试中，V 的 DeepSeek 读 Parallel 原文摘录写出的回答盲评 6.6 分，读 Gemini 摘要只有 5.9 分（+0.77，95% CI +0.25~+1.32）；端到端 p50 从 8.2 s 降到 4.4 s，单次搜索从约 5.7 s 降到约 1.2 s（`experiments/web-search-bench/RESULTS-20261004.md`）。经 PR #187（dev `edf54b4a`）的 `lab/release-files/web-search-parallel/activate-production.mjs` 受控重启生效：21:06 第一次取空闲栅栏时，21:00 的 Memory Librarian 定时任务正在运行，45 s 内没能排空，脚本放弃，配置未改；等该任务结束、V 空闲后，21:27:49 自动重试并成功：停服 → 安装插件 → 写配置 → 启动，Gateway PID 700515 → 929016，21:29:39 就绪，worker 池 5，夜班自动暂停后接上。VLab 候选：parallel-free 3+8 个真实回合、Gemini 对照 3+8 个回合，全部通过（候选编号见迁移脚本 README）。生产验收（测试会话 `web-search-acceptance-1791120598`）：DeepSeek 回合调用 2 次 web_search，均走 parallel-free（1.2 s / 1.0 s，0 失败），回复正确并附官方来源，整轮 26.6 s；日志无 Parallel 报错，`worker pool is closing` 0 次。已知风险：中文本地查询排序有噪声（候选中出现过一轮连搜 12 次、用时 70 s）；每次搜索的工具结果体积从约 4K 字符涨到 10–24K 字符。跟踪：7 天每日 review（`experiments/web-search-bench/daily-review.mjs`，V 上 `/opt/v-web-search-review/`，含切换前基线）。回退：`activate-production.mjs --rollback`。

相对上一版 `hotreload-feishu-approvals-20261003`：23 个文件变化。

**经 VLab 发版 `gpt-live-call-v1-20261004-a64bf6b`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `a64bf6be`）
- `core` agent-tools.before-tool-call-g2OT63u5.js  e61b81d4 → f410f20c
- `core` bash-tools-DiAfkLAC.js  8bda4a91 → 43d9a227
- `core` builtin-openclaw-zQV8Wwjr.js  f121be94 → d6cfa039
- `core` host-capability-Dq3cEEWF.js  4535cb19 → 296b132d
- `core` realtime-quicksilver-session-B3HKftDE.js  0f98f3d3 → 801c4fe7
- `core` sessions-spawn-tool-1FQMTkIo.js  52b6ea54 → 1a7ab8f9
- `core` subagent-announce-delivery-Dosep7Zr.js  c14b886c → 8cd70a86
- `core` gpt-live-voice-exec-lifetime.js  — → 1f101c5c
- `worker` gateway-message-tool.mjs  2ae673d4 → dbdd72fb
- `worker` gateway-public-stream.mjs  5440eadb → 6cf18479
- `worker` index.mjs  b5f315bb → 26c617fd
- `worker` native-attempt-bridge.mjs  6482f3d2 → 0429d15e
- `worker` worker-pool.mjs  58558773 → 1f137ca2

**经 VLab 发版 `gpt-live-pr154-shared-20261003-d3cd1fe`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `d3cd1fe1`）
- `core` plugin-sdk/agent-harness-task-runtime.js  60913341 → 50dc439b
- `core` subagent-announce.requester-settle-wake-B2NSziIo.js  e42fc319 → be8a3f7f
- `core` subagent-registry-C24yr_PF.js  c2c0c840 → 1d9f45d6
- `worker` gateway-completion-context.mjs  e958ff1c → 612d83cd

**经 VLab 发版 `gpt-live-call-v1-20261004-4934ff6`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `4934ff63`）
> 验收：GPT Live authorized first-release business acceptance. Source 4934ff63340d211df72235bfe44871e07a8fde1b artifact 6174518da6d22054854c5101bf14135f0fa62368ef3f94b2be5bc22a8967bbc9. Actual original H5/WebRTC shared evidence tmp/gpt-live-pr/call-release-4934ff6-shared-native/receipt.json sha256 e592b0b3a0939cccddba4b28b29620d1e33d285607b48e12b0177829f16833f6. Six observed functionalCore true; real pare…
- `core` realtime-quicksilver-delegation-controller-B0yPpiHp.js  e7a27df5 → ad9f99e8
- `core` realtime-session-harness-CEO5kVAJ.js  b394e47d → eee6e604
- `core` talk-DkFuKRod.js  8626acc9 → 560d5cf2
- `core` gpt-live-call-lifecycle.mjs  — → 713e1ba6
- `core` gpt-live-consult-continuation.js  — → db2ea459

**经 VLab 发版 `loopback-requester-sender-v1`**（claude-loopback-sender，dev `fe4093ce`）
> 验收：Shared VLab Feishu group oc_abfb8965 (VLab 压测 01), real model turns as owner Tianyi. Baseline before deploy (same group): /vcc cron.add refused 3x "job agentId outside caller scope" and automations list empty; worker/vds/vcodex succeeded. After deploy loopback-requester-sender-v1 (source fe4093ce, PR #181): /vcc (claude-cli) add -> list shows job (total=2) -> remove ok, list back to 1; worker add/…
- `core` tool-resolution-Con11qMn.js  5d08186a → aa63296c

**这期间合入 dev 的 PR**（3 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #181 fix(cron): /vcc（claude-cli）按共享策略管理定时任务，与其他 harness 一致
- #180 fix(voice): wait for current transcript before delegated call control
- #179 fix(voice): delegate natural goodbye before farewell

## hotreload-feishu-approvals-20261003

上线：2026-10-03 23:44 CST 安装，23:44:55 停 Gateway，停机时写入两项 Telegram 审批配置，23:47:14 就绪  ·  tag `hotreload-feishu-approvals-20261003`

**摘要**：两件事一起上。

（1）**worker 层不再需要重启**（#172/#173）：
- 改插件配置、改主配置（模型、白名单、agent），或者执行 `openclaw gateway call vlab.workers.roll`，worker 会换一代新进程。
- 旧一代把手上的回合、排队的回合、后台生图做完再退。
- worker 配置改为从主配置自动推导，不再手工维护，首次推导在 V 上改写了 70 处。
- 9/20、9/23 那种"热重载后 worker 池永久关闭"的停摆被修掉。

（2）**OpenClaw 改动、插件、命令执行审批改发到 Tianyi 的飞书私聊**（#171），带 批准 / 总是允许 / 拒绝 按钮；同时关闭 Telegram 审批（`channels.telegram.execApprovals.enabled=false`、`approvals.plugin.enabled=false`，停机时写入）。

**V 线上验收**（lark-cli，「V 生产发布验收 0910」群）：
- base 通过：0.2.12-generations.1，5 个 worker。
- roll 通过：在途回合的 1–3000 计数在旧一代完整输出，之后排空。
- config 通过：改 `wizard.lastRunCommand` 后 worker 自动换代，在途回合完成，配置按字节还原。
- 全程 `worker pool is closing` 0 次，worker 请求失败 0 次。
- OpenClaw 改动审批：
  - 00:00 第一次，`/vcc` 发起后这一轮立即结束，审批随之取消，卡片如实改写为「已取消」。这是 9.1 原有行为：审批绑定在发起它的那一轮上（`cancelAgentRuntimeBoundApprovals`）。
  - 00:35 第二次，让 `/vcc` 在这一轮里用 sleep 轮询，把回合撑住。卡片到了 Tianyi 的飞书私聊，Telegram 0 条。00:42 Tianyi 在手机上点「批准」，卡片改为「已批准：OpenClaw 改动……改动已经写入」，配置真实写入；验完按字节还原。
- 共享 VLab 上，插件审批卡已由 Tianyi 真人点「批准」通过。

**已知**：
- 共享 VLab 上，openclaw 系统 agent 工具报 "verified inference owner changed"，是原有问题，与本次无关。
- 在群里发起的 OpenClaw 改动，如果 agent 的这一轮先结束，审批就会作废。卡片能到私聊，但已经点不了。

相对上一版 `feishu-ask-chat-answer-20261003`：8 个文件变化。

**经 VLab 发版 `hotreload-feishu-approvals-v2`**（worker-generations，dev `06d330f4`）
> 验收：Shared VLab 2026-10-03 22:51-23:38 CST, release hotreload-feishu-approvals-v2 (dev 06d330f4: #171 + #172 + #173), real Feishu via Tianyi lark-cli in VLab 发布验收 B, driver lab/hotreload-acceptance.mjs. #172: base (worker 0.2.12-generations.1, generation 1, 5 workers, Worker config derived 33 paths, reply on vlab-worker); roll (vlab.workers.roll while a 1-3000 counting reply streamed in the old genera…
- `worker` index.mjs  c047f3df → b5f315bb
- `worker` worker-pool.mjs  a9f718d0 → 58558773
- `worker` worker-config-derive.mjs  — → b202a9a8
- `worker` worker-config-watch.mjs  — → 88354155
- `worker` worker-runtime-lifecycle.mjs  — → 5e29a54b
- `feishu` dist/channel-DSYCNah8.js  fbbcd86b → bb71f2d4
- `feishu` dist/monitor.account-WFdlCDhR.js  b68229ec → b9ba9fc8
- `feishu` dist/v-feishu-approvals.js  — → 2905c12f

**这期间合入 dev 的 PR**（3 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #173 worker：只改 meta 不触发换代；#171+#172 合并发布计划
- #172 worker 层不重启更新：排空式换代、手动换代、主配置自动传到 worker
- #171 feat(feishu): 审批卡发到 owner 的飞书私聊

## feishu-ask-chat-answer-20261003

上线：2026-10-03 11:04 CST 安装，11:24:52 重启 Gateway（11:27:56 就绪）  ·  tag `feishu-ask-chat-answer-20261003`

**摘要**：两件事一起上。（1）Ask User 等你回答时，直接在聊天里打字回答也算数（#162）：以前普通消息会排在等待中的对话后面，任务卡住。（2）V 需要你接管电脑时，发一张「电脑」卡片（#96/#161/#163）：中间是 V 电脑的实时截图，点图片或「接管」直接进电脑并自动接管，做完点「我完成了」V 接着干，「跳过」则让 V 换个办法；卡片状态原地变成 操作中 / 已完成 / 已跳过；接管页适配手机。接管插件与接管服务在 `/opt/v-desktop-handoff/`（不在捕获范围内，11:23 同步，旧版备份在 `/opt/v-release-backups/desktop-handoff-card-20261003-*`）。V 上线后验收：Ask User 聊天回答在 Worker、vcodex、vds、vcc 四个入口均通过；接管卡片四个入口均能发卡，交还后 V 自动继续。

**同日补丁（不在捕获范围内）**：13:26 只更新了接管插件（#166），13:26:34 重启 Gateway（13:28:53 就绪）。手机飞书对同时带链接和回调的「接管」按钮只执行回调，电脑打不开，还会冒出一条「No reply was generated」；现在「接管」只打开链接，旧卡片的回调改回一句提示。13:53 手机实测：打开 → 接管 → 收到触摸操作 → 「我完成了」→ 卡片「已完成」。插件备份在 `/opt/v-release-backups/desktop-handoff-mobile-20261003-*`。

相对上一版 `v2026.9.1-db91.6-memory-search-guards-20261002`：1 个文件变化。

**经 VLab 发版 `feishu-ask-chat-answer-v1`**（handoff-and-ask-20261003，dev `e141e7c5`）
> 验收：Feishu DM to V - Lab as Tianyi, 2026-10-03 10:54-10:55 CST, deepseek-v4-flash on vlab-worker: V asked a native ask_user question (面条/米饭/饺子, inline in the active reply card, "也可以直接在聊天中回复答案"); Tianyi answered with a plain chat message 饺子; Gateway logged "ask_user chat answer ... state=answered", question.waitAnswer resolved, the question collapsed to ✓ 已选择：饺子 and V continued with 午饭定了：饺子. Same deplo…
- `feishu` dist/monitor.account-WFdlCDhR.js  69230132 → b68229ec

**这期间合入 dev 的 PR**（9 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #164 release: capture V after feishu-ask-chat-answer-20261003
- #163 fix(desktop-handoff): 卡片默认放电脑实时截图；「已跳过」不再被改成「已结束」
- #162 fix(feishu): accept chat replies while Ask User waits
- #161 feat(desktop-handoff): 「电脑」卡片（图片 + 接管/我完成了/跳过）+ 手机版接管页
- #96 feat(desktop-handoff): Feishu card with 接管电脑 / 付款 buttons; agent cannot end an active takeover
- #159 fix(memory-indexer): 不再全量重建，文件变动只增量重试（修 21:16 冻结）
- #160 chore: 夜班拆到独立仓库 vegekyd-sys/v-nightshift
- #158 release: capture V after memory-search-guards
- #156 refactor(nightshift): delivery page takes every name from the manifest

## v2026.9.1-db91.6-memory-search-guards-20261002

上线：2026-10-02 20:00 CST 安装，20:00:41 重启 Gateway（20:02:17 就绪）  ·  tag `v2026.9.1-db91.6-memory-search-guards-20261002`

**摘要**：修 V 第三次验收在 #153 上发现的三个问题。（1）只搜一个人名时，人物卡排到日志后面：单个词查询恢复原来的打分，12 道人名题 10/12 → 12/12。（2）没有空格的中文整句搜出 0 条（S12）：拆不出两个词时，改用三字组合查全文索引，现在 S12 的正确答案排第 1。（3）满分打平时排序随意：关键词分保留 1/4 的 BM25。V 的 54 题（同口径，线上索引）：第一名 50.0 → 48–50%，前三 59.3 → 63.0%，前五 68.5 → 72.2%，MRR 0.556 → 0.57–0.58。另外更正 #153 的离线预估：那次每题取 10 条再筛成 5 条，和 V 取 5 条的口径不同，数字偏高。

相对上一版 `v2026.9.1-db91.6-memory-search-weighted-20261002`：1 个文件变化。

**经 VLab 发版 `memory-search-guards-20261002`**（claude-memsearch-20261002，dev `aaeb8840`）
> 验收：2026-10-02 19:56-20:00 CST shared VLab (midTurnPrecheck on). Gateway preflight 158 s, ready 19:55:41. Two real agent turns (vlab.mjs test, makaron), 8 memory_search calls, all ok: name query 康浩源 ranks people/kang-haoyuan.md first; the spaceless question that returned 0 results now returns 5; warm toolMs 1.6-2.3 s, first turn after restart 15.6-16.2 s (cold). Integrity 22-31 ms, no host timing gap.…
- `core` extensions/memory-core/manager-runtime.js  9f9d763c → 134cc6f6

**这期间合入 dev 的 PR**（2 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #157 fix(memory): 单个词查询恢复原打分；中文整句无结果时用三字组合兜底
- #155 release: capture V after memory-search-weighted and midturn-precheck

## v2026.9.1-db91.6-memory-search-weighted-20261002

上线：2026-10-02 19:17 CST 安装，19:18:52 停 Gateway、打开 midTurnPrecheck、启动（19:20:19 就绪）  ·  tag `v2026.9.1-db91.6-memory-search-weighted-20261002`

**摘要**：两项改动合在一个停机窗口里上线，只重启了一次 Gateway。
- **#153 memory_search 打分**：关键词覆盖率按词的罕见程度（IDF）加权，中文按两字切词，中文和字母数字之间自动断开。修的是 #147 的副作用：`memory`、`tianyi` 这类到处都有的词会把正确页面挤出前五，没有空格的中文整句关键词得分全是 0。V 的 54 题基准（离线跑，同一份 dist）：第一名 50.0%（#147 之前）/ 46.3%（#147）→ 53.7–55.6%，前五 70.4% / 68.5% → 72.2%，MRR 0.573 / 0.549 → 0.60–0.61。
- **#152 midTurnPrecheck**：配置开关，不改运行时文件，所以下面的文件变化里没有它。在 Gateway 停止时用 `/opt/v-ops/configure-v-midturn-precheck.mjs apply` 把两份配置里的 `agents.defaults.compaction.midTurnPrecheck.enabled` 改成 true，备份是 `*.bak-midturn-precheck-20261002T111852`。回滚：停掉 Gateway 后运行 `restore`。
  - 为什么要改：一轮开始时上下文没超限，但同一轮里工具输出把它推过了上限。这时 PR #108 的 BUDGET_EXHAUSTED 在工具执行之后才抛出，不能安全重放（replaySafe=no），所以不会压缩，用户看到的是「Agent couldn't generate a response」（9/30 出现 3 次，10/02 17:41 oc_fab91abe 出现 1 次）。打开开关后，每拿到一个工具结果、调用模型之前会先检查上下文，必要时先压缩或截断再继续。
  - 证据：candidate `lab/candidate/midturn-precheck-{off,on}.plan.json`。off 的收据 b0e304dd 复现了故障：2 个工具、0 次压缩、只回了报错提示。on 的收据 4ae2af0a 在估算约 65.4 万 token 时走了 route=compact_then_truncate，压缩 1 次，摘要有真实内容，3 个工具都跑完并正常回答。共享 VLab 18:38 打开开关，跑了一轮真实工具回合，结果 ok。
  - 操作注意：apply/restore 在 Gateway 运行时会拒绝执行，因为运行中写配置会触发热加载，热加载会关掉 worker 池。
- VLab 发版打包用的是 vlab-dev 本地提交 685a6387，它的内容与 origin/dev `4dfa4a3` 逐字节相同（Codex 的合并和回退互相抵消了）。

相对上一版 `v2026.9.1-db91.6-db91-shrink-reuse-20261002`：1 个文件变化。

**经 VLab 发版 `memory-search-weighted-20261002`**（claude-memsearch-20261002，dev `685a6387`）
> 验收：2026-10-02 19:15-19:25 CST, shared VLab with #152 midTurnPrecheck enabled (both configs). Gateway preflight passed (213.6 s), ready 19:14:04, 5 workers. Three real agent turns (vlab.mjs test, makaron) calling memory_search 8 times: all ok, warm toolMs 1.4-2.1 s, one cold 9.7 s that repeated at 1.55 s; first two after restart 12.9-13.1 s (cold cache). Integrity stage 23-28 ms, no host timing gap or…
- `core` extensions/memory-core/manager-runtime.js  9594ce28 → 9f9d763c

**这期间合入 dev 的 PR**（4 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #153 fix(memory): 关键词覆盖率按词的罕见程度加权，中文按两字切词
- #152 Turn on mid-turn context precheck on V
- #151 refactor(nightshift): 交付页改成模板，引擎不参与交付
- #150 release: capture V after memory-search-mixed and db91-shrink-reuse

## v2026.9.1-db91.6-db91-shrink-reuse-20261002

上线：2026-10-02 15:25 CST 安装并重启 Gateway（15:26 恢复）  ·  tag `v2026.9.1-db91.6-db91-shrink-reuse-20261002`

**摘要**：修复 Gateway 冻结。WAL 维护定时器的增量清理会缩小 agent 库文件，原来文件一缩小，下一次 memory_search 打开数据库时，就在 Gateway 主线程上同步重做整库完整性检查（13:19 卡 106.6 s，14:50 卡 122.1 s，之后进入 host thaw 循环）。现在，如果文件变小是 SQLite 自己做的（主文件头里的页数 × 页大小 = 文件大小），就继续复用证明；被外部截断的文件仍然拒绝复用。

相对上一版 `v2026.9.1-db91.6-memory-search-mixed-20261002`：1 个文件变化。

**经 VLab 发版 `db91-shrink-reuse-20261002`**（claude-memsearch-20261002，dev `ddc07669`）
> 验收：2026-10-02 15:23 CST. Shared VLab Gateway restarted on the patched db91 gate: preflight passed (224 s), health 200; three end-to-end memory_search calls via tools.invoke each reused the integrity proof (stage integrity 23-24 ms), no host timing gap. Shrink reuse proven by lab/db91-shrink-reuse.test.mjs: original gate refuses reuse after incremental_vacuum + truncating checkpoint, patched reuses; b…
- `core` db91-integrity-gate.mjs  3d6807a3 → aa68547b

## v2026.9.1-db91.6-memory-search-mixed-20261002

上线：2026-10-02 14:44 CST 安装，14:45 重启 Gateway  ·  tag `v2026.9.1-db91.6-memory-search-mixed-20261002`

**摘要**：中英混合、多关键词的查询，现在会优先返回同时包含多个查询词的页面。改动包括：额外的“任意词命中”候选检索、按查询词覆盖率打关键词分、给强关键词命中补算真实向量分。62 条真实查询盲评：第一条有用 68% → 76%；V 在群里验收通过，上一轮没搜准的两条都排到了第一。

相对上一版 `v2026.9.1-db91.6-memory-search-1s-20261002`：1 个文件变化。

**经 VLab 发版 `memory-search-mixed-20261002`**（claude-memsearch-20261002，dev `8c4be526`）
> 验收：2026-10-02 14:3x CST. Quality (VLab replica of V current memory, 62 real queries, blind-judged 0-3): nDCG@8 0.486 -> 0.558, top hit useful 68% -> 76%, top-5 useful 0.526 -> 0.584; mixed CN/EN many-keyword (49): top hit 71% -> 80%; both V acceptance queries rank the right page first (client-material-libraries.md; SCHEMA.md + memory-librarian/main.md). Latency: replica interleaved A/B p50 +12 ms; sh…
- `core` extensions/memory-core/manager-runtime.js  a94e2079 → 9594ce28

**这期间合入 dev 的 PR**（5 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #149 fix(db91): SQLite 正常缩小文件后，不再在 Gateway 主线程上重做整库检查
- #147 fix(memory): 中英混合多关键词查询找不到真正含这些词的页面
- #146 feat(nightshift): 交付改成网页，不再打 zip
- #145 fix(nightshift): Gateway 自己重新开放接活时立刻恢复，不再被短暂 suspension 卡住
- #144 release: capture V after memory-search-1s-20261002

## v2026.9.1-db91.6-memory-search-1s-20261002

上线：2026-10-02 13:16 CST 安装，13:17 重启 Gateway（13:18:28 恢复，约 86 秒）  ·  tag `v2026.9.1-db91.6-memory-search-1s-20261002`

**摘要**：memory_search 返回结果前不再每次加载整个会话目录（上游 9.5 修复的回移），并预先启动一个向量查找子进程备用。V 上通过 Gateway 端到端实测（同一组 48 条查询）：中位数 3.31 → 1.07 秒，1.5 秒以内 41/48，结果 48/48 一致。重启后的头一分钟内搜索可能超时：测试中前 23 条失败，原因是冷缓存加上“超时后暂停重试一分钟”的机制，之后恢复正常。

相对上一版 `v2026.9.1-db91.6-memory-search-fast-20261002`：2 个文件变化。

**经 VLab 发版 `memory-search-1s-20261002`**（claude-memsearch-20261002，dev `ea8faac9`）
> 验收：2026-10-02 13:00 CST end-to-end through the shared VLab Gateway (tools.invoke memory_search, 48 real queries, sequential, 1 s apart, same harness before/after): toolMs p50 2813 -> 1255 ms, p90 3338 -> 1613 ms, max 4282 -> 1808 ms; top-3 results identical 48/48. First search after restart 21.0 s (cold cache, DB open 55 ms, no integrity pass). Mechanism measured inside the Gateway via inspector befo…
- `core` extensions/memory-core/manager-runtime.js  c6f97543 → a94e2079
- `core` session-search-visibility-H6aL2Pcb.js  badc3d4c → 566d4e58

**这期间合入 dev 的 PR**（3 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #143 perf(memory): memory_search toward 1 s end to end
- #142 docs(memory): V before/after for the memory_search upgrade
- #141 release: capture V after memory-search-fast-20261002

## v2026.9.1-db91.6-memory-search-fast-20261002

上线：2026-10-02 09:58 CST 安装，未重启（KNN 子进程文件对新搜索立即生效；manager-runtime.js 待下次 Gateway 启动）  ·  tag `v2026.9.1-db91.6-memory-search-fast-20261002`

**摘要**：memory_search 的向量检索子进程不再每次加载用不到的模块，启动从 1.37 s 降到 0.19 s，安装后立即生效。查询向量改为与关键词搜索同时进行，这一处要等下次 Gateway 重启。搜索结果不变。makaron 索引重建与实时索引服务 `v-memory-indexer` 在后续维护窗口上线。详见 docs/memory-search-latency-quality-20261002.md。

相对上一版 `v2026.9.1-db91.6-background-work-20261002`：3 个文件变化。

**经 VLab 发版 `memory-search-fast-20261002`**（claude-memsearch-20261002，dev `48aa6142`）
> 验收：2026-10-02 10:0x CST real makaron agent turns via vlab.mjs test (deliver:false): memory_search 5 calls all ok (6 hits each, correct top paths, provider gemini); sequential warm searchMs 3510/2738/2886 on the shared (old 1024-layout, unsynced) index right after cold start; first concurrent pair right after start 18.4/19.5 s (cold cache). 0 vector/KNN errors in Gateway log since deploy. Speed and re…
- `core` extensions/memory-core/manager-runtime.js  115e5f41 → c6f97543
- `core` extensions/memory-core/memory-search-knn.child.js  a106f839 → 97c542fb
- `core` manager-search-knn-NiSMMJUM.js  124e05bd → a9bd4092

**这期间合入 dev 的 PR**（1 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #140 perf(memory): memory_search p50 2.8s→1.6s, sync the frozen index

## v2026.9.1-db91.6-background-work-20261002

上线：2026-10-02 03:13 CST 安装并重启 Gateway（03:15 就绪）  ·  tag `v2026.9.1-db91.6-background-work-20261002`；03:16–03:40 生产飞书回归通过。

**摘要**：飞书回复卡片最后（footer 上面）多一行灰色小字，显示这个会话还有几个后台任务在跑、是什么类型（`⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1`），卡片关了也会继续更新，全部结束后变成 `☑️ 后台任务已结束`；worker、/vds、/vcc、/vcodex 四个 harness 都可见。同时修好 Codex 原生子 agent：父会话来了新消息后子 agent 不再丢失工具中继（生产 10/02 00:15 的故障），子 agent 结束后会自动唤醒父会话把结果发回群里。[完整验收](docs/acceptance/background-work-20261002.md)。

相对上一版 `v2026.9.1-db91.6-vcodex-sol61-20260930`：捕获内 5 个文件变化；另有捕获外 1 个文件：Codex 插件 `~/.openclaw/npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/thread-lifecycle-DAcEJ_Om.js` `0e575c99 → 94d5420f`（npm 管理的目录，不在捕获与漂移哨兵里）。

**经 VLab 发版 `background-work-20261002`**（feishu-task-status，dev `84eceb39`）
> 验收：2026-10-02 02:35-03:12 CST real Feishu via lark-cli (user identity), VLab group B oc_5afced47 and 'VLab 压测 01' oc_abfb8965. Background-work line (own element above footer, after body) on all four harnesses, each: visible during streaming, still visible after the reply, ended with ☑️: /vcodex sessions_spawn+exec peak 2 (2->1->done 104s); /vcodex native spawn_agent; /vcc sessions_spawn (done 86s); /…
- `core` plugin-sdk/agent-harness-task-runtime.js  04f713bc → 60913341
- `core` subagent-registry-C24yr_PF.js  f0b833de → c2c0c840
- `core` task-registry-activity-DSlVVJwD.js  65d88753 → 8a89045a
- `core` task-registry.store.sqlite-paxOzi9K.js  e0e43ff1 → 81c9d4b2
- `feishu` dist/monitor.account-WFdlCDhR.js  4d3ea59b → 69230132

- 运行文件备份与 undo.json：`/opt/v-release-backups/v2026.9.1-db91.6-background-work-20261002-*`。
- 共享 VLab 先上了只在 VLab 的 `vlab-codex-parity-20261002`，把 VLab 的 Codex 插件对齐到 V（V 不变）。

**这期间合入 dev 的 PR**（11 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #136 feat(feishu): show a session's running background work on its reply card
- #137 fix(codex): native subagents keep their tool relay across parent turns and wake the parent
- #135 V Browser 0.4.7: cross-harness candidate, shared VLab parity, release record
- #133 ops(v): V 系统盘每日在线镜像，保留最新 3 份
- #132 fix(nightshift): 重做的卡按自己的第几次记账，付费台账不再认成上一次
- #130 docs: 记录关掉 Codex canva 插件的配置改动与验收
- #131 fix(nightshift): Gateway 一进入暂停就让夜班暂停，不等重启广播
- #128 feat(nightshift): 要求修改后自动重做这一条；审批卡不能重试
- #129 fix(codex): 关掉从没用过的 Canva 插件，/vcodex 每轮省 3–4 秒
- #127 feat(nightshift): the board says when Night Shift holds for a Gateway restart
- #125 feat(nightshift): Gateway 重启时夜班自动暂停，回来后自动接上被打断的卡

## v2026.9.1-db91.6-vcodex-sol61-20260930

上线：2026-09-30 13:01 CST  ·  tag `v2026.9.1-db91.6-vcodex-sol61-20260930`；13:04–13:10 生产飞书验收通过。

**摘要**：`/vcodex` 接入 `openai/gpt-6.1-sol`，使用 Native Codex 与独立安装的 Codex CLI 0.159.2。配置启用脚本保留默认模型和其余设置，将生产旧 Sol 6 路由保留为 `/vcodex60`；默认在 Gateway 空闲 fence 就绪后停稳服务；用户明确授权暂停现有夜班并重启后，使用原生 preserve restart intent 交接在跑任务，停稳服务，再备份并更新 Gateway/Worker 配置、启动和检查就绪，避免在线配置监听提前重启。Gateway 已重启为 PID 635943，实际 app-server 使用 0.159.2 二进制。生产工具写入与独立文件 SHA 验证、无工具上下文续聊、旧 `/vcodex60` 实际回复均通过。[完整验收与停机异常记录](docs/acceptance/vcodex-sol61-20260930.md)。

相对上一版 `v2026.9.1-db91.6-feishu-ask-user-20260930`：2 个 core 文件变化，Worker 与飞书插件字节无变化。完整捕获逐文件对比已核对。

**经 VLab 发版 `vcodex-sol61-v1`**（PR #120，dev `f3f37d0d5e59fa7b5e50b92219a636e2aecbc7b5`）

- `core` model-route-contract-B2Q_03Gg.js：0524626e → efb465d2。
- `core` openai-chatgpt-provider-BApw3_oy.js：b464def9 → 46bc8cc0。
- 共享产物 SHA-256：`3894a443e7e2e7b3d8b017f852df4842ae0d2a7835356f57ae8d430f71f60fbc`，安装同一份产物。
- 客户端版本 0.159.2，Linux 二进制 SHA-256：`1748767b230ebfc3d4ab7e4e254920d0c0ad9691fd8c11f190e7d44511a4a92e`；旧 0.156.1 目录保留。
- VLab 真实飞书验收：`/vcodex` 返回 GPT 6.1 Sol；工具写入并回读 nonce，卡片 `om_x100b64f3ef9b9080b03537b4cd7ffc2`，服务端文件 SHA-256 独立核对；下一轮无工具回复 CONTEXT_OK，卡片 `om_x100b64f3e9d8fcacb107e9aec6b4cb3`；旧 `/vcodex56` 实际回复通过。
- 仓库捕获可重建检查：core 99、Worker 94、飞书 47 个文件，0 缺失、0 字节差异；V 漂移哨兵 8734 个文件，0 findings。
- 运行文件备份与 undo.json：`/opt/v-release-backups/v2026.9.1-db91.6-vcodex-sol61-20260930-20260930T044045`。
- 暂停新增 Night Shift 调度；用户随后明确授权暂停现有夜班、重启后恢复。原生恢复交接不取消外部 Makaron 出片，不清空任务状态，临时 SIGUSR1 停机策略禁止 SIGKILL，启用结束删除临时策略。5 个项目已恢复 active 与原 automaticDispatch；两个被重启中断的卡片由现有监控重派，一个 running、一个 ready 等待项目名额。第一次停机被依赖 timer 的启动请求取消，异常清理过早还原策略导致旧进程被 systemd SIGKILL；已暂停 companion timer 完成第二次正常停机，修正脚本的 timer 与异常清理边界，详见验收记录。

**发版后配置改动（2026-09-30 21:17 CST，不改运行字节，代码仓库有迁移脚本）**：关掉 Codex 应用插件 canva（`plugins.entries.codex.config.codexPlugins.enabled` 从 true 改为 false，插件列表保留），Gateway `openclaw.json` 和 Worker `experiments/agent-worker-isolation-v1/worker-openclaw.json` 两份都改（备份 `.before-codex-plugins-off-1790774237*`）。原因：每个 `/vcodex` 回合开始前，都要先查 canva 的插件与应用清单（`plugin/read` 联网 → `app/installed` → 再一次 `plugin/read`），每轮多花 3–6 秒；清单一直缺失所以从不缓存，而 Canva 从未被调用过。经 PR #129（dev `1d4db3b`）的 `lab/release-files/codex-plugins-off/activate-production.mjs` 受控重启生效：`--preserve-inflight` 原生交接，停服后才写配置，Gateway PID 635943 → 1141805，就绪后 worker 池 5、夜班按 #125 自动暂停并接上。共享 VLab 同步改动，用真实 ChatGPT 登录测了改前改后：用户消息 → Codex 线程就绪从 4.8 / 6.2 s 降到 0.3 s（热）。生产验收：回合开始前不再有任何插件请求，run 开始 → 线程就绪从 4.2 s 降到 1.8 s（热，剩下的是 80 MB 大私聊的本地计算）。[验收记录](docs/acceptance/codex-plugins-off-20260930.md)。

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
