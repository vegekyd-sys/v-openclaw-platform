# 2026-11-09：agent 对整个数据目录递归搜索，读几十 GB、冻结 Gateway

时间均为 CST。所有结论来自只读查看 V 上的 Codex rollout（逐个指定文件读取）、工作区 AGENTS.md 和 OpenClaw 9.1 的 dist。

## 概要

- 当天抓到三次，都按 PID 杀掉了：16:40（14 分钟，Gateway 冻结 89 s 和 52 s）、19:22（173 s，读了 25 GB）、20:19（215 s，读了 37 GB）。
- 这三次各有一个**信息缺口**，agent 的反应都是去搜整个目录：
  1. 定时任务列表太长，又没法按名字查；
  2. 夜班卡只说「算一个稳定的 SHA-256」，没说怎么算；
  3. exec 环境里的代理拦住了 `nightshiftctl` 访问本机夜班服务，agent 误以为是地址不对。
- 三次还有一个共同的**放大因素**：命令超过等待时间后转入后台，agent 已经放弃这次搜索，但从没结束这个进程。
- **AGENTS.md 的规则没起作用，原因分两种：**
  - 飞书聊天会话：规则在模型上下文里，agent 看到了，照样执行；
  - 夜班卡会话（/vds）：模型上下文里**根本没有 AGENTS.md**。
- 这不只是三次偶发。重放当天全部 605 个 rollout 里的 17,214 次 shell 调用，有 **225 次、来自 145 个会话**对整棵树做了遍历，其中 50 次是 `grep -r`/`rg` 读文件内容（重放工具在已撤回的提交 a69c0ca3 里）。

## 三次各自的触发需求

### 1. 16:40:48 `grep -rl "chengpian-daily" /home/openclaw/.openclaw`（Codex 原生 `exec_command`）

- **会话**：飞书群「mp4 链接 // 特殊账号分发群」（`oc_74f1c85d…`），/vds（deepseek-flash）。rollout 是 `codex-home/sessions/2026/11/09/rollout-2026-11-09T14-20-07-01a1bef6-….jsonl`，第 529 行。
- **用户需求**：
  - 16:28，吕恒：「这边账号素材余量做一个汇总」；
  - 16:34–16:38，小明（叶路明）回复早上的日报：「如果超过 2000 行就不进行统计了，你看下以后要如何解决，我要一个完整数据」，并要求改成固定链接的飞书文档。
- **agent 做了什么**：
  1. 建好文档、表格和发布脚本 `scripts/chengpian-publish.py`；
  2. 想把每天的日报定时任务改成调用新脚本，于是调 `automations list`。返回 83 个任务、47,684 字符。
  3. 第 528 行的推理：「The list is huge … The output was truncated … search config files for "chengpian" in ~/.openclaw」，随即执行了这条 grep。
- **缺的信息**：
  - 这个任务的名字是「成片分发日报 · 工作日10:20（临界提醒运营备素材）」（`511cd664…`），出现在返回内容的第 22,877 个字符，而模型看到的是截断后的版本；
  - 任务名里没有脚本名 `chengpian-daily`；
  - automations 工具不支持按名字过滤。
- **放大因素**：
  - 30 s 后 Codex 返回「Process running with session ID 85722」；
  - agent 3 s 后改搜 `cron/ automations/ config*`，没搜到，就直接回复用户了；
  - 85722 一直没被结束，跑了 14 分钟。

### 2. 19:22:50 `grep -rl "media-manifest" ~/.openclaw/nightshift ~/.openclaw/workspace`（OpenClaw `exec`）

- **会话**：Workboard 卡 `18318dc8`「广州妆泽 阿拉伯语 20条…神经酰胺喷雾 1｜出片」，实例 DL-1109-05、条目 zz-ar-arb-05，/vds。rollout `rollout-2026-11-09T19-22-13-01a1c00b-…`，第 82 和 104 行。
  - 夜班卡线程没有 Codex 原生 shell。agent 先调 `terminal` 失败（参数错误），之后改用 OpenClaw 的 `exec`。
- **触发**：派卡提示词写的是「before the first paid/public/external call, compute a stable SHA-256 of the exact external request and run `nightshiftctl operations reserve … --request-hash <sha256>`」。
  1. agent 读了同项目另一条 `zz-ar-oem-06/produce/request.json`，想算出和它一样的 hash，没算对；
  2. 于是在 releases 和整个 `~/.openclaw` 里 grep `mediaManifestSha256`（19:22:33，转入后台，17 s 后它自己 kill 了）；
  3. 接着 grep `media-manifest`（19:22:50）；
  4. 19:23:22 推理「Search is slow. Forget it.」，自己定了一个 hash 继续干活，但第二个 grep（会话 `briny-sage`）一直没被结束。
