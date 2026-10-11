# 只改 worker 侧的发版用 roll 生效：加载清单与判定（2026-10-11）

热更新路线第 ① 步。V 在 10/02–10/11 的 systemd 层重启约 40 次，绝大多数是发版。Node 不能替换已加载的模块，所以 Gateway 进程已经加载的文件改了，只有重启 Gateway 才生效。worker 子进程在生成时从磁盘重新 import core dist，所以**只有 worker 加载的文件**改了，`vlab.workers.roll`（排空式换代，10/03 已上 V）就能生效，不用重启。

要回答「这次发版是哪一种」，需要知道每个文件被哪个进程加载。本文说明清单怎么测、判定规则，以及拿 10/02–10/11 的发版回放的结果。

## 结论

- 36 个发版（31 个有捕获，另外 5 行是 CHANGELOG 里记的未捕获发版、撤回或拆分）回放下来：**3 个只需 roll，33 个必须重启**。3 个里有 2 个是纯机械判定（`worker-secret-egress-20261010` 和它的撤回），1 个要经人工复核声明（`firsttext-r3-20261007`）。
- 第 ① 步本身能省下的重启很少。33 个必须重启的发版里，触发原因是：
  - 15 个只因为改了 Gateway 已加载的 core 文件；
  - 8 个只因为改了 Gateway 插件（4 个飞书 `monitor.account`、4 个 Codex 插件）；
  - 其余 10 个两类都有，或者还碰到了可达未加载、未测到的文件。
  
  所以重启次数要真正降下来，靠的是第 ② 步（自有插件做成外壳 + 版本目录热换）和第 ③ 步（core 与飞书补丁一次性装接口），不是第 ① 步。
- 第 ① 步的价值在于：worker 侧的改动（worker.mjs、worker 首轮预热之类）可以不排进重启窗口；并且 promote-to-v 现在会说出**是哪个文件**迫使重启，后续写补丁时可以有意识地把逻辑放到 worker 侧或热换模块里。

## 清单怎么测

- 钩子：[`lab/load-manifest/load-trace-hook.mjs`](../lab/load-manifest/load-trace-hook.mjs)，用 `module.registerHooks` 的 `load` 钩子，把每个进程、每个线程首次加载的文件同步追加写盘。Gateway 用 `--import` 启动；worker-pool 会把 `process.execArgv`（除 `--inspect`）传给 worker，所以 worker 自动带上钩子，按 `VLAB_WORKER_CHILD=1` 区分。
- 驱动：[`lab/load-manifest/measure-load-sets.mjs`](../lab/load-manifest/measure-load-sets.mjs)，在 VLab candidate 里（真实 9.1 + vlab-worker 插件 + 共享 VLab 的插件集合）起一个私有 Gateway。为了不碰真实用户，去掉了所有渠道账号、cron 和 binding，停用接共享 sidecar 的插件（V Browser、桌面接管、小爱、respeaker、夜班飞书）；渠道插件本身照常加载。另外有一道防护：候选数据目录里出现 `auth.json` 就拒绝启动，不让私有进程拿复制来的登录去刷新。
- 场景，全部是真实模型回合（DeepSeek）：
  - worker 回合：纯回复、exec、memory_search、read + sessions_list、web_fetch；
  - workboard 建卡 + start 派卡；
  - 语音 consult：`talk.client.toolCall` 调 `openclaw_agent_consult`；
  - 一组只读 RPC；
  - `vlab.workers.roll` 之后再跑一轮回合；
  - **Gateway 内嵌 runtime 的工具回合**（exec / memory_search / read / sessions_list / web_fetch）。
