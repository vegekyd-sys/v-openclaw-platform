# /vcodex → GPT-6.2 Sol，/astra → GPT-6.2 Astra（2026-11-18 CST）

OpenAI 2026-11-17 发布 GPT-6.2 Sol 和 GPT-6.2 Astra，API id 为 `gpt-6.2-sol`、`gpt-6.2-astra`（OpenAI Developers 公告；Codex 0.169.1 内置目录也是这两个 slug）。目标：`/vcodex` 指向 6.2 Sol，`/astra` 指向 6.2 Astra，旧模型保留回退别名，其他别名不变。

状态：共享 VLab 已验证并已回滚；**生产 V 未改，等 Tianyi 授权。**

## 结论

1. **配置部分**沿用 11/02 Terra 的做法（`models.providers.openai.models` 加带 `api: openai-chatgpt-responses` 的行），不需要 dist 补丁。
2. **Codex 通道必须升级 Codex 客户端。** V 的 Codex 0.159.2 拿到的账号模型目录里没有 6.2（V 上 `models_cache.json` 11/18 09:33 刷新，`client_version=0.159.2`）。VLab 实测：OpenClaw 路由通过，但 OpenAI 返回
   `The 'gpt-6.2-sol' model is not supported when using Codex with a ChatGPT account.`（400 `model_not_found`）。Codex 0.169.1（npm latest，11/17 发布）内置目录有这两个模型，换上后通过。
3. **Worker 通道不依赖 Codex 版本**：short-v 的 `/astra`（vlab-worker）在 0.159.2 下就能用 6.2 Astra 调工具并回复。
4. 换 Codex 客户端影响**所有** codex runtime 回合（`/vds`、`/vcodex*`、makaron/v-codex/hy-codex 上的 `/astra*`），所以回归覆盖了这些入口。

## 改动清单（两份配置都改，按语义镜像）

| 位置 | 改动 |
|---|---|
| `models.providers.openai.models` | 追加 `gpt-6.2-sol`（ctx 500000/272000，价格同 6.1 Sol）和 `gpt-6.2-astra`（ctx 272000/272000，cost 0，与现有 6 Astra 一致）；原有 Terra、Luna 行原样保留 |
| `agents.defaults.models` | `openai/gpt-6.2-sol` 取得 `vcodex`（codex，medium）；`openai/gpt-6.1-sol` 改名 `vcodex61`。`openai/gpt-6.2-astra` 取得 `astra`（Gateway vlab-worker / Worker openclaw，low）；`openai/gpt-6-astra` 改名 `astra60` |
| `agents.entries.makaron.models` | 同上（vcodex：codex medium；astra：codex high） |
| `agents.entries.v-codex.models`、`hy-codex.models` | 只有 astra：6.2 Astra 取得 `astra`（codex high），6 Astra 改 `astra60` |
| `plugins.entries.codex.config.appServer.command` | `/opt/codex-0.159.2-v/…/codex` → `/opt/codex-0.169.1-v/…/codex`（只改 command，mode/sandbox/serviceTier 保留）。**该键需重启**，CLI 提示 `Restart the gateway to apply` |

新别名的 runtime/thinking 全部从当前持有该别名的条目复制，不重写；`/vcodex60`、`/vcodex56`、`/vds`、`/terra`、`/luna` 等不动。`modelPolicy.allow` 已含 `openai/*`，不用改。

工具：`scripts/gpt62-aliases.mjs`（`plan` / `apply` / `verify` / `revert`），`apply` 逐条调用 `openclaw config set <path> <json> --strict-json --merge` 后 verify；第二次运行为空操作。标量不能 `--merge`，所以 Codex 命令是对 `appServer` 对象 merge `{command}`。Codex 客户端清单：`lab/release-files/gpt62-aliases/codex-client.json`（0.169.1，linux-x64 二进制 SHA-256 `105102da…ce8b5`）。

## VLab 证据（共享 VLab，lease owner `gpt62-alias-lucid-dijkstra`，09:38–09:57）

测试经 `vlab.mjs test`（`deliver:false`，走回复管线解析别名，不发飞书）。模型/provider/api 来自 `chat.history`；Codex 侧来自 `codex-home/sessions` rollout 的 `session_meta.cli_version` 与 `turn_context.model`。

