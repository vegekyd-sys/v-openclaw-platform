<!-- PR 正文草稿（release 包，WP12）。合入前把 <待填> 换成 e2e 的结果：docs/inter-session/e2e-*.md。 -->
# feat(inter-session): sessions_send 经渠道入站桥 + Gateway 账本（R1+R2 一次发版）

## 结论

V 的跨会话协作改成「请求在对方聊天里可见地出现，对方在那里像收到真人消息一样流式地做，结果自动交回一次」。入口仍是原生 `sessions_send`，四个渠道（飞书、Telegram、钉钉、企微）一起上。

- 发起方交出后说一句就结束本轮，不再 sleep 或轮询；同一轮交出的几件等齐后只叫醒一次、汇报一次。
- 对方忙时排队，轮到再开始，不插进正在跑的回合；兜圈被拦下；V 重启后在途的事做完或明确报告，不重复唤醒。
- 发版是**一个** plan：`lab/inter-session.plan.json`，34 个文件（核心 9 + 飞书 1 + 钉钉 3 + 企微 2 + 插件目录 19），`before` 全部是 V 现在的字节。插件由 `scripts/configure-v-session-relay.mjs` 在**同一次** `v-self-restart --while-stopped` 里打开；`DISABLED` 文件约 1 秒止血，不用重启。
- e2e 结论：<待填：各场景通过/未过的汇总一句>。

用户说明（各渠道看到什么、限制、怎么停、上线和回滚步骤）：`docs/inter-session/README.md`。设计：`docs/inter-session/design.md`（§13 的修订优先）。

## 证据

**V 字节**：15 个被改文件 2026-10-20 16:50、19:25 CST 两次只读核对，与捕获 `v2026.9.1-db91.6-subagent-index-20261020` 逐个相同，Gateway 仍跑该发版（`tests/fixtures/inter-session-v-bytes.json`）。合入前要再核对一次：<待填：时间、结果>。

**探针**（WP0，`docs/inter-session/probe-results.md`）：candidate `c03c6b70`、`c6cbf382`、`6a39ee54`。飞书入站把预设 runId 和 `vInterSession` 原样带到 get-reply（worker、vds、vcc 三条都是）；worker 与 vds 的 sessions_send 拿到真人发送者和 owner 标记；插件缺席时错误文本命中退回正则。

**e2e**（candidate，飞书 loopback webhook 入站 + VLab bot 真实出站，用 owner 身份 lark-cli 读回、按服务器时间判定；Telegram / 钉钉 / 企微用 `lab/candidate` 里的假平台）：

| 场景 | harness | candidate | 结果 | 证据（消息 id / 时间 / 账本） |
|---|---|---|---|---|
| F1 当场提问 | worker / vds | <待填> | <待填> | <待填> |
| F2 异步单件（目标 75 s） | worker / vds | <待填> | <待填> | <待填> |
| F3 / F3b / F3c 目标忙、竞态、守卫窗口 | worker | <待填> | <待填> | <待填> |
| F4a / F4b 插话（owner / 非 owner） | worker | <待填> | <待填> | <待填> |
| F5 目标回合中 kill -9 | worker | <待填> | <待填> | <待填> |
| F6 `VSR_CRASH_AT` 真机版 | worker | <待填> | <待填> | <待填> |
| F7 fan-out 3 + fan-in | worker / vds | <待填> | <待填> | <待填> |
| F8 诱导兜圈 | worker | <待填> | <待填> | <待填> |
| F9 / F10 NO_REPLY、模型无效 | worker | <待填> | <待填> | <待填> |
| F11 可见正文裁剪与隐去 | worker | <待填> | <待填> | <待填> |
| F12 只经 sessions.patch 建的新房间 | worker | <待填> | <待填> | <待填> |
| F13 续接 A→X→3 房间 | worker / vds | <待填> | <待填> | <待填> |
| F14 兄弟互问 | worker | <待填> | <待填> | <待填> |
| F15 后台收尾 | worker | <待填> | <待填> | <待填> |
| F16 `DISABLED` | worker | <待填> | <待填> | <待填> |
| F17 全局上限 fan-out 5 | worker | <待填> | <待填> | <待填> |
| TR1 / TR2 三房间协调者 | worker / vds | <待填> | <待填> | <待填> |
| Telegram F1/F2/F3/F5 | worker | <待填> | <待填> | <待填> |
| 钉钉 F1/F2/F3/F5 | worker | <待填> | <待填> | <待填> |
| 企微 F1/F2/F3/F5 | worker | <待填> | <待填> | <待填> |
| C-stock 对照：V 原字节复现三个遗留问题 | worker | <待填> | <待填> | <待填> |
| C-fallback 对照：插件停用 = 旧路径 | worker | <待填> | <待填> | <待填> |
| S-tail：`requester_tail_ms` 分布（worker 轮询闸的判据） | worker / vds | <待填> | <待填> | <待填> |

