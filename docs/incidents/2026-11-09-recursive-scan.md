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
- 这不只是三次偶发。重放当天全部 605 个 rollout 里的 17,214 次 shell 调用，有 **225 次、来自 145 个会话**对整棵树做了遍历，其中 50 次是 `grep -r`/`rg` 读文件内容。

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

夜班卡没有加载 AGENTS.md，原因如下：
- 夜班卡是受限工具面的回合，原生 shell 被拿掉了，所以 agent 只能用 `exec`/`gateway_exec`。
- OpenClaw 的 Codex 插件对这类回合，或对 `bootstrapContextMode: "lightweight"` 的回合，会给线程配置写 `project_doc_max_bytes: 0`。代码在 `extensions/codex/src/app-server/thread-requests.ts`，相关符号是 `restrictedTurnDisablesProjectDocs` 和 `CODEX_NO_PROJECT_DOCS_CONFIG`。具体是哪个条件命中的没有逐一核对，但效果从 rollout 上可以确认。
- 这和记忆 codex-catalog-drops-collaboration-instructions 那个问题（gpt-6.x 目录覆盖）不是一回事：/vds 用的 DeepSeek 没有目录覆盖，workspace context 也确实送达了，只是里面不包含 AGENTS.md。
- 夜班 11/09 12:23 改跑 /vds 以后，这条规则就到不了夜班 agent。Worker 时代的卡有没有加载 AGENTS.md，这次没有核实。

聊天会话看到了规则却照样执行，原因：
- 规则要求的是「加 `--include`」和「不要指向你没创建的数据树」，agent 很容易认为 `~/.openclaw` 是配置目录，不算数据树；
- 这条规则埋在约 21 万字符的指令里（developer 6.1 万 + workspace context 7.4 万 + skills 6.4 万 + AGENTS 1.5 万）；
- 规则只靠模型自觉，执行时没有任何东西拦它。

所以靠提示词约束不够，必须在工具调用前拦截。

## 拦截

新插件 `apps/v-scan-guard`，在 `before_tool_call` 上声明 `matcher: ["exec","process"]`，只拒绝、不改写参数。规则和覆盖范围见 [apps/v-scan-guard/README.md](../../apps/v-scan-guard/README.md)。

- **官方有没有现成机制**：
  - `tools.exec` 只有 `security`（deny / allowlist / full）和 `ask`，没有按命令内容拒绝的配置；V 上 `tools.exec` 和 `loopDetection` 都没配。
  - `loopDetection` 管的是重复调用，不看命令内容。
  - 插件钩子的 `matcher` 是官方能力（`src/plugins/tool-hook-matcher.ts`），只能用规范名，所以写 `exec` 而不是 `exec_command`。
  - 用插件钩子是现有机制里唯一能按命令内容拦截的做法。
- **覆盖**：
  - OpenClaw `exec`（Worker、PI、Codex 动态工具 `gateway_exec`/`exec`）；
  - Codex 原生 `exec_command`：Native hook relay 会把它改名成 `exec`，并把 `cmd` 复制到 `command`；
  - `process` 的 write / paste / send-keys。
- **缺口**：Codex 原生 `write_stdin` 进不了 PreToolUse（2026-10-31 实测）。先起一个交互式 `bash` 再往里输入命令可以绕过。当天没有任何一次这样走。

### 证据

1. **单元测试**（`apps/v-scan-guard/plugin/tests/`，15 项）：
   - 用 9/17、9/23、10/06、11/09 的真实命令做「必须拦」清单，共 40 条；
   - 用同一批会话里缩小范围后的命令和无关命令做「必须放行」清单，共 27 条。
2. **V 上只读重放**（`lab/scan-guard-replay.mjs`，读取 2026/11/09 目录下的 605 个 rollout，`ionice -c3`）：
   - 17,214 次 shell 调用中，会被拦 225 次（1.3%），来自 145 个会话；
   - 分类：`find` 180 次（instances 105、`/home/openclaw` 43、`/` 15、nightshift 14 等），`grep -r` 36 次，`rg` 8 次，`**` 1 次；
   - 其余 16,989 次照常执行。
3. **VLab candidate**（`lab/candidate/scan-guard-{on,off}.plan.json`）：
   - 真 Gateway 加载插件，三条路径各跑一次真实模型回合；
   - 每轮都包含两条正常命令（`ls`、在工作区里 `grep -rn`）和两条当天的事故命令；
   - 对照组不加载插件，确认拦截确实来自本插件；
   - 结果见 [docs/evidence/v-scan-guard-candidate-20261109.md](../evidence/v-scan-guard-candidate-20261109.md)。

## 直接把信息给 agent

- **拦截提示本身**：给出定时任务的查法（`openclaw automations list --all --json | jq -r '(.jobs // .)[]|[.id,.name]|@tsv' | grep -i <词>`，再 `automations get <id>`）、`nightshiftctl` 和 `NIGHTSHIFT_URL=http://127.0.0.1:24879`、`fetch failed` 时加 `NO_PROXY=127.0.0.1,localhost`、request-hash 自己算、卡自己的实例目录、sessions 工具、skill 所在的两个目录。
- **v-nightshift PR**（`claude/nightshiftctl-loopback-no-proxy`）：
  - 本机 NIGHTSHIFT_URL 时，nightshiftctl 自己绕过 env 代理（先写了失败测试，复现了同样的 `fetch failed`）；
  - 派卡提示词写明：hash 由 agent 用自己写下的请求 JSON 计算，不需要和别的卡一致，不要去翻别的实例、日志或源码找惯例。

## 没做、建议另行处理

1. **后台进程不回收**：三次事故里 agent 都已经放弃了，进程还在跑。Codex `exec_command` 超过 `yield_time_ms` 后转入后台，OpenClaw `exec` 超过 `yieldMs` 后也一样。可以考虑：回合结束时回收本回合起的后台只读命令，或者给 agent 的 shell 加 cgroup IO 上限（`io.max`）。后者也能堵住 `write_stdin` 的缺口。
2. **automations 不能按名字查**，长列表会被截断。工具加一个 `query`/`name` 参数，或者让 `list` 默认只返回 id 和名字。
3. **夜班卡线程不加载 AGENTS.md**：需要决定是否让受限回合也带上工作区的安全规则，或者把规则放进派卡提示词。
4. **别的信息缺口**：重放里还有大量跨实例的 `find instances -path '*/handoffs/produce.json'`（找别的卡的产出当样例），以及 `find / -name SKILL.md -path '*scene-cli*'`（找不到 skill）。前者可以在派卡提示词里给出本阶段 handoff 的示例或 schema。
5. **上线**：发布管线需要补 runtime-components 条目和 configure 脚本，然后走 `v-self-restart --while-stopped`。建议直接用 `block` 模式，因为重放显示被拦的全部是整棵树遍历。
