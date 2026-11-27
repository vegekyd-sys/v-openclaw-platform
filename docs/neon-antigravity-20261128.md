# /neon：Gemini 4 Neon 跑在 Antigravity CLI 上（2026-11-28 CST）

状态：**VLab candidate 全部通过（`candidate-b9cec412`），未合入，未上 V。** 合入 dev 和上线都要 Tianyi 明确批准。

## 要求（Tianyi）

- 11/19：V 接 Google 模型，用他自己的 Gemini 订阅账号。他接受 Antigravity 条款第 6 条带来的封号风险。
- 11/28：`/neon` 就是「Antigravity CLI + Gemini 4 Neon」，做法参照 `/vcc`（Claude Code CLI），各方面保持一致，要支持 steer，思考档位用 high，首字要快。同时去掉系统提示里的 OpenClaw（去 OpenClaw 化，#629 的 S1 项）。

## 账号与模型

- Tianyi 的账号是 Google AI Pro。`agy models` 列出 `gemini-4-neon-{low,medium,high,xhigh}`，没有 Carbon，Carbon 目前只对 Ultra 开放。
- 登录：VLab 上 Tianyi 为 `lab-db91-parity` 单独登录了一次 agy，HOME 是 `/var/lib/agy-lab/home`，agy 版本 1.5.18。没有复制 relay 的令牌：新版 agy 刷新令牌时如果 Google 轮换了 refresh token，relay 那份会失效，Scene 跟着断。V 上需要再为 `openclaw` 用户登录一次。

## 被拦截的那一句

Google 的账号接口（relay 用的同一个）会精确匹配 OpenClaw 默认系统提示的第一句「You are a personal assistant running inside OpenClaw.」（不区分大小写），然后返回伪装成额度耗尽的 `429 RESOURCE_EXHAUSTED`。11/19 在 V 上逐项对照验证过，11/28 在 agy 路线上也复现了：agent 正文以这句开头时 agy 重试 7 次后报 429，换成 V 的身份句就成功。

修法是 `v-identity-line-v1`：系统提示第一句改为「You are V, Tianyi's personal agent.」，作用于 PI 和 CLI 的 full、minimal、none 三种模式。

- 源码：`vegekyd-sys/openclaw-versa` 分支 `versa/port-v-identity-line-20261128`，commit `52d03a420dd`。
- dist：`lab/patch-v-identity-line.mjs`、`lab/build-v-identity-line.mjs`，生成 `lab/release-files/v-identity-line/`，plan 为 `lab/v-identity-line.plan.json`。以 V 线上的 `system-prompt-params-B645JcX8.js` 为基线（sha `24d19663…`，VLab 字节相同）。
- 为什么不用插件的 `registerTextTransforms`：vlab-worker 进程不安装进程级的活动插件注册表，文本替换在 worker 里不生效，只在 Gateway 里生效。这会影响 #629 后续所有打算用文本替换做的项。
- 这句会改变 V **所有回合**的开场身份，不只是 `/neon`。

## Harness：`apps/v-antigravity`（对照 Claude Code）

