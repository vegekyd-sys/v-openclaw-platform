# task-bridge-extra-sources — 后台行的外部数据源（跨会话协作 WP3）

设计：`docs/inter-session/design.md` §3.5（marker `v-task-bridge-extra-sources-v1`）。

**做什么**：V 的核心 `task-registry-activity-DSlVVJwD.js` 里已有任务登记桥（`v-task-registry-bridge-v1`，来自 `lab/release-files/feishu-task-status/`），飞书卡片和 v-experience（Telegram、钉钉、企微）都用它的 `listActive(sessionKey)` 画「⏳ 后台 n 项进行中」那一行。本补丁让进程内的其他组件（v-session-relay 插件）往这一行里加条目：

- 桥对象创建后立刻 `vTaskRegistryBridge.extraSources ??= new Set()`。插件先加载时可以自己建桥和这个 Set，`??=` 两边都保留。
- `listActive` 返回前，逐个调用 `extraSources` 里的函数 `(sessionKey) => TaskLike[]`，把返回的行追加在登记表任务、持久化任务、持久化子 agent 之后。
- 某个数据源抛错、返回值不可迭代、迭代中途抛错：这个数据源一行都不加，其他数据源和原有行照常返回。
- 没有 `taskId` 的行跳过；`taskId` 已经在列表里（登记表任务、持久化行或别的数据源）的行只保留第一条。

**为什么必须是 dist 补丁**：`listActive` 在 chunk 求值时被无条件重新赋值，插件包一层会被覆盖。

**只加两处，不改别的**：生成结果去掉这两段文字后与 V 原字节逐字相同（测试断言）。

| 文件 | V 上的 sha256（before） | 生成后（after） |
|---|---|---|
| `openclaw/dist/task-registry-activity-DSlVVJwD.js` | `8a89045a…` | 见 `manifest.json` |

- 输入：`release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/task-registry-activity-DSlVVJwD.js`（10/20 已在 V 上核对一致，`tests/fixtures/inter-session-v-bytes.json`）。
- 重新生成：`node lab/release-files/task-bridge-extra-sources/patch.mjs <capture> generated/task-registry-activity-DSlVVJwD.js`。
- 测试：`node --test tests/task-bridge-extra-sources.test.mjs`（重新生成并逐字比对、`node --check`、锚点唯一、marker 一次、与 `contracts.js` 字面量一致，以及在 vm 里跑补丁后的 `listActive`）。
- 单独上线没有任何效果：没有插件注册数据源时，`extraSources` 是空 Set。

**给插件（WP5）的约定**

- 数据源是同步函数，每次 `listActive` 都会调用（v-experience 每个被观察的会话每 5 秒轮询一次，飞书卡片也会调），只能读内存，不能读文件或账本目录。
- 只对发起方的 sessionKey 返回行：`{taskId:"v-a2a:<sendId>", runtime:"session", taskKind:"sessions_send", label, status:"running"|"queued", runId, childSessionKey, createdAt}`。收到的 key 已 trim，未转小写。
- 注册写法：`const b = (globalThis[TASK_REGISTRY_BRIDGE] ??= { listeners: new Set() }); (b.extraSources ??= new Set()).add(source)`；停止时 `delete` 同一个函数引用。
- 行有变化时自己通知 `b.listeners`：`{kind:"v-a2a", sessionKeys:[requesterKey]}`（v-experience 只看 `sessionKeys`）。
