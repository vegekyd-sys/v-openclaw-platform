# 验收方案：worker 不重启更新 + 飞书审批卡（#171 + #172 + #173）

日期：2026-10-03。发布：`hotreload-feishu-approvals-v1`。计划文件：`lab/hotreload-feishu-approvals-plan.json`，共 8 个文件，基线是 `feishu-ask-chat-answer-v1`，也就是 V 当前的版本。

- #171 改飞书插件 dist 的 3 个文件：审批卡发到 owner 的私聊。
- #172 + #173 改 `production-worker/` 的 5 个文件：
  - 排空式换代；
  - `vlab.workers.roll`；
  - worker 配置从主配置推导，主配置一变自动换代（只改 `meta` 时不换代）。

驱动脚本：`lab/hotreload-acceptance.mjs`。用 Tianyi 本人的 lark-cli 在验收群里发 @机器人 的消息，并读回卡片；Gateway 的状态通过它自己的 CLI 和 RPC 读取。

| | 共享 VLab | 生产 V |
|---|---|---|
| 群 | VLab 发布验收 B `oc_5afced47…` | V 生产发布验收 0910 `oc_104de997…` |
| 机器人 | V - Lab `ou_b4c17dba…` | V - Makaron `ou_b1cdecc…` |
| 成员 | Tianyi + 机器人 | Tianyi + 机器人 |

## 0. 部署

### 共享 VLab
1. 由 `worker-generations` 持有 lease。
2. 执行 package（dev 上的精确提交）→ stage → deploy。deploy 会先暂停接新活、排空，再重启。
3. 日志里要看到：
   - `Worker config derived`；
   - 没有 `feishu approvals: context registration failed`；
   - 飞书 websocket ready。

### V
1. `scripts/promote-to-v.mjs --apply` 只换文件，不重启。
2. 按 #169 的做法，在没有用户可见工作时停 Gateway。
3. **停下之后**写两项配置，因为它们都会触发整体重启：
   - `channels.telegram.execApprovals.enabled=false`
   - `approvals.plugin.enabled=false`
4. 启动，然后 capture、PR，再执行 `vlab.mjs align`。

## 1. 验收项

每一项都要求两点：
- 功能确实成立：真实回复，内容带标记。
- 故障路径确实被触发：换代发生时，旧一代里确实有我们的回合正在跑。

| 编号 | 场景 | 判定通过 |
|---|---|---|
| base | 新版本在跑 | status 版本为 `0.2.12-generations.1`，有 `generation`，没有排空中的旧一代，worker 已就绪；群里发短消息能收到带标记的回复 |
| roll | 长回复正在通过 worker 输出时，调用 `vlab.workers.roll` | 代数 +1，旧一代 `active ≥ 1`；这篇长文在群里完整发出（带结尾标记，不是错误卡片）；下一条消息正常回复；旧一代排空到 0；worker 进程数等于 status 报告的数 |
| config | 同上，但触发方式是改主配置的空操作键 `wizard.lastRunCommand` | worker 配置监视自己完成换代，其余同 roll；改回原值后配置文件的 sha256 与原来一致 |
| approval | 群里让机器人把 `messages.ackReaction` 改成 👀（空操作键） | 日志出现 `feishu approvals: delivered`；**Tianyi 在手机上点「批准」**；日志出现 `resolved`；卡片变为「已批准」；群里那一轮继续并回复标记；最后把配置字节恢复原样 |
| journal | 全程 | `worker pool is closing` 出现 0 次 |

插件热重载这条路径（改 `plugins.*`）在共享 VLab 上测不了，因为它的 `gateway.reload.mode=off`，VLab 工具链也要求保持这样。这条路径的证据来自候选 `candidate-fcc3e187`（真实 9.1，私有 Gateway，三个场景）以及对照组 `candidate-af69b8cc`（0.2.11 复现停摆）。

## 2. 共享 VLab 执行

```bash
node lab/hotreload-acceptance.mjs --target vlab --steps base,roll,config,approval
```

`approval` 这一步会停下来等 Tianyi 在手机上点「批准」。可以再点一次「拒绝」作为补充，但不是必须项。拒绝、过期、非 owner 被拦、重复点击，已经由 `candidate-ec5c2fd2` 覆盖。

全部通过后执行 `vlab.mjs accept`，证据引用本次报告。任何一项失败就执行 `vlab.mjs rollback`。

## 3. V 线上执行

时机选在夜班不忙、群里没有活跃对话的时候：

```bash
node lab/hotreload-acceptance.mjs --target v --steps base,roll,config,approval
```

V 上额外的判定：
- 审批卡到 Tianyi 的飞书私聊，Telegram 不再收到。
- 重启后 30 分钟内：
  - 机上哨兵和探针没有报 OUTAGE；
  - `vlab.workers.status` 的 worker 数 ≥ 5；
  - 首字时间不比重启前差。
- worker 配置的首次推导改写了 68 处，重点看：
  - worker 的压缩模型改成了 `gpt-5.6-sol`；
  - `anthropic:claude-cli` 登录配置被删除后，`/vcc` 仍能正常回复；
  - worker 加载 `nightshift-feishu` 和 `respeaker` 后没有报错。

上 V 后的回退：
- `promote-to-v.mjs --undo <备份目录>` 把文件换回去；
- 两项 Telegram 配置改回 `true`；
- 再重启一次。
- worker 配置不需要回退：推导结果对旧代码同样有效。

## 4. 不在本次范围

- 插件热重载在 V 上的实测：要改 `plugins.*`，9.1 会顺带重启飞书和 Telegram 渠道。是否做由 Tianyi 决定。
- 夜班满并发下的排空内存峰值。
