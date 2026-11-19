# Skill Workshop 经验复盘：有界复盘 + 刹车 + 一次性清理清单（2026-11-10）

## 现状（V，只读核对，2026-11-10 01:35–17:00 CST）

| 指标 | 数据 |
|---|---|
| 每天复盘次数（11/02–11/09，journald 全进程） | 73 / 102 / 46 / 63 / 72 / 11 / 8 / 59 |
| 其中溢出后触发压缩 | 23 / 12 / 8 / 7 / 17 / 0 / 5 / 14；最大一次请求 1,518,605 tokens |
| 单次成本样本（11/09 23:46） | 输入 340,941 tokens（缓存 257,408），输出 3,490 |
| 自动提案（9/05 起） | 335 条，来自 78 个会话、153 个"会话·天"；182 条（54%）是同一会话当天的第 2–14 条 |
| 结果 | 自动新建 91 个 skill（90 个还在），只有 12 个被读过 |
| 队列 | 11/02–11/05 pending 满 50 条，11/03（102 次）和 11/05（63 次）零产出；现有 pending 29 条，最早的是 10/12 |
| 超上限 | 31 个 skill 超过 1 万字符的自动修改上限；ci-build-triage 每天被尝试几十次，每次都被拒 |
| 列表截断 | 复盘提示只列前 50 个可写 skill，工作区有 288 个 |
| 每周集合清理 | 主工作区从未成功（11/07 身份不一致，11/08 286 KB 超过 240 KB 上限） |
| /vds 下的使用记录 | skill_usage 最后一次写入是 11/09 11:49，此后不再记录（单独修复，见子项 C） |

## 改动（本 PR，`skill-review-bounded-v1`）

源码：openclaw-versa `versa/port-skill-review-bounded-20261110` @ `3ed6d576c4c`，基于 `versa/port-backlog-20261029`。

### A. 有界复盘（回移上游 #173889 / #190158）

- **证据**：只读前台会话活跃分支最新 64 条事件（原始读取上限 2 MiB）。每条按复盘需要裁短：
  - 工具输出 800 字符，参数 600 字符，用户文本 4,000 字符，助手文本 2,000 字符，摘要 4,000 字符；
  - 图片换成占位文字，推理块去掉。
  - 裁完后只保留能装进 32 KiB 的最新事件。超出时按算出的条数再读一次，这样压缩边界的下标仍然对得上。
  - `openModelContext` 为此新增一个逐条改写的 `transformEntries` 钩子，持久化的会话不受影响。
- **运行参数**：
  - 只发 `skill_workshop` 一个工具；`promptMode: minimal`，`bootstrapContextMode: lightweight`；
  - 不带 skills 快照、群聊系统提示、clientTools，不强制 message 工具；
  - `thinkLevel: low`，`maxTokens: 8192`（够写一份 1 万字符的完整更新）。
- **让路**：每秒检查一次。只要有前台回合或回复在跑、且复盘还没花掉那一次修改，就中止复盘，不记失败，也不重试。修改已经发生时不中止，免得留下没人应用的 pending 提案。
- **提示**：说明这是"最近事件的有界摘录"，只能依据摘录里能看到的结果，不得推断缺失的结果或重复操作。

### B2. 刹车

- **同一会话 24 小时内最多复盘 1 次**：从复盘真正开始时计；因让路中止的不算。冷却记录在进程内存里，Gateway 和 worker 各自独立，重启后清零。
- **超上限 skill**：在可写列表里标 `(at size cap)`，提示里写明只能缩短。
- **列全部可写 skill**：最多 400 行，每行不超过 120 字符，原来只列 50 个。
- **过期清理**：每次复盘前，把在 pending 里等满 7 天的自动提案标为 rejected，原因写"Expired: autonomous proposal waited 7 days without operator review"。操作员发起的提案永不过期。

### 不变的部分

- 复盘的模型继承前台：/vds 下就是 deepseek-flash。harness 仍是 PI，上游最新的复盘运行器也是 PI。
- 自动应用规则不变：Workshop 自建的 skill 自动应用，手写 skill 的更新等操作员处理。

## B3. 一次性清理清单（等 Tianyi 逐组拍板，本 PR 不删任何东西）

