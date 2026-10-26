# 绑定飞书会话的后台任务呈现：本地实现与验收

状态：**本地实现完成；本地验收通过；Worker/VDS 私有 Gateway 候选尚未执行**。功能默认关闭。没有合入 dev、写入共享 VLab、部署生产或发送真实飞书消息。

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

- 关联测试：77/77 通过，零失败、零跳过。
- 平台全量离线测试：见下方最终回执摘要，326 个登记测试文件，零跳过。
- catalog audit 通过；新增适配登记为 `excluded-candidate`，不标记为可发布。
- 生成产物可重建、语法检查通过，输入锚点漂移/重复补丁被拒绝。

覆盖显式绑定及 actor/账号/会话隔离；同一任务单次执行；原生 ownership 去重；两条 Voice 回传与取消；yield/resume；公开过程与媒体 payload；NO_REPLY；重复/冲突终态；reset/rebind/账号撤销后的迟到回调；私有异常信息不外发；403/429/timeout/5xx 的呈现退避重试；完成 journal 重启不重发；捕获结果到调用方返回之间崩溃的真实结果恢复；大批 partial 的合并。

测试不仅检查适配器假对象，还从本次 captured bundle 提取并运行**实际补丁后的 `FeishuStreamingSession` 类**，验证 CardKit start/update/close、checkpoint 时序、固定消息 uuid，以及恢复已有 card/message 时不再创建可见消息。其 API transport/utility 边界是本地注入，不能当作完整 Gateway 或真实飞书验收。

本机默认 Node v24.1.0 曾在既有 `scripts/node-async-context-frame.test.mjs` 的子进程参数测试失败（该 Node 不接受 `--experimental-async-context-frame`）；未修改该无关测试，改用服务实际版本 Node 22 重跑全量通过。

## 尚未执行的候选与限制

```
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo /Users/tianyicai/v-worktrees/feishu-bound-session-visibility --owner 01a15e2e-bebb-7960-b90e-b822eb9b29de --plan /Users/tianyicai/v-worktrees/feishu-bound-session-visibility/lab/feishu-task-presentation.worker.plan.json
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo /Users/tianyicai/v-worktrees/feishu-bound-session-visibility --owner 01a15e2e-bebb-7960-b90e-b822eb9b29de --plan /Users/tianyicai/v-worktrees/feishu-bound-session-visibility/lab/feishu-task-presentation.vds.plan.json
```

计划使用独立 Gateway、真实配置中的 Worker/VDS 模型、loopback Fake Feishu；检查普通原生入站无额外卡片、跨会话目标 runner、Direct Voice、原生 consult 的公开过程和结果、重启不重复。真实飞书域名由 Node preload 阻断，CLI 发送入口也封锁，账号使用合成身份，其他 channels/cron/heartbeat 关闭。语法和文件依赖检查已通过，**上述两条 plan 尚未运行**。

10/26 本机 Tailscale 网络扩展故障阻止连接 VLab：新版 `1.104.1` 为 `activated waiting to upgrade`，旧版 `1.98.10` 为 `terminating for uninstall`。已尝试恢复连接、重新激活、重启 App、通过官方 Debug 菜单重建 VPN 配置；系统仍报 NEVPN/NEConfiguration `permission denied`。系统授权窗口受工具安全限制，需用户完成本机授权后复查；不能宣称网络已修复。

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

收尾代码 commit：`e02d1bad`。该版本的 Worker/VDS 最终复测结果见后续最终回执节；本段保留前轮通过、失败与修正的边界。
