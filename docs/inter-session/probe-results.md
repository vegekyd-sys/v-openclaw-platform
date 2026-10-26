# WP0 探针结果：A1–A4、A6、A16

2026-10-20 · 分支 `isc/wp0` · 对应设计 `docs/inter-session/design.md` §12.1

## 结论速览

| ID | 结论 | 对设计的影响 |
|---|---|---|
| A1 | **成立**（飞书入站；worker、vds、vcc 三条都执行到 G:3584）。`replyOptions.vInterSession` 原样到达 `opts`（对象，`onBusy` 仍是函数），预设 `runId` 也在 `opts.runId`；`ctx.VInterSession`（经 ctxPayload）同样到达；`opts.onDeliberateSilentTerminalReply` 在守卫位置可用 | 守卫按设计读 `opts?.vInterSession ?? ctx?.VInterSession` |
| A2 | **成立**（worker、vds、vcc）。`onAgentRunStart` 报回的 runId 等于预设的 `v-a2a-req-<sendId>-0` | 账本直接用预设 runId；「以实际 runId 再写一份」的退路保留但预计用不到 |
| A3 | **成立**（worker、vds；前提是 §3.2 的 openclaw-tools 接线）。sessions_send 拿到 `runId` = 预设值、`requesterSenderId` = 发消息的真人、`senderIsOwner: true`、`agentAccountId: "default"`、`agentTo: "user:<open_id>"`、`agentThreadId: null`。vcc 没跑到工具（VLab 的 claude 登录已失效，见下） | 不需要退到 activeTurnBySession |
| A4 | 插件缺席时 sessions_send 的 `gatewayCall` 得到 **`missing scope: operator.admin`**，不是 `unknown method: vrelay.send`；带不带 `scopes:["operator.write"]` 都一样；worker（网关客户端）和 vds（Gateway 进程内的工具）文本相同，正则命中。插件方法（operator.write）带显式 scopes 两边都能调通；**worker 侧不带 scopes 会被拒**（`missing scope: operator.write`） | 正则不用改；核心调用必须显式传 scopes（设计已如此）。真正的进程内 dispatch 路径（MCP loopback）未执行，见 A4 详情 |
| A6 | **部分成立**。Gateway 里能看到 worker 回合的 lifecycle **end**（带 runId、sessionKey），**看不到 start**；Gateway 侧在 start 之前只有不带 sessionKey 的 `run_status`（preparing_workspace / preparing_context / starting_model）。codex、claude-cli 回合在 Gateway 里 start / end（或 error）都看得到 | `activeTurnBySession` 不能靠 Gateway 侧的 lifecycle start；用桥的 `onAgentRunStart`（它带 sessionKey）和 sessions_send 传来的 `requester.runId`；end/error 照常可用 |
| A16 | **V 没有变**。14 个 R1+R2 目标文件在 V 上与 subagent-index-20261020 捕获逐一相同；dev 上之后的提交不涉及 dist | 以该捕获为基线，stage 时照常校验 `before` |

两个设计没有预料到、会影响 WP5 / WP12 的事实（详见「探针顺带发现」）：
1. **F-a：在 Gateway 主配置声明的插件也会在每个 worker 进程里加载**（V 的 worker 配置由主配置自动推导）。§3.10「只在 Gateway 加载」「R1 不动 worker 第二份配置」的前提不成立。
2. **F-b：同一 Gateway 进程会对同一个插件模块调用 3 次 `register()`**，在 `register()` 里直接订阅 `onAgentEvent` 会收到 3 份事件。

## 方法

