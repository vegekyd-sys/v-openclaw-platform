# 连续子任务完成通知：等待父会话索引就绪

2026-10-16 本地 58 项回归通过，最终候选真实旧群数据库副本测试 16/16 通过（含 15 项候选回归）。共享 VLab 渠道验收待执行；尚不能据此宣称真实通知丢失已修复，生产 V 未部署本补丁。

## 已复现的问题

旧飞书验收群内，父任务创建两个真实子任务并 yield。两个子任务均完成；第一条完成通知唤醒父任务，父任务再次 yield 等待第二条。第二条通知在会话队列中等待上一回合退出后进入 Worker，却在模型执行前遇到 `SessionTranscriptProjectionUnavailableError`，最终汇总未送达。该失败在积压补丁之前两次、之后一次出现；新会话双子任务和旧群单子任务通过。

“排队结束”不保证上一回合触发的异步索引重建已经完成。原有 readiness 等待只覆盖语音路径；只在通知入队前等待还存在检查后状态变化的窗口。

## 候选改动

在原生 `prepareEmbeddedAttemptTranscriptLifecycle` 已解析当前目标会话、且尚未创建本次 transcript 写上下文的位置，增加完成通知的 readiness 检查。仅处理可信调用数据中的 `inter_session`，来源为 `subagent_announce` 或 `agent_harness_task`；后者正是 Worker 的任务完成 SDK 使用的来源。

复用线上已有的 `waitForSessionTranscriptProjection`，检查真实数据库索引代次，最多等待 15 秒。等待前、期间、后检查取消与原 writer 归属，并验证目标会话身份。索引超时或数据库错误继续抛出，不重试整个回合，不重放模型或工具。原有语音保护保持原样。

此外，成功的原生 `sessions_yield` 已经过 pending-child claim，但原来的终结诊断只检查本回合新建子任务，导致收到第一条完成通知后再次 yield 时向群误发“没有 continuation source”。原生 `onYield` 只有 pending-child claim 成功后才会执行。候选从原生 attempt result 显式传递 `nativeYieldClaimed`，并要求它与 `yieldDetected` 同为 true；不依赖可能被 yield 中断打断的工具结束记录。不改变 yield 的 claim 或回合状态，不接纳仅有外部 yield 标记或工具元数据的情况。原生工具的 native claim、external callback、external owner 三个路径均有前后对比回归，无 claim 仍拒绝。

只修改一个 runtime 文件，新增 26 行。补丁生成器校验基线 SHA，拒绝覆盖其他版本：

- 基线：`5638a3b7071bbbfa20da7b7c2098facdbd3c15bedf723e922c2f68a3f550f5e9`。
- 生成器：[patch-subagent-completion-projection.mjs](../../lab/patch-subagent-completion-projection.mjs)。
- 产物：[builtin-openclaw-zQV8Wwjr.js](../../lab/release-files/subagent-completion-projection/builtin-openclaw-zQV8Wwjr.js)。

## 已完成与待完成验证

已执行：

```sh
node --test lab/subagent-completion-projection.test.mjs lab/gpt-live-projection-readiness.test.mjs lab/subagent-settle-backlog.test.mjs
```

58 项通过，包括通知在实际 attempt 内等待、两个来源、取消、writer 失效、会话身份不匹配、原生超时/数据库错误不重放、语音等待既有回归以及积压修复回归。通过执行提取出的实际 lifecycle 函数，确认 baseline 不等待，候选在创建写上下文之前等待。

真实 SQLite 脚本位于 [candidate 计划](../../lab/candidate/subagent-completion-projection.plan.json)。在共享原库只读事务内复制受影响会话的原始行和 schema 到私有库，验证 718 条 transcript 事件的 SHA256 一致；副本 14,086,144 字节。原生 SessionManager 在标记索引重建时复现原错误。候选连续三次等待原生重建后读回相同的 703 条历史消息，事件数保持 718，不调用模型或工具。