- 为什么要最后这一组：/vcodex、/vds、/vcc 都在 Gateway 里运行，并且在 Gateway 里构建同一套 OpenClaw 工具（Codex 插件走 core 的 `openClawCodingToolsFactory`，claude-cli 走 MCP loopback）。candidate 里这两种 harness 跑不起来：Codex 的安装登记和 OAuth 都在共享状态库里，复制过来有 `refresh_token_reused` 的风险；Claude 没有登录。所以用一个走内嵌 runtime 的模型代替，让同一批工具在 Gateway 进程里执行。这一步额外把 23 个 core 文件带进了 Gateway（bash-tools、tools.runtime、web-guarded-fetch、mcp-transport 等），它们原本都只在 worker 里出现。**没有这一步，这 23 个文件会被误判成「只需 roll」。**
- import 图：从实测的 Gateway 已加载集合出发，沿 runtime 里所有相对 import（静态和动态）求闭包，得到「Gateway 可达但没测到加载」的文件。静态边漏记为 0，说明钩子没有漏记。
- 结果：[`release/load-manifest/v2026.9.1-db91.6.json`](../release/load-manifest/v2026.9.1-db91.6.json)，由 [`build-manifest.mjs`](../lab/load-manifest/build-manifest.mjs) 合并两次 candidate 得到。文件里只有路径和运行元数据，没有日志、配置或凭据。
  - candidate-7cc94897：跑在 V+1 字节上（共享 VLab 当时装着 `voice-fill-20261011-v1`）；
  - candidate-5cd96ed8：跑在 V 当前字节上（`voice-content-product-20261011-v3`），包含 Gateway 工具代理那一组。

| 集合（core dist + worker 插件） | 文件数 |
|---|---|
| Gateway 已加载 | 3500 |
| worker 已加载 | 2812 |
| Gateway 可达、未测到加载 | 1737 |
| 只有 worker 加载、Gateway 也 import 不到 | 184（其中 worker 插件 5 个：`worker.mjs`、`gateway-owned-tool-proxy.mjs`、`native-attempt-bridge.mjs`、`native-hook-runtime.mjs`、`voice-process-owner.mjs`） |

重测命令：

```bash
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <task> --plan "$PWD/lab/load-manifest/measure.plan.json"
```

然后对得到的 receipt 跑 `build-manifest.mjs`。升级 OpenClaw 版本、chunk 名变化，或者 V 加了新的 harness/插件之后，都要重测。

## 判定规则

实现在 [`scripts/lib/restart-scope.mjs`](../scripts/lib/restart-scope.mjs)，离线测试在 `scripts/lib/restart-scope.test.mjs`。每个变更文件分成下面几类：

| 范围 | 条件 | 结果 |
|---|---|---|
| gateway | Gateway 已加载 | 重启 |
| gateway-reachable | Gateway 没测到加载，但它已加载的代码能 import 到 | 重启 |
| unmeasured | 两边都没测到 | 重启（保守） |
| gateway-plugin | 飞书 / 钉钉 / 企微 / Codex 插件 | 重启 |
| plugin-manifest | 新增的 `openclaw.plugin.json` / `package.json`（插件发现只在启动时做） | 重启 |
| unknown | 不属于任何 runtime 组件 | 重启 |
| worker | 只有 worker 加载，Gateway 也 import 不到 | roll |
| added | 新增文件：没有任何进程缓存过它，只有本次改动的代码会 import 它 | roll |
| removed | 删除的文件，Gateway 既没加载也 import 不到 | roll |
| worker-behavior | Gateway 已加载（继续用旧字节），人工复核确认改动只在 worker 里起作用，逐个文件写明理由 | roll |

只有所有文件都落在 roll 那几类，发版才判为 `worker-roll-only`。

**为什么「可达未加载」不能靠人工声明放行。** worker-prewarm-20261005 就是反例。`prewarmAgentCommandRuntimes` 确实只有 worker 调用，但新的 `agent-command-DeP5kHlK.js` 会从 `agent-command-DPfawBbr.js` 导入这个新导出。DeP5kHlK 在 Gateway 里属于可达未加载：`runtime-C-huom3Y.js` 的 `api.runtime.agent.command` 会懒加载它，talk 等插件会走到这条路径。如果不重启，Gateway 第一次走到这里时，会把 DeP5kHlK 的新字节链接到缓存里的旧 DPfawBbr 上，旧版本没有这个导出，结果是 SyntaxError。Gateway 已加载的文件反而安全：它会一直用旧字节，旧代码前后自洽。

**人工声明的门槛**：改动不能新增 import/export，Gateway 继续用旧行为必须是可以接受的现状，理由要逐个文件写明。

## 回放

命令：

```bash
node scripts/replay-restart-scope.mjs
```

