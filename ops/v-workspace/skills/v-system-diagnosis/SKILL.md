---
name: v-system-diagnosis
description: V 自己只读诊断 V 的系统问题（定时任务/同步失败、插件与 V Browser、CLI 认证与代理/网络、Worker、飞书收发、Gateway 卡顿、配置键）的步骤。排查这类问题时用它，不要把诊断交给 openclaw 工具（内置系统助手）。
---

# V 系统问题自诊断

V 自己就在这台服务器上，能读日志、文件、进程、插件和配置；内置系统助手（`openclaw` 工具）不能。这类问题由 V 自己查完。

## 为什么不交给 openclaw 工具

- 它只有一个固定工具面：读配置/状态、`doctor`、`audit`、提配置改动。**读不了日志、文件、进程、环境变量、插件内部状态，也跑不了命令。**
- 它一轮最多 120 秒，V 这边的工具调用 90–120 秒就超时；答案就算后来生成了，也到不了 V。
- 它遇到问题习惯跑 `doctor`，而 `doctor` 会全量读 15 GB 以上的会话库。2026-10-22 两次、10-25 一次，各把生产 Gateway 冻住 310 / 158 / 208 秒，期间所有群都不回，V 自己的 bash、桌面、配置读取也跟着报 hook 超时；10-22 那次之后还卡了 16 小时。
- 2026-09-05 以来它处理过的诊断类请求（UM 同步、V Browser、凭据卡片、卡住的会话、Mac 截图、定时任务）没有一次给出 V 自己查不到的答案。

## 原则

1. **先只读。** 用户说「只读」就只读；要改动时按 `skills/v-openclaw-config/SKILL.md` 和 TOOLS.md 的授权规则走。
2. **在出问题的那条执行通道里复现。** 定时任务跑在 cron 的隔离会话/Worker 里，工具面和环境变量跟当前群聊不同；在群里跑通不等于定时任务能跑通。
3. **每次读取都有边界。** 生产库 29 GB、夜班目录 29 GB，一次全量读就能把 Gateway 卡住：
   - `journalctl` 必须带 `-u <服务>`、`--since "-30 min"` 以内的窗口和 `grep -m N`；不要 `--since -7d`，不要循环跑。
   - 不对 `~/.openclaw/agents/*/agent/openclaw-agent.sqlite` 做全表扫描或 `LIKE '%…%'` 查询；会话内容用 `sessions_history`、`sessions_search` 工具。
   - `grep -r` 只搜自己的工作目录，必须带 `--include`（AGENTS.md 规则 5）。
   - **不要跑完整的 `openclaw doctor`**（`--non-interactive` / `--fix` / 不带参数都一样会全量扫会话库）。需要体检时用 `openclaw doctor --lint --only <检查 id>` 只跑相关的一项；整套 `--lint` 也要半分钟以上，只在定向检查都做完后用 `nice -n 10` 跑一次。
4. **不输出凭据。** 环境变量和配置只看名字、是否存在、类型，不打印值。
5. **结论要带证据**：哪条命令、什么输出、排除了什么。查不到就说清楚查到了哪一步。

## 按问题类型查

### A. 定时任务 / 同步连续失败（例：UM 每日同步）

1. `automations` 工具 `action=runs`（带 `jobId`）：看最近几次的 `status`、`summary`、`sessionKey`、耗时。
2. 用 `sessions_history` 读那次运行会话的最后几条，确认失败发生在哪一步、原样错误是什么。
3. 确认那条通道有没有需要的工具：cron 会话在 Worker 里，可能没有 `exec_command`/`terminal`。要验证就建一个同配置的一次性 smoke 任务，不要拿当前会话的结果代替。
4. 网络类错误（`UND_ERR_SOCKET`、`ECONNREFUSED`、`connection_failed`）转到 B。

### B. 宿主环境 / 代理 / 网络（例：`gateway_exec` 访问内网地址 `UND_ERR_SOCKET`）

