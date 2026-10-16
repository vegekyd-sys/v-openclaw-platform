# GPT Live 已接纳任务独立于媒体关闭

## 最小平台改动

独立 Voice 可以保存 H5/SeedDuplex 任务，但不能解除原生 GPT Live 的 Talk 主机把通话 AbortSignal 与 consult AbortSignal 绑定的行为。本补丁仅改变 `createTalkClientGatewayControlOwner` 的 `v-voice-gpt-live` 分支：收到真实 `onRunStarted` 后，普通通话 teardown 从该任务的执行 signal 脱离；原始 consult signal 的明确取消始终有效。主机同时转发真实 onRunStarted 的 runId，包括 resumed run，供独立 Voice 按 logical delegation 绑定结果，不能把 delegation item ID 当成 runId。

未接纳任务、其他 Provider 和真正的任务取消保持原行为。媒体不能再次接受输入，旧电话不能再展示结果。接续只保留同一 continuation identity，取消时仍由既有 Agent/Worker 管理原任务。这里不修改 egress proxy、exec 准入、工具白名单、飞书账号权限或其他 Agent。

既有原生 Provider 在 cancelBrowserSession 时先 `delegations.detach()` 再 dispose，所以不会通过原生 consult controller 误取消已接纳工作。逻辑通话 close 保留 live run 的已授权 confirmation grant；后续 resumed run 的登记允许 recordClosed，已有 mutation digest owner 负责结果通知。补丁无需重新实现这些功能。

## 固化与应用

`lab/patch-voice-task-lifetime.mjs` 对四处唯一锚点逐一校验，幂等；锚点变化直接失败。输入必须是发布基线已冻结的 `talk-DkFuKRod.js`，输出到新的发布产物目录，附带 `voice-task-lifetime.js`；不要原地热改共享/生产 runtime。

```sh
node lab/patch-voice-task-lifetime.mjs BASE/talk-DkFuKRod.js ARTIFACT/talk-DkFuKRod.js
node --test lab/voice-task-lifetime.test.mjs
```

独立 Candidate bootstrap 支持显式 `VOICE_INDEPENDENT_TASK_LIFETIME=1`，输出补丁前后 SHA256 收据；默认关闭，不影响其他 Candidate。正式 bundle 的 release plan 必须加入上述两份文件并保留原基线回滚产物。

## 本轮证据与剩余验收

9/9 行为测试在本地及 VLab Node 22 通过，包括实际 patched Talk 主机函数的 media close、continuation.isCurrent、explicit cancel 和其他 Provider。10月14日 captured runtime 的锚点匹配，产物语法检查通过。

本轮没有重启共享或生产 Gateway，没有把补丁加载到正在服务的 Gateway，也没有跑真实 GPT Live WebRTC 音频。平台 PR 合入后仍须拿共享 VLab lease，对该 Provider 真实通话的后台任务接纳→挂断→结果投递做集成验收，再按授权部署同一产物。需要加载新的 Talk 模块时使用既有 v-self-restart 流程，先核对其他业务任务；不能把本轮函数测试当成生产验收。