- 计划 `lab/candidate/inter-session-probe.plan.json`（默认 `ISC_HARNESSES=worker,vds`；vcc 要等 VLab 的 claude 登录恢复后再加），脚本 `lab/candidate/inter-session-probe.mjs`，用 `node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --owner isc-probe` 在 vlab91 的私有 candidate Gateway 里执行（用户 `lab-db91-parity`）。共享 VLab 当前发布 `subagent-index-20261020`（runtimeSha `0a0aa403…`，与 V 对齐）。三次运行都命中已有的 candidate 基线缓存（不是本次创建，未删除任何他人基线）；runner 结束时自动删除了每次的运行目录，只留 receipt。
- 起点字节：G、S、openclaw-tools、飞书 monitor 四个文件在打探针补丁前与 `tests/fixtures/inter-session-v-bytes.json` 记录的 V 字节逐一相同（脚本里断言）。
- 飞书：loopback webhook + 本机假飞书 REST（假 app id，自签证书，`NODE_EXTRA_CA_CERTS` 只给这个 Gateway）。入站消息按飞书真实格式签名、AES 加密后 POST 到 webhook，走真实的飞书 handler → durable ingress → 渠道回合 → get-reply → harness；回复卡也照常创建并流式更新（打到假 cardkit）。**没有第二条长连接，没有任何消息到达真实聊天。**
- worker 池开启（1–2 个 worker）。模型：worker = `deepseek/deepseek-flash`（vlab-worker），vds = `deepseek/vds-deepseek-flash`（codex，共享 managed npm 里的 Codex 插件，已带 V 的 /vds 补丁），vcc = `anthropic/claude-opus-5`（claude-cli，VLab 自带 `/usr/bin/claude` 2.1.273 与共享登录）。每个 harness 用一个独立的私聊会话，消息前先 `sessions.patch` 指定模型。
- 只在本次 candidate 的 runtime 副本上打的临时探针补丁（不进发版）：
  - G：在 `const queueAdmissionState = …;`（G:3584）之后记录 `opts.vInterSession`、`opts.runId`、`ctx.VInterSession`、`opts.onDeliberateSilentTerminalReply`、`isActive` 等。
  - 飞书 M：正文带 `ISCPROBE-PRESET:<sendId>` 的消息，在单 agent 路径的 `resolveTurn` 结果上加 `replyOptions.runId = v-a2a-req-<sendId>-0`、`replyOptions.vInterSession`（`exclusive:false`，不改变行为）、包装后的 `onAgentRunStart`，并把同一对象写进 `ctxPayload.VInterSession`。
  - openclaw-tools：按 §3.2 给 `createSessionsSendTool` 加 `runId/requesterSenderId/senderIsOwner/agentAccountId/agentTo/agentThreadId`。
  - S：消息含 `ISCPROBE` 时记录 `opts` 与 `hasInProcessGatewayToolContext()`，用 sessions_send 自己的 `gatewayCall` 依次调用 `vrelay.send`（带 / 不带 `scopes:["operator.write"]`）和探针插件方法 `iscprobe.echo`（带 / 不带），然后返回 error 结果（不真正发送）。
  - 探针插件 `isc-probe`（只写进 Gateway 主配置）：`registerGatewayMethod("iscprobe.echo", …, {scope:"operator.write"})`；`import { onAgentEvent, resolveActiveEmbeddedRunSessionId } from "openclaw/plugin-sdk/agent-harness-runtime"`（与 Codex 插件相同的静态导入）记录 lifecycle 事件和每个 runId 每种流的第一条事件。

| 运行 | 时间（CST） | harness | 结果 |
|---|---|---|---|
| `candidate-c03c6b70-131d-452f-bc56-d1cd83e51879` | 17:09 | worker | 通过；Gateway 41 s 就绪（启动收敛后自动重启一次），回合 10 s |
| `candidate-c6cbf382-c2a2-4df0-90e5-a674b8926618` | 17:12 | worker、vds、vcc | worker、vds 通过；vcc 回合以 `Failed to authenticate: OAuth session expired and could not be refreshed` 失败（工具没跑到） |
| `candidate-6a39ee54-1458-4f47-80db-d2312c2eac96` | 17:15 | worker、vds | 通过；补记 `hasInProcessGatewayToolContext()`。Gateway 15 s 就绪，回合 8.5 s / 8.0 s |

receipt 在 vlab91 `candidate-tests/receipts/` 和本 worktree 的 `tmp/candidate/`（git 忽略）。

