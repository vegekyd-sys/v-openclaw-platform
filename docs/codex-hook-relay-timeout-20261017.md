# Codex 工具调用被 "Native hook relay timed out" 拦下（2026-10-17）

现象：生产 V 上 Codex 运行时（`/vcodex`、`/vds`、Codex 原生子 agent）的工具调用间歇性失败，输出如下：

```
Script failed / Wall time 9.5 seconds
Command blocked by PreToolUse hook: Native hook relay timed out
```

工具没有执行，模型只能重试，或者报告 Blocked。

## 结论

- **9 秒是 relay CLI 的固定期限，不是某一段累计出来的耗时。**
  - Codex 插件给 PreToolUse hook 设了 10 s 超时（`CODEX_NATIVE_HOOK_RELAY_DEFAULT_TIMEOUT_SEC`）。
  - relay CLI 的 `--timeout` 是 10 s 减去 1 s 余量，即 9000 ms。V 的配置没有覆盖 `nativeHookRelay.hookTimeoutSec` 和 `gatewayTimeoutMs`。
  - CLI 期限从 CLI 代码开始执行时计时，冷启动不算在内。Wall time 9.4–9.8 s = 冷启动 0.4–0.8 s + 9.0 s 期限。
  - 到期后 CLI 输出 deny（fail-closed），Gateway 一侧不会被取消。
- **两类根因。**
  - **A. 原生子 agent 的跟进回合必然超时。** 父回合用 `followup_task` 或 `send_input` 给已经做完一轮的子 agent 派新活时，子 agent 已经不再被父中继认领。core 的 `awaitForegroundAdmission` 没有超时，一直等到 CLI 的 9 s 期限。已在 VLab 复现并修复，见下文。
  - **B. Gateway 主线程过载或冻结期间的零星超时。**
    - relay 在 Gateway 侧只占 ≤15 ms（认领 0–3 ms，策略 1–11 ms）。时间花在 bridge 请求排队，等主线程来处理。
    - 单次停顿要接近 9 s 才会超时。
    - 主线程持续饱和时（ELU=1，每轮 3 s，即 10/17 21:04 的 liveness 读数），串行调用约 5 s；8 路并发排队 14–20 s，16 次里 14 次超时，在 VLab 上复现了生产的报错。
    - 10/16 的 24 次超时全部落在 Gateway 冻结窗口内：heartbeat overdue 51–52 s，fenced read 19 s，属于 #402 和 #405 那条线。
    - 10/17 21:02–21:05 那 9 次：Gateway 32 s 内 rss 增长 2.5 GiB，ELU=1，同时父线程和 3 个子线程在并发调工具。
- 修法：
  - A：codex 插件补丁 `lab/release-files/codex-native-followup-admission/`。VLab 前后对比：基线 2/2 复现（9.7–9.8 s 被拦），修复 2/2 通过（0.7–1.0 s）。
  - B：根因不在 relay，在 Gateway 主线程饱和。整读问题由 #419 那条线处理；子 agent 派生前后的 rss 暴涨建议单独立项查。
  - 可选缓解：hook 预算放宽到 30 s（`lab/release-files/codex-hook-relay-timeout/`）。饱和并发下 0/16 被拦，但每次要等 22–24 s。不建议默认上。

## 链路与超时语义

1. Codex 在每次工具调用前执行 `exec nice -n 10 node openclaw.mjs hooks relay --provider codex --relay-id … --state-db … --generation … --event pre_tool_use --timeout 9000`，Codex 侧的超时是 10 s。
2. CLI（`native-hook-relay-cli-DTqrikhm.js`）：
   - 从 stdin 读 payload；
   - 用 `readNativeHookRelayClientBridgeRecord` 只读打开状态库，按 relay id 查 locator（pid/port/token）；
   - 向 `127.0.0.1:<port>/invoke` 发 POST。
   - bridge 返回 stale 以外的错误时，回退到 Gateway RPC `nativeHook.invoke`。
   - 到期调用 `writeNativeHookRelayDeadlineResponse`，输出 deny，原因是 `Native hook relay timed out`（`preToolUseUnavailable` 没设成 `noop`，所以拦下）。
