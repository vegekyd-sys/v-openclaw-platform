# 绑定飞书会话的后台任务呈现：本地实现与验收

状态：本地回归与 Worker/VDS 隔离候选已通过，后续增加了真实 V Voice × V - Lab 飞书联动验收，见文末。功能默认关闭；未合入 dev，未部署共享 VLab 或生产。

## 范围与用户体验

仅同步交给 session 后台模型的任务请求、公开进展及最终结果/媒体。两条 Voice 入口分别是 Direct Tools 的 `createBackendDelegation → chat.send`，以及原生 `consultRealtimeVoiceAgent → runEmbeddedAgent`。普通电话逐句对话、录音、完整 transcript/context、思考过程和原始工具参数不进入此呈现。

会话必须有显式 `delivery.kind=external` 飞书绑定，且 account、目标和 sessionId 都吻合。非飞书入口先由机器人发表“跨会话任务/语音交办”的简短来源记录，然后复用原生 `createFeishuReplyDispatcher` 的卡片、公开进展、模型/runtime 页脚和媒体投递。不会伪造一条飞书用户入站消息，也不重复启动模型。

普通飞书入站仍由原生 dispatcher 所有；其 runId 登记 ownership，后台适配不能再创建第二个 renderer。跨会话入口识别 `inter_session + sessions_send` provenance；明确隐藏 transcript 的内部 housekeeping、内部 session effects 不发布。

## 实现与运行边界

- `lab/feishu-task-presentation.mjs`：Gateway 所有的呈现身份、显式绑定/actor 校验、精确 runId/sequence、私有 journal、终态重放及发送退避重试。会话 reset/rebind 或账号撤销后拒绝迟到输出。发送失败只重试呈现，不重跑模型。
- `lab/feishu-task-presentation-runtime.mjs`：跨会话、原生 Voice 以及已有 embedded execution 的薄观察器；保持原执行返回值、异常和 continuation 回调。
- `lab/feishu-task-presentation-native.mjs`：调用原生回复器。等待原生 idle/finalization 回执后确认可见；重启复用已确认 CardKit/message 身份和已发送 payload cursor。
- `lab/realtime-direct-tools/backend.mjs`：执行前登记公开 question，完成后发送同一任务的正文；保持原 `chat.send`、`agent.wait`、取消和电话回传。登记期间被取消的任务不能随后启动。
- `lab/patch-feishu-task-presentation.mjs`：对 10/26 捕获字节做精确锚点补丁，保留 10/25 已有的 Voice 身份确认、公开进展和后台任务状态逻辑；锚点漂移或二次应用直接拒绝。

启用条件为 Gateway 环境 `V_FEISHU_TASK_PRESENTATION=1`；Worker child 不注册呈现管理器。默认关闭使此候选不会自行在现有服务发送消息。Direct Voice 源码属于单独的 Voice 产物，不随 Gateway 的文件映射部署。

`node lab/build-feishu-task-presentation.mjs` 生成九个 Gateway 文件及 before/after SHA256 清单、独立 Voice 源码 SHA256 清单，以及两个可执行候选 plan。候选探针和临时 native consult export 不属于发布文件；候选必须记录其单独 allowance。

消息创建采用固定 uuid，journal 记录已确认锚点/卡片和 payload cursor。这里证明的是本地协议与恢复行为，**尚不能据此声明飞书真实平台所有 ACK 丢失/媒体上传窗口都严格 exactly-once**。未完成任务重启后只提示执行状态需要核对，不擅自重新执行模型。

## 已完成的本地验收

使用从 Node 官方站下载并校验 SHA256 的 **Node v22.23.1**，与 VLab 运行时版本一致。

- 关联测试：83/83 通过，零失败、零跳过。
- 平台全量离线测试：见下方最终回执摘要，326 个登记测试文件，零跳过。
- catalog audit 通过；新增适配登记为 `excluded-candidate`，不标记为可发布。
- 生成产物可重建、语法检查通过，输入锚点漂移/重复补丁被拒绝。