- **同类**：19:04 的卡（`rollout-…T19-03-45-…`，DL-1109-04）在 `instances` 下连跑三次 `grep -rl`（`media-manifest`、`logo-main-en`、`e6966ed2625b-logo`）。
- **缺的信息**：这个 hash 由谁定、要和谁一致，提示词里没写。agent 以为必须沿用别的卡的惯例。

### 3. 20:19:41 `grep -rl 'NIGHTSHIFT_URL' /home/openclaw/.openclaw`（OpenClaw `exec`）

- **会话**：Workboard 卡 `208f6e0d`「上海国际广告（亚教展）西班牙语…08｜出片」，实例 DL-1109-08，/vds。rollout `rollout-2026-11-09T20-18-45-01a1c03f-…`，第 112 行。任务里另外提到的三份 rollout（`T20-22-44`、`T20-22-25`、`T19-55-09`）只在输出里出现过这个词，没有发起 grep。
- **触发**：`nightshiftctl operations reserve` 和 `health` 都返回 `fetch failed`。agent 的排查过程：
  1. 看了 env，里面有 `HTTP_PROXY`/`HTTPS_PROXY=http://…@127.0.0.1:45053` 和 `NODE_USE_ENV_PROXY=1`，没有 `NO_PROXY`；
  2. 读了 nightshiftctl 源码，看到默认地址是 `127.0.0.1:24879`，误判为「这个端口没在监听，要找 NIGHTSHIFT_URL」；
  3. 于是执行 `ss` + `ps` + 这条 grep；
  4. 20:20:10 发现 24879 其实在监听，改用 `env -u HTTP_PROXY …` 就通了。grep 没被结束。
- **根因（不是缺地址）**：
  - OpenClaw 文档（`docs/security/network-proxy.md`）写明，受管代理开启时会刻意清空 `NO_PROXY`，代理本身也拒绝转发回环地址；
  - 所以 exec 子进程里的 Node `fetch` 访问 127.0.0.1 一定失败；
  - 夜班卡每次都会遇到：20:00 以后的 137 个 rollout 中，76 个调用了 nightshiftctl，77 个出现 `fetch failed`。每张卡都要自己重新摸索出 `NO_PROXY=…` 或 `env -u …` 的绕法。
  - `NIGHTSHIFT_URL` 默认值本来就是对的。只在环境变量里补上地址解决不了问题。
- **同类**：14:58 `grep -rn "24879" /home/openclaw/.openclaw --include=…`，15:01 `grep -rn NIGHTSHIFT_URL ~/.openclaw/nightshift`。

## AGENTS.md 规则为什么没管住

规则原文还在，位于 `/home/openclaw/makaron-openclaw/.openclaw-local/workspace/AGENTS.md` 的 High-Priority Rules 第 5 条：

> **Filter every recursive search** — Always pass `--include` to `grep -r`, and never point it at a data tree you did not create. … `/home/openclaw/.openclaw/nightshift/` alone holds 29 GB of finished video; one unfiltered `grep -r` there saturates disk I/O and stalls the Gateway for every session. Search your own working directory and declared input paths only.

分两种情况：

| 会话 | 模型上下文里有没有这条规则 | 证据 |
|---|---|---|
| 飞书聊天（/vds，Codex） | **有**。Codex 原生加载项目文档，rollout 第 9 行「# AGENTS.md instructions for …」共 14,561 字符，包含第 5 条 | 第一次事故的 rollout |
| 夜班卡（/vds，Codex，Workboard） | **没有**。没有 AGENTS.md 那条消息；developer 指令只有 3,305 字符（聊天是 60,740）；`<openclaw_workspace_context>` 里只有 Memory Recall 和 OpenClaw Skills，没有 SOUL、AGENTS | 第二、三次事故的 rollout |

夜班卡没有加载 AGENTS.md，原因如下（2026-11-10 查清，详见 `docs/experiments/workboard-full-context-20261110.md`，修复在 PR #591）：
- **上游 Workboard 派卡时写死了 `lightContext: true`**（`extensions/workboard/src/dispatcher.ts:532`，V 的 dist 在 `runtime-api-1CCazqtv.js:3935`）。
  - lightweight 模式下，core 会清空全部引导文件；
  - 在 Codex 上还会写 `project_doc_max_bytes: 0`，原生 AGENTS.md 也不加载。
