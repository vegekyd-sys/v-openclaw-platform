# GPT-6 Astra — 双 Runtime 独立 VLab 验收通过

2026-09-05 14:28 Asia/Shanghai：**实际模型及工具执行通过，尚未生产部署或用户侧飞书验收。**

生产写入、重启由统筹线程 `01a06fbe-7654-7331-8d6e-73a8cd2dcd7e` 统一执行。本任务没有修改生产 V，也没有为这轮验收重启共享24993。

## 不可变候选

- 分支：`codex/gpt6-astra-support`。
- 代码提交：`a8acc89ad1da177772340ca4df62f324f95f8ae4`；后续报告提交只有文档。
- 工作树：`/Users/tianyicai/v-openclaw-platform-astra`。
- 实例：`/srv/vlab-production-mirror/labs/instances/astra`，26100，UID `lab-astra`。
- 核心：与生产逐文件hash校验过的OpenClaw2026.9.1；Worker生产基线0.2.9-rc.2，不包含并行任务的0.2.10-rc.1候选。
- Codex插件：官方 `@openclaw/codex@2026.9.1`，通过原生plugins install注册。
- Codex CLI：官方Linux x64 **0.153.4**，并排安装，不覆盖全局PATH或旧二进制。
- 二进制SHA256：`56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da`。
- 实例内二进制：`runtime/codex-0.153.4/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`。

## 实际证据

| 路径 | 上海时间 | Session | 工具及结果 |
| --- | --- | --- | --- |
| Codex | 14:26:57–14:27:18 | `agent:v-codex:explicit:astra-probe-v-codex-1788589604635` | bash执行printf，toolResult=`ASTRA_TOOL_OK`，最终=`ASTRA_REPLY_OK` |
| OpenClaw/Worker | 14:27:37–14:27:56 | `agent:lab:explicit:astra-probe-lab-1788589646862` | exec执行printf，toolResult=`ASTRA_TOOL_OK`，最终=`ASTRA_REPLY_OK` |

两条均为实际 `openai/gpt-6-astra`，对应runtime为codex和vlab-worker，agent.wait=ok，无fallback。通过原生sessions.patch/chat.send/agent.wait/chat.history核对，不能以目录available代替执行成功。

Probe每次使用唯一Session/label，并拒绝共享generation。wrapper必须显式给`VLAB_INSTANCE_OWNER`，通过labctl进入私有实例。

7项单测通过：窄补丁、漂移保护、幂等、模型policy保留默认及并发修改保护、Codex command保留其他设置及原生解析恢复。

最终状态：Gateway active，NRestarts=0，MemoryCurrent约1.53GB、Peak约1.82GB，低于3GiB限制。这不是并发或长上下文性能基准。

## 最小生产变更

**不能复制整个Lab配置或认证库。**

1. `patch-openclaw91-astra.mjs apply CORE WORKER CODE_BACKUP`：
   - model-route-contract仅加Astra双runtime路由与low/medium/high/xhigh/max。
   - openai-chatgpt-provider仅加Astra订阅Responses模型元数据，无temperature。
   - Worker manifest保留现有activation，补onAgentHarnesses=vlab-worker。
2. `astra-model-policy.mjs apply MAIN OVERLAY POLICY_BACKUP`：
   - 默认模型映射外层vlab-worker、内层openclaw；v-codex的Astra映射codex。
   - 不改primary/default模型。已有Astra条目会拒绝覆盖，须先逐项核对。
3. 安装或复用完全相同的Codex0.153.4独立二进制，再执行：
   `astra-codex-cli-policy.mjs apply MAIN OVERLAY BINARY CLI_BACKUP`。
   只改两份配置的`plugins.entries.codex.config.appServer.command`；校验二进制SHA及真实version，保留旧CLI。
4. 保留生产现有正常的`@openclaw/codex@2026.9.1`原生注册和生产认证，不重装正常插件、不改auth order。
5. 统筹负责人在获准窗口重启一次Gateway，检查通道/Worker恢复；用生产既有账号各做一次Astra短工具验收，再检查真实飞书流式及最终回复。

### 权限和账号边界

- Codex不能仅通过plugins.load.paths加载复制包：origin=config不能取得保留的原生codex harness所有权。新实例必须走官方插件注册，不能删除权限检查。
- Lab验收只在同一服务器取已有Lab v-codex未过期access token，写入实例私有库；**不复制refresh token、不刷新共享库、不接触生产认证库**。短期凭证不进发布包。
- 生产账号权限还需现场确认，Lab通过不能证明不同账号也具备Astra额度或权限。
- 私有测试会触发9.1 sticky model selection，改变测试agent默认；生产只应用增量脚本，不同步私有实例整份配置。

## 回滚

所有apply使用独立全新备份目录，权限0700；生产事先记下主/overlay路径及旧CLI command。

1. `astra-codex-cli-policy.mjs rollback MAIN OVERLAY BINARY CLI_BACKUP`：恢复旧command，原来未设置则移除override。
2. `astra-model-policy.mjs rollback MAIN OVERLAY POLICY_BACKUP`：仅撤回本次新增Astra映射。
3. `patch-openclaw91-astra.mjs rollback CORE WORKER CODE_BACKUP`：恢复本次三个代码/manifest文件。
4. 由统筹负责人重启Gateway，验既有模型/Feishu/Worker。

回滚有并发修改检查，不匹配则拒绝覆盖。无需降级OpenClaw或删除Session/Memory。Lab备份不能用于生产回滚。

## 已解决的旧问题

此前shared Lab bundled CLI0.152.1被服务端拒绝，提示升级Codex。现在0.153.4已经真实调用通过；不再是只安装未切换。独立实例也消除了与另一Worker任务争用24993的情况。

官方依据：[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)。工具调用用Responses。候选保留保守272k运行上下文预算（模型规格1.05M、输出128k）；本轮不代表长上下文质量验收。
