# 夜班卡没有 V 的工作区上下文：普查、根因与修复（2026-11-10）

## 问题

/vds 会话的上下文是不是和平时聊天一样完整？夜班卡为什么没有 AGENTS.md？

## 普查：2026-11-09 V 上全部 /vds 线程

做法：只读，逐个读取 `codex-home/sessions/2026/11/09/` 里每个 rollout 的前 80 行，用各文件独有的正文判断模型实际收到了什么。AGENTS 用「Makaron Workspace Entry Point」判断，SOUL 用「V's Identity」判断，其余同理。

| 线程类型 | 数量 | AGENTS.md | SOUL / IDENTITY / USER / MEMORY | 说明 |
|---|---|---|---|---|
| 用户聊天（飞书、钉钉等） | 102 | **102** | **102** | 完整。压缩过的 5 个线程，压缩后都重新注入了 |
| 记忆整理回合 | 13 | 0 | 13 | Gateway 在压缩前派的后台回合，只有 read/write 两个工具，按设计不带项目文档 |
| **夜班卡（Workboard）** | **435** | **0** | **0** | **一个文件都没有** |
| 定时任务 | 46 | 27 | 27 | 缺的 19 个是任务自己设了 `lightContext: true`（例如 V Chief of Staff、F页面审核接续） |
| 子 agent | 3 | 3 | 只有 MEMORY | 官方设计：子 agent 只给 AGENTS |

结论：
- **面向用户的 /vds 聊天是完整的。** 和 9.1 官方的引导文件清单一致：AGENTS（Codex 原生加载）、SOUL、IDENTITY、USER、MEMORY、skills（`workspace-BFk42BX6.js:200`）。
- TOOLS.md 在 9.1 已经不是引导文件，并入了 AGENTS.md 的 `## Tools`，Worker 同样不注入它。
- **缺口只在 lightContext 的回合上。** 其中夜班卡是全部缺失。

## 根因：夜班卡缺失，与 harness 无关

1. **上游 Workboard 派卡时写死了 `lightContext: true`**。位置：`extensions/workboard/src/dispatcher.ts:532`，V 的 dist 在 `runtime-api-1CCazqtv.js:3935`。
2. `lightContext` 在 Gateway 里会变成 `bootstrapContextMode: "lightweight"`（`server-plugins-*.js:312`）。随后：
   - core 的 `applyContextModeFilter` 直接返回 `[]`，所有引导文件都没了；
   - 在 Codex 上，还会给线程配置写 `project_doc_max_bytes: 0`，原生 AGENTS.md 也不加载（`thread-lifecycle-DAcEJ_Om.js:2966`）。
3. 卡的 sessionKey 是 `agent:makaron:subagent:workboard-<board>-<card>`，会被认成子 agent。所以即使不是 light，也只会留下 AGENTS 和 MEMORY（`filterBootstrapFilesForSession`）。
4. Worker 会把 `bootstrapContextMode` 原样转发进子进程（`worker/harness-event-contract.mjs:80`）。所以**夜班在 11/09 12:23 改跑 /vds 之前，在 Worker 上同样没有这些文件**。下面 candidate 的对照组证实了这一点：Worker/PI 上的卡也答不出来。

所以这不是 /vds 带来的回退：夜班卡从来就没有拿到过 V 的工作区规则。昨天三次递归 grep 里有两次出自夜班卡，AGENTS.md 里禁止这样做的规则根本没有送到它们手里。

## 修复：v-workboard-full-context-v1

卡也是 V 在做自己的事，所以让它和聊天一样启动：

| 文件 | 改动 |
|---|---|
| `runtime-api-1CCazqtv.js`（Workboard dispatcher） | `lightContext: true` 改为 `process.env.OPENCLAW_WORKBOARD_LIGHT_CONTEXT === "1"` |
| `workspace-BFk42BX6.js`（`filterBootstrapFilesForSession`） | sessionKey 是 `subagent:workboard-*` 时保留全部引导文件 |