| Claude Code（9.1 `extensions/anthropic`） | Antigravity（`runtime.js` / `backend.js`） |
|---|---|
| 插件自己执行（`prepareExecution().execute`），常驻 stdio live session | 同样。每个 OpenClaw 会话常驻一个 `agy --input-format stream-json --output-format stream-json` |
| 系统提示每轮都带（`--append-system-prompt-file`） | 系统提示写进自定义 agent `.agents/agents/v.md` 的正文，用 `--agent v` 选中。实测 21.6 万字节的正文生效，内容叠加在 agy 自带的工具定义之上 |
| OpenClaw 的工具走 loopback MCP（claude-config-file 格式） | 同一份主机配置，转换为 `.agents/mcp_config.json`（`serverUrl` + `headers`）。先激活 live session（激活后 MCP 令牌才生效），再通过 `tools/list` 取到全部工具（VLab 上 122 个）并设为 eager，模型直接看到 `mcp_openclaw_*` |
| 原生工具：Bash、文件、Web；后台类工具关掉 | agent 的 `tools` 白名单：`run_command`、`command_status`、`send_command_input`、`view_file`、`list_dir`、`grep_search`、`find_by_name`、`write_to_file`、`replace_file_content`、`multi_replace_file_content`、`read_url_content`、`search_web`，加上 `commandExecutionPolicy: auto`（V 这类 Linux 主机不支持 agy 沙箱）。调度、子 agent 和 agy 自带浏览器不开，这些由 OpenClaw 的工具提供 |
| `--disallowedTools mcp__openclaw__x` | 写进该 MCP 服务的 `disabledTools` |
| steer：写进运行中的进程；有未消化的插话时，结果出来后回合仍不结束 | 同样。agy 会把插话排成紧接着的下一轮，消化时会出现一个 `user_input` 步骤；回合一直保持打开，直到插话那一轮的结果也出来，两段并进同一条回复 |
| 续接：`--resume {sessionId}`，`session_id` | live 进程不在时用 `--conversation <id>` 续接，事件里取 `conversation_id`。backend 声明 `--resume`，core 算指纹时会忽略这个值，所以第二轮不会重启进程 |
| 图片：工作区路径 | 主机传来的 `--image` 路径转成 `@路径` 提及，agy 用 `read_file` 读图 |
| 思考档位转成环境变量 | 转成账号模型档位，默认 high，即 `gemini-4-neon-high` |
| 同一会话串行；原生压缩归 CLI | 同样 |

运行日志（Gateway 日志，带 `[v-antigravity]` 前缀）记录：进程启动和原因、MCP 工具数、每次工具调用、steer 入队。设置 `V_ANTIGRAVITY_TRACE=1` 会逐步记录。

**没有对齐的地方：**
- `nativeToolMode` 是 `always-on`。如果某个回合要求精确的工具集合（例如带 `toolsAllow` 的 cron、子 agent），core 会拒绝，这和 `/vcc` 的 selectable 不同。
- 带图片的插话走后续回合，与 `/vcc` 一致。
- 节点托管（node placement）未覆盖。

## 验收（VLab candidate `candidate-b9cec412`，2026-11-28 02:2x CST）

运行时是 V 的 dist 加上 `v-identity-line`；配置按 `scripts/gemini-neon-alias.mjs` 改，插件从 candidate 自己的目录加载。agy 1.5.18，用 Tianyi 的账号，模型 `gemini-4-neon-high`。

| 回合 | `/neon` | `/deepseek`（vlab-worker 对照） |
|---|---|---|
| 普通回复 ×3 | 3/3 正确；首字 8.0 s（首轮，含 agy 启动），之后 4.3 / 4.2 s | 1.4–2.4 s |
| 同一进程上的后续普通回复 | 3.9 s；其他 probe 测到 3.35–3.5 s | — |
| OpenClaw 工具 `memory_search`（MCP） | 调用到了 OpenClaw（`mcp_openclaw_memory_search`）。candidate 没有记忆索引，工具返回「index metadata is missing」，模型如实回复 0 | — |
| shell `hostname` | `HOST=VM-0-4-ubuntu`，6.1 s | — |
| 附件图片（纯蓝 PNG） | 「蓝色」，11.5 s | — |
| steer：`sleep 25` 进行到第 10 s 时插话「加上 KIWI」 | `steer queued into the live turn`，同一条回复：`MAIN-DONE\nMAIN-DONE KIWI` | — |

**首字为什么之前慢、现在为什么是这个数：**
- 11/19 量到的 12–33 s，大部分来自测试隧道（VLab → 上海 → V）上传 188 KB 请求体的时间，不是 Google 慢。同一条真实请求（5 万 token、129 个工具）在 V 上直接重放，首字 medium 3.8–4.2 s，high 5.8 s。
- agy 路线下，同一进程上的热回合首字 3.4–4.3 s，基本就是 Neon high 处理 5 万 token 上下文的时间。首轮多出约 2 s 的 agy 启动和冷缓存。
- `/deepseek` 仍然更快（1.3–2.4 s）。

单元测试：`tests/v-antigravity.test.mjs` 7 个，用一个模拟 agy 常驻模式的假 agy，覆盖 live 进程、跨轮复用、steer 并进同一条回复、续接、进程中途退出、指纹变化重启，以及工具 `ERROR` 状态；`scripts/gemini-neon-alias.test.mjs` 4 个；`lab/v-identity-line.test.mjs` 4 个。