覆盖显式绑定及 actor/账号/会话隔离；同一任务单次执行；原生 ownership 去重；两条 Voice 回传与取消；yield/resume；公开过程与媒体 payload；NO_REPLY；重复/冲突终态；reset/rebind/账号撤销后的迟到回调；私有异常信息不外发；403/429/timeout/5xx 的呈现退避重试；完成 journal 重启不重发；捕获结果到调用方返回之间崩溃的真实结果恢复；大批 partial 的合并。

测试不仅检查适配器假对象，还从本次 captured bundle 提取并运行**实际补丁后的 `FeishuStreamingSession` 类**，验证 CardKit start/update/close、checkpoint 时序、固定消息 uuid，以及恢复已有 card/message 时不再创建可见消息。其 API transport/utility 边界是本地注入，不能当作完整 Gateway 或真实飞书验收。

本机默认 Node v24.1.0 曾在既有 `scripts/node-async-context-frame.test.mjs` 的子进程参数测试失败（该 Node 不接受 `--experimental-async-context-frame`）；未修改该无关测试，改用服务实际版本 Node 22 重跑全量通过。

## 候选执行与验收边界

```
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo /Users/tianyicai/v-worktrees/feishu-bound-session-visibility --owner 01a15e2e-bebb-7960-b90e-b822eb9b29de --plan /Users/tianyicai/v-worktrees/feishu-bound-session-visibility/lab/feishu-task-presentation.worker.plan.json
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo /Users/tianyicai/v-worktrees/feishu-bound-session-visibility --owner 01a15e2e-bebb-7960-b90e-b822eb9b29de --plan /Users/tianyicai/v-worktrees/feishu-bound-session-visibility/lab/feishu-task-presentation.vds.plan.json
```

计划使用独立 Gateway、真实配置中的 Worker/VDS 模型、loopback Fake Feishu；检查普通原生入站无额外卡片、跨会话目标 runner、Direct Voice、原生 consult 的公开过程和结果、重启不重复。真实飞书域名由 Node preload 阻断，CLI 发送入口也封锁，账号使用合成身份，其他 channels/cron/heartbeat 关闭。语法和文件依赖检查已通过；上述 plan 已实际执行，前轮和最终回执见后续章节。

历史阻塞（连接现已恢复）：10/26 本机 Tailscale 网络扩展故障曾阻止连接 VLab：新版 `1.104.1` 为 `activated waiting to upgrade`，旧版 `1.98.10` 为 `terminating for uninstall`。已尝试恢复连接、重新激活、重启 App、通过官方 Debug 菜单重建 VPN 配置；系统仍报 NEVPN/NEConfiguration `permission denied`。系统授权窗口受工具安全限制，需用户完成本机授权后复查；不能宣称网络已修复。

候选暂不包含真实飞书、真实音频/WebRTC/手机 UI 验收，也没有完成与 Draft PR #482 的完整 v2 relay bridge 联合回归。#482 尚未合入且有历史冲突；本补丁以当前 dev 捕获为基线，不能拿它替换旧分支整个 monitor 后直接发布。即便私有候选通过，是否合入 dev 与共享/生产验证仍需用户决定。

## 最终离线回执摘要

Node v22.23.1；326 files；2559/2559 passed；fail=0，skip=0；耗时 55.836 秒。原始回执保留本机 `/tmp/bound-task-platform-node22-accepted-local-20261026.json`，未作为 runtime 数据入库。


## 10/26 连接恢复后的候选记录

Tailscale 已恢复 Running/online，VLab 私有 SSH 已实际连通。全部测试仍使用 loopback Fake Feishu，没有发送真实飞书消息。

