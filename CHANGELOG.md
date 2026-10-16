# 生产 V 变更记录

每一节对应一个生产 V 的发版。标题就是 V 上的发版名，也是 git tag，对应 `release/captured/<发版名>{,.worker,.feishu,.codex,.dingtalk,.wecom}` 下的完整存档（钉钉、企微从 2026-10-05 起有；Codex 插件从 2026-10-14 起有，第一份是补捕获的 `v2026.9.1-db91.6-codex-ds-window-20261013.codex`，更早的发版没有 Codex 存档，那时 Codex 的改动是手写进各节的）。最新的在最前面。

- **文件变化**：由 `node scripts/release-notes.mjs --from <上一版> --to <这一版>` 生成。它把两个发版在 V 上的完整文件集合逐一比对，所以列出的就是 V 上真实变化的文件，不依赖谁的记忆。
- **来源**：每个变化的文件，都追溯到产生这份字节的 VLab 发版（负责人、dev 提交、验收证据）。追溯不到的，标为**流程外改动**，也就是在 V 上直接改的。
- **摘要**：由上线的人写一两句：为什么上，用户能感知到什么。
- **规则**：发版 PR（dev → main）必须包含这一节。CI（`tests/vlab-static.sh`）会检查：`release/captured/` 下每个发版在这里都要有章节。

流程见 `docs/vlab-v-sync-flow.md`。

---

## v2026.9.1-db91.6-projection-incremental-20261017

上线：2026-10-17 05:04 CST 装入，05:06 v-self-restart 生效  ·  tag `v2026.9.1-db91.6-projection-incremental-20261017`

**摘要**：会话分叉、回退、旁路追加之后，投影不再整段重建：从旧投影的有效前缀接着算，只重放新增行并找到与旧活跃路径的交汇点，主线程用一个写事务应用增量；无法证明安全的情况一律退回全量。用 V 数据副本测了马晴私聊、夜班群、Tianyi 主会话等 4 个会话：写入后到投影可读 4–7 s → 1.3–2.4 s，主线程最长停顿 2.8 s → ≤179 ms，投影与全量重建逐行一致，模型视图 A/B 零差异。

相对上一版 `v2026.9.1-db91.6-codex-inspection-budget-20261017`：3 个文件变化。

**经 VLab 发版 `projection-incremental-20261017`**（monitor-v-production，dev `f36d4a84`）
> 验收：共享 VLab 05:02 部署 #411。Gateway ready，错误 0、rebuilding 0；deepseek-flash 回合 exec echo 正确，/vds 回合 bash echo vds-f4-ok 正确。V 上 05:06 重启后 Cannot reap / InvalidConfig / claim / stream-ack / Cannot inspect Codex / rebuilding 均为 0，drift 0 findings。
- `core` session-transcript-index-9itOio9h.js  d0e05a56 → 7d14a3c0
- `core` session-transcript-reconcile-j5qhAafV.js  b63bdf05 → 9fac1d4a
- `core` config/sessions/session-transcript-reconcile.worker.js  95b9ddcd → 2fa289dd

## v2026.9.1-db91.6-codex-inspection-budget-20261017

上线：2026-10-17 04:11 CST 装入，04:13 v-self-restart 生效  ·  tag `v2026.9.1-db91.6-codex-inspection-budget-20261017`

**摘要**：大会话的 /vds（Codex 运行时）回合，空闲后第一句话不再报「Cannot inspect Codex processes. Process inspection exceeded its deadline」。原因是 Codex app-server 启动时登记子进程的身份读取沿用了 containment 的 2 s 时限，而同一时刻主线程正被有界历史读取占住约 2.6 s（Tianyi 主会话 10/17 03:28 复现）。现在这一步有独立的 15 s 时限并在超时时重试一次；containment 的 2 s 语义不变。共享 VLab 的 state/npm Codex 副本另行同步为同一字节后 align。

相对上一版 `v2026.9.1-db91.6-projection-checkpoint-20261017`：1 个文件变化。

**经 VLab 发版 `codex-inspection-budget-20261017`**（monitor-v-production，dev `0801d006`）
> 验收：共享 VLab 03:58 部署 #409（Codex 插件 transport-stdio-CyPldczm.js，before=V 线上字节）。Gateway ready，错误 0、Cannot inspect Codex 0；/vds 回合 bash(uname -m) → x86_64。candidate：主线程阻塞 2.6 s / 5 s 修复前 0/3、修复后 3/3，16 s 走重试 2/2（PR #409）。注意：VLab 当时加载的是 state/npm 副本，回合本身未覆盖新代码，已于 04:28 同步并重新 align。
- `codex` transport-stdio-CyPldczm.js  513e62dd → cd3d59c5

## v2026.9.1-db91.6-projection-checkpoint-20261017

上线：2026-10-17 03:39 CST 装入，03:40 v-self-restart 生效（51 s 就绪）  ·  tag `v2026.9.1-db91.6-projection-checkpoint-20261017`

**摘要**：大会话（马晴私聊 2.6 万行、夜班群 1.3 万行等）每轮回合开始的用户消息注解、媒体送达后的助手展示改写，不再让投影整段重建：之前每次改写都要在写锁里把整会话求和 1–5 s，然后后台整段重建 3–7 s，期间新消息（如生图完成后的续跑）直接报“正在重建”失败。现在投影原地保持最新，结果与全量重建逐行一致；仍需重建的分叉/回退期间，回合会等待而不是失败。V 上验收：专用会话 flash 与 /vds 回合正常，投影保持最新，重启后“重建中”报错 0。

相对上一版 `v2026.9.1-db91.6-subagent-lazy-store-20261017`：3 个文件变化。

**经 VLab 发版 `projection-checkpoint-20261017`**（projection-checkpoint，dev `b5c8ddff`）
> 验收：共享 VLab 03:35 部署 #405（3 个 core dist：session-transcript-index、session-accessor.sqlite-transcript-store、builtin-openclaw；before 均等于 V 线上字节）。Gateway ready。专用会话 agent:makaron:explicit:vlab-dev-projection-checkpoint-1792179366 真实回合：deepseek-flash(vlab-worker) exec echo flash-ok → 回复 flash-ok（12 s）；/vds 切换后 Codex 回合 exec echo vds-ok → 回复 vds-ok（15 s）。回合开始的 Codex 原生注解改写已写入（user seq 9 mirrorOrigin=codex-a…
- `core` builtin-openclaw-zQV8Wwjr.js  71c2310a → a44b846a
- `core` session-accessor.sqlite-transcript-store-DV0WFe1a.js  0592e1cd → 74fba951
- `core` session-transcript-index-9itOio9h.js  5504f5de → d0e05a56

## v2026.9.1-db91.6-subagent-lazy-store-20261017

上线：2026-10-17 02:44 CST（V 与 VLab 对齐时间）  ·  tag `v2026.9.1-db91.6-subagent-lazy-store-20261017`

**摘要**：子代理相关查询改为按 key 只读需要的行，不再每次整表解析会话库（#404），去掉每次 1.4–1.6 s 的 Gateway 主线程读取。本节由 #405 的上线会话代为补记，捕获内容为 promote-to-v 生成的原样文件。

相对上一版 `v2026.9.1-db91.6-subagent-settle-20261016`：3 个文件变化。

**经 VLab 发版 `subagent-lazy-store-20261017`**（monitor-v-production，dev `56721d76`）
> 验收：共享 VLab 02:27 部署 #404（F1，3 个 core dist：session-accessor.sqlite-entry、subagent-capabilities、subagent-completion-admission.store；before 均等于 V 线上字节）。Gateway ready，journal 错误 0、Cannot inspect Codex 0、SessionCanonicalKeyMigration 0。真实回合 vlab-dev-1792175398784：exec(date) → sessions_spawn 子代理(exec echo sub-ok-1017) → sessions_yield → 子代理完成回传 → 最终回复 2026-10-17 / sub-ok-1017，子代理深度/权限/完成清理路径全部走到且行为不变。等价性与耗时…
- `core` session-accessor.sqlite-entry-BlklNPKQ.js  6b12190c → a15b1426
- `core` subagent-capabilities-CPAHEjL-.js  76ac1cc6 → 4ee0a32e
- `core` subagent-completion-admission.store-JmpNDYTF.js  ee0d42e6 → c106a6ce

**这期间合入 dev 的 PR**（7 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #406 release: 投影检查点上线计划与真实回合 A/B 记录（#405 后续）
- #405 fix(sessions): 原地改写不再让大会话整段重建投影（投影检查点）
- #404 perf(sessions): 子代理查询只读需要的行，不再整表读会话库
- #402 fix(v-gateway): Gateway 单元禁用 swap，消除 10/16 的 50–70 秒冻结
- #403 perf(sessions): bound sharing metadata reads to the selected page
- #401 release: record PR399 production deployment and acceptance
- #400 Avoid full Workboard histories during lifecycle reconciliation

## v2026.9.1-db91.6-subagent-settle-20261016

上线：2026-10-16 23:33 CST。生产已部署；发布留档与标签状态以对应 PR 为准。

**摘要**：已结束、无需用户通知的子任务会正确结算；原生子任务完成通知和父会话让出等待的凭据完整穿过 Worker 回传，避免后续完成通知无法续接或出现错误提示。

相对上一版 `v2026.9.1-db91.6-voice-task-continuity-20261016-r3`：6 个运行时文件变化。全部来自已验收 VLab 发版 `subagent-settle-completion-20261016e`，源提交 `24ad9998da030cfafb51089b6c1a62d43ea73793`；artifact SHA `a465dd0a42bea1e8b040373de17cc51399179e7c335bf05bca92130c8054149e`。PR #399 经 CI 通过后合入 dev。#398 与 Night Shift #12 不在此次生产字节变更中。

- `core` builtin-openclaw-zQV8Wwjr.js  5638a3b7 → 71c2310a
- `core` embedded-agent-DaSvA-Yk.js  a53fe92d → bcb20f5d
- `core` subagent-announce.requester-settle-wake-B2NSziIo.js  be8a3f7f → ec4c192b
- `core` subagent-registry-read-UaDFTyfW.js  dfcf09fa → 142bb515
- `core` subagent-registry.store.sqlite-hzGu4QSk.js  bc42d6c4 → f37ed94d
- `worker` harness-result.mjs  76840da2 → 0c52961a

本次补齐 Codex 插件 72 文件的发版存档及漂移检测覆盖。其字节与 `v2026.9.1-db91.6-codex-ds-window-20261013.codex` 完全相同；不表示本次修改了 Codex 插件。

**验证**：`v-self-restart` 请求 `20261016-233206-0495`，56 秒就绪，5 个 Worker ready；配置未改，Night Shift 服务未重启。安装前静默待结算积压 194，重启后为 0；逐 runId 验证 194/194 原行仍在，待结算字段全部清除。生产飞书普通、双子任务、单子任务最终消息各一条，三个实际 exec 输出已核验。Night Shift 自动接续 10 卡、转交人工 0，已有新的执行与成功结果。