- 卡的 sessionKey 是 `…:subagent:workboard-…`，会被认成子 agent，引导文件只剩 AGENTS 和 MEMORY。
- Worker 会原样转发这个模式，所以 **Worker 时代的卡同样没有**，不是 /vds 带来的回退。candidate 对照组证实，Worker 和 /vds 上的卡都答不出 AGENTS 和 SOUL 的内容。
- 初稿把原因归到「受限工具面」，这是错的。受限工具面只影响工具：卡按子 agent 策略运行，没有原生 shell，只能用 `exec`/`gateway_exec`。
- 这和记忆 codex-catalog-drops-collaboration-instructions 那个问题（gpt-6.x 目录覆盖）不是一回事。
- 11/09 普查全部 /vds 线程：用户聊天 102/102 完整（AGENTS、SOUL、IDENTITY、USER、MEMORY）；夜班卡 435/435 全部缺失。

聊天会话看到了规则却照样执行，原因：
- 规则要求的是「加 `--include`」和「不要指向你没创建的数据树」，agent 很容易认为 `~/.openclaw` 是配置目录，不算数据树；
- 这条规则埋在约 21 万字符的指令里（developer 6.1 万 + workspace context 7.4 万 + skills 6.4 万 + AGENTS 1.5 万）；
- 规则只靠模型自觉，执行时没有任何东西拦它。

靠提示词约束不够。初稿的做法是在工具调用前拒绝这类命令（v-scan-guard 插件）。Tianyi 11/10 的决定是：**不限制 agent 能做什么，只限制它能抢走多少资源**。拦截插件不上线，改成下面两件事。

## 1. 资源隔离：agent 的命令进自己的 cgroup

**现成机制。**
- Gateway 单元早已委托给服务用户（`94-verifier-resource-group`：`Delegate=memory`、`DelegateSubgroup=foreground`），Gateway 也用同样的方式把数据库校验进程挪进同级的 `database-verifier` cgroup（memory.high 512M）。
- systemd 自己没有「把某个子进程归入另一组」的机制，只能由委托子树的属主来挪。
- V 上 `system.slice` 本来就把 io 控制器开给了这个单元，`cgroup.subtree_control` 归 openclaw 所有，服务目录本身也没有进程。所以服务用户可以自己写 `+io`：**不用改 Delegate，也不用重启 Gateway**。

**做法：`scripts/v-agent-shell-cgroup.py`。** 这是一个以 openclaw 身份运行的独立单元 `systemd/v-agent-shell-cgroup.service`，每秒执行一次：

- **挪进 `agent-shell` 的**：
  - OpenClaw exec 的每个 shell 连同子树。Gateway 和 Worker 执行每次 exec 时，都会直接起一个 `/bin/bash --noprofile --norc -c`（这是在 VLab 的真实回合里观察到的进程树）；
  - 每个 OpenClaw 服务 relay（`core/dist/process/supervisor/service-child-relay.js`）连同子树。agent 起的常驻服务（watch、bridge）挂在 relay 下面；
  - Codex app-server 起的每个进程连同子树，包括 `exec_command` 和 `write_stdin` 用的 shell。
- **不动的**：Gateway、Worker、app-server 本身、Codex 的 hook relay（它必须在 10 秒的 hook 期限内答复），以及 Chrome。
- **`agent-shell` 的限制**：
  - `memory.high`（V 上 12G）：agent 命令读进来的页缓存记在 agent-shell 头上，先在这里回收，挤不掉 Gateway 的库页。超过上限时内核降速，不杀进程。V 上现有的 agent 进程共 460 MB；每次 exec 的 relay 和 anchor 两个 node 进程约 96 MB，所以按夜班几十张卡并发留足了余量。
  - `io.max`（V 上两块盘各 80 MB/s 读写）：扫盘不能占满 Gateway 要写的盘。
- Gateway 重启后会自动重建 `agent-shell`；sidecar 停掉也不影响任何进程。

**对正常命令的影响**（实测见下）：
- 短命令通常在被挪之前就结束了（最多慢 1 秒被挪）。
- 被挪之后，只有在 agent-shell 合计超过上限时才会变慢：大文件读写被限在 80 MB/s，内存总量超过 12G 时降速。
- ffmpeg 这类以 CPU 为主的任务基本不受影响。大文件拷贝会被限速，这是有意的：它们本来就会和 Gateway 抢盘。

## 2. 回合结束时回收被放弃的后台进程

