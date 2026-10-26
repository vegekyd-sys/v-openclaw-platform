# V 跨会话协作（sessions_send）使用说明

> 设计见 [design.md](design.md)（§13 的修订优先）。本文写给用的人和上线、回滚的人。

## 它做什么

一个聊天里的 V（私聊、群、Task Room，或 Telegram / 钉钉 / 企微里的会话）可以用原生 `sessions_send` 把一件事交给另一个聊天里的 V：

- **交出去**：对方聊天里出现一条「📨 来自「Tianyi 私聊」的请求 #7F3A」，下面紧跟对方平时那张回复卡。对方像收到真人消息一样在那里做，有过程流、清单、页脚，可以问人，也能发图和文件。
- **交回来**：做完后，发起的聊天里出现「↩️「任务群 a」交回了 #7F3A 的结果」，接着是发起方 V 的一张普通回复卡，汇报一次。
- **一轮交出几件，只叫醒一次**：同一轮交出的几件全部有结果后（成功、失败或中止都算），发起方只被叫醒一次，一起汇报：「↩️ 3 件都有结果了：「a」✅ ·「b」✅ ·「c」⚠️」。
- **当场问**：`timeoutSeconds=120` 是提问。对方聊天里出现「❓「任务群 a」问 #Q2」和回答卡，答案直接回到提问的那一轮，不另外交回。
- **发起方不等待**：交出后发起方说一句交给了谁，就结束本轮；等待期间卡片上显示「⏳ 后台 1 项进行中 · 会话请求」。
- **对方正忙**：请求排队，锚点末行写「⏳ 这里正在处理别的事，处理完就开始这条」，轮到时自动开始，不会插进正在跑的那一轮。
- **防兜圈**：最多转派两层；一条协作链来回超过上限、两个会话互相等待、回答问题的那一轮再转派，都会被拦下，并告诉 V 原因。
- **重启**：V 重启后，已交出的事会接着做完或明确报告「做到一半 V 重启了」，不会重复唤醒。

`#code` 在请求、排队、失败、交回各处都一样，可以用它在两个聊天之间对上号。

## 各渠道看到什么

| | 飞书 | Telegram | 钉钉 | 企业微信 |
|---|---|---|---|---|
| 请求锚点 | 📨 / ❓ 文字消息，群里回复卡挂在它下面 | 纯文本消息，回复挂在它下面 | markdown 消息，回复卡紧随其后 | markdown 消息，回复紧随其后 |
| 对方的回复 | 流式卡、过程流、清单、后台行、页脚、ask_user、图文、插话 | 草稿流式、清单、后台行、图文 | AI 卡与工作清单；**没有页脚**（今天也没有） | **不流式**：只有锚点、单独发的问题、最后一条 markdown 结果、后台结束行；锚点末行写「（企业微信里看不到处理过程，做完会发结果）」 |
| 可见正文上限 | 1500 字 | 3500 字 | 1500 字 | 1000 字（且 ≤ 3800 字节） |
| 以 owner 身份做事 | 是（链根是 Tianyi 时） | 是 | **否** | **否** |

- 无渠道的会话（V 主会话、webchat、V App）只有最终结果，没有请求锚点。
- 有外人的群只显示请求的前 200 字，末行写「…（全文 n 字已交给 V）」；只有 Tianyi 和机器人的群（例如 Task Room）显示全文。对方 V 永远拿到全文。
- 像 `sk-…`、`ghp_…`、私钥块这样的内容在聊天里显示为「‹已隐去›」。
- 请求正文一律按字面处理：里面的「停止」「/new」「/approve」不会被当成命令。

## 限制

