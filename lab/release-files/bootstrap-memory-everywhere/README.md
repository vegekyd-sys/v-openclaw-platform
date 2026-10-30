# 每个会话都预载 MEMORY.md（2026.9.1，workspace-BFk42BX6.js + Codex attempt-context-DmQUNWwT.js）

`patch-bootstrap-memory-everywhere.mjs --core-dist <openclaw dist> --codex-dist <@openclaw/codex dist>`，幂等。
基线是 V 在 2026-10-28 运行的字节（`v2026.9.1-db91.6-release-batch-20261027`）：`workspace-BFk42BX6.js`
7aa02efc → 5c74cd7c，`attempt-context-DmQUNWwT.js`（Codex 插件 generation g-b42d646e5561ece2）f3d2f15a → d425cfe2。
发版 plan：`release.plan.json`。

## 为什么

上游有两处让 V 在很多会话里看不到 MEMORY.md：

1. core `filterBootstrapFilesForSession`：群聊、频道、定时任务、子 agent 会话把根目录 MEMORY.md 从
   bootstrap 里去掉（隐私过滤）；子 agent 和定时任务另有白名单，本来就不含 MEMORY.md。只有私聊会预载。
2. Codex 插件 `buildCodexWorkspaceBootstrapContext`：只要 `memory_search`/`memory_get` 可用，就不粘贴
   MEMORY.md 正文，只渲染一行「MEMORY.md exists … OpenClaw does not paste its contents」。所以
   `/vcodex`、`/vds` 连私聊也看不到正文。

这些会话本来就能用 memory_search 读到同一份文件，挡掉预载起不到保护作用，只是让 V 在回合开头更弱、
要多走一步才能找到入口。Tianyi 2026-10-28 决定：群聊、定时任务、子 agent 也预载。

## 改了什么

- core：`privacyFilteredFiles = files`（不再按会话类型过滤根 MEMORY.md）；子 agent、定时任务白名单各加
  MEMORY.md。子 agent 仍然只有 AGENTS.md + MEMORY.md，定时任务其余文件不变。
- Codex：MEMORY.md 留在 context files 里，和 SOUL/IDENTITY/USER 一起作为回合级 developer instructions
  下发（`CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES` 加 `memory.md`）。不拼到用户输入前面，
  所以不会每轮累积进 Codex 线程历史；那行「不粘贴」的指针不再渲染。memory recall 提示词不变。

没改：`bootstrapContextMode: "lightweight"` 的回合（例如轻量 cron）照旧什么都不预载；记忆来源
（provenance）不合格的 MEMORY.md 照旧排除。V 的 MEMORY.md 约 7.6 KB，每个群聊/定时任务/子 agent 回合多约
2–3k token。

## 验证

`candidate.baseline.plan.json`（不带补丁，`EXPECT_BASELINE=1`）和 `candidate.fixed.plan.json`
（带补丁）跑同一个 `tests/bootstrap-memory-everywhere.test.mjs`：

| | 私聊 | 群聊 | 频道 | 定时任务 | 子 agent | Codex 私聊正文 | Codex 群聊正文 |
|---|---|---|---|---|---|---|---|
| 基线 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌（只有指针） | ❌ |
| 补丁 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

两边都断言 Codex 不把 MEMORY.md 拼进用户输入。

## 上线

两个文件都在 Gateway / Worker 进程里加载，要一次 `v-self-restart`。回滚：把两个文件放回 before 字节再重启。