3. Gateway（`native-hook-relay-BRGvN3HA.js`）的 bridge 运行在主线程：
   - `invokeNativeHookRelay` 先做 `resolveNativeHookRelayInvocationBinding`。payload 带 `agent_id`（原生子线程）时走 `awaitForegroundAdmission`。
   - 然后执行 `runBeforeToolCall`，即策略、审批和 loop detection。
   - CLI 超时断开后，9.1 的 bridge 不会中止这次调用，挂起的认领等待要到子线程回合结束才会被 reject。上游 10.x 会把请求的 abort signal 传进 `awaitForegroundAdmission`。
4. 超时后 fail-closed（deny）是正确的语义：fail-open 等于在 Gateway 忙的时候绕过所有 before_tool_call 策略和审批。不改。

## 生产取证（V 只读，10/16–17 Codex rollout 与 Gateway 文件日志）

两天里共有 41 次 `timed out`（按调用计，不按出现的文字计）和若干次 `unavailable`。

| 类别 | 次数 | 判据 |
|---|---|---|
| A 跟进回合 | 8（10/17 21:11–21:12） | 两个子线程的跟进回合里，带 hook 的调用 8/8 超时，wall 9.4–9.5 s；同一时间父线程的调用都在 0.5 s 左右成功；Gateway 没有停顿告警 |
| B Gateway 冻结或过载 | 10/16 24 次；10/17 9 次（21:02:51–21:05:27） | 每一批都对得上 Gateway 日志：10/16 18:20 heartbeat overdue 51 s，18:22 overdue 52 s，18:37 fenced read 19.3 s；10/17 21:02:48 内存压力 critical（32 s 内 rss +2.53 GiB），21:04:22 liveness ELU=1、P99 3183 ms。同一窗口里成功的调用也要 8–17 s |
| `unavailable`（另一类） | 10/16 18:59 一个子线程 62 次 | 不等待，0.8–3 s 内失败：子线程在父回合结束后还在调用工具，中继已经不存在或不肯认领。v1 补丁（yield 保留）之外的情形，不属于本次的 9 s 问题 |

注意几点：

- 交接里说的 "31 次" 按文字出现次数统计，一次失败的输出里会出现两遍。
- B 类窗口多数在原生子 agent 派生前后 1–2 分钟内，Gateway 出现 rss 增长 1.4–2.5 GiB 或长读：
  - 10/16 17:54 派生，17:56 出现增长或长读；
  - 10/16 18:36 派生，18:37 出现；
  - 10/16 18:59 派生，18:58 已经出现，早于派生；
  - 10/17 21:02 派生，21:02 出现。

  内存压力在其他时间也会出现。这里只记相关性，没有定位到代码。

## 分段（VLab candidate，`FA_MODE=segments`）

VLab 是 4 核机器（V 是 8 核）。测试方法：父线程跑一个长 `sleep`，在它的 relay 处于前台期间，用 Codex 实际使用的同一条 CLI 命令（`--timeout 9000`）发合成的 pre_tool_use 调用，并在 CLI、client 和 Gateway bridge 三处打点。

Gateway 主线程负载是测试专用的注入：

- `block X/Y`：每 Y ms 忙等 X ms，中间有空闲。
- `sat X`：每轮事件循环忙等 X ms，主线程从不空闲，ELU=1，对应生产 10/17 21:04 的 liveness 读数（ELU=1、max 3.2 s）。

CPU 负载用 4 个满负荷进程制造。下表数值为 p50 / max，单位 ms。

