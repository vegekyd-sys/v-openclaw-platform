# Codex 工作区上下文改走线程 developer 消息（2026.9.1，Codex 插件 3 个文件）

`patch-codex-turn-context-handoff.mjs --codex-dist <@openclaw/codex dist>`，幂等。基线是 V 在
2026-10-28 运行的字节（`v2026.9.1-db91.6-release-batch-20261028`，Codex 插件 generation g-b42d646e5561ece2）：

| 文件 | before | after |
|---|---|---|
| `thread-lifecycle-DAcEJ_Om.js` | 4cceab62 | 762089fd |
| `run-attempt-D1hJO4fX.js` | c34d6d77 | 09343afb |
| `compact-_t0HQrUS.js` | 278c8505 | 4af4b703 |

发版 plan：`release.plan.json`。

## 为什么

OpenClaw 把 SOUL.md、IDENTITY.md、USER.md、MEMORY.md（10/28 起），以及 OpenClaw 的 memory 说明和
skills 目录，放进 `turn/start` 的 `collaborationMode.settings.developer_instructions` 下发。

Codex 0.159.2 只在模型目录**没有** Default 模式覆盖文本时才用这个字段：
`core/src/context/world_state/collaboration_mode.rs` 先取 `messages.default.catalog_override()`，
有就直接替换 `developer_instructions`。V 的 `models_cache.json` 里所有 gpt-6.x（sol、astra、terra、luna、
6.1-sol）都带 1015 字符的 Default 覆盖，gpt-5.x 和 DeepSeek 没有。所以：

- `/vcodex`（gpt-6.1-sol）的模型只看到 catalog 那段 Default 文本（rollout 里那条 1056 字符的
  `<collaboration_mode>`），SOUL、MEMORY、USER、IDENTITY、skills 目录都没到。私聊、群聊、定时任务、
  新旧线程都一样，跟会话类型无关，只跟模型有关。
- 变化检测本身是有的：Codex 用（mode、model、instructions 哈希）做快照，内容变了会重发一条。但
  catalog 模型的 instructions 恒为 catalog 文本，哈希永远不变，所以连重发都不会发生。
- `/vds`（DeepSeek）不在 catalog 里，一直正常收到，这也是之前 VLab 上 /vds 能答出 MEMORY.md 的原因，
  不是新线程的缘故。

上游 OpenClaw 已经承认同一机制（#140422 把 skills 目录移出 collaboration，#162156 把 persona/memory
也移出，collaboration 的 `developer_instructions` 改为 null），但那是在新架构上做的，无法直接回移到 9.1。

## 改了什么

- `thread-lifecycle`：新增 `deliverCodexTurnContextHandoff()`。把上述上下文渲染成一条
  `<openclaw_workspace_context>` developer 消息，用 `thread/inject_items` 追加到线程末尾；按内容哈希记在
  `<agentDir>/codex-turn-context/<threadId>.json`，内容没变就不发。内容被清空时发一条「已撤回」。
  注入失败返回 `failed`，不写记录。
- `run-attempt`：`turn/start` 前先投递；`collaborationMode` 不再带这些上下文（`developer_instructions`
  为 null，模型拿到 Codex 原生的 Default 文本）。投递失败时退回旧通道，行为与现在相同。回合内发生压缩后
  重新投递（压缩会丢掉客户端写入的 developer 消息，`compact_remote_v2.rs` 里
  `retain_client_developer_messages` 为 false）。
- `compact`：独立压缩（`thread/compact/start`）被接受后删掉该线程的投递记录，下一回合重发。

没改：定时任务回合的 cron 协作说明仍走 collaboration（gpt-6.x 上同样被覆盖，单独跟进）；
supervision 连接（Mac 原生会话）不动；不拼进用户输入。

## 对缓存和线程历史的影响

- 注入项追加在历史末尾，前一轮的请求原样是下一轮请求的前缀，缓存命中不受影响。
- 只在内容变化时多一条（V 上 makaron 约 61k 字符，约 15k token），旧的那条留在历史里直到压缩。这与
  DeepSeek 现在的原生行为相同（内容一变 Codex 就整段重发一条 collaboration）。
- 上线后每条已有线程的第一回合会多投递一次：gpt-6.x 线程是第一次真正拿到；DeepSeek 线程会多一份
  重复（旧的在 collaboration 项里）外加一条 1k 的原生 Default 文本，之后不再重复。
- Gateway 重启不会重发（记录在磁盘上）。
- 新线程的副作用：在第一回合前注入时，Codex 用线程默认设置先补一份初始上下文，所以新线程会多一条只有
  日期/时区的 `<environment_context>`，以及一条带 cwd 的完整 `<environment_context>` 和 1.4k 的原生
  Default 协作文本。每条新线程（和每次压缩后）一次，约 2k 字符，内容确定，不影响缓存。

## 验证

`tests/codex-turn-context-handoff.test.mjs`：真实 Codex 0.159.2 app-server（npm 官方包，与 V 同
sha256 1748767b）+ 本地假 Responses 接口，抓模型实际收到的请求；catalog 用 V 的 gpt-6.1-sol 条目。
跑法：先在 VLab 主机 `npm pack @openai/codex@0.159.2-linux-x64` 解到 `/tmp/turnctx-codex-0.159.2/`，
V 的 `models_cache.json` 放同目录（plan 里的 `CODEX_BIN`、`CODEX_TEST_CATALOG`），用完删掉。

| | 基线（V 字节） | 补丁 |
|---|---|---|
| gpt-6.1-sol 收到的 collaboration 项 | 1 条，1056 字符 catalog 文本，无 SOUL | 同左（不再依赖它） |
| gpt-6.1-sol 两轮改内容 | SOUL 两轮都不在请求里，第 2 轮前缀 = 第 1 轮全部输入 | — |
| 无覆盖模型（代表 DeepSeek）3 轮 | SOUL 项数 1,1,2（不变不重发，变了重发） | — |
| 补丁投递 5 轮（A,A,B,B,压缩后 B） | — | delivered/unchanged/delivered/unchanged/delivered；每轮前缀不变；MEMORY 到达 |

`lab/candidate/codex-turn-context-handoff-e2e.mjs`：隔离 Gateway，`/vds` 按 V 配置（Codex 0.159.2 +
真实 DeepSeek），抓包代理看每个请求；4 轮，第 2、3 轮之间改 SOUL.md。两边 4 轮都正常回复。

| 每轮第一个请求 | 基线 | 补丁 |
|---|---|---|
| collaboration 项里带 SOUL | 1,1,2,2 | 0,0,0,0 |
| `<openclaw_workspace_context>` 带 SOUL | 0,0,0,0 | 1,1,2,2 |
| SOUL.md 新加的那行 | 0,0,1,1 | 0,0,1,1 |
| MEMORY.md 在 developer 项里 | 是 | 是 |
| 每轮请求以上一轮请求为前缀 | 是 | 是 |
| SOUL 出现在用户输入里 | 否 | 否 |

DeepSeek 上两边一样能看到，区别只在通道；gpt-6.x 只有补丁能看到（单测证明）。gpt-6.1-sol 的真实模型
没在 candidate 跑：candidate 复制的 OAuth 会刷新失败并可能连累 V（见 candidate-stale-oauth-refresh）。

## 上线

三个文件都在 Gateway 进程里加载，要一次 `v-self-restart`。回滚：三个文件放回 before 字节再重启；
`codex-turn-context/` 目录可留可删。