## A1 / A2：飞书入站到 get-reply

三个 harness 在 G:3584 看到的完全一致（以 6a39ee54 的 worker 为例）：

```
optsRunId: "v-a2a-req-s_mvggwpq92ac4dcb9fd-0"
optsVInterSession: "object", vInterSessionId: <sendId>, vInterSessionOnBusy: "function"
ctxVInterSession: "object", ctxVInterSessionId: <sendId>
optsOnAgentRunStart: "function", optsOnDeliberateSilentTerminalReply: "function"
isActive: false, queueAdmissionState: "empty", recoveryOwnerActive: false
```

飞书包装的 `onAgentRunStart` 收到的 runId：

| harness | 预设 | 报回 | 一致 |
|---|---|---|---|
| worker（三次） | `v-a2a-req-<sendId>-0` | 同左 | 是 |
| vds（两次） | `v-a2a-req-<sendId>-0` | 同左 | 是 |
| vcc（一次） | `v-a2a-req-s_mvggtfc94bd2b85945-0` | 同左（随后因登录失效报错） | 是 |

带预设 runId 和 vInterSession 的回合照常创建、更新并收尾了流式卡（假 cardkit 收到 create / elements / settings 请求），说明这两个字段不影响原有卡片流程。

## A3：sessions_send 拿到的 opts（§3.2 接线后）

| 字段 | worker | vds |
|---|---|---|
| 执行进程 | worker 子进程（`production-worker/worker.mjs`，IPC 子进程） | Gateway 进程（`dist/index.js gateway`） |
| `runId` | 预设值（= `onAgentRunStart` 报回的） | 同左 |
| `requesterSenderId` | `ou_iscprobe0worker`（发消息的人） | `ou_iscprobe0vds` |
| `senderIsOwner` | `true`（在 `ownerAllowFrom` 里） | `true` |
| `agentChannel` / `agentAccountId` / `agentTo` / `agentThreadId` | `feishu` / `default` / `user:ou_iscprobe0worker` / `null` | `feishu` / `default` / `user:ou_iscprobe0vds` / `null` |
| `agentSessionKey` | `agent:makaron:feishu:direct:ou_iscprobe0worker` | `…:ou_iscprobe0vds` |
| `callGateway` 覆盖 | 无（默认 `callAgentToolGatewayRequest`） | 无 |
| `hasInProcessGatewayToolContext()` | `false` | `false` |

vcc：A3 未取得（工具没跑到，原因见「vcc」）。

## A4：插件缺席时 gatewayCall 的错误文本

| 调用 | worker（网关客户端） | vds（Gateway 进程内的工具） |
|---|---|---|
| `vrelay.send`，`scopes:["operator.write"]` | `missing scope: operator.admin` | `missing scope: operator.admin` |
| `vrelay.send`，不传 scopes | `missing scope: operator.admin` | `missing scope: operator.admin` |
| `iscprobe.echo`（插件，operator.write），带 scopes | 成功 | 成功 |
| `iscprobe.echo`，不传 scopes | `missing scope: operator.write` | 成功 |