| 场景 | 调用数 | 超时 | wall | CLI 冷启动 | locator 读 | CLI→Gateway 收到请求 | Gateway 认领 | Gateway 策略 |
|---|---|---|---|---|---|---|---|---|
| 空闲，串行 | 8 | 0 | 601 / 611 | 564 / 569 | 5 / 7 | 6 / 8 | 0 / 0 | 1 / 1 |
| 空闲，8 并发 | 24 | 0 | 3633 / 4547 | 3441 / 4174 | 20 / 73 | 34 / 266 | 0 / 1 | 1 / 7 |
| block 1500/2000，串行 | 8 | 0 | 1704 / 3451 | 993 / 1932 | 8 / 11 | 826 / 1478 | 0 | 1 |
| block 3000/4000，串行 | 8 | 0 | 2732 / 3712 | 792 / 1106 | 5 / 187 | 1575 / 2986 | 0 | 1 |
| block 3000/4000，8 并发 | 24 | 0 | 7174 / 8750 | 5265 / 6349 | 48 / 89 | 1594 / 3042 | 0 | 1 / 2 |
| block 9500/10000，串行 | 3 | 0（擦边） | 9660 / 9738 | 733 / 2333 | 6 / 8 | 8887 / 8992 | 0 | 1 |
| CPU 满载，串行 | 8 | 0 | 5871 / 8304 | 5331 / 7807 | 79 / 216 | 31 / 93 | 0 / 3 | 2 / 6 |
| CPU 满载，8 并发 | 24 | 0 | 9158 / 11997 | 8740 / 11374 | 93 / 228 | 70 / 286 | 0 | 1 / 11 |
| sat 1000，串行 | 6 | 0 | 4608 / 5824 | 2752 / 3947 | 15 / 34 | 1737 / 1950 | 0 | 0 / 6 |
| sat 3000，串行 | 6 | 0 | 5713 / 6546 | 860 / 942 | 10 / 32 | 4916 / 5618 | 0 | 1 |
| **sat 3000，8 并发** | 16 | **14** | 11917 / 13467 | 3673 / 4370 | 14 / 80 | 14312 / 20228（只记到 6 次） | 0 | 1 |

读法：

- **relay 自身几乎不花时间。**
  - Gateway 侧从读 body 到写回应答 ≤15 ms，其中认领 0–3 ms，策略（`runBeforeToolCall`）1–11 ms。
  - SQLite locator 读 5–230 ms。
- **冷启动不计入 9 s。** 期限从 CLI 代码开始执行时才计时。冷启动在 CPU 满载时会到 5–11 s，计入的是 Codex 自己的 10 s 超时。生产 rollout 里没有 Codex 自身超时的报错，说明生产上的失败不是冷启动造成的。
- **决定成败的是“CLI→Gateway 收到请求”这一段**，即 Gateway 主线程处理这个连接要等多久：
  - 单次阻塞要接近 9 s 才会超时；
  - 有空闲间隙的反复阻塞（3 s/4 s）不会超时；
  - 主线程持续饱和时（`sat`），每次 I/O 回调要等一整轮事件循环。串行调用约 1.6 轮，即 5 s。8 路并发时排队到 14–20 s，16 次里 14 次超时，被拦的消息和生产一致。
- 这正对应 10/17 21:02–21:05 的现场：父线程加 3 个子线程同时在调工具，Gateway ELU=1、单轮最长 3.2 s。
- 冷启动和 locator 读在并发与 CPU 满载时会变长（8 并发冷启动 3.4 s，满载 5–11 s），但都不在 9 s 期限之内，最多吃掉 Codex 10 s 里的余量。

放宽预算的对照（`candidate-523cbada`，可选补丁 `codex-hook-relay-timeout`，hookTimeoutSec=30，Codex 实际下发 `--timeout 29000`）：

| 场景 | 调用数 | 超时 | wall p50 / max | CLI→Gateway 收到请求 p50 / max |
|---|---|---|---|---|
| sat 3000，8 并发，30 s 预算 | 16 | 0 | 24124 / 30632 | 22229 / 24270 |

- 30 s 预算下，这一场景不再有调用被拦，但每次调用要等 22–24 s，最慢一次已经超过 30 s（加上冷启动以后，真实情况下会被 Codex 自己的超时杀掉）。
- 排队时间比 9 s 预算时更长：之前有一半 CLI 提前放弃，现在全部都在排队。从数据看，饱和状态下 bridge 大约每轮事件循环只接进一个新请求。
- 结论：放宽预算只是把“9.5 s 被拦、模型重试”换成“二十多秒才放行”。根因仍然是 Gateway 主线程饱和。

## 跟进回合修复的前后对比（VLab candidate，`FA_MODE=followup`）

场景：一个 `/vds` 回合（Codex harness + DeepSeek，测试里打开原生 multi_agent），流程如下：

1. 父线程用 `spawn_agent` 派一个子 agent 去 `cat` 文件 A；
2. 用 `wait_agent` 等它做完；
3. 用 `send_input` 给同一个子 agent 派第二份活：`cat` 文件 B；
4. 再次 `wait_agent`。

