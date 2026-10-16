# 连续子任务完成通知：等待父会话索引就绪

当前是独立 worktree 候选，尚未合入 dev、部署共享 VLab 或上线 V。2026-10-16 本地 54 项回归通过；数据库副本和真实飞书验收因 VLab 的 Tailscale SSH 超时尚未执行，不能据此宣称通知丢失已修复。

## 已复现的问题

旧飞书验收群内，父任务创建两个真实子任务并 yield。两个子任务均完成；第一条完成通知唤醒父任务，父任务再次 yield 等待第二条。第二条通知在会话队列中等待上一回合退出后进入 Worker，却在模型执行前遇到 `SessionTranscriptProjectionUnavailableError`，最终汇总未送达。该失败在积压补丁之前两次、之后一次出现；新会话双子任务和旧群单子任务通过。

“排队结束”不保证上一回合触发的异步索引重建已经完成。原有 readiness 等待只覆盖语音路径；只在通知入队前等待还存在检查后状态变化的窗口。

## 候选改动

在原生 `prepareEmbeddedAttemptTranscriptLifecycle` 已解析当前目标会话、且尚未创建本次 transcript 写上下文的位置，增加完成通知的 readiness 检查。仅处理可信调用数据中的 `inter_session`，来源为 `subagent_announce` 或 `agent_harness_task`；后者正是 Worker 的任务完成 SDK 使用的来源。

复用线上已有的 `waitForSessionTranscriptProjection`，检查真实数据库索引代次，最多等待 15 秒。等待前、期间、后检查取消与原 writer 归属，并验证目标会话身份。索引超时或数据库错误继续抛出，不重试整个回合，不重放模型或工具。原有语音保护保持原样。

只修改一个 runtime 文件，新增 21 行。补丁生成器校验基线 SHA，拒绝覆盖其他版本：

- 基线：`5638a3b7071bbbfa20da7b7c2098facdbd3c15bedf723e922c2f68a3f550f5e9`。
- 生成器：[patch-subagent-completion-projection.mjs](../../lab/patch-subagent-completion-projection.mjs)。
- 产物：[builtin-openclaw-zQV8Wwjr.js](../../lab/release-files/subagent-completion-projection/builtin-openclaw-zQV8Wwjr.js)。

## 已完成与待完成验证

已执行：

```sh
node --test lab/subagent-completion-projection.test.mjs lab/gpt-live-projection-readiness.test.mjs lab/subagent-settle-backlog.test.mjs
```

54 项通过，包括通知在实际 attempt 内等待、两个来源、取消、writer 失效、会话身份不匹配、原生超时/数据库错误不重放、语音等待既有回归以及积压修复回归。通过执行提取出的实际 lifecycle 函数，确认 baseline 不等待，候选在创建写上下文之前等待。

已准备但尚未运行成功的真实 SQLite 脚本位于 [candidate 计划](../../lab/candidate/subagent-completion-projection.plan.json)。它通过官方 candidate 工具备份共享 VLab 的 makaron 数据库，在私有副本上使用原受影响会话，重现原生模型上下文读取在索引未就绪时报错，再验证候选等待三次重建后读回相同历史且 transcript 事件数不变。它不启动模型、渠道或 Gateway，不写共享数据库。

2026-10-16 21:14–21:18 的连接检查中，Tailscale 显示 VLab 在线且 DERP ping 有响应，但原 IPv6 SSH、同一主机的 Tailscale IPv4 SSH和 24993 健康端点均超时；生产 V 的只读 SSH 同样超时。未使用公网 SSH，未修改 SSH/Tailscale 配置，未重启任何服务。candidate 在 SSH 上传阶段失败，没有候选测试成功 receipt。

恢复连接后，先核对共享 lease、实际 runtime SHA 和 V 对齐状态，执行私有副本测试，再按本次授权集成积压补丁与通知补丁，回到同一旧群连续验证双子任务汇总、重复投递防护与单子任务正常回复。真实验收通过后出 PR；生产上线另按授权执行。