Gateway 环境里设 `OPENCLAW_WORKBOARD_LIGHT_CONTEXT=1`，可以同时恢复上游行为。

- **源码**：openclaw-versa `versa/port-workboard-full-context-20261109` @ 87199af7dfd，基于 `port-backlog-20261029`。
  - 改的是 `dispatcher.ts`、`workspace.ts`，并加了测试。
  - 在 VLab 主机上用 Node 24.17 跑：workspace.test 63/63，dispatcher 加 nightshift-limits 38/38。
  - 把源码改回上游写法后，两条新测试都失败。
  - 本机 Node 24.1 的 SQLite 版本过不了 OpenClaw 的检查，所以测试放在 VLab 上跑。
- **dist**：`lab/patch-workboard-full-context.mjs`。成品由 `lab/build-workboard-full-context.mjs` 从 V 当前字节生成，`before` 哈希已和 V 核对。`lab/workboard-full-context.test.mjs` 共 4 项。

## VLab candidate：真派一张卡

`lab/candidate/workboard-full-context.mjs` 的做法：
- 起真 Gateway；把共享 VLab 的 makaron 工作区引导文件复制进 candidate 工作区；
- 像夜班一样，用 `workboard.cards.create` 和 `dispatchWithOptions` 派一张 makaron 的卡；
- 卡里要求 agent 除 `workboard_complete` 外不调任何工具，凭启动时拿到的上下文，答出 AGENTS.md 里最后一条高优先级规则的标题，以及 SOUL.md 的第一个标题。

原始结果见 [workboard-full-context-candidate-20261110.json](../evidence/workboard-full-context-candidate-20261110.json)。

| 组 | receipt | 卡线程里有什么 | 答案 |
|---|---|---|---|
| /vds 打补丁 | `candidate-aa6a9588` | developer 指令 11,606 字符，含 AGENTS.md 全文；workspace context 有 SOUL、IDENTITY、USER、MEMORY | 两题都对（「Tool-call process note」「SOUL.md — V's Identity」） |
| /vds 对照（V 现在的字节） | `candidate-91394f9e` | developer 指令 2,988 字符，workspace context 里没有引导文件 | UNKNOWN / UNKNOWN |
| Worker/PI 打补丁 | `candidate-9cfab19a` | （PI 的系统提示不进会话记录） | 两题都对 |
| Worker/PI 对照 | `candidate-39638faf` | — | UNKNOWN / UNKNOWN |

- 四组都只调用了 `workboard_complete`，没有读文件。
- PI 打补丁组的会话记录（15.6 KB）比对照组（18.2 KB）还小，说明它没有去读那份 14 KB 的 AGENTS.md。
- receipt 记录的是 `abd35ed8`（dirty），也就是这次提交之前工作区里的同一批文件；输入哈希都在 receipt 里。

## 代价

在 V 上，每张卡线程启动时会多出：
- AGENTS.md 约 14.4K 字符；
- SOUL、IDENTITY、USER、MEMORY 约 12.3K 字符。

合计约 2.7 万字符，按 11/09 的 435 张卡算，每天多几百万输入 token。这些内容每张卡都一样，DeepSeek 的前缀缓存能命中大部分。卡不是交互式的，所以不影响首字。

## 仍然不同的地方（没有在这次改动）

卡仍然按子 agent 的工具策略运行。和聊天相比，它没有这些工具：
- Codex 原生 shell（`exec_command`），只能用 OpenClaw 的 `exec`；
- `automations`、`sessions_*`、`message`、`ask_user`、`secrets`、`subagents`。

这次补上的是上下文（系统提示词和 AGENTS.md）。工具是否也和聊天对齐，需要另外决定。

## 上线（未做，等 Tianyi 批）

和其他 core dist 补丁一样：先合入 dev，再在共享 VLab 验收，然后 `promote-to-v`，需要重启 Gateway。验收标准是在 V 上新派一张夜班卡，它的 rollout 里有 AGENTS 和 SOUL。