**离线**：`node platform/cli.mjs test` <待填：通过数/总数>；`./tests/vlab-static.sh`、`node platform/cli.mjs audit`（errors 0，offlineFiles 326）、`scripts/scan-secrets.sh` 通过。发版相关的新测试：
- `tests/inter-session-plan.test.mjs`：plan 等于生成器输出；每个 `before` = V 捕获字节 = 核对记录；每个产物 = 所属包的补丁函数作用在 V 字节上的结果；插件只发 package.json 列出的文件、不带 tests；每个 target 映射到 V 上记录的路径；用这份 plan 模拟共享 VLab 的 deploy/rollback（指纹完全还原）和 promote-to-v 的 install/undo。
- `scripts/configure-v-session-relay.test.mjs`：apply / revert 只动三处、幂等、从不创建 allowlist、Gateway 在跑或插件目录不对时一字不写、`revert --undo` 字节还原、输出里没有其他插件的配置。
- `lab/shared/files.test.mjs`、`scripts/promote-to-v.test.mjs`、`scripts/lib/runtime-components.test.mjs` 的新用例（下面「改动」里的三处修复，每条都先在旧代码上确认失败）。

## 改动

**V 上被替换的 15 个文件**（`before → after`；全部由各包的补丁从 V 字节生成，测试钉死）：

| 组件 | 文件 | 包 | V 字节 |
|---|---|---|---|
| core | `sessions-spawn-tool-1FQMTkIo.js` | `sessions-send-relay` | `1a7ab8f9` → `b3c380d9` |
| core | `openclaw-tools-BODVdJQD.js` | `sessions-send-relay` | `af27d9ae` → `8635f325` |
| core | `get-reply-CqW1y05D.js` | `inter-session-admission` | `9bac6b7c` → `03db4eac` |
| core | `agent-runner.runtime-CAdsMsQt.js` | `inter-session-admission` | `8c192b9d` → `7ad469df` |
| core | `dispatch-from-config-DOJq_7CI.js` | `inter-session-admission` | `f150902a` → `97e69403` |
| core | `task-registry-activity-DSlVVJwD.js` | `task-bridge-extra-sources` | `8a89045a` → `2e70d33d` |
| core | `v-experience.js` | `v-experience-session-kind` | `5d939fa7` → `484da309` |
| core | `telegram-ingress-drain-factory-DJM2Jqrc.js` | `telegram-inter-session-bridge` | `acdf98ee` → `320e82de` |
| core | `bot-message-DC6p8sB3.js` | `telegram-inter-session-bridge` | `f37781c4` → `95064e71` |
| 飞书 | `monitor.account-WFdlCDhR.js` | `feishu-inter-session-bridge` | `ffdf7072` → `a8ff41e5` |
| 钉钉 | `connection-DCvu-l09.mjs` | `dingtalk-inter-session-bridge` | `397c42c3` → `6df0dd3c` |
| 钉钉 | `message-handler-BUoLSylZ.mjs` | `dingtalk-inter-session-bridge` | `d914cbce` → `b36b6888` |
| 钉钉 | `v-experience.mjs` | `v-experience-session-kind` | `5d939fa7` → `484da309` |
| 企微 | `monitor.js` | `wecom-inter-session-bridge` | `d4fe3561` → `0c9c1b50` |
| 企微 | `v-experience.mjs` | `v-experience-session-kind` | `5d939fa7` → `484da309` |

