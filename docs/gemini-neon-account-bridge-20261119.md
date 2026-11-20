# /neon：Gemini 4 Neon 走 Tianyi 的 Google 账号（2026-11-19 CST）

状态：**被 Google 拦截，停在验证阶段。不要合入，也不要上 V。** 账号接口会识别 OpenClaw 默认 system prompt 的开头一句，并以 429 拒绝。要不要绕过需要 Tianyi 决定；这里没有做绕过。详见「验收：被拦在哪里」。

## 要求（Tianyi 11/19）

在 V 里接入 Google 模型，用他自己的 Gemini 账号（relay 上已有登录）。第一步小规模试：只走 vlab-worker，接 relay 已经在用的账号接口，只上 Neon，要能看图。Tianyi 已明确表示接受下面的条款风险。

## 事实

- **账号能用的模型**：用 V 上 relay 的官方 CLI（`agy` 1.3.3）只读执行 `agy models`，列出：
  - `gemini-4-neon-{low,medium,high,xhigh}`
  - `gemini-4-argon-*`、`gemini-4-hydrogen-*`
  - `gemini-3.8-flash-*`
  - Claude Opus/Sonnet 5.5、GPT-OSS 120B

  **没有 Carbon**，Pro 账号目前用不了。Neon 11/18 发布，对 AI Pro 开放。账号档位 `g1-pro-tier`。
- **条款风险**：Antigravity 条款第 6 条以 "OpenClaw with Antigravity OAuth" 为例，说明用第三方软件访问服务属于违约，可能导致 Antigravity 或 Gemini CLI 账号被暂停或终止。上游 OpenClaw 因此删除了 google-antigravity provider（`382fe8009aa`）；另外，个人账号通过 Gemini CLI 用 Google 登录的方式已于 6/18 停止。本方案与 Scene relay 的视频分析一样，用的是这个账号的 OAuth，**风险由 Tianyi 承担**。
- **9.1 没有可用的内置通道**：`google-antigravity` 只剩模型名规范化，没有 transport；`google-gemini-cli` 是驱动 Gemini CLI 的 runtime，个人账号登录已停用。所以需要一个很薄的转换层。

## 方案：账号桥 + OpenClaw 原生 Google transport

```
Gateway (vlab-worker) ─▶ Worker (PI harness, google-generative-ai transport)
   └─ provider gemini-account, baseUrl http://127.0.0.1:25990/v1beta, key = file SecretRef
        └─ apps/gemini-account-bridge（scene-gemini 用户, 127.0.0.1:25990）
             └─ daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent（relay 的同一登录）
```

- agent 循环、工具、图片、流式和思考全部由 OpenClaw 自带的 Gemini transport 完成。桥只做三件事：
  1. 把请求包成 `{project, model, request}` 再拆回来；
  2. 加上账号令牌；
  3. 把 `thinkingLevel` 换成账号模型名的档位后缀，例如 `/think high` 对应 `gemini-4-neon-high`。

  没有另造 agent、工具或提示词机制。
- 登录令牌由官方 CLI 维护：快过期时桥调一次 `agy --print /usage`（relay 也是这么做），收到 401/403 时强制刷新并重试一次。
- **没有共享密钥。** 桥通过 `/proc/net/tcp` 查本机连接是哪个 Unix 用户发起的，V 上只放行 `openclaw`（Gateway 和 Worker），其他本机用户返回 401。配置里的 apiKey 只是一个固定标记，因为 Google transport 总要带一个 key。
  - 9.1 里试过把 file SecretRef 和 store SecretRef 用作 provider key，都不行：这两种来源在模型请求里只会变成占位串，真实值要由 egress 代理在出站时替换，而发往 127.0.0.1 的请求不经过代理。candidate 实测桥收到的是 118 字符、每轮都变的占位串。V 上 `/ultra` 能用 store 引用，是因为它发往的是外网主机。
  - Google 的 OAuth 凭据始终只在 relay 用户的 0600 文件里，不进配置、git 或日志。
- 没有选 Antigravity CLI 当 harness，原因是它的 headless 模式不支持图片输入、没有 system prompt 参数、MCP 配置不能按次指定，而且 9.1 要写插件才能接。这次的要求是 vlab-worker 加图片，这条路不需要。

## 配置改动（`scripts/gemini-neon-alias.mjs`，两份配置按语义镜像）

| 位置 | 改动 |
|---|---|
| `models.providers.gemini-account` | `api: google-generative-ai`，`baseUrl: http://127.0.0.1:25990/v1beta`，`apiKey: "loopback-uid-auth"`（固定标记，不是凭据，见下文）。模型 `gemini-4-neon`：1M 上下文，最大输出 65536，`input: [text, image]`，cost 0（订阅额度） |
| `agents.defaults.modelPolicy.allow` | 追加 `gemini-account/*` |
| `agents.defaults.models`、`agents.entries.makaron.models` | `gemini-account/gemini-4-neon`：`alias: neon`，`thinking: medium`，`agentRuntime` 复制本 scope 的 `/deepseek`（Gateway 为 `vlab-worker`，Worker 为 `openclaw`） |