它读取 `release/captured/*/manifest.json`，按组件把相邻两次捕获逐文件比较，从 `kind` 推出新增、删除还是修改。捕获表达不了的部分写在 [`release/load-manifest/replay-adjustments.json`](../release/load-manifest/replay-adjustments.json) 里，每条都注明 CHANGELOG 出处：
- Codex 插件的改动；
- PR #312 分支上的两份 10/10 捕获（通过 `git show` 读取）；
- 没有捕获的 `batch-20261010c`（按差额推定）；
- `worker-secret-egress` 的撤回。

人工声明和不能声明的理由也写在同一个文件里。

| 发版 | 判定 | 理由 |
|---|---|---|
| firsttext-r3-20261007 | roll（人工声明） | agent-command 的改动全部在 `prewarmAgentCommandRuntimes` 内部；skills watcher 在 ready 之前忽略初始事件。两个文件的 import/export 行与上一版逐字相同 |
| worker-secret-egress-20261010 | roll | `worker.mjs`（worker）+ 新增 `secret-egress-worker.mjs`。与 CHANGELOG 记录一致：当时就是只 roll、没重启上的线 |
| worker-secret-egress 撤回 | roll | `worker.mjs`（worker）+ 删除 `secret-egress-worker.mjs` |
| worker-prewarm-20261005 | 重启 | DeP5kHlK 可达未加载，有混版风险（见上） |
| firsttext-r4 / big-session-reads / voice-confirmation-switch / memory-search ×5 | 重启 | 改动在 Gateway 侧生效：回复管线的记忆整理推迟、vcodex/vds 回合开始的上下文窗口读取、GPT Live 在 Gateway 里的 exec、Codex/vcc 回合里由 Gateway 执行的 memory_search |
| 其余 25 个 | 重启 | 碰到 Gateway 已加载的 core 文件、Gateway 插件，或 worker 插件的 Gateway 侧（`index.mjs`、`worker-pool.mjs`、`harness-result.mjs`） |

每个发版的完整文件和范围以脚本输出为准。

## promote-to-v

`scripts/promote-to-v.mjs` 的计划输出现在多了一段判定（只报告，不改变 `--apply` 的安装行为，也不自己 roll 或重启）：

```text
restart scope: restart-required
  restart <- openclaw/dist/agent-command-DPfawBbr.js  [gateway] loaded by the Gateway and by Workers
  roll    <- production-worker/worker.mjs  [worker] loaded only by Workers
```

不连 V、只看判定，有三种用法：

```bash
node scripts/promote-to-v.mjs --scope-only --release <VLab 发版>
```

```bash
node scripts/promote-to-v.mjs --scope-only --artifact <artifact.json>
```

```bash
node scripts/promote-to-v.mjs --scope-only --targets a,b
```

`--release` 只读取 VLab 上的发版记录。复核过的共享 chunk 用 `--worker-behavior-file <json>` 声明，格式是 `{target: 理由}`。清单缺失时一律报 `restart-required`。

## 局限

- /vcodex、/vds、/vcc 没有真实跑，靠 Gateway 工具代理覆盖它们在 Gateway 里执行工具时加载的 chunk。Codex harness 专用的 core 路径如果没被代理覆盖，会落到「可达」或「未测到」，两者都判重启。
- 飞书、钉钉、企微、Telegram 的入站没有跑（去掉了渠道账号），只加载了插件代码。v-experience 的 telegram/bot 文件因此是「未测到」，判重启，结果没错。
- memory_search 的 KNN 子进程（`memory-search-knn.child.js`）每次查询都新开，其实不需要重启；它是用 `spawn` 启动的，钩子跟不进去，所以判为「未测到」。这里偏保守。
- **声明 roll 之后 Gateway 留着旧字节。** 在下一次重启之前，后续发版如果有可达文件依赖这些文件的新导出，同样会混版。promote-to-v 目前还不记这本账；在接上这本账之前，`worker-behavior` 只在紧接着就要重启的情况下使用。
- 判定只看文件归属，不看 worker 插件 Gateway 侧与 worker 侧之间的 IPC 协议是否兼容。动 `worker.mjs` 的消息格式时，要同时看 `index.mjs` 有没有跟着改；改了就会判重启。