- 错误对象：`GatewayClientRequestError`，`code: "FORBIDDEN"`，`details: {code: "MISSING_SCOPE", missingScope: "operator.admin", requiredScopes: ["operator.admin"]}`；`formatErrorMessage(err)` 与 `err.message` 相同。用时 129–168 ms（首次）/ 36–42 ms。
- 原因：未分类方法按最小权限要求 admin（9.1 `method-scopes.ts:215-228` 默认拒绝），而鉴权在方法查找之前（`server-methods.ts:689` `authorizeGatewayRequestPreDispatch`，:705 才报 `unknown method`）。所以 write 客户端永远看不到 `unknown method: vrelay.send`。
- 插件看到的调用方（两边相同）：`scopes: ["operator.write"]`，`mode: "backend"`，`clientId: "gateway-client"`，`internal: true`。
- vds 的工具虽然在 Gateway 进程里执行，但 `hasInProcessGatewayToolContext()` 为 false，`callAgentToolGatewayRequest` 走的是 `callGateway` 的回环客户端，不是 `dispatchGatewayMethodInProcess`。真正的进程内 dispatch（MCP loopback，即 /vcc 的 OpenClaw 工具）**没有执行到**。按源码，进程内 dispatch 同样经过 `handleGatewayRequest` 的前置鉴权并抛出 `GatewayClientRequestError`（9.1 `server-in-process-dispatch.ts:27-44、164`），预计文本相同；即使那条路先报 `unknown method: vrelay.send`，现有正则也覆盖。
- 「不传 scopes」在 worker 侧会被拒、在 Gateway 进程里能过：两者都走 `callGateway` 的最小权限解析，只有 Gateway 进程认识插件方法。核心补丁必须一直显式传 `scopes`。

## A6：Gateway 插件的 onAgentEvent

| 回合 | Gateway 进程看到的 lifecycle | 其他 |
|---|---|---|
| worker | 只有 **end**（带 runId、sessionKey、sessionId、agentId）。end 之前只有 `run_status`（`preparing_workspace`、`preparing_context`、`starting_model`）、`tool`、`assistant`，这些**都不带 sessionKey** | start 和 `finishing` 只在 worker 进程里出现（插件被加载进了 worker，见 F-a） |
| vds（codex） | start、finishing、end，均带 sessionKey | 另有 `codex_app_server.*` 流 |
| vcc（claude-cli） | start、`fallback_step`、error（error 文本是登录失效） | — |

- `resolveActiveEmbeddedRunSessionId(sessionKey)` 在 worker 回合的 end 事件当时仍返回该会话的 sessionId（登记表在 end 这一刻还没清）。§4.3 的「lifecycle end 后防抖 1.5 s 再 pump」是必要的。
- 没有测到 worker 回合以 error 结束的情形；按 end 的转发方式推测 error 同样可见，但未验证。

## vcc

17:12 的运行里 vcc 回合在 Gateway 里正常开始（A1、A2 都已取得），claude-cli 随即报 `Failed to authenticate: OAuth session expired and could not be refreshed`，工具没有执行，所以 vcc 的 A3/A4 没有结果。只读核对：共享 VLab 用户的 `.claude/.credentials.json` 最后修改于 10/17 03:11，里面没有可用的刷新令牌（`expiresAt` 为 0），是**已有状态**，本次运行没有改动它。恢复需要人工重新登录，探针不做。

## 探针顺带发现

**F-a 插件会进 worker。** 探针插件只写进 Gateway 主配置，candidate 里的 worker 配置文件也是从共享 VLab 复制、不含它，但每个 worker 进程都加载并注册了它（三次运行各 1 次）。原因：V 的 worker 插件（捕获 `…20261020.worker/dist/worker-config-derive.mjs`；`index.mjs:596-608`）启动时和主配置变化时，把 worker 配置**按主配置逐字推导**（只覆盖 runtime id 映射和 session maintenance），主配置变化还会触发 worker 换代（`onWorkerConfigChanged → rollGeneration`）。记忆「worker 读第二份手工配置」已过时。对设计的影响：
- §3.10「插件只在 Gateway 加载」做不到。插件 2.0 的 `index.js` 必须自己判断是否在 worker 进程，worker 里不启动引擎、不注册服务、不订阅事件；`LOCK` 只是第二道保险。判据用 V 的 worker 插件自己的做法：`process.env.VLAB_WORKER_CHILD === "1"`（worker 捕获 `exec-env.mjs:28` 给子进程设置，`index.mjs:351、388` 据此跳过 Gateway 侧服务），已冻结为 `contracts.js` 的 `WORKER_CHILD_ENV` / `isWorkerChildProcess()`；不要靠 argv 或 IPC 父进程猜。
- 同理，§3.10 按 `config.role` 区分 `gateway` / `worker-guard` 也不成立：worker 拿到的是逐字推导的同一份 `config`（role 永远等于主配置里的值）。worker 轮询闸要改成插件配置里的一个布尔开关（例如 `workerGuard`），由插件在 worker 子进程里读它决定是否注册 guard。
- §8.7 第 4 条的 worker 轮询闸不需要「声明到 worker 第二份配置」：插件本来就在 worker 里，开不开闸是插件内的开关（仍按 `requester_tail_ms` 判据决定）。回滚说明里「先改 worker 配置再删目录」相应改为「先在主配置停用插件（会触发 worker 换代），再删目录」。
- WP12 写主配置会触发一次 worker 换代；仍按 `v-self-restart --while-stopped` 执行。