- **严格批次**：一轮交出的几件里有一件卡住，汇报会等它结束；单件最长 12 小时，排队最长 6 小时，到时按超时交回。
- **数量上限**（插件配置 `limits`，默认值）：同时在跑的请求回合 4 个（第 5 个排队）；一轮最多交出 5 件；每个聊天排队 10 件；最多两层转派；当场提问最多等 300 秒，超过转为结果回来时叫醒。
- **钉钉、企微没有 owner 身份**：在这两个渠道里，协作回合和今天真人发的消息一样，不能用需要 owner 权限的工具。
- **至少一次**：Telegram、钉钉、企微发请求锚点时不能去重；网络抖动时同一个 #code 的锚点可能出现两次。回合不会重复跑。
- **协调者不能撤回或改正在跑的房间**：要改，人到那个群里插话或说「停止」。
- **/vcc**：原生 Bash 里的 sleep 拦不到，只靠提示约束；9.1 上跨轮可能丢上下文，所以交出的请求必须自包含；协作回合里建不了定时任务。共享 VLab 的 claude 登录 10/17 起过期，/vcc 当目标还没有在 candidate 里实测。
- **/vcodex**：只能在共享 VLab 验收（candidate 里复制登录令牌会连带 V 的登录）。
- 交给自己的请求方只能当场问（不能再异步发回去），它的最终回复本来就会自动交回。

## 怎么停

1. **立即止血（不重启）**：在插件账本目录建一个 `DISABLED` 文件，约 1 秒生效。之后的 `sessions_send` 退回旧路径（对方仍会回复，但没有请求锚点和流式卡，结果作为一条最终消息发出）；已经在途的照常做完。删掉文件即恢复。

   ```sh
   # V（账本在 <stateDir>/v-session-relay/v2/）
   ssh v 'sudo -u openclaw mkdir -p /home/openclaw/.openclaw/v-session-relay/v2 && sudo -u openclaw touch /home/openclaw/.openclaw/v-session-relay/v2/DISABLED'
   # 共享 VLab
   ssh vlab91 'sudo -u lab-db91-parity touch /srv/vlab-production-mirror/labs/instances/db91-parity/state/v-session-relay/v2/DISABLED'
   ```

2. **停一件正在做的事**：到对方聊天里说「停止」（或用原生停止）。发起方会收到「⏹「…」那边中止了 #code」。
3. **整体停用插件**：见下面「回滚」第 2 步，需要一次重启。

v-self-restart 的空闲闸门会把在跑的协作回合算作忙（`vrelay.list`），发版用 `--if-busy abort` 时不会打断它们。

## 上线（需要 Tianyi 分别授权合入 dev 和上 V）

一个发版：`lab/inter-session.plan.json`，34 个文件 = 核心 9 个（含 Telegram）+ 飞书 1 个 + 钉钉 3 个 + 企微 2 个 + 插件目录 19 个。`before` 都是 V 现在的字节，插件文件是新增。改了任何一个包的产物后重新生成：`node lab/build-inter-session-plan.mjs`（`--check` 只核对）。发版本身不改配置，插件由 `scripts/configure-v-session-relay.mjs` 打开。

1. **共享 VLab 的发版工具先更新**：`lab/shared/files.mjs` 这次加了「新目录」支持。vlab91 上 `/srv/vlab-production-mirror/labs/shared-workflow/tool/files.mjs` 是旧版（10/20 与仓库逐字节相同）：它在 stage 时不报错，deploy 时遇到 `extensions/v-session-relay/` 这个新目录会失败、回滚，并留下要人工处理的 `pending.json`。合入后由 Tianyi 授权按原有方式替换（旧文件留成 `files.mjs.before-new-dirs-<日期>`）。
2. **共享 VLab stage + deploy**：`vlab.mjs lease` → `package --plan lab/inter-session.plan.json` → `stage` → `deploy`。此时插件文件已在 `runtime/extensions/v-session-relay/`，但没有加载，`sessions_send` 走旧路径。
3. **共享 VLab 激活**（持 lease；把 dev 上的 `scripts/configure-v-session-relay.mjs` 拷到 vlab91，脚本按主机名用共享 VLab 的配置和插件目录；停共享 Gateway 后 apply，再启动）：

   ```sh
   sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node configure-v-session-relay.mjs plan    # 先看 diff
   sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node configure-v-session-relay.mjs apply   # Gateway 停着时
   ```

   **注意配置哈希**：共享发版流程在 stage 时记下配置文件的哈希，deploy、accept、rollback 都核对它，激活之后 `accept` 和 `rollback` 都会被拒。需要 Tianyi 选一种做法：
   - (a，推荐) 先 `accept`（证据：candidate 结果，加上插件未加载时旧路径无回归），再激活并按设计 §10.6 验收。验收不过要回滚时，先 `configure-v-session-relay.mjs revert --undo <apply 写的 undo 文件>` 把配置按字节还原（哈希回到 stage 时），再 `vlab.mjs rollback`。
   - (b) 先激活、验收，再 `revert --undo`、`accept`、重新 `apply`。多两次重启。