基线：codex 插件、core 均为 V 的字节（哈希已核对）。修复：只加 `patch-codex-followup-admission.mjs`。

| 运行 | 结果 | 跟进回合的 exec | CLI 期限命中 | 说明 |
|---|---|---|---|---|
| 基线 #1 `candidate-01918e22` | 复现 | 9.8 s 后被拦，`Native hook relay timed out` | 1 | 回复 `DONE <A> MISSING Command blocked…`。Gateway 对这次调用没有 invoke 记录：一直挂在认领等待上 |
| 基线 #2 `candidate-2214f807` | 复现 | 9.7 s 后被拦，同上 | 1 | |
| 修复 #1 `candidate-e6fcdcf1`（第一版补丁） | 失败 | 9.8 s 后被拦 | 1 | 子线程旧状态 `terminal=true` 且结果还在投递，第一版跳过了这种情况，诊断日志据此补全 |
| 修复 #2 `candidate-a2ab012f` | 通过 | 1.0 s 成功 | 0 | 走“本回合单独认领”的路径 |
| 修复 #3 `candidate-c9050cdb` | 通过 | 0.7 s 成功 | 0 | 64 次 hook 调用 p50 623 ms、max 1078 ms；本回合认领在子线程回合结束时释放（`follow-up claim released`） |

multi-agent V2（`followup_task`，生产 10/17 用的就是 V2）的情况：

- 修复版收到了父线程的 `subAgentActivity interacted`，并且完成了认领（`candidate-9381ae1a`、`candidate-4b645e26`）。
- 但 DeepSeek 下 V2 的 `followup_task` 本身跑不通：要么子线程不开始新回合，要么报 `reasoning_text must be passed back to the API`（`candidate-a6b64a53`）。所以没法在 candidate 里做 V2 的端到端前后对比。
- V2 的端到端只能等真实 GPT（`/vcodex`）流量验证：上线后看 V 日志里有没有 `follow-up admitted`，以及跟进回合还有没有超时。

## 修法评估

| 方向 | 结论 |
|---|---|
| 跟进回合重新认领（A） | **已做**，见 `lab/release-files/codex-native-followup-admission/README.md`。认领不等于放行，工具仍然要过发出跟进的父回合的 `runBeforeToolCall` |
| 认领等待设上限，或在 CLI 断开时中止 | 建议后续做，作为纵深防御：失败从 9.5 s 缩短到几百毫秒，并释放挂起的认领。修完 A 以后已知场景不会再触发，所以没放进这次的补丁 |
| 没有策略时不走 relay | 上游已经这样做（`shouldRelayEvent` → `hasBeforeToolCallPolicy`）。V 上有 before_tool_call 策略和 loop detection，必须走 relay；在 Gateway 侧缓存“放行”判定会绕过审批和 loop detection 的状态，不做 |
| 常驻 relay，免去冷启动 | 冷启动只占 0.4–1 s，而且不计入 9 s 期限。A 和 B 都不是冷启动造成的，收益有限，暂不做 |
| 放宽超时 | 对 A 无效：等待本身没有上限。对 B，30 s 预算在饱和并发下把 16 次中被拦的 14 次全部变成放行，代价是每次等 22–24 s，最慢的贴近 30 s。可以少烧一次模型重试，但用户等待更久。可选补丁 `lab/release-files/codex-hook-relay-timeout/`，**不建议默认上**，由 Tianyi 决定 |
| bridge 接入移出主线程 | 饱和时 bridge 大约每轮事件循环只接进一个请求，并发越多排队越长。可以把 HTTP 的接入和解析放到 worker thread，只把调用交给主线程。这样能减少等待的轮数，但策略仍须在主线程执行。属于 core 改动，列为后续方向，这次没做 |
| 超时语义 | 保持 fail-closed |

## 证据位置

- V（只读）：rollout 统计脚本在 `/tmp/cc-rollout-scan.py`、`/tmp/cc-timeline.py`、`/tmp/cc-classify.py`、`/tmp/cc-timedout.py`，运行时需要 sudo，只读 10/16–17 的 rollout。
- VLab：`lab/candidate/codex-hook-relay-latency.mjs`，plan 文件是 `lab/candidate/codex-hook-relay-*.plan.json`。
