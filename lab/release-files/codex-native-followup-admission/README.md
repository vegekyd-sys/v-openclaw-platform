# Codex 原生子 agent：跟进任务重新接入父中继（2026.9.1）

## 现象（生产 V，2026-10-17 21:11 CST）

Memory Librarian（cron `914f4254`，`/vcodex`，multi-agent V2）在同一个父回合里先派 3 个原生子 agent，等它们做完，再用 `followup_task` 给其中两个派第二份活。第二份活里每一次带 hook 的工具调用都是：

```
Script failed / Wall time 9.4 seconds
Command blocked by PreToolUse hook: Native hook relay timed out
```

| 子线程 | 第一回合 | 跟进回合 |
|---|---|---|
| `01a149f4-c043`（`/root/daily_later`） | 22 次成功，1 次超时 | 4 次超时，1 次无 hook 的调用成功 |
| `01a149f4-9218`（`/root/daily_early`） | 22 次成功，2 次超时 | 4 次超时，1 次无 hook 的调用成功 |

同一时间父线程自己的调用都在 0.5 s 左右成功，Gateway 没有停顿告警。跟进回合的失败与负载无关，是必然的。

## 根因

1. 子线程被派生时，`native-subagent-monitor` 用父回合 owner 的 `claimDirectChild` 认领它。core 的 `resolveNativeHookRelayInvocationBinding` 看到 payload 带 `agent_id`，就走 `awaitForegroundAdmission`：已认领就放行，没认领就挂起等待认领。
2. 子线程第一回合结束（`turn/completed`），监控把 revision 标记为 terminal，并释放认领。
3. 父回合用 `followup_task`（V2 是 `subAgentActivity kind=interacted`）或 `send_input`（V1 是 `collabAgentToolCall`）给子线程派第二份活，子线程开始新回合。监控对这些事件只做 `registerChildThread(state, child)`，不认领。即使带认领，`registerChildThread` 也会因为 revision 已是 terminal 而直接返回。
4. 子线程新回合的每次 PreToolUse 都进入 `awaitForegroundAdmission`，挂起的 Promise 没有超时。relay CLI 等到自己的 9 s 期限（Codex hook 超时 10 s，减 1 s 余量），返回 deny，消息是 `Native hook relay timed out`。工具根本没有执行。子线程回合结束时，监控才 reject 掉挂起的认领。

候选测试里看到的状态更具体：`send_input` 到达时，子线程的旧状态还在，`terminal=true`，`pendingCompletion` 仍在等待投递给父会话。上游 9.5 以后用 `pendingTurns` 和交互证据处理这个问题（`native-subagent-monitor.followup.test.ts`），整套监控已经重写，没有可以直接回移的小补丁。

## 改动（`patch-codex-followup-admission.mjs`，只改 codex 插件 `native-subagent-monitor-CnH147jH.js`，幂等，锚点必须唯一）

- 父回合 owner 发出跟进时，调用 `readmitFollowupChild`。触发条件是 `item/completed` 事件，并且满足下面任一项：
  - V1：`collabAgentToolCall` 的 `followupTask`、`sendInput` 或 `resumeAgent`，状态为 completed；
  - V2：`subAgentActivity` 的 `interacted`。
- `readmitFollowupChild` 只认领满足以下全部条件的子线程：
  - 本监控登记在同一个父线程下的子线程（childState 或 revision 的 parentThreadId 一致）；
  - 当前父回合的 owner 有 `claimDirectChild`；
  - 还没有被认领。
- 子线程状态仍然活着：清掉 revision 的 terminal 标记，再用 owner 认领。下一次 `turn/completed` 由原有路径释放，和派生时的认领一样。
- 子线程的上一份结果还在投递中（childState `terminal=true`）：不动这份状态，只为本次跟进回合单独认领。这份认领记在 `followupDirectClaims` 里，在该子线程下一次 `turn/completed` 时释放，不受监控提前 return 的影响。
- 认领成功后打一条 info 日志：`Codex native subagent follow-up admitted to the parent relay`。

### 安全

- 认领不等于放行。子线程每次调用工具，仍然要经过 `runBeforeToolCall`，用的是发出跟进的那个父回合的上下文。审批、voice 确认、loop detection 等策略都照常执行，被拦的调用照样 deny。
- 只有父回合自己对子线程发出的协作动作才会触发认领。Codex 只允许父线程对自己树里的 agent 发 follow-up，事件来自父线程本身。
- 新回合的权限来自发出跟进的父回合，与上游 9.5 及以后的语义一致：上游测试要求跟进回合只拿到 B 的权限上限（"gives the new child turn only B's ceiling"）。原 v1 补丁不让新父回合自动接管旧子线程的认领，这条规则没有变化：只有显式派了新活，才重新认领。

### 没覆盖

- 跨父回合的跟进，而且上一回合因为 yield 被保留（turn-scoped 中继 id）。这种情况下，子线程的 hook 命令指向旧中继，新回合的认领落不到旧中继上，结果是快速失败，消息为 `Native hook relay unavailable`，不会等待超时。这个情况要单独处理。
- 父回合已经结束、子线程还被跟进：中继在前台关闭时就没有认领，属于另一种失败（`unavailable`），比如 10/16 18:47 那个子线程的第二回合。

## 上线

只改 codex 插件一个文件，需要重启 Gateway（插件代码在启动时加载）。插件目录由 npm 管理，重装或升级插件后需要重新打补丁。

```sh
node patch-codex-followup-admission.mjs --codex <@openclaw/codex 目录> --check   # 只检查
node patch-codex-followup-admission.mjs --codex <@openclaw/codex 目录>
```

V 上的插件目录：`/home/openclaw/.openclaw/npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex`。共享 VLab 加载的是 `state/npm` 下的副本，两边都要打。

## 验证

`lab/candidate/codex-hook-relay-latency.mjs`，`FA_MODE=followup`，见 `docs/codex-hook-relay-timeout-20261017.md`。