- **Codex `exec_command` 和 `write_stdin`**：超过 `yield_time_ms` 的命令留在 Codex 的「后台终端」里。插件原来只在回合被取消或超时的时候调 `thread/backgroundTerminals/list` 加 `terminate`；正常结束的回合不清理，16:40 那个 grep 就这样跑了 14 分钟。
  - **修复**：`v-codex-turn-end-terminals-v1`，回合正常结束时也清理。只在本回合跑过原生命令（出现过 `commandExecution` item）时才做，不碰 shell 的回合不多发请求。改动在 `run-attempt-D1hJO4fX.js`，源码在 openclaw-versa `versa/port-codex-turn-end-terminals-20261110` @ 9da16d57d2d。
  - Codex 没有「后台命令跑完唤醒 agent」的机制，回合结束后留着的终端没人会再看，所以这样做不会丢掉有用的工作。
  - `OPENCLAW_CODEX_TURN_END_TERMINALS=keep` 可以保留它们。
- **OpenClaw `exec`**：后台会话**按设计跨回合存活**：命令跑完时会唤醒 agent（`tools.exec.notifyOnExit`），夜班等出片就是靠这个。所以回合结束时不杀，沿用官方已有的上限 `tools.exec.timeoutSeconds`，默认 1800 秒。19:22 和 20:19 那两次的 grep 本来最多跑 30 分钟；有了资源隔离，这 30 分钟也只会拖慢它自己。

## 证据

1. **单元测试**：
   - `tests/v-agent-shell-cgroup.test.py`：5 项，用 V 上真实的进程树做夹具；
   - `lab/codex-turn-end-terminals.test.mjs`：3 项；
   - fork 的 vitest：`run-attempt-thread-cleanup.test.ts` 新增 4 项。在 VLab 上用 Node 24.17 跑 Codex app-server 的 5 个套件，全部通过（attempt 179、attempt-extra 269、light 66、support 70、runtime 1181），基线版本同样全部通过；把清理改成恒不执行后，新增用例里应当回收的 2 项失败。
2. **VLab candidate：资源隔离**（`lab/candidate/agent-shell-cgroup.*`）。结果见 [docs/evidence/agent-shell-cgroup-20261110.md](../evidence/agent-shell-cgroup-20261110.md)。
3. **VLab candidate：真实 /vds 回合**（`lab/candidate/codex-turn-end-terminals-{on,off}.*`，结果在 [docs/evidence/codex-turn-end-terminals-20261110.json](../evidence/codex-turn-end-terminals-20261110.json)）。用 `chat.send` 发消息，和渠道聊天一样会保留 Codex 线程。CLI 的 `openclaw agent` 会设 `cleanupBundleMcpOnRunEnd`，回合结束后线程不保留，终端会随线程一起被收掉，复现不出问题。

   | | 回合 1：`exec_command` 起 `sleep`，yield 2 秒后直接回复 | 回合 2：`gateway_exec` 后台起 `sleep` |
   |---|---|---|
   | V 现在的字节（`candidate-5ea27814`） | 运行中在 agent-shell；**回合结束后仍在跑**（复现了 16:40） | 运行中在 agent-shell；回合结束后仍在跑（按设计） |
   | 打补丁（`candidate-5abb6a9b`） | 运行中在 agent-shell；**回合结束即被回收** | 运行中在 agent-shell；回合结束后仍在跑（按设计） |

   两组里 Gateway 和 Codex app-server 都留在 `foreground`。

## 直接把信息给 agent

- **v-nightshift PR #43**：本机 NIGHTSHIFT_URL 时，nightshiftctl 自己绕过 env 代理（先写了失败测试，复现了同样的 `fetch failed`）；派卡提示词写明 hash 由 agent 用自己写下的请求 JSON 计算，不要去翻别的实例、日志或源码找惯例。
- **PR #591（已合入）**：夜班卡带上完整的工作区上下文，AGENTS.md 的规则终于能送到夜班 agent。

## 没做、建议另行处理

1. **automations 不能按名字查**，长列表会被截断。工具加一个 `query`/`name` 参数，或者让 `list` 默认只返回 id 和名字。
2. **别的信息缺口**：
   - 夜班卡大量跨实例 `find instances -path '*/handoffs/produce.json'`，是在找别的卡的产出当样例。可以在派卡提示词里给出本阶段 handoff 的示例或 schema。
   - `find / -name SKILL.md -path '*scene-cli*'`，是找不到 skill。
3. **监控**：上线后，在 V 的哨兵里加一项「agent-shell 存在、relay 进程不在 foreground」，防止 sidecar 静默失效。
