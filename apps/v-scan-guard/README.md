# v-scan-guard

在命令执行之前，拒绝对 V 整个数据目录做递归遍历的 shell 命令。起因和证据见 [docs/incidents/2026-11-09-recursive-scan.md](../../docs/incidents/2026-11-09-recursive-scan.md)。

## 拦什么

对**受保护目录本身或它的上级目录**做以下操作，就会被拒绝：

| 命令 | 怎样算越界 |
|---|---|
| `grep -r` / `-R` / `--recursive` / `-d recurse`、`ugrep -r` | 总是算 |
| `rg`、`ag`、`ack` | 没有 `--max-depth`/`-d`（ag 用 `--depth`），或深度超过 `findMaxDepth` |
| `find` | 没有 `-maxdepth`，或深度超过 `findMaxDepth`（默认 4） |
| `du` | 总是算（`-d`、`-s` 只是让输出变短，照样遍历整棵树） |
| `tree`（没有 `-L` ≤ 上限）、`ls -R` | 同上 |
| `**` glob、`os.walk('<目录>')`、`Path('<目录>').rglob(...)`、`readdirSync(<目录>, {recursive:true})` | 只要出现在命令文本里任何位置，heredoc 里的脚本也算 |

默认受保护目录（`protectedRoots`，`*` 匹配一级目录名）：`/home/openclaw`、`~/.openclaw`、`~/.openclaw/nightshift`、`~/.openclaw/nightshift/instances`、`~/.openclaw/agents`、`~/.openclaw/agents/*`、`agents/*/sessions`、`agents/*/agent`、`agents/*/agent/codex-home`、`codex-home/sessions`、`~/.openclaw/media`、`~/.openclaw/npm`。它们的上级目录（`/`、`/home`）也受保护。

**放行**的情况：
- 受保护目录以下的具体子目录（某一个夜班实例、工作区、`~/.agents/skills/...`）；
- 只列文件的 glob（`instances/*/content-items/*/run-state.json`、`*.json`）；
- 带字面字符的 glob（`config*`、`DL-1109-*`），因为它只选中一部分子目录；
- 路径无法判断的情况（`$SOME_DIR`、cwd 未知时的相对路径）。

能识别的写法：`cd` 之后的相对路径、`sudo` / `env` / `nice` / `ionice` / `timeout` / `xargs` 等前缀、`bash -lc "..."`、`$(...)` 和反引号、`2>/dev/null` 这类重定向。

被拒绝时，agent 收到一段说明：为什么不能这样做、不要换写法重试，以及该用什么代替（`openclaw automations list --json | jq`、`nightshiftctl`、`NIGHTSHIFT_URL`、代理导致 `fetch failed` 时怎么办、request-hash 自己算、sessions 工具、skill 的位置）。

## 覆盖哪些调用路径

| 路径 | 进入 `before_tool_call` 的方式 | candidate 结果 |
|---|---|---|
| OpenClaw `exec`（Worker / PI harness） | 直接调用 | ✅ 在 Worker 子进程里拦下 |
| Codex 里的 OpenClaw 动态 exec（`gateway_exec`，夜班卡里叫 `exec`） | 直接调用，工具名为 `exec` | ✅ |
| Codex 原生 `exec_command` | Codex PreToolUse → `openclaw hooks relay` → 工具名改成 `exec`，`cmd` 复制到 `command` | ✅ 「Command blocked by PreToolUse hook: V blocked…」 |
| OpenClaw `process` write / paste / send-keys | 直接调用，检查 `data`/`text`/`literal` | 只有单元测试 |
| Codex 原生 `write_stdin` | **进不了钩子**（2026-10-31 harness 对照实测） | ❌ 缺口，见下 |

**缺口：** agent 可以先用 `exec_command` 起一个交互式 `bash`，再用 `write_stdin` 往里输入命令，这条路绕过钩子。今天的三次事故和全天 225 次越界遍历都没有走这条路。要堵住，需要在 Codex 里给 `write_stdin` 加 PreToolUse（上游改动），或者在 exec 层用 cgroup 给 agent 的 shell 限制 IO。

**matcher：** 注册时声明了 `matcher: ["exec", "process"]`。其他工具调用不会进这个插件；V 上已有不带 matcher 的插件（v-browser 等），所以 Codex 的钩子转发本来就是对所有工具开启的，加这个插件不会多起进程。

**失败时放行：** 钩子运行器把抛异常当作拒绝（fail-closed），所以插件内部出错时会记一行日志然后放行，不会因为插件的 bug 卡死所有 shell 命令。

## 配置

```json
"v-scan-guard": {
  "enabled": true,
  "config": {
    "mode": "block",
    "findMaxDepth": 4,
    "extraProtectedRoots": []
  }
}
```

`mode: "warn"` 只记日志（`[v-scan-guard] would block …`）不拦截，适合先观察一天。`protectedRoots` 会整个替换默认列表，`extraProtectedRoots` 是在默认列表上追加。每次拦截都会在 Gateway 日志里记一行 `[v-scan-guard] blocked <命令> over <目录> … session=… run=…`；Worker 里的拦截带 `[vlab-worker:N]` 前缀。

## 测试

```sh
node --test tests/v-scan-guard.test.mjs                      # CI 入口
cd apps/v-scan-guard/plugin && node --test tests/*.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <任务> --plan "$PWD/lab/candidate/scan-guard-on.plan.json"
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <任务> --plan "$PWD/lab/candidate/scan-guard-off.plan.json"   # 对照组
```

`lab/scan-guard-replay.mjs` 只读重放某一天的 Codex rollout，统计这个规则会拦下哪些调用。

## 上线（未做，等 Tianyi 批）

和 v-session-relay 一样，属于需要重启才能生效的插件：把目录放到 `/home/openclaw/.openclaw/extensions/v-scan-guard`，然后在一次 `sudo v-self-restart --while-stopped …` 里同时把它加进主配置的 `plugins.load.paths`、`plugins.allow`、`plugins.entries`（Worker 配置会自动推导出来）。发布管线还缺两样东西：`scripts/lib/runtime-components.mjs` 里的组件条目，以及 configure 脚本。这两样等先决定好用 `block` 还是 `warn` 起步，再单独提交。