**F-b `register()` 被调用多次。** 同一 Gateway pid 里对同一个模块实例调用了 3 次 `register()`（模块级计数 1→2→3，说明模块没有重新求值），每次都订阅了 `onAgentEvent`，于是每个事件收到 3 份；worker 进程里是 1 次。插件 2.0 的订阅、计时器、引擎启动要放进 `registerService` 的 start/stop，或用模块级 / `globalThis` 单例保护；`registerGatewayMethod` 重复注册没有报错。

**F-c 插件不经信任闸。** 非官方安装（`origin` 为 config 路径）的插件可以 `registerGatewayMethod` 和用 `onAgentEvent`；9.1 的「only available for trusted plugins」闸只管 keyed/blob store、渠道 ingress 队列和 `dispatchHookAgentTurn`（`registry-runtime.ts:184`）。插件 2.0 的账本是普通文件，不受影响。

**F-d vds 不走进程内 dispatch。** 设计 §9.1 表里 /vcodex、/vds 的「`vrelay.*` 调用方式」写的是「进程内 dispatch」；实测 vds 的 sessions_send 虽在 Gateway 进程里执行，`hasInProcessGatewayToolContext()` 为 false，走的是 `callGateway` 的回环客户端（插件看到的调用方是 `gateway-client`、`backend`、`internal:true`），和 worker 一样。结论不变（显式 `scopes:["operator.write"]` 两条路都通，缺席文本相同），但 §9.1 那一格应改为「回环 Gateway 客户端」；真正走进程内 dispatch 的只可能是 /vcc 的 MCP loopback，WP0 没跑到。

## A16：V 线上字节

只读核对，2026-10-20 16:50 CST，`ssh v`（`/home/openclaw` 下的文件用 `sudo -n sha256sum`）：

- 14 个目标文件（R1：sessions-spawn-tool、openclaw-tools、get-reply、agent-runner.runtime、task-registry-activity、飞书 monitor.account；R2：telegram-ingress-drain-factory、bot-message、core v-experience.js、钉钉 connection / message-handler / v-experience.mjs、企微 src/monitor.js / src/v-experience.mjs）在 V 上的 sha256 全部等于 `release/captured/v2026.9.1-db91.6-subagent-index-20261020*` 的 manifest，逐项记录在 `tests/fixtures/inter-session-v-bytes.json`（`tests/inter-session-v-bytes.test.mjs` 校验它与捕获一致）。
- 评审复核：2026-10-20 17:25 CST 用 fixture 里的 hostPath 和 sha256 在 V 上只读跑 `sudo -n sha256sum -c`，14 个文件仍全部 OK。
- 运行中的 Gateway：`ExecStart` 指向 `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js`，2026-10-20 02:37:39 CST 启动（subagent-index 发版）。钉钉 npm generation 目录仍是捕获时那一个（`…g-7ae9583359ddbec0`）。
- `origin/dev` 上捕获之后的提交：#439/#440/#443 只改 `scripts/v-memory-vector-warm.py`、systemd 单元和测试，不涉及 dist；dev 上没有比 subagent-index-20261020 更新的 capture。
- 没有跑 `verify-release-reproducible.mjs --host v` 的全目录扫描（会对 V 上约 8600 个文件做 sha256）；只读核对目标文件和 ExecStart 已足以回答 A16。