**边界**：部分卡片仍 blocked，原因待核实；压力 hold 与夜班峰值性能没有被本轮验收证明已解决。运行时回滚备份、逐文件 SHA、真实消息与执行证据见 [生产验证](docs/experiments/subagent-completion-projection.md#生产推广2026-10-16) 和 [结构化回执](docs/experiments/subagent-completion-projection.production.json)。

## v2026.9.1-db91.6-voice-task-continuity-20261016-r3

上线：2026-10-16 08:43 CST  ·  tag `v2026.9.1-db91.6-voice-task-continuity-20261016-r3`

**摘要**：语音挂断与后台任务解耦；任务可原生派生子任务、让出等待并续接，GPT Live 与豆包共用任务控制机制。

相对上一版 `v2026.9.1-db91.6-upstream-5xx-fallback-20261015`：5 个文件变化。

**经 VLab 发版 `voice-batch-shared-20261016e`**（voice-batch-shared-01a0fb0e-20261016，dev `3e97ae41`）
> 验收：Frozen Voice a9ac5168 (177 files, 5caf0813) and five core files revalidated in shared VLab. 2026-10-16 08:20-08:23 actual GPT Live and SeedDuplex synthetic natural speech -> real ASR -> native child spawn/yield/exec and parent announce -> hangup -> Feishu final message independently read back (49.263s /39.771s). Actual steer and followup both in final, foreign owner denied. Five ready idle workers…
- `core` agent-run-control-BeeIeTBf.js  03402763 → 8219c5e8
- `core` runs-5WnDPZ0V.js  40799973 → 056243f5
- `core` subagent-announce-delivery-Dosep7Zr.js  8cd70a86 → 6269e1bd

**经 VLab 发版 `voice-e7-lifetime-20261015d`**（voice-e7-01a0fb0e-20261015，dev `17dff81d`）
- `core` talk-DkFuKRod.js  dc6d6e9f → 80d9cec1
- `core` voice-task-lifetime.js  — → 49a8bf6e

**这期间合入 dev 的 PR**（8 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #392 fix(ops): wait for delegated Worker cgroups to empty
- #391 fix(ops): drain service children before restart configuration
- #390 fix(ops): honor restart lifecycle readiness budgets
- #389 fix(ops): block config writes while Gateway stop is incomplete
- #388 feat(release): consume the standalone Voice manifest safely
- #385 fix(voice): wait for canonical parent projection before continuation
- #374 fix(realtime-voice): preserve trusted run authority for task control
- #378 release: V v2026.9.1-db91.6-upstream-5xx-fallback-20261015 捕获与 CHANGELOG（#375 #377；模型改回 DeepSeek + luna 备用；超时 90 s）


### 独立 Voice 入口与插件（旁路登记）

- 仓库 `vegekyd-sys/v-voice`，冻结提交 `a9ac516860a8856470262957ad6ea0cc2670cb0e`；177 文件，清单 SHA `5caf0813a241cde4968eb9a8c2b76e7dd43abcc77235be53224cfb9474c23c6c`。实际 Gateway 插件路径和 rtc-h5 进程入口均指向该 release。Voice #10–#19、#21、#22；#18 已整合 #17。#2 多账号、#20 草稿未纳入，Grok 不在本轮模型验收范围。
- 详细登记：[manifest](release/voice/voice-a9ac5168-20261016/manifest.json)、[逐文件清单](release/voice/voice-a9ac5168-20261016/artifact-manifest.json)、[核对方式](release/voice/voice-a9ac5168-20261016/README.md)。**漂移哨兵不覆盖 Voice 目录**，必须另查实际插件配置、实际 H5 进程路径及全部 177 文件哈希。不能拿 core 的 0 findings 代替 Voice 校验。
- 入口启用专用飞书 CLI 和 `VOICE_GPT_PROVIDER=v-voice-gpt-live`、`VOICE_HOST_CALL_CONTROL=1`，默认豆包 SeedDuplex。首次入口激活遗漏后两项既有开关，已先回滚入口、修正 Voice profile 后通过官方入口控制器重新激活；没有热改产品文件，没有再次重启 Gateway。原始失败记录保留。

### 实际验收与限制

- 共享 VLab：GPT / 豆包自然口述（合成麦克风）→ 真实 ASR → 子任务 spawn / yield / exec → 原生父任务续接 → 挂断 → 飞书独立读回，分别 49.263 / 39.771 秒收到最终结果。
- V 生产：两款模型各用独立标识，真实子任务与工具时间匹配；挂断后分别 47.448 / 49.074 秒收到最终群消息，已独立读回。steer、followup 均进入最终结果，异主调用被拒。相同标识复用旧结果的负例和日期格式误判均保留，不计为新鲜工具成功。
- 两款模型最终回复插话已验证；报告打开、滚动及收起后的手机视口布局已验证。真实 iPhone Safari 未复测。GPT 一次口述结束因“下次再聊”与页面固定文案不同而停留 ending：已定位、单独修成隔离前端候选补丁，**本版未声称该变体已修复或全项通过**。
- 正式 Gateway 重启使用 `v-self-restart`，请求 `20261016-084228-af39`，71 秒就绪；主服务本次新 invocation 日志 err/关键错误均 0，夜班恢复 up。未增加“不强杀进程”配置，`SendSIGKILL=yes`。此前两次 preflight 因只读 `agent.wait` 观察连接退出，并未重启 Gateway。
- 系统盘 17,287,241,728 字节旧备份在 vdb 副本 SHA 校验通过后删除；原路径只留符号链接，未做第二份大备份。系统盘约 53 GB、vdb 约 27 GB 可用。生产六个 Voice Candidate / tunnel 均已停止，未重新启动。
- 共享 VLab 已再次 align 且 lease 已释放。Voice 源码开关与密钥、用户聊天和音频、数据库均不进入本登记。


## v2026.9.1-db91.6-upstream-5xx-fallback-20261015

上线：2026-10-15 13:01:57 CST 生效（12:58 装到 V；`v-self-restart` `20261015-125959-9db6`，同一次重启让 history-image-e3 一起生效）  ·  tag `v2026.9.1-db91.6-upstream-5xx-fallback-20261015`

**摘要**：#375 + #377。上游 DeepSeek 返回 503 / too busy / 429 / 5xx，或者首个 token 前超时，现在会切到备用模型，不再让用户干等几分钟后看到一句英文错误。10/15 上午 DeepSeek 官方故障（部分中断约 4 小时）期间，V 配了 fallback 却一次也没切过去。
- 根因有三处：9.1 把对端已经回复的 5xx 判成 timeout；worker 失败跨 IPC 回到 Gateway 后，一律被标为不可安全重放；工具执行后遇到 503 直接把错误抛给用户。
- 修复：回移上游 776f76b4b87（对端回复的 5xx 判为 server_error）；有备用模型时，同模型只重试 1 次；worker 跨 IPC 保留状态码，满足条件时交给 Gateway 的 fallback 链；工具执行后遇到 429/5xx，同模型从转录续写，最多 3 次，失败后给中文提示。
- candidate 证据：A = V 原字节，B = 补丁后。worker 路径 503/429/500/504：A 7–10 s 后英文错误、0 次 Grok 请求；B 2.2–4.9 s 看到备用回复。200 后不出 token：A 68 s，B 33 s。（candidate 87895664、cb510391、d66a5bae）
- #377 把 worker.mjs 里写死的 `../core/node_modules/@openclaw/ai` 改成从 worker 正在用的 core 推导。这一行来自 V 的 agent 09:45 热装的 heartbeat-v2 guard；它在 VLab 的目录结构下会让 worker 池起不来。

**同一次重启里的配置变更**（主配置和 worker 那份配置都改了；备份 `/root/{openclaw,worker-openclaw}.json.before-deepseek-back-20261015`）：
- DeepSeek 已恢复：makaron 恢复为 `deepseek/deepseek-flash`，short-v、dealclaw、xiaoai 恢复为 `deepseek/deepseek-v4-pro`，defaults 也恢复；**fallbacks 一律改为 `["openai/gpt-6-luna"]`**（Tianyi 定：主 DeepSeek、备用 Luna）。压缩模型恢复为 deepseek-flash。10:04–13:01 期间临时用 luna 当主模型。
- `models.providers.deepseek.timeoutSeconds` 300 → 90。

**过程记录**：
- 12:2x 为了让共享 VLab 能对齐，先把 V 上 09:45 那份热修撤回到 3e66b4b3（备份 `/root/incident-20261015-heartbeat-revert/`）。
- 本次发版用 #377 修好路径的版本重新带上 heartbeat-v2 guard（`heartbeat-v2-stream-guard.mjs` 51f6aeea 字节不变，所以上面的列表里没有它）。

相对上一版 `v2026.9.1-db91.6-history-image-e3-20261015`：9 个文件变化。

**经 VLab 发版 `upstream-5xx-fallback-20261015b`**（monitor-v-production，dev `7d6e0636`）
> 验收：共享 VLab 12:38 部署 #375+#377（10 文件，worker.mjs 3e66b4b3→198bd1f5 + heartbeat-v2-stream-guard 新增）：worker 池 14 进程正常、ERR_MODULE_NOT_FOUND/plugin service failed 0、journal err 0；vlab.mjs test 会话 vlab-dev-accept-377b-1792039585701（deepseek-flash, vlab-worker）记暗号/exec 工具 391/复述 3/3 正确各 5 s。fallback 切换以 candidate 87895664/cb510391/d66a5bae 为证（VLab makaron 无 fallbacks，xai/openai 无 key 测不到）
- `core` agent-command-DPfawBbr.js  1805b686 → d63e3307
- `core` builtin-openclaw-zQV8Wwjr.js  3e07c3fa → 5638a3b7
- `core` classify-Dm9sTbZz.js  98ea918d → a69e44f5
- `core` embedded-agent-DaSvA-Yk.js  142d248f → a53fe92d
- `core` embedded-agent-helpers-CzpaLpCq.js  79f7f268 → 63002d77
- `worker` harness-failure.mjs  3be999ce → 89419679
- `worker` index.mjs  4f6894da → cfa0e687
- `worker` worker-pool.mjs  197ec4a8 → f6ca5d76
- `worker` worker.mjs  18c949c3 → 198bd1f5


回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-upstream-5xx-fallback-20261015-20261015T045729`（需重启）。配置用上面的备份还原。

## v2026.9.1-db91.6-history-image-e3-20261015

上线：2026-10-15 11:28 CST 装到 V（未重启；随 12:30 窗口的重启生效）  ·  tag `v2026.9.1-db91.6-history-image-e3-20261015`

**摘要**：#355 + #345 合并发版（PR #372）。
- **#355 历史图片不再重复缩放**：早就被裁掉的历史图，每轮都在 worker 主线程上从 2048 px 重新缩到 1200 px，单张约 0.45 s。共享 VLab 真实飞书里，会话已有 8–12 轮带图时，命令→首次模型调用从 9.6–11.4 s 降到 7.3–8.5 s。模型请求逐字节不变；`OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0` 可以关掉。
- **#345 DeepSeek 图片预算补漏（E3）**：provider 那一份按图片计数；中文提示能真正发到用户。

**另外 1 个文件不在 core 捕获范围内**（捕获只覆盖 `dist/`），按安装计划手写：
- `core` node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs  6a34cb79 → 915ac13d

**下面两个「流程外改动」是 V 自己的 agent 改的**（2026-10-15 09:45–09:53 CST，用户 openclaw，从 workspace 用 `sudo install` 安装）：只给 2 个 heartbeat-v2 定时任务加了「30 s 内必须见到首个 SSE 事件」的传输期限，是在 DeepSeek 故障期间加的。10:04 重启后已经生效。#375 以这份字节为底本，所以先保留，Tianyi 可以决定撤回。

相对上一版 `restart-speed-2-reconcile-20261014`：6 个文件变化。

**经 VLab 发版 `history-image-e3-20261015b`**（claude-history-image-e3，dev `e8e01051`）
> 验收：#372（dev 5aa37e2f/打包 e8e01051）5 文件，线上哈希核对一致。真实飞书「VLab 发布验收 B」vlab-worker/deepseek-flash 16 回合（12 张 4032x3024 图 + view_image + 4 次汇总）16/16 正确。同深度 A/B（rollback→V 字节 vs 重新部署）：命令→首次模型调用 A 9.6–11.4 s vs B 7.3–8.5 s；第二次调用准备差异仅出现在 DeepSeek 503 重试回合，candidate 9745f5af/73492e00 受控对比无差异。journal err 0；503 为上游（V 同期也有）。证据 ~/v-upgrade-private/history-image-e3-20261015/shared-vlab-evidence.md
- `core` agent-runner.runtime-CAdsMsQt.js  75b5b4b1 → 8c192b9d
- `core` embedded-agent-DaSvA-Yk.js  22dad1ef → 142d248f
- `core` embedded-agent-helpers-CzpaLpCq.js  342e6269 → 79f7f268
- `core` history-image-prune-Dg0CDQ4a.js  2811753f → dbe28902

**流程外改动**（这些字节没有由任何 VLab 发版产生，是在 V 上直接改的）：
- `worker` worker.mjs  3e66b4b3 → 18c949c3
- `worker` heartbeat-v2-stream-guard.mjs  — → 51f6aeea

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-history-image-e3-20261015-20261015T031107`（需重启；包括 node_modules 下那个文件）。

## restart-speed-2-reconcile-20261014

上线：2026-10-14 16:33 CST 生效（16:32 装到 V）  ·  tag `restart-speed-2-reconcile-20261014`

**摘要**：Tianyi 于 2026-10-14 批准（「同意上 V，启动计时也打开，跟其他有效果的 PR 一起上」）。合并两项：
① #368：重启后第一条消息不再在 worker 里等 Gateway 解析密钥。worker 每一轮都通过 `secrets.resolve` 解析 agent 运行时
SecretRef，原来超时 30 s，Gateway 要等 worker 池起来才应答；现在 worker 里最多等 3 s，之后本地解析，结果相同。
② #360 的 worker 一半：会话投影重建的 reconcile worker 改为只读打开，每行只读一遍，不再在 agent 库上开不带标签的
IMMEDIATE 写事务。

**上 V 实测**（16:33:29 经 `v-self-restart` 计时重启，临时开 `OPENCLAW_GATEWAY_STARTUP_TRACE`，测完已移除）：
- 第一条消息：进入 worker 后 3 s 回退本地解析，4.4 s 开始准备 prompt（10/13 是 8–18 s）。
- 这次重启飞书连上 51 s、首个 worker 56.9 s、ready 63.8 s，比 10/13 的 31/37/43 s 慢。trace 显示多出来的在
  `cli.main.gateway-run-bootstrap`（18.6 s，10/13 08:48 约 6 s）：cron-repair、plugin-index-persistence、config-snapshot
  ×5 等启动迁移/修复，OpenClaw 只在配置或构建指纹变化后才重跑；两次之间 V 有过别的发版和配置改动，待下次同配置重启确认。
- Gateway 就绪后主线程卡 15 s + 8 s（16:34:35→16:35:01），第一条回复因此 45 s 才出现（模型首字只用了 6.8 s）。
  对比历次重启，这段卡顿一直存在（10/12 22:14 改动前 33 s、10/13 23:08 16 s），不是本次引入，作为下一轮目标。
- 原生校验器 16:39 开始、17:06:26 9 项通过（27 分钟，下午负载下）；期间 liveness 告警 7 次，之前 33 分钟 8 次。
- NRestarts 0，无 restart recovery claim、Cannot reap、EROFS。

相对上一版 `v2026.9.1-db91.6-codex-ds-window-20261013`：2 个文件变化。

**经 VLab 发版 `restart-speed-2-reconcile-20261014`**（claude-restart-speed，dev `63e988b1`）
> 验收：合并 release（#368 + #360 worker 一半），dev 63e988b1。restart-speed（#368）：candidate 配置加 V 那类 SecretRef，worker 进程探针 Gateway 启动期间 secrets 解析 18.2 s→3.2 s 后本地解析、值相同，就绪后 171→180 ms 经 Gateway 不回退（candidate-3136aa98/46d299bd）；共享 VLab 16:08 受控重启 RS2C：8/8 沿用、飞书 24.6 s、首 worker 38.6 s、ready 45.0 s，重启后 27.5 s 发消息 48.5 s 见回复（vlab-worker），exec 回合 worker 执行并原样回复随机 UUID。#360 worker：~/v-upgrade-private/restart-speed-2-…
- `core` command-secret-gateway-DCJZ8pGz.js  d139c36e → f28f2fbe
- `core` config/sessions/session-transcript-reconcile.worker.js  9e676169 → 95b9ddcd

## v2026.9.1-db91.6-codex-ds-window-20261013

上线：2026-10-13 23:09 CST 生效（22:40 装到 V；`v-self-restart` `20261013-230822-e668`，23:08:53 停 → 23:09:49 ready，56 s）  ·  tag `v2026.9.1-db91.6-codex-ds-window-20261013`

**摘要**：#361，/vds（Codex + DeepSeek）按 DeepSeek 的真实窗口（100 万 token）压缩，不再按 GPT 默认的 24.48 万。上线前 V 上 DeepSeek 线程每小时压缩约 1.56 次（10/13 共 55 次），每次压缩要读整段历史、回复变慢；上线后到 10/14 15:00 压缩 0 次，"oversized thread" 日志 52 → 0。

相对上一版 `v2026.9.1-db91.6-tooling-prepare-20261013`：core / worker / 飞书 / 钉钉 / 企微 0 个文件变化。变化全在 Codex 插件里；Codex 插件不在捕获范围内（`scripts/lib/runtime-components.mjs`：V 与 VLab 有意跑不同版本），以下按 V 上的安装计划 `/opt/v-release-backups/v2026.9.1-db91.6-codex-ds-window-20261013-20261013T144039/plan.json` 手写：

**经 VLab 发版 `codex-ds-window-20261013`**（dev `ebca7d5c`；验收记录 PR #364）
- `codex` run-attempt-D1hJO4fX.js  bb0b0354 → 8ab51650
- `codex` v-deepseek-model-catalog.json  （新增）→ 6df9d13d
- `codex` v-deepseek-base-instructions.md  （新增）→ 3b08633f

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-codex-ds-window-20261013-20261013T144039`（需重启）。

## v2026.9.1-db91.6-tooling-prepare-20261013

上线：2026-10-13 21:49 CST 生效（21:24 装到 V；`v-self-restart` `20261013-214736-a0c8`，21:48:08 停 → 21:49:09 ready，61 s，清掉 3 条 Codex 孤儿登记）  ·  tag `v2026.9.1-db91.6-tooling-prepare-20261013`

**摘要**：两件事一次重启。
- **#360（主进程那一半）会话投影重建每行只读一遍。** `sessions.transcript-index.prepare` 在主线程同步跑，上线前每小时 12.3 次慢操作、最长 21.1 s；上线后到 10/14 11:00 每小时 4.3 次、最长 8.6 s。顺带 `sessions.history.read` 慢操作 4.5/h → 0.9/h，等写锁导致的回合失败 0.83/h → 0.46/h。worker 只读打开那一半没上：共享 VLab 的发布工具拒绝路径含 `sessions/` 的目标文件，拆到下一批。
- **#358 群聊换人说话不再换 Codex 线程。** 群 oc_88d96b7e 之前每换一个发言人就新开线程、重放整段历史并频繁压缩；现在成员续用群主线程。单独效果和 #361 混在一起，分不出来。

同一晚 22:00 另外装了 #363（`/opt/v-sentinel/v-memory-indexer*`，旁路组件，不走 promote）：v-memory-indexer 的密钥改用 execve 环境传入，进程命令行上不再出现任何密钥（上线前 60 个）。

相对上一版 `v2026.9.1-db91.6-claim-workboard-20261013`：core 1 个文件变化，另有 1 个 Codex 插件文件（不在捕获范围内，按安装计划手写）。

**经 VLab 发版 `tooling-prepare-20261013`**（transcript-index-prepare，dev `94e1ba39`）
> 验收：~/v-upgrade-private/tooling-prepare-20261013/shared-vlab-evidence.md：飞书 vlab-worker 12 回合全对、无干扰批首字 4.3/4.7/4.5/5.1 s 与 claim-workboard 持平、journal ERROR 0；#358 toolset 2 线程、成员 3 次续用主人线程、暗号全对、conversations_list 被拒；#360 上线 chunk 对共享 V 数据副本 4176 会话 prepare 与 V 原版 0 差异（candidate-4f7c12e1）
- `core` session-transcript-index-9itOio9h.js  ae034fcf → 5504f5de
- `codex` thread-lifecycle-DAcEJ_Om.js  a9f76cf4 → 4cceab62

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-tooling-prepare-20261013-20261013T132420`（需重启）。

## v2026.9.1-db91.6-claim-workboard-20261013

上线：2026-10-13 17:31 CST 生效（17:16 装到 V；`v-self-restart` `20261013-173030-4f8e`，17:30:36 停 → 17:31:28 ready，51 s，清掉 3 条 Codex 孤儿登记）  ·  tag `v2026.9.1-db91.6-claim-workboard-20261013`

**摘要**：Tianyi 10/13 同意 PR 评估（docs/pr-triage-2026-10-13.md）的今晚批次，两件事一次重启。
- **#353 重启恢复认领不再把群永久卡死。** 消息准入时会话转录投影正在重建，准入写入抛错后恢复认领留在会话上，此后这个群每条消息都报 `restart recovery claim changed`，只有重启能解开。10/12 13:00–23:00 CST 有 4 群 1 私聊被卡（日志 2,128 行），回复最晚迟到约 3.5 h。现在写入失败会按本控制器自己的 run id 恢复会话原状态、清掉认领，同一条消息的重试正常被接纳。
- **#314 派卡只读需要的卡。** 启动卡片时 `buildWorkerContext` 和父卡检查不再全量读看板（4000 多张卡）。上线前 V 上 `dispatchWithOptions` P50 约 1.2 s（10/12 22:18 起 18 h 共 187 次、合计 235 s 主线程）。

**上 V 实测（重启后）**：`dispatchWithOptions` 前 4 次 150 / 182 / 231 / 279 ms（上线前 P50 1.20–1.27 s）；`restart recovery claim changed` 0。夜班随重启自动 holding → resuming（0 项需人工）。重启后 17:33 有一条私聊 Codex 回合报 `Cannot inspect Codex processes … exceeded its deadline`（重启后进程检查超时，10/06、10/12、10/13 10:55 都出现过，与本次无关），用户 17:34 起的消息正常处理。#353 的错误路径要等下一次投影重建时准入才会触发，判据是之后 `restart recovery claim changed` 仍为 0。

相对上一版 `voice-streamed-hangup-20261013b`：3 个文件变化。

**经 VLab 发版 `restart-recovery-claim-release-pr353-v1`**（pr353-regression，dev `ecc162ba`）
- `core` reply-admission-ticket-QG2vY13O.js  3001280f → 078c3742

**经 VLab 发版 `claim-workboard-20261013`**（pr-triage-batch-20261013，dev `b97766d3`）
> 验收：~/v-upgrade-private/claim-workboard-20261013/shared-vlab-evidence.md：#314 真实 RPC 父卡拦截/放行、派卡 339–392 ms、worker 提示父卡结果与最近完成工作逐项正确；飞书 vlab-worker 8 回合全对、热态首字 4.4–4.8 s 与部署前持平、ERROR 0；#353 错误路径为单元复现
- `core` runtime-api-1CCazqtv.js  6ea87f96 → 95373b6e
- `core` sqlite-store-CH-caj1l.js  321499f3 → 90437478

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-claim-workboard-20261013-20261013T091621`（需重启），只换回这 3 个文件。

## voice-streamed-hangup-20261013b

上线：2026-10-13 10:22 CST 装到 V（备份 `/opt/v-release-backups/voice-streamed-hangup-20261013b-20261013T022215`），Gateway 业务排空后受控重启生效  ·  tag `voice-streamed-hangup-20261013b`

**摘要**：Voice 控制修复（Voice #4/#5，已合入并上线 85d18ab）：后台任务还在跑时挂断能干净结束；Agent 最终回复期间用户插话，回复听得见且不再续读。Gateway 侧只更新 #344 已合入的实时委派控制器一个文件，没有新增 exec 准入、权限或 Worker 改动；最终字幕修复只切换 Voice 入口。

相对上一版 `restart-speed-20261013`：1 个文件变化。

**经 VLab 发版 `voice-streamed-hangup-20261013b`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `ecc162ba`）
> 验收：/Users/tianyicai/v-upgrade-private/voice-native-turn-control-20261012/streamed-hangup/acceptance-report.md；真实WebRTC+Agent final插话后回复听得见且不续读；后台查询未返回时挂断，最后转录到Gateway close 7.940秒，WebRTC closed、空白拨号页、mic sender disabled；Voice 57a774df，153文件0884f80922900d7bf49ae7e712fb1fe85498f9913665c591f991ea1ee49e08df。
- `core` realtime-quicksilver-delegation-controller-B0yPpiHp.js  7ddf7fae → 3e098e6a

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/voice-streamed-hangup-20261013b-20261013T022215`（需重启）。

## restart-speed-20261013

上线：2026-10-13 08:30 CST 生效（08:20 装到 V，08:26 首次重启）  ·  tag `restart-speed-20261013`

**摘要**：Tianyi 于 2026-10-13 批准（「发吧 如果有问题注意回滚 新重启速度注意计时」）。V 重启到能用从约 200 s 降到约 40 s：干净重启时 8 个 agent 库（22 GB）沿用上一生命周期的全量检查，不再每次启动前重读（崩溃、重启宿主机、撤销、过期、文件变化仍全量）；worker 预热不再和 Gateway 互相等 30 s 的 `secrets.resolve`；worker 用上 dist 解析快路径，Gateway/worker 开 Node 编译缓存。同时装 drop-in `restart-speed.conf`（`ProtectControlGroups=no`），V 的原生后台校验器从 10/05 起一直 EROFS 失败，现在每次启动后约 5 分钟和每天全量检查一次。

**上 V 实测**（`lab/restart-speed-accept.mjs --target v`，经 `v-self-restart`，秒，从发起重启算）：

| | 上线前典型（10/10–10/12） | 首次重启 08:26（无上一生命周期记录，仍全量） | 计时重启 08:30 |
|---|---|---|---|
| db91 预检 | 110–112 | 129 | 0.03（8/8 沿用） |
| 飞书连上 | ≈148 | 171 | **31.3** |
| 首个 worker 就绪 | ≈193 | 180 | **36.6** |
| `[gateway] ready` | ≈199 | 187 | **43.4** |
| 连上后发消息 → 看到回复 | — | 173 → 214 | 32.7 → 62.5 |

worker 预热 40–45 s → 7–13 s。重启后两次 exec 回合（08:31、08:32）均由 vlab-worker 执行，转录里 exec 结果与回复的随机 UUID 一致。08:43:52 原生校验器 9 项通过、0 失败（V 上自 10/05 以来第一次）；全程 NRestarts 0，无 liveness 告警、无 restart recovery 报错。未达 30 s 的部分：Gateway import/插件到飞书连上约 29 s；重启后第一条消息从进入 worker 到开始准备 prompt 约 18 s（第二条起 1–10 s），原因待查。

相对上一版 `v2026.9.1-db91.6-mirror-facts-identity-20261012`：7 个文件变化。

**经 VLab 发版 `restart-speed-20261013`**（claude-restart-speed，dev `640a60f6`）
> 验收：共享 VLab 2026-10-13 02:20 受控重启（lab/restart-speed-accept.mjs RS1）：db91 8/8 库沿用上一生命周期全量检查，预检 29 ms（部署那次重启无记录全量 193 s）；飞书 WS 23.7 s、首个 worker 37.3 s、gateway ready 43.4 s（部署那次约 234/253/257 s）；重启后 25.8 s 在「VLab 发布验收 B」发消息，53.3 s 看到回复，Runtime vlab-worker；exec 回合 7.4 s 由 worker 执行并原样回复随机 UUID；启动后原生校验器 9 项通过、0 失败，8 个 agent 库收据全部换成 native-verifier-child；worker 预热 15–19 s，快路径/编译缓存/secrets 不阻塞均生效。candidate：59…
- `core` agent-command-DPfawBbr.js  e3cab0b4 → 1805b686
- `core` index.js  3f485880 → fe549415
- `core` db91-integrity-bootstrap.mjs  7c276dfa → 87b7fa47
- `core` db91-restart-carry.mjs  — → 5f18d635
- `worker` worker.mjs  8b466a60 → 3e66b4b3
- `worker` compile-cache.mjs  — → fc88a3a9
- `worker` dist-esm-resolve-fast-path.mjs  — → 9a14e717

**这期间合入 dev 的 PR**（3 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #350 V 重启提速：db91 检查干净重启沿用、worker 不再等 30 秒、启动缓存、修复 V 后台校验器
- #344 Gateway: keep a minimal GPT Live result-delivery seam
- #349 fix(sentinel): 用户收不到回复时报警；夜班卡片消息不再进哨兵群

## v2026.9.1-db91.6-mirror-facts-identity-20261012

上线：2026-10-12 22:18 CST（v-self-restart 就绪）  ·  tag `v2026.9.1-db91.6-mirror-facts-identity-20261012`

**摘要**：转录镜像查重（`session.transcript.mirror-facts`）在会话投影被标脏时，不再把整段转录读进主线程，改查 identity 表（PR #315）。起因：10/12 16:50–17:24 V 整体不可用，当天 mirror-facts 慢事务累计 426 次，是 Gateway 主线程最大的同步读取来源（16 点 45 次/77 s、17 点 137 次/190 s）。

**证据分两类**：
- 修复本身：VLab candidate `e431fff2`，与上线字节相同，36,505 条事件的标脏会话 1,278 ms → 13 ms，插桩证明原版整段读、补丁走 identity，原版写出 V 同款慢事务日志 7 条、补丁 0 条；candidate `424706ba` 对 V 数据副本全库比对 identity 与整段读 0 差异。
- 回归：共享 VLab 部署后真实飞书 /vds 回合正确、转录无重复，首字热态不慢。共享 VLab 没有标脏会话，这部分不覆盖修复路径。

**上线**：Tianyi 在 pr315 验收 session 说「你上线去吧」。`promote-to-v.mjs` 22:04 装字节（捕获步骤因丢包失败，22:2x 补跑捕获、哨兵、align）；`v-self-restart` `20261012-221418-1949`，22:18:12 就绪（203 s），worker 5，Codex 孤儿登记清掉 2 条。

**上线后**：重启前 21:00 起繁忙大会话已安静，标脏重建（transcript-index.prepare）与 mirror-facts 都是 0，所以重启后的 0 还不能说明修复生效；要等下一次出现标脏重建时，看 mirror-facts 是否仍为 0。重启前后都有 5 个会话报 `restart recovery claim changed`（13:59 起，与本次无关，另行处理）。

**10/13 生产效果**：V 文件日志统计，上线前（10/12 00:00–22:18，约 22 h）`session.transcript.mirror-facts` 慢事务 511 次、合计 721 s、最长 7.3 s；上线后（至 10/13 16:10，约 18 h）9 次、合计 11 s、最长 1.5 s。同期标脏重建 `transcript-index.prepare` 仍有 104 次，说明修复路径已被真实触发（见 docs/pr-triage-2026-10-13.md 第 2 节）。

相对上一版 `v-voice-content-product-20261011`：1 个文件变化。

**经 VLab 发版 `mirror-facts-identity-20261012`**（pr315-mirror-facts，dev `3490b79a`）
> 验收：/Users/tianyicai/v-upgrade-private/pr315-mirror-facts-20261012/shared-vlab-evidence.md: 部署后真实飞书 Codex(/vds, DeepSeek Flash) 6 回合回答全对、跨重启记忆保留、转录 254 键无重复；vlab-worker 8 群首字热态 P50 4.8/4.9s vs 部署前 6.3/5.0s；Codex 3.3-4.0s vs 3.3-3.9s；部署后 mirror-facts 慢事务 0；标脏大会话 1278->13ms 与 V 同款日志见 candidate e431fff2，全库比对 0 差异见 candidate 424706ba
- `core` session-accessor-K0XuW6ln.js  5c2eb542 → 30c7b9d6


**这期间合入 dev 的 PR**（5 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #315 perf(sessions): 转录镜像查重在投影追赶期间改查 identity 表，不再整段读转录
- #341 fix(v): /vcc 在 900k 自动压缩，不再贴着 1M 上限
- #339 test(v-browser-fill): 验收驱动支持生产 V；exec 回归驱动
- #337 fix(voice): 修复直接工具运行准入与飞书 CLI 身份
- #336 test(v-browser-fill): 真实飞书多 harness 验收驱动

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-mirror-facts-identity-20261012-20261012T140419`（需重启）。


## v-voice-content-product-20261011

上线：2026-10-11 02:27 CST 启动生产 Gateway，02:34 CST 切换 H5；tag `v-voice-content-product-20261011`。

**摘要**：Voice 使用简洁的 Web/H5 通话布局，报告和图片、视频可展开阅读；默认豆包 SeedDuplex，展示真实模型名；补回打招呼文字，挂断清空聊天、文档和输入，回到首次进入状态。通话期间申请 Screen Wake Lock，浏览器后台或不支持时遵循系统行为。

**来源**：共享 VLab `voice-content-product-20261011-v3`，已验收源码 `b93d0585b38dbf649f2dd999612d37be1f063b9c`（#307、#330、#332）；产物 SHA256 `b8f3387b2c9cb33bc84e4289dcfe73feb034006f70cec2b4eb405d78a8a734a2`。H5 固定同一提交，139 文件总指纹 `36b39a668767a4da812d6a6d23acb468907c20ba8244c1a08a8ddcc2633e8058`。#333 仅修正头像目录计数，不改变上线字节。

**真实运行文件差异**（对上一生产捕获逐文件比较）：
- `core` realtime-quicksilver-session-B3HKftDE.js：f0b01553 → 22ae5c48，后台完整文档保留给屏幕，语音输出简短摘要；媒体 URL 不进入过程口播。
- `core` talk-DkFuKRod.js：2d740a7c → dc6d6e9f，相同后台文档与摘要策略。
- Worker、飞书、钉钉、企微捕获无文件变化。此捕获不是将 dev 上其他修改重新部署一次。

**验收**：共享 VLab 真实 GPT Live 图片读取、完整文档、短口播、继续对话和挂断复位通过；SeedDuplex/Grok 通话以及 Candidate 视频播放证据按同一字节基线复用。生产默认 SeedDuplex、真实开场文字、合成语音提问和回答、挂断复位已通过。物理 iPhone 不熄屏和听感尚未在本轮自动验收。

**运维**：用户授权核对并暂停旧夜班任务。4 条登记实际为 10/9 孤儿运行，原生取消显示不存在；一致性备份任务/业务库，保留 365 项文件和已有付费生成结果，退出旧登记，不重新生成或重试。启动后登记显示 failed，原业务卡片仍为 1 done、3 blocked。两条额外飞书运行自然完成后才停止 Gateway。原 Gateway PID 963964 正常退出，新 PID 1158451；生产配置 SHA256 未改变；临时停止参数已移除。共享 VLab 已 align 到本次生产产物。

回滚：Gateway 用 `node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v-voice-content-product-20261011-20261010T182048` 后按流程重启；H5 恢复上一入口 `/opt/openclaw-voice-h5/releases/gpt-live-52eefaab221ed8e1e20d439133875ee2cfcb4b19/lab/gpt-live-h5`。备份保留在 V 的 `/var/lib/v-voice-release/voice-content-product-20261011-v3`，不含在 Git 中。

## v2026.9.1-db91.6-night-batch-20261010

上线：2026-10-10 23:03 CST（v-self-restart `20261010-225957-0e63`，22:59:57 请求，196 s 就绪，清掉 2 条 Codex 孤儿登记）  ·  tag `v2026.9.1-db91.6-night-batch-20261010`

**摘要**：Tianyi 10/10 定的晚间批次，一次重启上三件事。
- **#322 /vds 看图不再撑爆请求体**：DeepSeek Codex 线程关掉 Codex 原生 view_image，改用 OpenClaw view_image（JPEG、每张 ≤1 MB）；OpenClaw view_image 长边 1200 → 2048（DeepSeek 看到的像素与原图相同）；413 / 请求体过大时清掉线程绑定，下一条消息换新线程。起因：10/10 11:41 起张寒冰私聊每条都 413——Codex 原生 view_image 原样存 PNG（单张至 13.4 MB），DeepSeek 无状态、每次整段重发、上限 48 MiB。对比与证据见 `experiments/vds-image-context/README.md`。
- **#317（#316 的 v2）工具调用后的 NO_REPLY 不再冒英文兜底句**（10/10 15:03 群里加 👍 后出现 "The tool run finished, but no final summary was produced…"）。
- **#318 → #324 没有正文的流式卡片撤回**，不再留只有页脚的空卡片；#318 条件写错（每张卡都带任务状态对象），共享 VLab 真实飞书复验时抓到，#324 改为按任务状态行判断。已知副作用：卡片撤回前会闪现约 3 秒，飞书可能留「撤回了一条消息」提示，Tianyi 接受。

**重启后的一次性影响**：每个已有 /vds 会话的第一条消息换一次新线程（会话记录投影续上上下文）；默认 harness 看图长边变 2048，DeepSeek 每张图多计约 45% token。

**这次的文件**（经 VLab 发版 `night-batch-20261010-v2`，vds-view-image，dev `c85bbc45`，PR #317 #318 #322 #324）
> 验收（共享 VLab）：真实 /vds 回合两张 1080×1920 PNG 暗号全对、Codex 线程只存 JPEG；升级前已有的 /vds 会话首条消息换线程、7 s 回复、上下文保留；默认 harness 看图回归正常；candidate e8a80d8c 复现 413 卡死、修复后换线程恢复；candidate 67ce0f76 请求体 24.2 → 3.8 MB、追问首字 8.7 → 2.4 s。表情：「VLab 发布验收 B」20:03/20:07 有 THUMBSUP、群里无机器人消息、空卡片 3 s 内撤回、无 "lacked a final answer"。
> 验收（V，重启后）：专用会话 `agent:makaron:explicit:v-accept-vds-view-image-mv2j8dqp`（deliver:false）两个暗号全对、线程只存 JPEG、provider deepseek、整轮 23 s（`lab/accept-vds-view-image.mjs`）；表情在「V 生产发布验收 0910」23:11 通过（THUMBSUP、无机器人消息、23:12:04 Discarded streaming card、无追问）。重启后 Gateway 日志无 413 / Cannot reap / lacked a final answer。
- `core` builtin-openclaw-zQV8Wwjr.js  972d25fe → 3e07c3fa
- `core` openclaw-tools-BODVdJQD.js  637c86f3 → af27d9ae
- `feishu` monitor.account-WFdlCDhR.js  763bb8eb → 31238429
- Codex 插件（npm 管理，不在捕获范围）`thread-lifecycle-DAcEJ_Om.js` c0a9ce77 → a9f76cf4、`dynamic-tools-BU9tmlYm.js` 2de5868b → f3ad9f4d、`side-question-BTZAII4l.js` 9be0ea6c → 1ca216cf、`run-attempt-D1hJO4fX.js` d25e0d91 → bb0b0354

回滚：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/v2026.9.1-db91.6-night-batch-20261010-20261010T145251`（需重启）。

**记账说明**：本次捕获在 `worker-secret-egress-20261010` 撤回之后（V 的 worker.mjs 为 8b466a60、无 secret-egress-worker.mjs），撤回的捕获与章节在 #327。共享 VLab 的 production-worker 仍是撤回前的字节，align 前需按 V 同步。

## worker-secret-egress-revert-20261010

回滚：2026-10-10 22:32 CST（V 文件 `promote-to-v --undo`，随后 `vlab.workers.roll` 换代，未重启 Gateway）  ·  tag `worker-secret-egress-revert-20261010`

**摘要**：撤回 `worker-secret-egress-20261010`。那次上线让 worker 里的 exec 带上凭据库的出网占位符，但凭据库条目会**覆盖** worker 从 Gateway 服务环境继承的同名变量。`MAKARON_API_KEY` 两边值不同：17:52 起新起的 worker 里，夜班调 Makaron 用的是凭据库那把「群聊任务」账号的 key，而不是原来的个人账号 key。17:51–22:32 共 3571 次 www.makaron.app 请求被换了 key（18 点 1750、19 点 1696），夜班 DL-1010-04/05 共 31 个项目建在「群聊任务」账号下、其余额被耗到 2 积分，部分提交因余额不足失败；另有回合结束后仍在跑的后台命令因代理授权已撤销而失败（makaron 402 次、飞书 27 次）。其他重名条目：`BROWSER_USE_API_KEY` 值不同但期间无请求；三个 `VOLCANO_*` 值相同（语音 15 次替换不换账号）。修复需改为不覆盖继承的同名变量，并处理后台命令的授权生命周期，重新验证后再上。

相对上一版 `worker-secret-egress-20261010`：2 个文件变化。
- `worker` worker.mjs  8c6b2e92 → 8b466a60（复原）
- `worker` secret-egress-worker.mjs  515e211e → —（删除）

## worker-secret-egress-20261010

上线：2026-10-10 18:10 CST  ·  tag `worker-secret-egress-20261010`

**摘要**：凭据库里的 `secret` 条目（飞书凭据卡、`secrets request` 存的）以前在 worker 里的 exec 中是空的：出网代理只在 Gateway 进程里，worker 拿不到占位符，带凭据的请求不带鉴权、一律 403（10/10 群里 /vcc 派子会话调 AgentMail、Vercel 都是这样）。现在 worker 在自己进程里启动同一个原生出网代理，exec 拿到占位符，请求在允许的域名上被替换成真值；发往其他域名的会被代理拒绝（502），回合结束即撤销授权。只换 worker，`vlab.workers.roll` 生效，没有重启 Gateway。V 上验收：新一代 worker 全部 `[worker-secret-egress.1] active`（167–366 ms）；一轮 worker 回合里 `AGENTMAIL_API_KEY` 是占位符、有代理，AgentMail 列收件箱 200，返回 `hey-v@agentmail.to`。

**未完成的记账**：上一版 V 之后、这一版之前，V 还上过 `v2026.9.1-db91.6-batch-20261010-codex-feishu-workboard`、`v2026.9.1-db91.6-firsttext-card-note-20261010b`（捕获与章节在未合并的 #312）和 `batch-20261010c-workboard-sessions-tail`（尚无捕获）。所以下面只列本次的文件；`release-notes.mjs --from release-batch-20261009` 会把那几次的文件也算进来。

**这次的文件**（经 VLab 发版 `worker-secret-egress-20261010-v1`，claude-secret-egress，dev `c0e7f58a`，PR #319）
> 验收：candidate 同一字节、开启 secrets.egressProxy：开 candidate-b8d46520 值送达（len 40 哈希一致）、未授权域名 502、回合后同一代理凭据 407；关 candidate-907e033e len 0、无代理（复现 V）。共享 VLab 未开启 egressProxy：5/5 worker `disabled-by-config`、预热 5/5，真实回合在 vlab-worker:0 exec 正常。
- `worker` worker.mjs  8b466a60 → 8c6b2e92
- `worker` secret-egress-worker.mjs  — → 515e211e

## v2026.9.1-db91.6-firsttext-card-note-20261010b

上线：2026-10-10 01:27 CST（v-self-restart `20261010-012343-e920`，Tianyi 01:23 要求立即重启，187 s 就绪）  ·  tag `v2026.9.1-db91.6-firsttext-card-note-20261010b`

**摘要**：修 #298 上线后的回归。batch-20261010 上 V 后，Tianyi 体感变慢、卡片底部 footer 逐字打出。原因是提前建卡时还不知道模型，footer 只有「Agent: …」，模型选定后用流式接口（`PUT …/elements/note/content`）补全，而且这次写入排在正文后续所有更新之前。V 上「卡片建好 → 首段正文」多出 1–21 s，投递 P50 从上线前的 1.2 s 变成 1.8 s，P95 15.8 s。#304：模型一选定就在后台补全 note；需要补全时改成整组件替换（`/elements/note`），不再排在正文前面。

V 前后对比（统一口径：首字 = 飞书 create_time → 首段正文推送；同样 5 个测试群 × 2 轮，重启后满 20 min 再测）：

| | 首字 P50 / P95 | 投递 P50 / P95 |
|---|---|---|
| 上线前（00:11，旧代码，高负载） | 13.6 / 20.4 s | 1.2 / 1.3 s |
| #298（00:45） | 9.1 / 约 27 s | 1.8 / 15.8 s |
| #304（01:44） | 8.6 / 12.1 s | 0.8 / 1.0 s |

首字的变化里有一部分是负载差异；投递这一段是 #298/#304 直接影响的部分。教训见 memory `ship-only-verified-no-slowdown`：上 V 前要拿到「关键路径不变慢」的证据；首字只用统一口径报。

相对上一版 `v2026.9.1-db91.6-batch-20261010-codex-feishu-workboard`：1 个文件变化。

**经 VLab 发版 `firsttext-card-note-20261010b`**（firsttext-0jwr2n，dev `de3d64c4`）
> 验收：2026-10-10 01:20 CST firsttext-card-note-20261010b = #304 (dev de3d64c4; feishu monitor.account 96f7b0b8 -> 763bb8eb) on shared VLab (live config renderMode=auto, unchanged), group 「VLab 压测 23」, same prompts A vs B. A = V bytes (batch-20261010, #298 only): deepseek token->first answer push 0.80-0.87 s (card send ~0.55 + queued note PUT), token->visible 1.50/1.52/1.61/2.08 (P50 1.57). B (#304, two …
- `feishu` dist/monitor.account-WFdlCDhR.js  96f7b0b8 → 763bb8eb

## v2026.9.1-db91.6-batch-20261010-codex-feishu-workboard

上线：2026-10-10 00:24 CST（v-self-restart `20261010-002027-30fc`，00:14 起等空闲，00:20:27 请求，203 s 就绪）  ·  tag `v2026.9.1-db91.6-batch-20261010-codex-feishu-workboard`

**摘要**：Tianyi 10/09 晚定的统一上线（「验证过有效果的上，没效果的别上」），由监控 session 统筹。三项都在共享 VLab 拿到效果证据才进包：

- **#302 建卡只读需要的卡片。** 10/09 下午起 Gateway 主线程每小时卡 20–30 次、最长 22 s，钉钉随之断线；根因之一是 `workboard.cards.create` 每次全量 `list()` 看板（挂父卡时再全量读一次）。candidate 用 4150 张卡的真实看板：带父卡建卡 1261 → 10 ms，共享 VLab 复验 median 8 ms，行为逐项一致。派卡 `dispatchWithOptions`（今天 442 次、P50 2.9 s）同类问题留待下一批。
- **#301 /vds 记忆整理循环与回合开始整读大会话。** V 重启后首个大会话回合日志 `codex-bounded-history.1`：10339 条事件只读最近 296 条（6.9 MB，516 ms）。
- **#298 飞书卡片提前建好。** 共享 VLab A/B：投递 P50 1.4 → 1.0 s，建卡 P50 1.0 → 0.6 s。**上 V 后出现回归**（footer 逐字打出，并且挡住首段正文），由下一版 `firsttext-card-note-20261010b`（#304）修复。
- 不在本包、同晚直接装到 V 的主机工具：#295 哨兵配置检查、#294 memory-indexer 持锁时长字段。未上：#303（无效果数据）、#280（需在含 #301 的 dev 上重建）。

V 重启后：Worker 5/5 预热 ready；启动前 Codex 孤儿登记清理删掉 2 条（#205），Cannot reap 0；release-drift 0 findings；midTurnPrecheck 两份配置无变化。Codex 插件的 3 个文件（run-attempt、attempt-context、session-history）由 npm 管理，不在捕获范围，hash 见 VLab 发版记录。

相对上一版 `release-batch-20261009`：6 个文件变化。

**经 VLab 发版 `codex-big-session-20261009`**（claude-sweet-tesla-flush-loop，dev `e7720cc2`）
> 验收：2026-10-09 23:01-23:06 CST 共享 VLab（Gateway 2810555，dev e7720cc2 / PR #301）：/vds 专用会话 vlab-dev-codex-big-session 三轮（记住 KESTREL-58、答出 KESTREL-58、exec 工具返回 vds-tool-ok）；默认 deepseek-flash（vlab-worker）exec 回合返回 default-ok；/vcodex gpt-6.1-sol 两轮（记住并答出 HERON-31）；部署后文件日志无 codex-bounded-history 警告、无 Cannot inspect、无回合失败。大会话截断读取与整理循环见 candidate lab/candidate/codex-big-history.mjs（172.6 MB 无压缩 /vds 会话：新线程投影逐…
- `core` agent-runner-memory-7VF-zwNt.js  27f38ffb → 7d5eaa38
- `core` agent-runner.runtime-CAdsMsQt.js  947ba056 → 75b5b4b1
- `core` session-manager-CNTG_BAJ.js  ce091fda → 84317e32

**经 VLab 发版 `batch-20261010-codex-feishu-workboard`**（claude-sweet-tesla-flush-loop，dev `0790a0e9`）
> 验收：2026-10-09 23:40-23:56 CST 共享 VLab（dev 0790a0e9，Gateway 2815667，channels.feishu.renderMode=auto 与 V 一致）整批 #301+#298+#302： #298：VLab 压测群 A/B 各 8 条（A=V 字节+auto 23:30，B=整批 23:45，均重启后约 5 分钟），8/8 与 8/8 回复，均 vlab-worker。投递（出字→卡片可见）P50 1.4→1.0 s，建卡 P50 1.0→0.6 s；B 组 8 张卡全部 card-start precreated:true createMs:0，sendMs 0.5-1.1 s，1 张 4.2 s 为飞书发送接口本身（A 组的建卡时间也包含发送）。首字 P50 34.5→14.9 s 主要来自冷启动排队 23.9→10.7 s，不归…
- `core` runtime-api-1CCazqtv.js  220fed4c → 5b836021
- `core` sqlite-store-CH-caj1l.js  603c906a → 4ca26600
- `feishu` dist/monitor.account-WFdlCDhR.js  ec089142 → 96f7b0b8

**这期间合入 dev 的 PR**（9 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #294 fix(memory-indexer): slow-write 的持锁时长不再计入等锁时间
- #295 feat(sentinel): 主配置/worker 配置坏了先告警，不等用户或重启发现
- #302 perf(workboard): 建卡只读需要的卡片，不再全量读看板
- #301 fix(codex): /vds 记忆整理循环与回合开始整读大会话
- #300 Test: reconcile merged voice and card inventory counts
- #299 Voice: recover actual avatar display and dialogue timelines
- #298 feishu: 飞书卡片提前建好，首字不再等建卡（首字）
- #297 Persist Xiaohe and Grok voice text for daily sync
- #296 Release contextual voice avatar reactions and natural farewell controls

## release-batch-20261009

上线：2026-10-09 01:19 CST（v-self-restart `20261009-011524-19f1`，01:15:24 空闲时请求，191 s 就绪）  ·  tag `release-batch-20261009`

**摘要**：Tianyi 10/09 00:37 定的一批：共享 VLab 验收通过就直接装 V 重启。

- **#292 压缩时的交接摘要不再被当成回复发出。** 10/08 23:30 群 oc_ff5076（/vds）在回合内压缩，用户收到一整段 `# Context Checkpoint Handoff …`，真正的回答丢了。Codex 本地压缩时，摘要以 `rawResponseItem/completed`（phase `final_answer`）在压缩 item 打开期间到达，被插件当成了回复；现在压缩期间的 raw item 不再进入回复。Codex 插件（npm 管理，不在捕获范围）`run-attempt-D1hJO4fX.js` b4553661 → 1264f88b。
- **同时撤回 F**：`codex-toolset-cover-20261008`（主人与成员交替不换线程）只装到了磁盘、从未重启生效；共享 VLab 对比首字无可测改善，暂缓。`thread-lifecycle-DAcEJ_Om.js` 7ee060b1 → c0a9ce77，即 V 一直在跑的版本。
- **#285 会话索引预检不再在写锁下全表扫描**（10/08 V 上最长持锁约 10 s，打断聊天）。
- **#278 / #279 Worker 预热**：会话键检查按库文件只做一次并放进预热；预热抢不到 state-lifecycle 锁时重试，不再整段推迟到首个用户回合。私有 VLab A/B：冷启动 command→model P95 约 7 → 4–5 s。这两个 PR 10/08 合入 dev 时以 VLab 发版 `firsttext-r5-prewarm-20261008` 准备过，但那一版没有到 V（V 上没有任何 r5 文件，上面「r5 同一次重启生效」的说法不准确），这次才上。

验收（共享 VLab，01:10–01:13）：约 31 万 token 的 /vds 会话在第二轮回合内压缩，回复是真正的答案（旧代码同形状返回 `**Handoff Summary**`）；续用 4 轮一个线程、首字 2.0–4.2 s；vds↔vcodex 4/4；Worker 预热 10/10 ready、无推迟；预检无退回或报错。V 重启后：Worker 预热 5/5 ready（会话键 350–485 ms）。监控 `batch-watch-20261009`（V 上 systemd，至 11:27）盯交接摘要外泄、预检慢持锁、预热未就绪、Codex 回合报错，出问题直发飞书。

另：#287（v-memory-indexer 分批短事务）10/08 已直接装到 V 的 `/opt/v-sentinel/`（独立服务，不在 Gateway 发版链里），之前的章节漏记。

相对上一版 `codex-toolset-cover-20261008`：4 个文件变化（Codex 插件的两个文件不在捕获范围内）。

**经 VLab 发版 `release-batch-20261009`**（codex-compaction-summary，dev `b38982e8`）
- `core` agent-command-DPfawBbr.js  150d9003 → e3cab0b4
- `core` session-accessor.sqlite-transcript-state-Cz9g7S9v.js  dd00be09 → 792b1c75
- `core` session-transcript-reconcile-j5qhAafV.js  e95bb26a → b63bdf05
- `worker` worker.mjs  024306ae → 8b466a60

**这期间合入 dev 的 PR**（1 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #292 fix(codex): 压缩时的交接摘要不再被当成回复发出（G），并同批上 #285

---

## codex-toolset-cover-20261008

上线：待重启生效（2026-10-08 22:41 CST 装到 V 磁盘）  ·  tag `codex-toolset-cover-20261008`

**摘要**：修同一个群里主人和普通成员交替发言时，每换一次人就新开 Codex 线程、重放整段历史的问题。主人回合比成员多 12 个顶层工具（`nodes`、`gateway`、`terminal`、`conversations_*`、`codex_plugins` 等，`openclaw_direct` 里还有 `computer`），有些工具描述也跟着变，Codex 线程的工具清单在创建时固定，于是工具指纹一变就换线程。现在指纹不同时先读线程实际记录的工具：本回合每个工具在线程里都有同名、参数相同的版本（描述可不同），就续用这个线程。权限不放宽，工具调用只按本回合授权执行，成员调用主人专属工具返回 `Unknown OpenClaw tool`。方向是单向的：主人第一次发言仍换一次线程，之后两人共用主人线程。

Codex 插件（npm 管理）`thread-lifecycle-DAcEJ_Om.js` c0a9ce77 → 7ee060b1，经 VLab 发版 `codex-toolset-cover-20261008`（dev `fc8c04cb`，PR #289），旧文件在 `/opt/v-release-backups/codex-toolset-cover-20261008-20261008T144149/`；改动不在捕获范围内，所以下面的文件比对是 0。共享 VLab 验收：一个 /vds 会话、成员先说再交替 6 轮，2 个线程（109/122 个工具），成员 3 轮都留在主人线程，缓存 99% 以上，首字 2.2–2.5 s；续用与 vds↔vcodex 切换回归通过。

相对上一版 `v2026.9.1-db91.6-big-session-reads-20261008`：0 个文件变化。

---

## v2026.9.1-db91.6-big-session-reads-20261008

上线：2026-10-08 22:14 CST（v-self-restart 20261008-221101-b85e 重启生效）  ·  tag `v2026.9.1-db91.6-big-session-reads-20261008`

**摘要**：大会话不再整段同步读取（PR #286）。vlab-worker 每轮结束只读会话尾部，不再把整段历史经 IPC 回传；vcodex/vds 回合开始只读最近压缩之后的上下文窗口，Gateway 主线程不再被 70–160 MB 的会话冻住 3–11 s（VLab：3.0–3.4 s → 114–167 ms，vds 回合由失败变为成功）。上线后 V 上 worker 读取 p50 286 ms → 13 ms。新的 operationLabel `session context window read`；`OPENCLAW_V_CONTEXT_WINDOW_READ=0` 可退回全量扫描。

相对上一版 `codex-memory-flush-transient-20261008`：2 个文件变化。

**经 VLab 发版 `big-session-reads-v1`**（claude-big-session-reads，dev `6b3cff70`）
> 验收：2026-10-08 22:00 CST big-session-reads-v1 (PR #286, dev 6b3cff70): shared VLab regression - deepseek-flash via vlab-worker 2 turns with exec (session vlab-dev-bsr-accept-flash-1791467922143) ok; /vds switch + 2 Codex turns with exec and recall (vlab-dev-bsr-accept-vds-1791467956) ok, second turn recalled the first turn tool output; no errors in journal. Effect evidence from candidate (same runtime…
- `core` session-manager-CNTG_BAJ.js  8db52c1a → ce091fda
- `worker` harness-result.mjs  c1be75be → 76840da2

**这期间合入 dev 的 PR**（1 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #289 fix(codex): 主人与成员交替发言不再换线程

## codex-memory-flush-transient-20261008

上线：2026-10-08 21:09 CST（16:58 装到 V 磁盘）  ·  tag `codex-memory-flush-transient-20261008`

**摘要**：Tianyi 允许 21:00 后重启；V 由 codexft-idle-restart-20261008.timer 在 21:05:29 空闲时请求重启（v-self-restart `20261008-210529-4007`），21:09:03 就绪，同一次重启生效的还有 #205（Codex 孤儿登记启动前清理）和首字线 r5（各自记账）。

修的是 #275 上线后大群仍然每条消息新开 Codex 线程：大会话回复后空闲时跑的推迟记忆整理（#243）只有 read/write 两个工具，插件为它开新线程并把会话的 Codex 绑定改写成它，下一条用户消息工具集不符只能再开新线程、重放 40 多万 token。现在 `trigger === "memory"` 的回合走临时线程、不写回绑定（与 report_only 同一条路径）。Codex 插件（npm 管理）`thread-lifecycle-DAcEJ_Om.js` e7c2208f → c0a9ce77，经 VLab 发版 `codex-memory-flush-transient-20261008`（dev `a6b146fa`），旧文件在 `/opt/v-release-backups/codex-memory-flush-transient-20261008/`；改动不在捕获范围内，所以下面的文件比对是 0。

V 线上（21:09–21:37）：重启前 17:40–21:05 记忆整理 7 次中 6 次夺走绑定；重启后整理 3 次、0 次夺走绑定。oc_b4346bd5 一个线程连续 7 轮（重启后首轮补全量 46 万并压缩一次，之后每轮 12–16 万、缓存 97–98%）；你的私聊线程 d694 跨重启续用。

**已知**：同一大群里主人与普通成员交替发言时工具集不同（106 vs 94），每次切换仍会新开线程（oc_b4346bd5 21:28）；DeepSeek 窗口仍是 258,400；压缩时交接摘要会存进会话记录（飞书未见外发）。

相对上一版 `codex-vds-oversized-20261008`：0 个文件变化。

**这期间合入 dev 的 PR**（10 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #286 fix: 大会话不再整段同步读取（worker 尾部读取 + 上下文窗口读取）
- #285 perf(sessions): transcript index preflight without a full scan under the writer
- #284 fix(ops): Codex 孤儿登记清理的 drop-in 要排在 db91 的清空之后（#205 补丁）
- #282 fix(sentinel): 压缩后重试不再报「回复断掉」，补上长回合漏报
- #205 Clear dead Codex app-server registrations before the Gateway starts
- #283 撤回首字小修复 #260 #261 #268（未上 V）
- #281 firsttext: revert #260, #261, #268 from dev
- #277 fix(codex): 记忆整理回合用临时线程，不再改写会话的 Codex 绑定
- #278 VLab A/B (private candidate, 5 Workers, 8 concurrent cold turns, alternating ON/OFF ×2+2): command->model P95 7.0–7.5 -> 4.2–4.9 s, max 8.7–9.6 -> 4.8–5.8 s, in-turn scan 3.6–4.1 s CPU -> ≤6 ms; P50 unchanged; replies unaffected.
- #272 release: v2026.9.1-db91.6-voice-reliability-20261008

## codex-vds-oversized-20261008

上线：2026-10-08 13:46 CST  ·  tag `codex-vds-oversized-20261008`

**摘要**：Tianyi 于 2026-10-08 批准（「只上第二处」「现在上，空闲时重启」）。大会话里 /vds 不再每轮换 Codex 线程、重放整段历史并压缩：群 oc_64bcd621…（约 43–44 万 token）此前每轮都 `native transcript exceeded active token limit; starting a fresh thread`，首字 19–27 s，带工具的回合还要 Codex 压缩一次。原因是 Codex 不认识 deepseek-flash，按 272,000 兜底窗口（生效 258,400），新线程灌入的历史本身就超限，下一轮又被换掉。现在 DeepSeek 线程超限时保留线程、交给 Codex 自己压缩后续用（日志 `keeping oversized DeepSeek thread for native compaction`），字节上限保险和 GPT 不变。

改动不在 V 捕获范围内，所以下面的文件比对是 0：Codex 插件（npm 管理）`run-attempt-D1hJO4fX.js` 564374a6 → b4553661，经 VLab 发版 `codex-vds-oversized-20261008`（codex-vds-oversized，dev `4dd61571`），旧文件在 `/opt/v-release-backups/codex-vds-oversized-20261008/`。共享 VLab 验收：约 33 万 token 会话 3 轮同一线程、只压缩一次、第三轮缓存 99.8%；常规回归通过。

重启：2026-10-08 13:43:06 空闲时请求（v-self-restart `20261008-134306-b8b7`），13:46:23 就绪（166 s），清掉 2 条 Codex 孤儿登记。

**已知、未修**：DeepSeek 线程压缩时 Codex 把交接摘要写成一条 final_answer；若模型紧接着直接回答（中间没有工具调用），OpenClaw 可能把摘要当回复发出（VLab 复现，V 上至今未见）。另：DeepSeek 窗口仍是 258,400，提到 100 万需改全局 Codex 模型目录，暂不做（见 `lab/release-files/codex-firsttext/README.md`）。

相对上一版 `v2026.9.1-db91.6-voice-reliability-20261008`：0 个文件变化。

**这期间合入 dev 的 PR**（4 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #275 fix(codex): 大会话 /vds 不再每轮换线程、每轮压缩
- #261 首字：isInstalledPluginEnabled 复用已规范化的插件配置
- #260 首字：内置 chat channel id 查找结果按进程记住
- #268 feishu: 发送人名/群名缓存过期后不再阻塞消息分发（首字）

## v2026.9.1-db91.6-voice-reliability-20261008

上线：2026-10-08 01:33–01:39 CST  ·  tag `v2026.9.1-db91.6-voice-reliability-20261008`

**摘要**：PR #251 修复 Voice 的播放队列、同页麦克风复用、简单请求直接调工具与复杂任务后端委派；完整方案以 Markdown 展示，口播给出真实摘要，GPT Live 后台状态可见并在最终回复后恢复对话。共享 VLab 实际验证三模型工具/回答、复杂任务与 GPT Live 方案和后续对话；原媒体、物理 Safari 与语义保真严格 FAIL 继续保留。2026-10-08 经 Tianyi「可以安排上线」授权，推广同一份 11 个运行时文件（artifact SHA `f1a7f7eef03346182c267bbe4725d1047ae29b7084f5a1c2272b09b5923f30ab`），保留备份，受控重启 Gateway，并将原 `/voice/` H5 更新为 38 个 dd5e4cdb 文件。H5 文件集合 SHA `1f0d855faf2cf3f7ec96e8dde0a56dacfc83ae53bee25a490682786a4a237f98`。 原线上 `/voice/` 三模型实际回答及原 WebRTC/AudioWorklet 输出 PCM 已验证；临时验收页面清理、共享 lease 归还，部署版本保留。生产原姓名保真、观察器期限及媒体采样 FAIL 保留，详见 `docs/voice-release-20261008.md`。

相对上一版 `codex-firsttext-20261008`：11 个文件变化。

**经 VLab 发版 `voice-reliability-20261008`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `dd5e4cdb`）
> 验收：PR251 dd5e4cdb release functional evidence: shared direct actual native Memory single USER + hybrid delegated multi-tool/progress/auto final both models; direct-voice r2 original FAIL retained, independent source=injected-speech real Xiaohe 54 provider PCM chunks FIFO drained. Shared GPT Live 56c5e847 real Memory then Web results native speech+pending; eda62700 scoped original H5 long complete USE…
- `core` agent-tools-djVuP1H1.js  50da9780 → f414fa7f
- `core` embedded-agent.runtime-CL7poBKY.js  31e6c957 → 8ba1f8fb
- `core` realtime-quicksilver-delegation-controller-B0yPpiHp.js  a5a06fdb → 7ddf7fae
- `core` realtime-quicksilver-session-B3HKftDE.js  801c4fe7 → f0b01553
- `core` talk-DkFuKRod.js  91cf0741 → 2d740a7c
- `core` gpt-live-call-lifecycle.mjs  47afe3df → ba6f0b7e
- `core` voice-process-owner.mjs  — → c0045e63
- `worker` index.mjs  26c617fd → 4f6894da
- `worker` worker-pool.mjs  1f137ca2 → 197ec4a8
- `worker` worker.mjs  18fc5d4f → 024306ae
- `worker` voice-process-owner.mjs  — → c0045e63


## codex-firsttext-20261008

上线：2026-10-08 00:17 CST  ·  tag `codex-firsttext-20261008`

**摘要**：Tianyi 于 2026-10-07 批准（「开 PR 合进 dev 然后上 V」，并要求带上 #262）。/vds 不再每轮新开 Codex 线程，同模型连续对话续用线程、缓存可命中（V 实测第二轮缓存 98%）；Codex 的答案不再等用户消息写库才往外送（修 /vcodex 被扣 1–8 s、/vds 私聊 pre-bind 溢出整轮重试）；同一会话 vds↔vcodex 两个方向都能切，并且看得到对方那几轮（原来 vcodex→vds 报 auth profile 不可用）。同一次重启生效 #262：Gateway 和 Worker 以 `--experimental-async-context-frame` 启动（`--verify` 6/6 进程）。

两项改动都不在 V 捕获范围内，所以下面的文件比对是 0：
- Codex 插件（npm 管理，`npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/…/dist/`）：`run-attempt-D1hJO4fX.js` 694e3817 → 564374a6，`thread-lifecycle-DAcEJ_Om.js` 94d5420f → e7c2208f。经 VLab 发版 `codex-firsttext-20261007`（codex-firsttext-prebind，dev `9d4ccd63`），旧文件在 `/opt/v-release-backups/codex-firsttext-20261008/`。升级或重装该插件会丢掉这两个补丁和 /vds 补丁。
- systemd drop-in `/etc/systemd/system/openclaw-gateway.service.d/zzzzzzzzz-node-async-context-frame.conf`（`scripts/node-async-context-frame.mjs --target v --apply`）。

重启：2026-10-08 00:13:28 请求（v-self-restart `20261008-001328-7749`），00:17:56 就绪（237 s），清掉 4 条 Codex 孤儿登记。V 上专用会话验收：vds 两轮同一线程、vcodex 答出两个暗号、再切 vds 正常并复述 vcodex 的回答。

相对上一版 `v2026.9.1-db91.6-firsttext-r4-20261007`：0 个文件变化。

**这期间合入 dev 的 PR**（2 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #269 fix(codex): /vds 首字与线程续用、vds↔vcodex 切换
- #265 Release capture: V after firsttext-r4-20261007 (#243 #264)

## v2026.9.1-db91.6-firsttext-r4-20261007

上线：2026-10-07 16:46 CST  ·  tag `v2026.9.1-db91.6-firsttext-r4-20261007`

**摘要**：首字优化第四批，Tianyi 于 2026-10-07 08:32 UTC 批准（「r4上线吧」，#247 已按他的要求撤出）。大会话空闲后的第一条消息不再被回复前的记忆整理挡住：整理推迟到回复之后、会话空闲时再跑，新消息来了就让出，之后补跑并照常写记忆；快到压缩阈值时仍然先整理（#243）。codex 会话同样推迟，包括 token 数不新鲜的会话（#264）。上线前 24 小时 V 上有 10 条真实消息因此白等 37–90 s（7 条 codex、3 条 vlab-worker）。16:35 CST 装到 V 磁盘，16:41 v-self-restart（20261007-164108-05f1），16:44:45 Gateway ready。#262 的 async-context-frame 启动参数这次没有生效：V 上排在它后面的 db91 drop-in（state-db-fastpath-v6）重新声明了 ExecStart，--verify 查出后已把这个 drop-in 撤掉，修复后另行上线。`agent-runner.runtime` 与 `builtin-openclaw` 的字节与验收 #243 用的 VLab 发版 `mflush-vds-20261007` 相同，所以来源追溯到那一版。

相对上一版 `v2026.9.1-db91.6-firsttext-r3-20261007`：3 个文件变化。

**经 VLab 发版 `firsttext-r4c-20261007`**（firsttext-0jwr2n，dev `22c4f72f`）
> 验收：2026-10-07 15:55 CST r4c = #243 + #264 (3 core files, dev 22c4f72; #247 dropped by Tianyi) + #262 acf drop-in (--target vlab, --verify 6/6) on shared VLab: dedicated session vlab-dev-r4c-accept-1791358677236 exec + memory_search + visible reply (deepseek-flash); #243 deferral/interrupt/memory-write verified 13:10-13:28 on the same runtime/builtin bytes (memory file differs only by #264's stale-tok…
- `core` agent-runner-memory-7VF-zwNt.js  8bca065f → 27f38ffb

**经 VLab 发版 `mflush-vds-20261007`**（firsttext-0jwr2n，dev `eea51de0`）
- `core` agent-runner.runtime-CAdsMsQt.js  9b85f780 → 947ba056
- `core` builtin-openclaw-zQV8Wwjr.js  84456470 → 972d25fe

**这期间合入 dev 的 PR**（4 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #264 #243 follow-up: defer a Codex session's flush even when its token count is stale
- #243 perf(reply): run a housekeeping memory flush after the reply, not before it
- #262 scripts: start the Gateway and its Workers with --experimental-async-context-frame
- #263 Release capture: V after firsttext-r3-20261007 (#252 #254)

## v2026.9.1-db91.6-firsttext-r3-20261007

上线：2026-10-07 09:33 CST  ·  tag `v2026.9.1-db91.6-firsttext-r3-20261007`

**摘要**：首字优化第三批，Tianyi 于 2026-10-07 01:10 UTC 批准（「r3上V」）。Worker 启动时 skills watcher 不再误判变更而让每个 Worker 的 skills 快照失效重建（#252）；Worker 预热时提前激活 secrets 运行时快照，冷首轮的 config-resolved 段在 VLab 上从约 1.1 s 降到 0（#254）。2026-10-07 09:27 CST 装到 V 磁盘，09:28:35 v-self-restart（20261007-092835-4165）后生效，09:32:32 Gateway ready。`refresh-BzYxPady.js` 的字节与 #252 的 VLab 对照发版 `skillswatch-on-20261007` 相同，所以来源追溯到那一版。

相对上一版 `v2026.9.1-db91.6-firsttext-r2-20261007`：2 个文件变化。

**经 VLab 发版 `firsttext-r3-20261007`**（firsttext-0jwr2n，dev `e97e98bb`）
> 验收：2026-10-07 09:25 CST r3 (#252 #254) on VLab: dedicated session agent:makaron:explicit:vlab-dev-r3-accept-1791336390511 run status ok in 24 s, model deepseek-flash, tools exec + memory_search, visible final reply; Feishu bench r3-accept 8/8 answered (first answer p50 9.0 s, max 10.6 s cold); parity AHEAD by pending plan
- `core` agent-command-DPfawBbr.js  82e7ca49 → 150d9003

**经 VLab 发版 `skillswatch-on-20261007`**（firsttext-0jwr2n，dev `7569497f`）
- `core` refresh-BzYxPady.js  e886dd60 → 3e34ae21

**这期间合入 dev 的 PR**（8 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #258 candidate: vcodex-preturn-profile shows Gateway-side pre-turn stages
- #257 candidate: let vcodex-preturn-profile drive /vds
- #247 飞书：codex 回合开始就建卡片，不再等第一个答案字
- #254 首字：Worker 预热时激活 secrets 运行时快照
- #256 parity: compare Feishu renderMode in the config advisory
- #252 firsttext: skills watcher stops invalidating each Worker's skills snapshot at startup
- #255 Release capture: V after firsttext-r2-20261007 (#221 #238 #240)
- #253 parity: compare memory-core dreaming in the config advisory

## v2026.9.1-db91.6-firsttext-r2-20261007

上线：2026-10-07 01:48 CST  ·  tag `v2026.9.1-db91.6-firsttext-r2-20261007`

**摘要**：首字优化第二批。Gateway 每分钟两次后台扫描（workboard 卡片、Worker placement）不再整表读取，共享 VLab 上每分钟主线程卡顿从 1.6–2.5 s 降到约 0.2 s；带图消息的识图能力判断不再现场构建完整模型目录（#221）。文件已于 2026-10-07 01:45 CST 装到 V 磁盘，在下一次 Gateway 重启时生效（本节写入时 V 尚未重启）。附带：本版之前 V 已上 voice-native-tools-pr217（tools-invoke-shared，由其负责人上线）。

相对上一版 `v2026.9.1-db91.6-firsttext-r1-20261006`：5 个文件变化。

**经 VLab 发版 `firsttext-r2-20261007`**（firsttext-0jwr2n，dev `9cc6785a`）
> 验收：R2 (#221 #238 #240) on shared VLab 2026-10-07: health ok; real model turn exec+memory_search+write ok, 0 tool errors; idle profile minute windows 169-208 ms (batch2 base 1577-2466); image turns 3/3 toHarness 0.3-0.4 s; bench cold8 P50 12.4 s, warm16 P50 6.1 / P95 9.7 s; no errors from R2
- `core` extensions/workboard/index.js  ba56e0ab → 5ac1a060
- `core` placement-store-CkyLHi6x.js  f7c7b41c → 5bcb7a2f
- `core` runner-BIhCXp3h.js  0648f47c → f99d7111
- `core` server-worker-placement-startup-BvPREvpr.js  8366d71a → 8e73e9eb

**经 VLab 发版 `voice-native-tools-pr217-firsttext-r1-20261006`**（01a0fb0e-739d-7681-9238-faa2c1912c6c，dev `1ee42ed0`）
> 验收：Same frozen PR217 artifact/config; original shared native provider and speaker PCM core review reused (pr217-shared-core-review.json). User explicitly retained production trial after exec admission failure; production calendar and strict paused gates remain FAIL/unaccepted.
- `core` tools-invoke-shared-CjpflNGO.js  68ef48e5 → ac465c5b

**这期间合入 dev 的 PR**（8 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #250 parity: mark VLab channel plugins as expected config differences
- #249 parity: advisory comparison of MCP server and plugin enabled switches
- #240 perf(placement): the minute sweep stops reading every placement row
- #221 带图消息：识图能力判断不再现场构建完整模型目录
- #238 perf(workboard): stop the per-minute sweep from reading every card (retry of #225)
- #237 feat(parity): V Browser 纳入 VLab↔V 比对（plugin / Broker / Browser Gateway）
- #235 Capture of the release Tianyi Cai approved on 2026-10-06 ("可以先上线219 和220", "上线吧").
- #232 feat(v-self-restart): 让 V 能安全地重启自己

## v2026.9.1-db91.6-firsttext-r1-20261006

上线：2026-10-06 18:14 CST 安装到 V（promote-to-v，未重启；下次 Gateway 启动时生效，重启时间由 Tianyi 决定）  ·  tag `v2026.9.1-db91.6-firsttext-r1-20261006`

**摘要**：Gateway 重启后的第一条消息、以及新 Worker 接的第一单，以前要先做一遍一次性的准备（建技能快照、首次加载模块），用户多等几秒。现在 Worker 在就绪前（#219）、Gateway 在启动后空闲时（#220）提前做完，不写库、失败不影响就绪。共享 VLab 压测：重启后第一条首字 7.8–9.3 秒 → 5.4–6.1 秒，冷 Worker 第一轮 P50 12.7 → 10.6–10.7 秒；稳态各类无退化。

相对上一版 `v2026.9.1-db91.6-workboard-incremental-sweep-20261006`：5 个文件变化。

**经 VLab 发版 `firsttext-r1-20261006`**（firsttext-0jwr2n，dev `1ee42ed0`；同样字节此前也在测试发版 `firsttext-r2-20261006` 里出现过，脚本按首次出现归属，已手工更正）
- `core` agent-command-DPfawBbr.js  e8a0c7e4 → 82e7ca49
- `core` get-reply-CqW1y05D.js  fcfca37f → 9bac6b7c
- `core` get-reply-from-config.runtime-CWdWv_c6.js  71de3e3e → 727ad514
- `core` server-startup-post-attach-BPE6Pv6n.js  fbf799dd → fdd10613
- `worker` worker.mjs  898fd1fc → 18fc5d4f

**这期间合入 dev 的 PR**（5 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #220 Approved by Tianyi Cai in the project chat (2026-10-06 07:49Z): 可以先上线219 和220
- #219 Approved by Tianyi Cai in the project chat (2026-10-06 07:49Z): 可以先上线219 和220
- #218 fix(desktop-handoff): 接管前自动松开 V 残留按下的按键
- #215 release: V v2026.9.1-db91.6-workboard-incremental-sweep-20261006 捕获与变更记录
- #214 feat(v-experience): V 自己的钉钉提问卡模板

## v2026.9.1-db91.6-workboard-incremental-sweep-20261006

上线：2026-10-06 00:05 CST 安装到 V（promote-to-v，未重启；下次 Gateway 启动时生效，重启时间由 Tianyi 决定）  ·  tag `v2026.9.1-db91.6-workboard-incremental-sweep-20261006`

**摘要**：workboard 的 lifecycle 对账以前每 64 秒把全部会话列一遍，每次卡 Gateway 主线程约 3 秒，赶上的消息要多等最多约 2.5 秒才开始跑。现在全量之间只列最近更新的会话，首次、每 10 分钟、有 prepared launch 时仍做全量。共享 VLab 实测每分钟对账约 0.6 秒，c10 首字 P95 6.6 秒（之前 10–14 秒）。

相对上一版 `v-experience-channels-20261005`：1 个文件变化。

**经 VLab 发版 `workboard-incremental-sweep-20261005`**（claude-workboard-incremental-sweep，dev `bdfcdde2`）
> 验收：PR #212. Shared Gateway profiled 23:42-23:54 (12 min): session-sharing resolution ran once (23:51:57, 663 ms, the 10-minute full sweep) vs every minute before; per-minute sweep bursts ~0.06-0.1 s + 0.45-0.6 s (was ~2 s on VLab / ~3 s on V); 0 workboard lifecycle sync failures in journal. Candidate receipts candidate-52bbf324 (on) / candidate-e070d2dd (off): late card linked to a session changed af…
- `core` extensions/workboard/index.js  66e7b126 → ba56e0ab

**这期间合入 dev 的 PR**（7 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：
- #213 release: V v-experience-channels-20261005 捕获与变更记录
- #210 release: V v2026.9.1-db91.6-firsttext-runid-20261005 捕获与变更记录
- #206 release: V v2026.9.1-db91.6-firsttext-e2e-20261005 捕获与变更记录
- #200 release: V v2026.9.1-db91.6-worker-prewarm-20261005 捕获与变更记录
- #199 release: V v2026.9.1-db91.6-voice-confirmation-switch-20261005 捕获与变更记录
- #212 perf(workboard): 对账只列最近更新的会话，不再每分钟卡 Gateway 约 3 秒
- #195 release: V v2026.9.1-db91.6-placement-evidence-20261005 捕获与变更记录

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

## v2026.9.1-db91.6-firsttext-runid-20261005

上线：2026-10-05 16:55 CST 安装，**还没有重启 V**（飞书插件在 Gateway 启动时加载）  ·  tag `v2026.9.1-db91.6-firsttext-runid-20261005`

**摘要**：`[firsttext-e2e.1]` 首字记录多两项：`runId` 和 `runStartAtMs`（飞书回复对象接上 `onAgentRunStart`）。有了 runId，每条消息能和 worker 的 `[firsttext-worker-phases]` 对上；「V 收到 → 运行开始」就是消息在 Gateway 里的排队时间，统计脚本多了 queue 这一段（#209）。共享 VLab c5：5/5 条都有记录，其中 2/5 带 runId，并能和对应运行的 worker 阶段对上；部署重启后的第一轮，收到到运行开始 P50 13.8 s。

相对上一版 `v2026.9.1-db91.6-firsttext-e2e-20261005`：1 个文件变化。

**经 VLab 发版 `firsttext-runid-20261005`**（claude-firsttext-e2e）
- `feishu` monitor.account-WFdlCDhR.js  943b0116 → ec089142

**这期间合入 dev 的 PR**：
- #209 feat(feishu): 首字记录带上运行 ID 和运行开始时间

## v2026.9.1-db91.6-firsttext-e2e-20261005

上线：2026-10-05 14:57 CST 安装，**还没有重启 V**（飞书插件在 Gateway 启动时加载，下次重启才生效）  ·  tag `v2026.9.1-db91.6-firsttext-e2e-20261005`

**摘要**：以前量的首字都不是用户看到字的时刻：模型吐出第一个字、回复写进库、卡片创建时间都会偏早约 2 s。V 是在模型出第一个字之后才建卡片的，要调两次飞书接口，然后才推文字。现在飞书插件对每条回复的消息记一行 `[firsttext-e2e.1]`，内容包括：飞书发送时间、V 收到、开始分发、打字提示、第一段思考或第一个正文字到达插件、卡片开始建和建好、第一次推出内容、第一次推出正文、不走卡片的回复送达，以及 harness 和模型。不记消息内容，日志调用不会影响回复（#202）。`scripts/firsttext-e2e-report.mjs` 在 V 上读这些记录，给出首字 P50/P95/P99/Max 和分段（入站、agent、投递、建卡片）。共享 VLab 真实飞书 12/12 条都记到；热的一轮首字 P50 8.2 s、P95 9.3 s，其中入站 0.6 s、agent 6.9 s、投递 0.5 s。

这也是钉钉、企微插件第一次被捕获（`.dingtalk`、`.wecom`；捕获脚本在 #204 加了 sudo）。

相对上一版 `v2026.9.1-db91.6-worker-prewarm-20261005`：1 个文件变化。

**经 VLab 发版 `firsttext-e2e-20261005`**（claude-firsttext-e2e，dev `63d6bc1f`）
- `feishu` monitor.account-WFdlCDhR.js  b9ba9fc8 → 943b0116

**这期间合入 dev 的 PR**：
- #202 feat(feishu): 每条消息记录用户口径的首字时间

## v2026.9.1-db91.6-worker-prewarm-20261005

上线：2026-10-05 13:12 CST 安装，13:15 重启 Gateway，75 s 后 5 个 worker 全部预热完成  ·  tag `v2026.9.1-db91.6-worker-prewarm-20261005`

**摘要**：V 一直常驻 5 个 worker，但「常驻」只是进程起好了。每个 worker 接的第一单还要付一整套一次性准备，V 上实测进 worker 到出第一个字要 13 s，热的只要 2–3 s。重启、按内存回收换新、扩容之后 worker 都会变冷。V 用过的每一版 worker 都没有回合级预热，9/12 的 VLab 候选也从没上线。

现在 worker 报 ready 之前会先做三件事：拿一次 prepared-model 租约；加载 agent 命令模块的 14 个懒加载模块；打开本进程的会话库，再只读解析一次会话。最后这一步之前，进程里没有打开的库连接，每次只读查找都会新开连接，把全部会话的规范 key 重新扫一遍。预热不写库、不调模型、不调工具，失败时照常 ready。用 `OPENCLAW_WORKER_EAGER_PREPARE=0` 可以关掉（#198）。

- VLab candidate：冷 worker 进 worker 到调模型 22.6–24.2 s → 5.8–6.2 s。
- 共享 VLab 真实飞书：重启后首轮 31.5–37.5 s → 15.6–21.4 s。
- V 重启后（13:17 c15，15/15）：首轮回复中位 23.5 s，worker 第一单的准备运行时从 4 s 降到 0.13 s，但从进命令到调模型仍要 7–12 s；第二轮中位 4.2 s。剩下的冷开销（技能快照、构建工具集、首次 import，以及 Gateway 重启后的开销）留给后续。

相对上一版 `v2026.9.1-db91.6-voice-confirmation-switch-20261005`：3 个文件变化。

**经 VLab 发版 `worker-prewarm-20261005`**（claude-worker-prewarm-v，dev `a1432ea8`）
- `core` agent-command-DPfawBbr.js  f9142430 → e8a0c7e4
- `core` agent-command-DeP5kHlK.js  893415c5 → e7b522ff
- `worker` worker.mjs  4bf1472d → 898fd1fc

**这期间合入 dev 的 PR**：
- #198 perf(worker): worker 接第一单之前先做完准备（预热）

## v2026.9.1-db91.6-voice-confirmation-switch-20261005

上线：2026-10-05 12:51 CST 安装，12:52:51 受控重启 Gateway（worker 全空闲、无通话，原生 suspend/drain 后重启），12:54:27 就绪（95 s）·  tag `v2026.9.1-db91.6-voice-confirmation-switch-20261005`

**摘要**：GPT Live 电话里 V 能正常用自己的工具了，语音查飞书日历不再报 `VOICE_CONFIRMATION_REQUIRED`（PR #196）。这道门是 OpenClaw 原生的语音口头确认：`exec` 只把 cat/grep/ls 等当只读，`lark-cli` 一律要确认。过去 V 上不拦，只是因为回合跑在 worker 里、worker 看不到语音绑定；GPT Live 把语音 exec 交回 Gateway 后它才生效（生产记录：音响 V 17/17 次执行，GPT Live 11/11 次被拦）。现在默认放行，语音和文字的 V 权限一致，本人入口和普通入口都放开（Tianyi 定）；`OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1` 可恢复原生门。

**V 上验收**：2026-10-05 12:55–12:57 CST，公网 https://openclaw.tianyi.live/voice/ 真实 GPT Live 通话（V 本机无头 Chrome，合成用户语音「帮我查一下今天飞书日历上有哪些安排」，访问 cookie 在服务器端签发）。会话 `gpt-live-h5-experiment-5aefdaf6`：后台 7 次 exec 全部执行、0 次被拦，`lark-cli calendar +agenda --as user` 返回三场日程；提问后 44 s 语音读出「九点半到十点半长老会、三点到六点客户沟通 · Tianyi × 袁振、六点到七点半福餐厅吃饭」，与工具结果逐条一致。

相对上一版 `v2026.9.1-db91.6-placement-evidence-20261005`：1 个文件变化。

**经 VLab 发版 `voice-confirmation-switch-v1`**（claude-voice-confirmation-switch，dev `71d3ecf2`）
> 验收：Shared VLab 2026-10-05 12:45-12:49 CST: real GPT Live call (gpt-live-1-codex, WebRTC) through the dev H5 (transient loopback unit, stopped) on the shared Gateway; synthetic USER audio "帮我查一下今天飞书日历上有哪些安排". Voice session 55062026, session gpt-live-h5-experiment-02fa6d22: backend ran 25 exec calls starting with lark-cli calendar +agenda, all executed, 0 VOICE_CONFIRMATION_REQUIRED (V before fix: 11/1…
- `core` agent-tools.before-tool-call-g2OT63u5.js  f410f20c → 618ab46a

## v2026.9.1-db91.6-placement-evidence-20261005

上线：2026-10-05 10:38 CST 安装，10:39 重启 Gateway，10:41 就绪（PID 1518653）  ·  tag `v2026.9.1-db91.6-placement-evidence-20261005`

**摘要**：Gateway 每分钟会把所有 worker placement 对应的会话读出来、逐条解析一遍，用来判断有没有孤儿记录。placement 只增不减：9/18 有 295 条，10/05 有 2394 条，大头来自夜班。这一步就变成每分钟在主线程上卡 2–3 秒，落在卡顿里的消息都要等它结束。现在只用索引判断「会话还在不在」，只有 key 已经换了新会话 id 时才解析那一条（#193）。

- VLab candidate（3172 条）：每次检查 2353→198 ms，最长阻塞 8.5 s→约 0.5 s；判断结果与原逻辑 3172/3172 一致。
- 共享 VLab 真实飞书：6 个压测群 /deepseek，每条到会话库核对回复，旧代码 24/24、新代码 24/24 成功，中位数 3.1–3.5 s。5 分钟剖析里超过 2 s 的主线程占用 10→3 次。

相对上一版 `v2026.9.1-db91.6-gpt-live-voice-20261005`：2 个文件变化。

**经 VLab 发版 `placement-evidence-20261005-b`**（claude-placement-evidence，dev `790ae74c`）
- `core` server-worker-placement-startup-BvPREvpr.js  96b5b482 → 8366d71a
- `core` session-accessor-K0XuW6ln.js  21f2a569 → 5c2eb542

**这期间合入 dev 的 PR**：
- #193 fix(gateway): 60 秒 placement 对账不再逐条解析会话

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
