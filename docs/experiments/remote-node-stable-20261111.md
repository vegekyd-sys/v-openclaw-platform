# Mac 节点睡眠导致 workspace context 反复重发（2026-11-11）

## 现象

/vds 切成默认之后的约 36 小时里，在原线程里重发了 229 次整份 workspace context（约 7.5 万字符），共 1,710 万字符。其中 84 次只是因为 Mac 节点那一行变了：57 次纯粹换了顺序，27 次是节点上线或下线。还有 46 次是节点和技能同时变。统计方法见 `vds-idle-firsttext-20261111.md` §1.3。

## 根因

- **哪台节点在变**：「Tianyi Mac」（`d99272f4`）是 Tianyi 笔记本上的 `ai.versa.v-compute-node`。它经本机 launchd `ai.versa.v-compute-tunnel`（`ssh -L 25094→V:22793`）连到 V。
- **为什么会断**：Mac 睡眠或 Power Nap 时 Tailscale 路由断开。隧道日志里有 2,149 次「No route to host」。节点随之以 1006 断开，醒来后重连。36 小时重连了 47 次，时间点和本机 `pmset` 记录的 DarkWake 一一对得上。另外两台 Mac 同期各只重连 3 次。
- **为什么断一下提示词就变**：core `remote-*.js` 的 `getRemoteSkillEligibility` 只列当前在线的 macOS exec 节点，按 Map 的插入顺序排列。节点断开时 `removeRemoteNodeInfo` 会把它从 Map 里删掉，重连后再插回到末尾。所以只要睡一觉，「Remote macOS node available (…)」这一行就会变，所有活跃会话下一轮都会重收一遍整份 workspace context。全部 Mac 都离线时，这一行会整个消失。

## 修法：`remote-node-stable-eligibility-v1`

- **展示哪些节点**：已配对（有 pairing generation，且支持 system.run）、7 天内出现过的 macOS 节点，按名字排序。
  - 新文案：「Paired macOS nodes: A, B. Run macOS-only skills via exec host=node on one of them; a node that is asleep or offline fails the call.」
  - 节点不在线时，exec 那一步会直接报错，文案里也写明了这一点。
- **bins（命令探测结果）**：在线节点仍然用它当前的探测结果；离线节点保留最后一次的结果。
- **没有 pairing generation 的旧节点**：在线时照旧展示，离线后不会被记住。
- **开关**：`OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY=0` 恢复原来按在线连接展示的逻辑。这样输出的文案与 V 现在逐字节相同（测试里有断言）。
- **源码**：openclaw-versa `versa/port-remote-node-stable-20261111` @ `8f8b5ed3525`。
  - 新模块是 `src/skills/runtime/remote-stable-eligibility.ts`。
  - 测试 `remote-stable-eligibility.test.ts` 6 条，其中 3 条在旧代码上会失败。
  - 原有 `remote.test.ts` 23 条、`remote-reconciliation.test.ts` 在关闭开关下照跑通过，另新增一条 legacy 节点断言。
- **dist**：只改 `core/dist/remote-CiV-Qx_e.js` 一个文件，before `86731e90…` → after `5d169ac3…`。
  - 补丁 `lab/patch-remote-node-stable.mjs`，构建脚本 `lab/build-remote-node-stable.mjs`，发版 plan `lab/remote-node-stable.plan.json`。
  - `lab/remote-node-stable.test.mjs` 在桩掉 import 的前提下，直接运行补丁后文件里真实的登记函数和资格函数。

上线之后，Gateway 每个现有会话的下一轮会因为文案变了，再收一次 workspace context。这是一次性的，之后节点再睡醒都不会重发。

## candidate 端到端（2026-11-11 14:36 CST）

`lab/candidate/remote-node-stable-e2e.mjs` 的做法：
- 隔离的 Gateway，跑真实 /vds（Codex 0.159.2 + DeepSeek），codex 插件用 V 的字节。
- 一个预加载脚本在 Gateway 进程里导入同一个 core 模块，装一个列出「在线」假节点的 registry，然后调用 Gateway 自己处理节点连接和断开时用的 `recordRemoteNodeInfo` / `recordRemoteNodeBins` / `removeRemoteNodeInfo`。
- 跑 5 轮，每两轮之间：笔记本睡、笔记本醒、另一台重连（顺序变化）、两台都睡。
- 从 Codex rollout 里统计 `<openclaw_workspace_context>` 被投递了几次。

| | 节点那一行 | workspace context 投递次数 |
|---|---|---|
| v（`candidate-5da8d230`，V 字节） | 每步都跟着变；两台都离线时整行消失 | **5 次**：每次变化都整份重发，每份约 1.08 万字符（candidate 工作区很小，V 上每份约 7.5 万字符） |
| stable（`candidate-531c7a91`，本补丁） | 5 步完全相同 | **1 次** |

同一个 Gateway 进程驱动了所有节点变化（driverPids 只有 1 个）。Gateway 启动时会派生子进程，所以预加载只在监听 Gateway 端口的那个进程里生效。

## 上线

1. 合入 dev。
2. 在共享 VLab 上 stage 并验收：重启后节点那一行变成「Paired macOS nodes」，`/vds` 一轮正常。
3. 用 `scripts/promote-to-v.mjs` 上 V，需要重启 Gateway。
4. 上线后核对：Tianyi Mac 睡醒之后，V 的 rollout 里不再出现只因节点变化而发生的重发。
5. 回退：给 Gateway 环境加 `OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY=0`（需要重启），或者用 promote-to-v 回滚这一个文件。