- 第一、二轮停在候选探针注册：补齐 `activation.onStartup`、标准 JS 入口与 package manifest，并让准备失败也清理 fake transport。没有把启动失败记作模型验收。
- Worker `candidate-5e34ec55-ce93-49e5-b402-f12e0bf1607a`：原生入站、三个后台入口、公开过程与结果、完成 journal 重启去重通过。
- Worker `candidate-acb8b832-db28-451b-bd5a-937b683ee242`：增加真实模型 `sessions_send`，共五个后台任务、七张原生卡片（含两次原生入站基线），重启后不重发，sharedUnchanged=true。测试源码 commit `9cf81de9436d4b35c024b86c9adcc6109efce469`。
- VDS `candidate-48a8a193-cd3f-4bff-a68a-aa975892c2b7`：三个入口与真实模型 `sessions_send` 均通过，实际页脚为 `Runtime: codex`。其重启计数检查失败：count=14→16 的两个新消息发生在旧 Gateway 停机期间、第二次启动之前，是合法请求方唤醒回合，不能说是 journal 重发。新增全体已受理回合收敛检查后再复测。客户端控制 SSH 曾断开，原始结果从服务器持久化 receipt 补取，没有因此重复派发模型。

新增 core `sessions_send` 的精确 run ownership 查询：目标已由原生呈现承接时，旧 announce 不再重复投递；未取得明确 ownership 时保留旧路径。保留正常 requester 唤醒，不通过关闭后台模型回合来减少消息数。任务来源记录去掉内部 inter-session 路由协议头，`NO_REPLY/REPLY_SKIP/ANNOUNCE_SKIP` 以自然无文字终态收尾。

收尾代码 commit：`1fae6a49`。该版本的 Worker/VDS 最终复测结果见后续最终回执节；本段保留前轮通过、失败与修正的边界。


私聊候选核对中确认：`ou_` 是收件人，Native dispatcher 的 conversation chat 使用消息 ACK 中的 `oc_`。代码已持久化 `conversationChatId` 并交给原生回调，投递目标仍是原绑定用户。测试也按实际 DM chat 匹配卡片、接受 VDS 的原生 Bash 工具进展。一次 VDS 模型未给出指令要求的最终标记，原样保留为失败；最终验收改用实际工具输出佐证，而非只要求模型复述任意进展标记。


## 最终候选验收：通过

两份回执都来自干净 commit `1fae6a49bac245123ffab657dadd27f9b42eb5d3`（dirty=false），同一运行时基线 `sessions-search-20261026`。使用真实 DeepSeek 模型及原生 Worker/Codex harness，飞书仅替换为 loopback transport。各自的 7 项场景全部通过：普通原生入站无额外呈现、跨会话公开过程/结果、Direct Voice、原生 consult、真实模型 sessions_send 无旧 announce 双发、请求方唤醒完成后收敛、重启不重发。工具结果以原生历史的 toolResult 验证，卡片过程按实际工具状态匹配。

| Harness | Receipt | 后台任务 | 原生卡片（含两张入站基线） | 消息总数 | testMs | sharedUnchanged |
|---|---|---:|---:|---:|---:|---|
| worker | `candidate-c696bd45-6b98-4af7-ba7e-7920d17bb303` | 6 | 8 | 16 | 167490 | true |
| vds | `candidate-a9006eb4-659c-469f-8bd3-1252eee0569d` | 6 | 8 | 16 | 173441 | true |

这些耗时包含启动、测试及重启，不能直接解释为模型响应延迟。

- worker inputSha256：`4558593367394a744ea73de76e5fe51e7d7f68902ab5b89c559c69b6a36471c5`；runtimeSha：`e645d63018565c6c0f451eec2a57c24460ad831edd3d65bbb08c64a1c1045ec3`。
  原始回执：`tmp/candidate/candidate-c696bd45-6b98-4af7-ba7e-7920d17bb303.json`（本机 gitignored）；服务器持久化 receipt 同 ID。
- vds inputSha256：`f838434a52f071d41b7d39b9b8997c8bcf180e061f9c993aae03e8007efd0f29`；runtimeSha：`e645d63018565c6c0f451eec2a57c24460ad831edd3d65bbb08c64a1c1045ec3`。
  原始回执：`tmp/candidate/candidate-a9006eb4-659c-469f-8bd3-1252eee0569d.json`（本机 gitignored）；服务器持久化 receipt 同 ID。

最终本地回归：Node v22.23.1，关联 **83/83**；全量 **2565/2565**，326 files，零失败、零跳过；catalog audit 通过。发布文件仍默认关闭，适配保持 `excluded-candidate`。

