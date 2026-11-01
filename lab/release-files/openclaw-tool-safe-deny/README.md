# 拒绝 openclaw 工具不再让 Codex 关掉原生工具面（2026.9.1，selection-BC0YSSFq.js）

`patch-openclaw-tool-safe-deny.mjs --dist <openclaw dist>`，幂等。基线是 V 在 2026-10-26 运行的
`selection-BC0YSSFq.js` 5a0c1a19（`v2026.9.1-db91.6-sessions-search-20261026` 的捕获），产物 `dist/selection-BC0YSSFq.js`
b55b5352。发版 plan：`release.plan.json`。配合配置 `config/v-makaron-deny-openclaw-tool.json`
（`agents.entries.makaron.tools.deny: ["openclaw"]`）使用。

## 为什么要改代码

目标是 V（makaron）在任何路由上都拿不到 `openclaw` 工具（内置系统助手），见
`docs/v-openclaw-tool-reassessment-20261025.md`。#479 的 `codexDynamicToolsExclude` 只管 Codex 回合；
Gateway 内的 openclaw harness、vlab-worker、claude-cli 仍然带着它。

官方能统一去掉它的只有 agent 工具策略 `agents.entries.makaron.tools.deny`。但 core 的
`toolPolicyRestrictsHarnessNativeTools` 在 deny 里出现一个名字时，只要它「不是核心目录里的工具」或者
「不在 harness 声明的 `conversationToolPolicySafeDenyTools` 里」，就把这次运行判成工具策略受限。
`openclaw` 两条都不满足：委托工具在 `CORE_TOOL_DEFINITIONS` 之外构建，`isKnownCoreToolId("openclaw")`
为 false；Codex 的安全清单里也没有它。结果每一轮 `/vcodex`、`/vds` 都被判受限，Codex 关掉原生
shell 和文件编辑，`gateway_exec/gateway_process` 换成 OpenClaw 的 `read/edit/write/apply_patch/exec/process`
（candidate-bee8efea）。只往 Codex 的安全清单里加名字没用，因为前一个条件仍然成立。

`openclaw` 对任何 harness 都只是一个 OpenClaw 工具：core 生成工具列表时就已经按策略把它去掉，
没有哪个 harness 有对应的原生工具，所以拒绝它总能被精确执行。补丁只在这一个判断里加一行：

```js
if (normalized === "openclaw") return false; // v-openclaw-tool-safe-deny-v1
```

其他被拒绝的名字照旧判断。没有设置 `tools.deny` 时这行代码不会执行到，所以只装代码不改配置时行为完全不变。

## 上线顺序

代码在 Gateway 进程里，要重启才生效；配置键 `agents.entries.*` 是热生效的（candidate 实测约 10 s，没有插件重载）。
**必须先让补丁生效，再写 deny**：deny 落在还跑旧代码的 Gateway 上时，Codex 回合会立刻退化。所以用
`promote-to-v` 装上 `release.plan.json` 的产物，在同一次 `v-self-restart` 里用 `--set` 写 deny（停机期间写入，
起来就是新代码 + 新配置）：

```sh
sudo v-self-restart --reason "drop the openclaw tool from every makaron route" \
  --requested-by "<谁、在哪、几点批准>" --chat <oc_群id> --session-key <会话 key> \
  --set 'agents.entries.makaron.tools.deny=["openclaw"]'
```

`--set` 写主配置 `/home/openclaw/.openclaw/openclaw.json`；Worker 配置
`/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json` 由 Worker 插件自动推导，不手改。
V 现在 `agents.entries.makaron.tools` 是 `{}`，合并后只多这一项。#479 的 `codexDynamicToolsExclude` 保留不动。

回滚：先 `openclaw config unset agents.entries.makaron.tools.deny`（热生效），再把代码回到 5a0c1a19（要重启）。
顺序反过来会让 Codex 回合在两步之间退化。