数据：V 的 skill_usage 截至 2026-11-10 17:00 CST。"读"指被 OpenClaw 记录到的读取次数。

注意 skill_usage 的覆盖不全：
- 只有 PI/worker 回合的 `read` 工具会被记录；
- /vcodex、/vds（Codex harness）、/vcc 的读取从来都没记（见子项 C）。

所以"没被读过"表示"没有被记录到的读取"，不等于确定没人用。

### 1. 近似重复：建议合并成一个（保留第一个）

| 组 | skill（创建日，被改次数，读） | 建议 |
|---|---|---|
| 展商采访剪辑 | exhibitor-interview-cut（11/09，0，0）、exhibitor-interview-shorts（11/06，1，0）、exhibitor-interview-clips（11/09，0，0）、zhongfang-exhibitor-clips（11/06，0，0）、interview-film-cut（11/06，5，0） | 合成 exhibitor-interview-cut；interview-film-cut 是通用精剪，可单独保留 |
| WA 发送时间 | wa-send-timing（11/02）、send-window-timing（11/02） | 合并 |
| 飞书表格交付 | feishu-bitable-deliver（10/30，读 1）、feishu-sheet-deliver（11/06）、feishu-sheet-to-doc（10/30） | 合成 feishu-bitable-deliver |
| YouTube 发布 | youtube-schedule-publish（11/06）、youtube-channel-publish（10/30） | 合并 |
| WABA 模板 | waba-template-ops（10/30）、waba-template-vars（10/30）、waba-carousel-template（10/30） | 合成 waba-template-ops |
| DealClaw 定时器 | dealclaw-timer-inventory（11/09）、dealclaw-cron-merge（10/29） | 合并 |
| Home Assistant | home-assistant-remote-maintenance（9/05）、remote-ha-virtualbox-diagnosis（9/05） | 合并 |

### 2. 超过自动修改上限：需要人工改写

- ci-build-triage：10,013 字符（16 KB），被自动改了 43 次，0 次读取。它的范围已经从"构建定位"长成 16 节，建议人工拆成"触发构建"和"失败定位"两份，或者归档。
- 另外 30 个超上限的 skill 都是手写的，复盘本来就改不了。名单见 V `skills/` 目录下超过 1 万字符的那些。

### 3. 单次任务味重：建议归档（归档前先把目录备份一份）

investment-plan-reconciliation（个人理财）、exam-prep-planning（个人备考）、review-report-revision、xiaoyuan-billing-review、ai-visibility-audit、agent-token-burn-triage、factory-shortvideo-script-pack、client-escalation-solution、credit-gate-trigger-words、onboarding-failure-ux、tenant-page-error-triage、dashboard-snapshot-backfill、datasource-migration-fanout。

### 4. 关于 V 自身运维的 skill：确认是否仍然有效

gateway-rpc-adapter-repair、openclaw-safe-downgrade、openclaw-harness-evaluation、openclaw-disk-full-recovery、plugin-defect-verification、memory-promotion-audit、long-term-memory-update、mac-presentation-memory-ingestion、gpt-live-talk-tuning。这些是 9 月 V 维护自己时学到的，部分流程已经被平台仓库的脚本取代。

### 5. 其余：保留观察

其余约 50 个没被读过的 skill，都是具体业务类：DealClaw、飞书文档、视频交付、WABA、TikTok、YouTube 等。等使用记录覆盖 /vds（子项 C）之后，再看一个月的真实读取。

## 验证

- 源码测试：改动前，新加或修改的调度、提示、应用、超上限测试共 9 项失败，证据测试套件无法加载；改动后 `experience-review*.test.ts`、`workspace-skill-read.test.ts`、`session-manager-model-context-window.test.ts` 全部通过。证据测试用真实 SQLite 会话：200 轮，约 70 MB 工具输出和图片。复盘只读到最新的不到 64 条，模型可见内容不超过 36 KB，最早的轮次不在其中，图片字节也不在其中。
- `tsgo -p tsconfig.core.json`：只有一个与本次改动无关的既有错误（`native-hook-relay-client-store.ts`）。
- dist：按 V 现网字节逐处精确替换，5 个文件；`lab/skill-review-bounded.test.mjs` 6/6 通过；`bash tests/vlab-static.sh` 通过。
- candidate：见 PR 描述。