**没有进行**真实飞书投递、真实音频/WebRTC/手机 UI 验收，也未完成与 #482 整体 v2 relay bridge 的联合回归。没有合 dev、部署共享 VLab 或生产。两份最终 receipt 均证明共享 PID/config/runtime 未变；不把隔离候选模拟平台视作生产验收。


## 10/26 真实 V Voice × 飞书联动

本节更新前述“未进行真实飞书/音频”的历史边界。真实模型与真实飞书投递均在任务私有候选中执行，使用 **V - Lab** 机器人；起初选错的 Codex 机器人已从自建测试群移除。测试只操作自建验收群、VLab 房间 1 和 Tianyi 与 V - Lab 的真实私聊。候选关闭 channel 接收，仅调用原生 Feishu outbound；没有启动第二条机器人入站连接。

实际 Voice 源码已同步当前 main 的产品任务 API：`voice.product.task.start/read/lookup/cancel`。公开 `publicQuestion` 与私有执行上下文分开传递，平台观察原来的 SDK consult，不再依赖旧版 `chat.send` 路径。Native GPT Live 仍走原生 consult。Voice PR 为 #151；平台 PR 为 #483，两者均保持 Draft。

### 实测发现并修正

1. 发送退避时，原先可能丢失所选模型/runtime 元数据；现在独立保存真实执行回执。
2. GPT Live 原生 question 已由上游封装成 `realtime_delegation`，还追加了 transcript delta 与内部执行提示。来源记录现在只取显式 input；封装不完整时使用安全的通用请求说明。旧测试来源记录已修正，最终飞书读取中不含该内部封装。
3. 工作目录附件被原生媒体读取策略拒绝。新呈现入口通过 SDK `getAgentScopedMediaLocalRoots(cfg, agentId)` 传入当前 Agent 的目录，未扩大到任意本地路径。
4. Voice 的显式进展订阅和自动结果同步会先查询精确 session/run 的原生卡片归属。明确 owned 时停止旧发送，同时保留电话结果；归属查询失败时保留失败证据，不补发重复消息。

### 已覆盖的真实路径

| 场景 | 实际结果 |
|---|---|
| 飞书普通入站基线 | V - Lab 原生接收与回复；无需新增后台呈现 |
| Grok Voice Direct Tools | 合成用户 PCM 经原始 H5 麦克风与真实模型进入 `delegate_to_v`，实际命令计算得到 5535，原生卡片交付 |
| GPT Live 原生入口 | 原始 H5 WebRTC → 真实 GPT Live → native consult → Worker 实际命令计算得到 9999，飞书来源只包含公开请求 |
| 普通插话 | 用户询问 2+2，电话回答 4；原后台任务继续 |
| 明确取消 | 真语音取消原任务，电话仍连接；原生卡片显示取消 |
| 挂断但继续后台 | 真语音挂断后原任务继续；最新代码的原生卡片在挂断后确认交付，旧发送通道记录 native-owned，没有 delivery-confirmed 双发 |
| 真 `sessions_send` | Worker 请求方调用原生工具，房间 1 实际选用 `vds-deepseek-flash / codex`，目标只显示该任务的一份原生结果卡片；请求方正常唤醒保持独立回合 |
| 同一请求重放 | 两次相同提交返回相同 taskId/runId；实际执行计数文件只有一行 |
| 实际附件 | 飞书文件下载成功，27 字节与执行生成内容完全一致，SHA256 `95b949865881839e98a3ec4293ccebbe980b6255e82cad9cbe9de98a1322d2b1` |
| 真实私聊 | 绑定 `ou_` 收件人，原生 ACK 记录真实 `oc_` 会话，来源记录及结果均进入正确私聊 |
| 呈现恢复 | 已捕获的真实结果曾在修复 sender 后交付，未重跑原模型；完成 journal 装入后续新候选，没有重发旧消息 |
| 隐私边界 | 飞书来源不含 private sentinel、transcript delta 或内部 native 执行策略；普通通话逐句不进入任务卡片 |

使用的是合成用户音频、真实模型/工具和真实平台回执；未伪造模型回复或 tool/RTC 事件。没有进行实体 iPhone、扬声器麦克风或听感验收，也不能据此声明真实飞书所有 ACK 丢失窗口的严格 exactly-once。