| 入口 | Codex | 结果 |
|---|---|---|
| makaron `/vcodex` | 0.159.2 | 路由通过，OpenAI 400 `not supported when using Codex with a ChatGPT account` |
| short-v `/astra`（vlab-worker） | 0.159.2 | `gpt-6.2-astra / openai-chatgpt-responses`，exec 返回 hostname，回复正确 |
| makaron `/vcodex` | 0.169.1 | `gpt-6.2-sol`，bash 工具 + 回复；下一轮不调工具复述上下文 `CONTEXT_OK`；rollout `cli=0.169.1 model=gpt-6.2-sol` |
| makaron `/vcodex` apply_patch | 0.169.1 | 新建文件、cat、sha256 与本地计算一致 |
| makaron `/astra`（codex） | 0.169.1 | `gpt-6.2-astra`，bash + 回复；rollout `model=gpt-6.2-astra` |
| short-v `/astra`（vlab-worker） | 0.169.1 | `gpt-6.2-astra`，exec + 回复 |
| `/vcodex61` `/vcodex60` `/vcodex56` `/astra60` | 0.169.1 | 分别 `gpt-6.1-sol` `gpt-6-sol` `gpt-5.6-sol` `gpt-6-astra`，均 bash + 回复 |
| `/vds`（DeepSeek via Codex） | 0.169.1 | `deepseek-flash`，bash + apply_patch + 读回均成功，rollout `provider=deepseek` |
| short-v `/terra` `/luna`（vlab-worker） | 0.169.1 | `gpt-6.1-terra`、`gpt-6-luna`，exec + 回复 |
| 思考档位 | 0.169.1 | 会话 `thinkingLevel=high` 时 rollout `effort=high`（直接 `chat.send`） |

注意：`vlab.mjs test` 每条消息都带 `thinking:'low'`，所以经它跑的回合 rollout 一律是 `low`，不能用来判断档位；同一行的 `idempotencyKey: vlab-dev-${Date.now()}` 让同一毫秒并行发出的请求被当成重复（本次一个 `/astra` 被吞），并行测试要错开或自带 key。

写配置后 worker 池正常（5 个、未 closing）。VLab 重启后日志有一条 `Cannot reap registered Codex process <旧 pid>`，是旧进程登记残留，回合不受影响。

回滚：停机恢复两份配置备份，`configSha` 回到 `b38326c2…`、Worker `d3d710a0…`，5 个 worker，`/vds` 正常；lease 已释放。`tools/codex-0.169.1` 保留以便同步。

## V 上线步骤（待授权）

1. 安装客户端到新目录（不影响运行中的服务）：
   `npm install @openai/codex@0.169.1` 到 `/opt/codex-0.169.1-v`，`chown -R openclaw:openclaw`，核对二进制 SHA-256 与清单一致、`--version` 为 0.169.1。0.159.2 保留。
2. 一次重启完成全部配置（分开做会出现「别名已指 6.2、Codex 还是旧版」的窗口）：
   `v-self-restart --reason … --requested-by … --idle-timeout 600 --if-busy abort --while-stopped-timeout 300 --while-stopped '<对两份配置各跑 gpt62-aliases.mjs apply --cli /usr/local/bin/openclaw --codex-command /opt/codex-0.169.1-v/…/codex>'`。
   v-self-restart 停机前自动备份两份配置，命令失败、配置校验失败或起不来时自动恢复。V 上已在两份配置的副本上 dry-run：各 6 条 set 成功、verify 通过，相对线上各只改 7 行（6 处 alias + 1 处 command）。
3. 起来后核对：`vlab.workers.status` workers>0 且未 closing、app-server 进程路径为 0.169.1、日志无 `not supported` / Codex 报错；如 Codex 回合因 `Cannot reap registered Codex process` 失败，按已知做法核对旧 pid 已死后删 `app-server-processes` 登记行。
4. 验收：由 Tianyi 本人在测试群发 `/vcodex` + 一条需要工具的消息、`/astra` 同样一条；或经授权用 lark-cli 以 Tianyi 身份在「V 生产发布验收 0910」群发送。核对回复卡片 model/runtime 和 V 上 rollout 的 `cli_version=0.169.1`。
5. 同步 VLab（同一脚本、同一 Codex 版本），`vlab-v-parity` 核对。

回滚：`v-self-restart --while-stopped` 恢复 v-self-restart 留下的 `*.bak-self-restart-<id>` 两份备份（或对两份配置跑 `revert` 并把 command 改回 0.159.2），重启。

## 风险

- Codex 0.159.2 → 0.169.1 跨 10 个小版本，影响全部 codex runtime 回合，尤其是 V 上量最大的 `/vds`（近 3 天 2300+ 个 rollout）。VLab 覆盖了工具调用、apply_patch、上下文延续、思考档位、跨模型回归；没覆盖：长会话压缩、图片、子 agent、steer、夜班批量负载。
- 已切到 `/vcodex` 或 `/astra` 的现有会话会话里记的是旧模型 ref，要重发一次别名才换到 6.2（与 11/02 Terra 相同的推断）。
- 6.2 Astra 的 cost 填 0（与现有 6 Astra 一致），价格未从 OpenAI 官方价目页核实。