4. **上 V，装文件**：`node scripts/promote-to-v.mjs --release <id> --name v2026.9.1-db91.6-inter-session-<日期> --owner <o> --apply`。它只装文件、不重启。插件目录落在 V 自动扫描的 `/home/openclaw/.openclaw/extensions/v-session-relay/`，因为 V 配了 `plugins.allow`，不会自己加载。
5. **把配置脚本放到 V**（root 所有，agent 改不到）：

   ```sh
   scp scripts/configure-v-session-relay.mjs v:/tmp/
   ssh v 'sudo install -m 0755 -o root -g root /tmp/configure-v-session-relay.mjs /opt/v-sentinel/ && sudo /opt/node-v22.23.1/bin/node /opt/v-sentinel/configure-v-session-relay.mjs plan'
   ```

6. **一次重启同时生效 dist 和配置**：

   ```sh
   sudo v-self-restart --reason "inter-session 上线" --requested-by release --if-busy abort --idle-timeout 3600 --delay 0 \
     --while-stopped "/opt/node-v22.23.1/bin/node /opt/v-sentinel/configure-v-session-relay.mjs apply"
   ```

   apply 只改 Gateway 主配置的三处：`plugins.load.paths` 加插件目录、`plugins.allow` 加 `v-session-relay`、`plugins.entries["v-session-relay"] = {enabled: true, config: {workerGuard: false}}`。写之前把原文件存成 undo 文件（`/var/backups/v-config/v-session-relay-apply-*.json`）。插件目录不在、或不是 2.0 时拒绝写（指向不存在的目录会让整份配置失效）。Gateway 在跑时拒绝写（V 上改这几个键会当场整体重启）。worker 配置在 Gateway 启动时由主配置推导，插件会进每个 worker，但在 worker 里什么都不启动。
7. **核对**：日志有 v-session-relay 启动；`vrelay.list` 有回应；worker 配置（`worker-openclaw.json`）列出了插件，且 worker 数大于 0；`vlab-v-parity.mjs` 是 ALIGNED；Tianyi 按设计 §10.7 在飞书私聊验收。
8. **工作区规则**：AGENTS.md 新增的一节和 Task Room 技能的改动按 [workspace-changes.md](workspace-changes.md) 出 diff，Tianyi 确认后才写入 V。没写入时，群聊沉默和 NO_REPLY 规则可能让交回的结果为空。

## 回滚

顺序不能反：**先停用插件、重启，再删文件**。插件目录还在配置里时删掉它，worker 会立刻每轮报错，下次重启 Gateway 也起不来。

1. **立即止血**：建 `DISABLED`（见上）。
2. **停用插件**（一次重启）：

   ```sh
   sudo v-self-restart --reason "inter-session 回滚：停用插件" --requested-by release --if-busy abort --idle-timeout 3600 --delay 0 \
     --while-stopped "/opt/node-v22.23.1/bin/node /opt/v-sentinel/configure-v-session-relay.mjs revert"
   ```

   revert 先把 `enabled` 设为 false（条目和它的 config 留着，作为明确的关闭开关），再把插件目录从 `plugins.load.paths`、把 `v-session-relay` 从 `plugins.allow` 里去掉。dist 补丁还在，`sessions_send` 走旧路径。只有插件出问题时，到这一步就够了。
3. **撤回 dist 和插件文件**（Gateway 已经在第 2 步的配置上起来之后）：`node scripts/promote-to-v.mjs --undo /opt/v-release-backups/<name>-<时间>`。它还原 15 个 dist 文件、删掉插件文件和它建的目录，然后马上再做一次 v-self-restart（dist 在启动时才生效），再按 `docs/vlab-v-sync-flow.md` 重新捕获、更新哨兵、让共享 VLab 回到 V。
4. **共享 VLab**：`configure-v-session-relay.mjs revert --undo <apply 的 undo 文件>`（字节还原，配置哈希回到 stage 时；apply 之后配置又被改过就会拒绝，这时用不带 `--undo` 的 revert，并且只能重新 stage），然后 `vlab.mjs rollback`。

`promote-to-v` 的 undo.json 只管文件，不管配置；配置靠第 2、4 步。