1. 只看变量名：在出错的同一通道里 `env | cut -d= -f1 | grep -i -E 'proxy|node_use_env'`。
2. Gateway 的环境来源：`systemctl cat openclaw-gateway.service | grep -E 'Environment|EnvironmentFile'`，再 `sudo grep -o -E '^[A-Z_]*PROXY[A-Z_]*' <EnvironmentFile>` 看有哪些代理变量（不看值）。
3. 用 `curl -sS -o /dev/null -w '%{http_code}\n' --noproxy '*' <内网地址>` 和不带 `--noproxy` 各试一次，确认是不是代理把内网地址也代理了。
4. 配置里有没有对应的键：`openclaw gateway call config.schema.lookup --params '{"path":"<候选路径>"}' --json`（schema 是唯一依据，别凭记忆猜键名）。
5. 改宿主环境变量或 `restart` 类配置要重启 Gateway，只能用 `sudo v-self-restart --set …`（见 TOOLS.md），并且要 Tianyi 本人授权。

### C. 插件 / 工具报错（例：V Browser `acquire` 成功但 `tabs` 返回 `running=false`）

1. 插件本身：`openclaw plugins inspect <插件 id>`（版本、来源目录、是否加载），`openclaw plugins doctor`（加载错误）。
2. 插件配置：`openclaw config get plugins.entries.<插件 id>`；浏览器 profile：`openclaw config get browser.profiles.<profile>`。
3. 原生 browser 侧：`openclaw browser --browser-profile <profile> status`、`openclaw browser doctor`；对照租约返回的 `profile`/`target` 和实际解析到的 `cdpUrl`，判断走的是租约还是静态 profile。
4. 日志：`sudo journalctl -u openclaw-gateway --since "-15 min" --no-pager | grep -m 80 -i '<插件名或报错关键词>'`；V Browser 的 broker 是生产服务 `openclaw-vlab-browser.service`，同样只看最近 15 分钟。
5. 代码层原因（参数没传到、路由选错）：读插件源码目录里的相关函数（路径来自第 1 步），定位到具体文件和行，交给 Tianyi 决定修法。

### D. Gateway 慢 / 卡 / 不回 / Worker

1. 一次 `openclaw gateway call health --json`（不要循环调，health 本身有负载）。
2. `openclaw gateway call vlab.workers.status --json`：ready 数、`generation`、`draining`。
3. `sudo journalctl -u openclaw-gateway --since "-15 min" --no-pager | grep -m 50 -E 'liveness|event loop|host thaw|timed out'`。
4. 看到 Gateway 正在冻结时，不要再发重的诊断命令，先把现象报给 Tianyi。

### E. 飞书收不到 / 发不出

1. 先用消息 id（`om_…`）在最近 30 分钟的 Gateway 日志里 `grep -m 20`，确认消息到没到 Gateway、派给了哪个会话。
2. 到了再用 `sessions_history` 看那个会话这一轮的结果；没到是入站问题，不是会话问题。

### F. 配置键是什么 / 当前值 / 改了要不要重启

- `openclaw config get <路径>`；键名和 `reloadKind` 用 `config.schema.lookup`；多处核对用 `skills/v-openclaw-config/scripts/v_config_txn.py inspect`。

### G. 会话卡住 / 要中止某一轮

- 中止是变更，需要授权：`openclaw gateway call sessions.abort --params '{"key":"<sessionKey>"}' --json`，之后用 `sessions_history` 核对确实停了。

## openclaw 工具还能用在哪

只在这些情况用，并且一次调用只问一件事、不要让它跑 `doctor`：

- 用户明确要求通过 OpenClaw 内置审批（owner 飞书私聊审批卡）提交一项配置、渠道或插件变更。
- 需要 OpenClaw 的引导流程（接入新渠道、配置 web search 等）。

重启 Gateway 用 `sudo v-self-restart`；改配置首选 `skills/v-openclaw-config`。

## 查不出来时

不要转问 openclaw 工具，也不要换个说法重试。把这些报给 Tianyi：

1. 已确认的事实（命令 + 关键输出）；
2. 已排除的原因；
3. 卡在哪一步、为什么卡（缺权限、缺工具、需要宿主改动）；
4. 需要他决定或授权的具体事项，以及每个选项的影响（是否重启、是否改凭据）。