- **核心**：`sessions_send` v3 在读对方历史之前把发送交给 Gateway 的 `vrelay.send`，插件缺席、`DISABLED` 或发起方不受支持时照常走 v2；get-reply 的独占准入守卫（忙则 BUSY、零可见输出）；协作回合的正文按字面处理（「停止」「/new」「/approve」都不生效）；后台行的「会话请求」数据源。
- **渠道入站桥**：飞书、Telegram、钉钉、企微各一个，合成一次普通入站交给原 handler，所以卡片、过程流、清单、页脚、ask_user、插话都复用原来的。
- **插件** `apps/v-session-relay/plugin` 2.0：账本（单写者、先落盘后副作用）、每个目标 FIFO、全局上限、批次与唤醒、续接、后台收尾、重启恢复、防兜圈、轮询闸。发到 V 的 `extensions/v-session-relay/`。
- **监控**：首字统计和哨兵不把协作回合当用户回合；v-self-restart 的空闲闸门等协作回合（`vrelay.list`）。
- **发版接入（本包）**：
  - `scripts/lib/runtime-components.mjs` 新组件 `session-relay`（`extensions/v-session-relay/`，整目录捕获，读 V 要 sudo）。它在发版前两边都不存在：标为 `absentOk`，parity 把缺失目录当空目录（仍是 blocking），promote-to-v 在 V 有了它之后才捕获。
  - `scripts/promote-to-v.mjs`：V 还没有的组件不捕获（否则这次之前的每次发版都会在捕获一步失败）；新文件所在的新目录（root 0755）记进 undo.json，undo 时删掉变空的目录。
  - `lab/shared/files.mjs`（共享 VLab 发版工具）：修复「新目录里的新文件」deploy 必失败（`stat` 父目录 ENOENT），新目录按最近的已有上级目录建（权限与属主），rollback 删掉变空的目录，指纹完全还原。**vlab91 上的工具副本需要另外更新**（见「未覆盖」）。
  - `scripts/configure-v-session-relay.mjs plan|apply|revert`：只改主配置的 `plugins.load.paths`、`plugins.allow`、`plugins.entries["v-session-relay"]`（`{enabled: true, config: {workerGuard: false}}`）；幂等、打印 diff（只含这三处）、写 undo 文件到 `/var/backups/v-config/`；Gateway 在跑时拒绝写；插件目录不存在或不是 2.0 时拒绝写；revert 先 `enabled:false` 再去掉路径和 allowlist 项，`revert --undo` 按字节还原。
  - `lab/build-inter-session-plan.mjs` + `lab/inter-session.plan.json`（`baseRelease: "REPLACE_AT_STAGE"`）。
- 新测试都已登记进 catalog（`release-parity`），`platform.test.mjs` 计数 324 → 326。
- 需要一次 v-self-restart（dist 和配置同一次生效）：`--if-busy abort --idle-timeout 3600 --while-stopped "<node> /opt/v-sentinel/configure-v-session-relay.mjs apply"`。
- 不发：`lab/release-files/sessions-send-reply-once`（已并进 v3）和 `lab/release-files/mcp-after-tool-call`（只有插件 1.x 用）。

## 未覆盖 / 后续

- **共享 VLab 的配置哈希**：共享发版流程在 stage 时记下配置哈希，deploy、accept、rollback 都核对。激活插件要改配置，所以激活之后 `accept` 和 `rollback` 都会被拒。需要 Tianyi 选：(a) 先 accept（证据是 candidate 结果加插件未加载时旧路径无回归），再激活和验收，要回滚时先 `revert --undo` 字节还原再 rollback；(b) 激活、验收、`revert --undo`、accept、再 apply。README 推荐 (a)。
- **vlab91 的发版工具**：`/srv/vlab-production-mirror/labs/shared-workflow/tool/files.mjs` 10/20 与仓库旧版逐字节相同。不先换成本 PR 的版本，这个 plan 在 deploy 时会失败、回滚并留下 `pending.json`。替换要 Tianyi 授权。
- **/vcc**：共享 VLab 的 claude 登录 10/17 起过期，candidate 没跑 /vcc 当目标；原生 Bash 的 sleep 拦不到。**/vcodex** 只能在共享 VLab 验收。<待填：e2e 实际覆盖到的 harness>
- **工作区规则**：AGENTS.md 的新一节和 Task Room 技能改动（`docs/inter-session/workspace-changes.md`）要 Tianyi 看过 diff 才写入 V；没写入时群聊沉默和 NO_REPLY 规则可能让交回的结果为空。
- **worker 轮询闸**：代码已在，默认关（`workerGuard: false`）；按 S-tail 的 `requester_tail_ms` 判据（5 次里少于 4 次在 60 s 内结束就开）决定，开的时候只改主配置。
- A5（插件经 `callGatewayFromCli` 能否拿到 operator.admin）未实测；拿不到时 agent transport 以非 owner 身份运行。
- 已知遗留（各包报告）：核心给模型看的 "Conversation info" 里 `message_id` 仍是合成 id；群里 message tool 的额外发送落在顶层、不挂在锚点下；`finalCount` 口径飞书/Telegram 与钉钉/企微不同。
- 9.8 升级时要把核心补丁回移到 fork 源码，且先修 #161719（设计 §12.4）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