- receipt：`candidate-9308be0e-32e4-4626-b979-a1e3dee01a53`，12/12 通过；共享进程 PID 与 runtime/config hash 未变。
- 等待耗时：1,154 / 1,097 / 1,093 ms。
- 产物 SHA256：`6e78b509103fadb32d996246170be4c07bed53483d27595c875cbf88dfd38e2f`。
- 完整库备份首次尝试约 7.3 GB，叠加运行时副本耗尽共享磁盘，造成 21:59:49 一次 Workboard lifecycle recovery 磁盘满错误。停止本任务备份后 runner 清理自己的临时目录，恢复约 7.7 GB 可用空间；22:04 健康 RPC 通过，事件循环未退化。后续改为受影响会话副本，不清理其他任务数据。首次定向副本遗漏 schema triggers，被原生完整性检查拒绝；补齐原始 triggers 后通过。

2026-10-16 21:14–21:18 的连接检查中，Tailscale 显示 VLab 在线且 DERP ping 有响应，但原 IPv6 SSH、同一主机的 Tailscale IPv4 SSH和 24993 健康端点均超时；生产 V 的只读 SSH 同样超时。未使用公网 SSH，未修改 SSH/Tailscale 配置，未重启任何服务。candidate 在 SSH 上传阶段失败，没有候选测试成功 receipt。

恢复连接后，先核对共享 lease、实际 runtime SHA 和 V 对齐状态，执行私有副本测试，再按本次授权集成积压补丁与通知补丁，回到同一旧群连续验证双子任务汇总、重复投递防护与单子任务正常回复。真实验收通过后出 PR；生产上线另按授权执行。

## 共享初轮与最终候选

组合 `subagent-settle-completion-20261016b` 从完整 parity ALIGNED（18,812 文件）的基线部署。旧群真实两个子任务完成、父会话中途再次 yield 后，最终 `COMPLETION_R1_1016_OK A+B` 实际可见并被飞书读回；projection 错误未再出现。但仍有一条错误的 yield 诊断，未算完整通过；已回退基线，补充上面的成功 claim 证据判断。

最终候选 `candidate-f340d41a-3aaf-4792-a49a-bd9fb34bc278`：16/16，通过。最新旧群副本 14,331,904 字节，733 条事件、718 条历史消息，三次等待 1417 / 2389 / 1027 ms，历史与事件数不变，无模型或工具调用。最新 runtime SHA256 为 `e54511997f3d9f3bedc85d60aa8bcd1fbe794e71e01ef745eeb6974afc25e5ba`。共享渠道复验待执行。

组合 c 的真实旧群 R1 最终汇总成功，但基于 toolMetas 的误报修订没有覆盖实际中断路径，仍未通过完整验收并已回退。v3 改为显式原生 claim 凭据；测试执行实际 native result 对象组装，覆盖没有 tool-end 元数据、没有本回合 spawn 的情况。

v3 候选 `candidate-b74af677-0de0-4c9f-b0ce-fff07bf180ad` 16/16 通过；746 条事件、731 条历史消息，三次等待 1117 / 1131 / 1140 ms，历史与事件数不变，无模型或工具调用。产物 SHA256 `71c2310a73dbfa66d70fe560ff13132c620f0033439e604417842412758a67bc`。最终共享渠道复验待执行。

## 跨 Worker 返回链路修订

组合 d 的原生 attempt 已产生 claim 凭据，但 `completeEmbeddedRun` 的最终 meta 和 Worker `buildHarnessAttemptResult` 均丢失该字段，因此误报仍然出现。该轮另记录一次 `session-entry.patch` 并发版本冲突；没有确认最终汇总成功，未验收，22:36 已通过正式 rollback 恢复原基线。

候选 e 将凭据从 native attempt 传至 native final meta，再经 Worker IPC attempt 返回 Gateway。两端均要求 yielded 与原生凭据同时为 true。通知改动涉及三个 runtime 文件（builtin、embedded-agent、Worker harness-result），加上积压修复共六个。补充回归执行实际最终 metadata 投影和实际 Worker adapter，经历 JSON 序列化后再跑 Gateway 判定，覆盖无凭据与非 yield 拒绝；本地含 adapter 既有回归共 67 项通过。真实副本 candidate-852de947-ba6e-45e5-bf8d-23918112dc77：17/17 通过；757 事件、742 消息，三轮等待 1179/2263/1057 ms 后历史完全不变。渠道复验待执行。