最新通过场景的私有候选为 `candidate-42da1efc-62d0-4eec-8b15-7a3412f00d52`，平台输入 commit `e3f8dacf466b5f1a3939bf08b55006476829762f`，Voice commit `26c7bf9b381ffd6eb39fb8389027508499c4ec01`；inputSha256 `b2c68049eb405f75e1629de004249fb5cccdaca285bdc7bac286d0da4c1710a5`。在该输入中，核心发布文件已包含公开请求和附件修复。源分支随后仅补充验收文档。

### 回归结果与仍有的边界

- Node 22.23.1 最新平台全量离线 **2573/2573**，327 个登记文件，零失败、零跳过；公开请求修复后的关联卡片测试 **44/44**。
- 当前 Voice 代码关联测试 **68/68**。同步 main 后的 Voice 全量为 **956/958**；`ios-web-release` 和 `ui-bundle` 两项已在未修改的 main 复现，均为既有提交产物与源码不同步。本任务没有改写这些无关 UI 产物，不将全量描述为全绿。
- 上游 dev 的新增测试登记仅同步进任务分支以消除 PR 冲突；没有将任务分支合入 dev。
- 真实 GPT Live 凭据只按用户明确批准用于本次私有候选，复制 access-only 字段，不复制 refresh token。收尾凭据删除和候选退出回执记录另补于下。

本机原始模型/投递记录保留于 gitignored `tmp/live-acceptance/`。其中包含私有执行上下文，不进入 Git、公共文档或共享记忆。报告中的结果以真实飞书读取、候选任务记录及执行计数核对；旧失败候选不计入通过。


可直接核对的真实飞书结果：[GPT Live / 9999](https://applink.feishu.cn/client/chat/open?openChatId=oc_fcf5d85e3f0507b26864c1025f80d1c2&position=38)、[Grok 挂断后的 5535](https://applink.feishu.cn/client/chat/open?openChatId=oc_fcf5d85e3f0507b26864c1025f80d1c2&position=36)、[VDS 目标结果](https://applink.feishu.cn/client/chat/open?openChatId=oc_fe63730f4bc817cd46ccd325ab990a74&position=22)、[私聊结果](https://applink.feishu.cn/client/chat/open?openChatId=oc_8f28eb6bcb3b847471693f066dac61c4&position=1444)、[实际附件](https://applink.feishu.cn/client/chat/open?openChatId=oc_fcf5d85e3f0507b26864c1025f80d1c2&position=30)。

补充电话端核验：浏览器真实显示完整的“真实输出是 9999”答复。补充测试脚本曾对 ASR 的中文数字格式作了过严断言；之后同一问题使用了已完成上下文，没有新建任务，因此“必须再有一个新后台任务”的自动断言也不适用。此补充通话仅作为完整电话结果展示的人工观察，不计作另一次新任务执行通过。原始新任务的执行、run、公开请求和飞书结果由此前成功候选记录佐证。没有用手填模型事件或伪造结果补齐断言。


### 收尾回执

私有候选正常结束，official receipt `ok=true`、`sharedUnchanged=true`；共享服务 PID 前后均为 `2353365`，配置与 runtime fingerprint 未变。私有 candidate run 目录（含 access-only auth SQLite）已移除；服务器临时 access token 文件、测试机器人私有配置均已删除，测试 Chrome/Pulse 与自有 Voice 测试进程均已退出。没有复制 refresh token，没有修改本机 Codex 登录或共享服务的 OpenAI auth store。

最终飞书读取再次确认发送者为 V - Lab，验收任务每个来源 anchor 与对应原生卡片各出现一次，不含内部 native envelope 或私有 sentinel。真实输入使用既有测试会话绑定元数据，未复制完整会话历史。原始退出回执及清理证明保留 `tmp/live-acceptance/receipt-and-cleanup.json`。

本轮完成的是隔离候选验收；仍未合入 dev、部署共享 VLab 或上线生产。共享集成和 #482 全体 v2 relay 的联合验收不由本轮私有候选结果替代。