不改默认模型，不改其他别名。脚本提供 `plan / apply / verify / revert`，重复运行为空操作，输出里不含任何凭据。

## 验收：被拦在哪里

实测时间 2026-11-19 11:24–12:02 CST。环境：桥以临时 systemd 单元跑在 V 上（scene-gemini 用户，127.0.0.1:25990）。VLab candidate 起私有 Gateway 和 Worker，经 Mac 上的 SSH 隧道访问这个桥。测试完已清理：桥、临时单元、请求样本、隧道都已删除；relay 未受影响。

**桥本身是通的**（直接调用，不经过 OpenClaw）：

| 场景 | 结果 |
|---|---|
| 流式纯文本 `gemini-4-neon-low` | 200，首个分片 1.38 s，总耗时 1.39 s，`modelVersion=gemini-4-neon` |
| function calling（exec 声明） | 200，返回 `functionCall exec {command: hostname}` |
| inlineData 图片（纯红 PNG） | 200，回答 `Red` |
| 约 7 万 token 的合成 system prompt | 200，2.96 s |
| 令牌快过期时自动刷新 | 一次 `agy /usage` 后令牌恢复 1 小时有效，请求 3.8 s |
| 不在名单里的本机用户（scene-gemini） | 401 |

**OpenClaw 的真实回合全部失败。** 对照组 `/deepseek`（同一个 vlab-worker 通道）的普通回复、exec、附件图片、view_image 全部通过，首字 1.6–3.3 s。`/neon` 的每一轮请求都到了桥，但上游回 `429 RESOURCE_EXHAUSTED`，用时 4–34 s；与此同时，小请求照常返回 200，额度也没有用完。

把 OpenClaw 发出的真实请求逐项拆开重放，结果如下：

| 请求 | 结果 |
|---|---|
| 只有 contents（去掉 system prompt） | 200 |
| system prompt + "hi" | 429 |
| system 只放 `You are a personal assistant running inside OpenClaw.` | **429** |
| 同一句，全部小写 | **429** |
| 同一句，去掉句号 | 200 |
| `running` 改成 `operating` | 200 |
| `a personal assistant` 改成 `an assistant` | 200 |
| system 只放 `OpenClaw` / `You are running inside OpenClaw.` | 200 |
| 同一句放进用户消息而不是 system prompt | 200 |

结论：Google 的账号接口会精确匹配 OpenClaw 默认 system prompt 的开头一句（不区分大小写），然后返回伪装成额度耗尽的 429。这就是 Antigravity 条款第 6 条（以 "OpenClaw with Antigravity OAuth" 为例）在服务端的实际执行，不是容量或长度问题。

**影响：**
- 测试期间大约有十几个被识别的请求，用的是 Tianyi 的账号，也就是 Scene relay 共用的那个。Google 那边可能已经记下了这些请求。
- 可选路线：
  1. **API key，合规**：配置不用改结构，只要把 baseUrl 换成官方地址、换上 key。代价是 API 费用，Neon 是每百万 token 输入 $3、输出 $15。
  2. **绕过识别**：在桥里改写这句话即可。这是主动规避 Google 的反滥用识别，封号风险会明显上升，而且 Google 可以随时换特征。本 PR 没有实现，也不建议这么做。
  3. **等官方给个人订阅开放第三方使用的渠道。**

## 上线步骤（等 Tianyi 批准后由监控 session 执行）

1. `sudo bash apps/gemini-account-bridge/install.sh`：安装 `/opt/gemini-account-bridge/<sha>`，起 `gemini-account-bridge.service`（scene-gemini 用户，127.0.0.1:25990，只放行 openclaw）。不动 relay 和它的端口 25986。
2. 对两份配置分别跑 `node scripts/gemini-neon-alias.mjs apply <config> --cli <openclaw.mjs>`。9.1 的 reload 规则里 `models` 属于 hot（只重启 heartbeat），`agents`、`secrets` 属于 none，所以**不需要重启 Gateway**。Worker 按配置换代，与 11/02 的 `/terra` 相同。写入后核对 `vlab.workers.status` 里 workers>0 且没有处于 closing。
3. 验收：在测试群发 `/neon`，再发一条需要 exec 的消息和一张图片。

## 回退

- 对两份配置跑 `node scripts/gemini-neon-alias.mjs revert <config>`，输出的 `unset` 用 `openclaw config unset`，`sets` 用 `config set`。也可以直接恢复 v-self-restart 的配置备份。
- `sudo bash apps/gemini-account-bridge/install.sh --uninstall` 停掉桥。
- relay、Scene 和其他别名都不受影响。

## 风险与未覆盖

- 账号封禁风险见上。用量计入 Tianyi 的 Pro 订阅额度，和 Scene relay 共用同一个池子：五小时额度和周额度都是共用的。
- 共享 VLab 没有这套登录，parity 对 `gemini-account` 会报差异。要么在 VLab 上单独登录一份 agy（需要 Tianyi 交互授权），要么让 VLab 通过 tailnet 访问 V 上的桥。待定。