## 配置改动（`scripts/gemini-neon-alias.mjs`）

改的是 Gateway 的 `openclaw.json`；Worker 配置由它派生，保持 `antigravity-cli` 不变，这个 runtime 只在 Gateway 里跑。

| 位置 | 改动 |
|---|---|
| `plugins.load.paths`、`plugins.allow` | 加入 `/home/openclaw/.openclaw/extensions/v-antigravity`、`v-antigravity` |
| `plugins.entries.v-antigravity` | `config: { agyBin: /opt/agy/current/agy, agyHome: /home/openclaw/.agy-home, runRoot: …/openclaw-runs, defaultEffort: high, modelProvider: antigravity }` |
| `models.providers.antigravity` | `gemini-4-neon` 的目录条目（1M 上下文，`input: [text, image]`，cost 0）。没有 key，也不会被直接调用 |
| `agents.defaults.modelPolicy.allow` | 追加 `antigravity/*` |
| `agents.defaults.models`、`agents.entries.makaron.models` | `antigravity/gemini-4-neon` = `{alias: neon, agentRuntime: antigravity-cli, thinking: high}` |

不改默认模型，也不改其他别名。`plugins.*` 的改动需要重启。

## 上线步骤（等 Tianyi 批准后由监控 session 执行）

1. 在 V 上用 Google 官方安装脚本装 agy：`bash install.sh --dir /opt/agy/1.5.18`，然后 `ln -sfn /opt/agy/1.5.18 /opt/agy/current`。目录属 root，agy 无法自更新，版本固定。
2. `sudo bash apps/v-antigravity/install.sh`：把插件装到 extensions 目录（root 属主，755/644），建好 `/home/openclaw/.agy-home`。
3. **Tianyi 登录一次**：`sudo -u openclaw -H sh -c 'cd /home/openclaw/.agy-home/work && HOME=/home/openclaw/.agy-home /opt/agy/current/agy --mode plan'`，选 Google OAuth，打开链接，把授权码粘回来。
4. 一次 `v-self-restart`，在 `--while-stopped` 阶段做两件事：
   - 用 promote 流程放上 dist 补丁 `lab/v-identity-line.plan.json`；
   - 跑 `node scripts/gemini-neon-alias.mjs apply /home/openclaw/.openclaw/openclaw.json --cli <openclaw.mjs>`。
5. 在测试群验收：`/neon`，然后普通回复、一条要跑命令的、一张图片、一次 steer。核对回复卡片显示的是 `antigravity-cli / gemini-4-neon`，Gateway 日志里有 `[v-antigravity] process start` 和 `mcp server openclaw: http eagerTools=…`。

## 回退

- 配置：`node scripts/gemini-neon-alias.mjs revert <config>`，按输出跑 `config unset` 和 `config set`；它会关掉插件并移除加载路径。或者直接恢复 v-self-restart 留下的备份。需要重启。
- dist：用 promote 流程的 undo 恢复 `system-prompt-params-B645JcX8.js`。
- agy 和它的登录可以留着，不影响别的东西。

## 风险

- 条款：用 Tianyi 个人账号的订阅驱动第三方 harness，可能被封号，Tianyi 已接受。用量计入他的 Pro 额度（五小时和周额度）。11/19 的测试中有十几条被 Google 识别出来的请求。
- 系统提示第一句会改变 V 所有回合的身份。上线后的第一轮，提示的稳定前缀会重新进缓存一次。
- agy 是外部二进制，没有公开的 stream-json 版本承诺。这次在 1.5.18 上验证；升级 agy 前要重跑 candidate。
- 每个活跃的 `/neon` 会话常驻一个 agy 进程，空闲 10 分钟回收；core 对 live session 的上限是 16 个。

## 历史：11/19 的账号桥路线

11/19 先做过一条路线：一个很薄的账号桥对外提供 Gemini API 格式，转发到 `v1internal`，跑在 vlab-worker 上。那次 VLab 验收也通过了（`candidate-744e291e`）。11/28 Tianyi 定下 `/neon` 走 Antigravity CLI，这条路线就从本 PR 移除了，代码留在本分支的 git 历史里（commit `c1ea4262` 及之前）。
