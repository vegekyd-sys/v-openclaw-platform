# 飞书入站补拉（PR #415）验收证据：2026-10-17 CST

结论：**可以上线**。上线前需要满足一个前提，并接受几处已知限制，见文末。

## 1. 字节基线

| 项 | sha256 前 8 位 | 来源 |
|---|---|---|
| V 线上 `feishu/dist/monitor.account-WFdlCDhR.js` | 31238429 | 2026-10-17 21:5x CST 在 V 上直接 `sha256sum`（`/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu/dist/`） |
| 最新发布捕获 `v2026.9.1-db91.6-codex-inspection-budget-20261017.feishu` | 31238429 | `release/captured/` |
| VLab candidate 基线中的同一文件 | 31238429 | candidate 运行时断言 |
| `patchFeishuMonitor(V 线上字节)` | ffdf7072 | 本地重建 |
| PR 的 `lab/release-files/feishu-ingress-catchup/monitor.account-WFdlCDhR.js` | ffdf7072 | 与重建结果逐字节相同 |

PR 的 before 等于 V 线上的字节，不需要重建。

## 2. 测试方法

`lab/candidate/feishu-ingress-catchup-e2e.mjs`，每个场景单独跑一次 candidate（`FT_PHASE`）。

- **真实的部分**：
  - 一个私有 Gateway 运行在 candidate 配置副本上。
  - V 的飞书插件字节：baseline 场景不打补丁，其余场景打补丁，并断言 hash。
  - 飞书 SDK 1.73.0 自己的 WebSocket 重连循环。
  - durable ingress（SQLite）、飞书去重库和 handler。
  - vlab-worker 里的真实模型回合（deepseek-flash）。
- **假的部分**：飞书服务端，跑在 127.0.0.1 上。
  - REST 接口，包括 `im/v1/messages` 列表（每次调用加 80 ms 延迟）。
  - 一个 WebSocket 端点，实现 SDK 的 pbbp2 帧协议：推送、ack、ping/pong。它可以真的切断连接，并在一段时间内拒绝重连。
- **没有用任何真实飞书凭据**：
  - candidate 配置里的飞书、钉钉、企微、Telegram 都替换成一个假应用（`cli_0000feed0000beef`），domain 指向假服务器。
  - 假服务器的自签证书只通过 `NODE_EXTRA_CA_CERTS` 给这个私有 Gateway。
  - Worker 那份配置的 channels 也清空了。
  - 没有往任何真实会话发消息，也没开真实长连接。
- **停顿用真实方式制造**：对 Gateway 进程 SIGSTOP 22 s，期间 socket 保持连接。
- **"处理次数"的计数**：用 Gateway 自己的 `[firsttext-e2e.1]` 记录，每处理一条入站消息记一条。
- **主线程**：在 Gateway 里预加载 `monitorEventLoopDelay`，每秒采样一次（仅限 candidate）。
- **candidate 专用的两处改动**，与线上无关：
  - 放行私有副本里飞书插件的 trusted-plugin 门，做法同 `feishu-dm-approvals.mjs`；
  - 模拟"飞书重推"时，用的是原 event_id，在发送后约 65 s 推出。

## 3. 结果

| 场景 | candidate | 结果 |
|---|---|---|
| baseline：V 原字节，断线 20 s | candidate-a8ccf81c | 断线期间的 3 条消息，重连后 60 s 内一条都没到。只有等重推才处理，发送后 79 s 才处理完。这就是线上 5–12 分钟延迟的来源。 |
| reconnect：打补丁，断线 20 s | candidate-b6b1b154 | 见下文 |
| stall：SIGSTOP 22 s，socket 不断 | candidate-53876441 | 见下文 |
| restart | candidate-3fc5be0e | 见下文 |
| load：200 会话 × 150 条，空档 121 s | candidate-1c4e0e0f | 见下文 |

**reconnect**
- 重连后约 5 s 开始补拉，日志为 `window 85s, chats 3, listed 9, injected 3, already received 4, errors 0`。
- 私聊、@V 的群消息、全量推送群里不 @ 的消息各处理 **1 次**。
- 只推 @ 的群里不 @ 的消息没有被拉，其他应用发的消息也没有被拉。
- 飞书随后重推这 3 条：日志 `dropping Feishu re-push … already pulled`，ack 200，处理次数仍然是 1。
- 60 s 后的 follow-up 补拉：`injected 0, already received 7`。

**stall**
- 停顿期间飞书没推的 s1 被补拉，日志为 `event loop stalled 23s … injected 1, already received 4`，处理 1 次。
- 冻结期间进了 socket 缓冲区的 s2，恢复后照常处理 1 次，补拉把它算作已收到。
- 两条都被重推一次：s1 被补拉标记丢掉，s2 被原有的 handler 去重挡掉。两条最终都只处理 1 次。

**restart**
- 补拉过的 p1，在 Gateway 重启后被飞书重推，新进程靠持久标记 `v-catchup:<id>` 丢掉它，处理次数仍然是 1。
- 已知限制，这里证实了：Gateway 停机期间发来的 x1，新进程**不会**补拉，只能等飞书重推（到达后正常处理 1 次）。

**load**
- 800 次列表调用（每会话 4 页），峰值 47 次/秒，补拉用时 18.3 s。
- 每个会话的空档消息各注入 1 次（`injected 200`），断线前推过的 600 条全部识别为已收到，`errors 0`。
- 主线程：补拉期间每秒的事件循环延迟最大值平均 58 ms，单个最高 397 ms；ELU 平均 0.36。空闲时 ELU 是 0.02。

单元测试 `node --test lab/feishu-ingress-catchup.test.mjs` 8/8 通过，`tests/vlab-static.sh` 通过，`platform/platform.test.mjs` 17/17 通过。

## 4. 放到 V 的真实规模上

数据来自 V 的 journal，只读。

- **会话数**：V 过去 24 h 收到 179 条飞书消息，分布在 26 个会话（19 个群、7 个私聊）；7 天内是 111 个会话。所以一次补拉大约是 26–52 次列表调用，约 1–2 s。load 场景的 200 会话是代码上限，约为当前规模的 8 倍。
- **触发频率**：7 天里飞书重连和启动类事件大约每天 11 次。每次触发是一次补拉加一次 follow-up，每天约几百次调用。
- **10/16 风暴（16:38–17:00）**：
  - Gateway 大约每 75 s 冻结一次，每次 40–55 s。
  - SDK 在 16:39 和 16:51 各重连一次，飞书 monitor 在 16:48 整体重启一次，17:00 Gateway 重启。
  - 停顿触发器会在风暴中反复触发。16:52–16:56 那批消息会在 17:00 重启前被老进程补拉进 durable 队列。
  - 这一点是按日志推断的，没有在 V 上实测。

## 5. 上线前提与限制

1. **前提：V 的飞书应用要有读会话历史消息的权限。** 这一点还没有用真实飞书验证过，已经请 Tianyi 决定是否做一次只读检查。
   - 没有权限时的表现是安全的：列表接口返回非 0，那个会话记一次 `errors`，打一行 `ingress catch-up list …: code=…` 日志，消息照旧等飞书重推，和现在一样。
   - 也可以直接上线，看第一次补拉的日志行来确认。
2. **需要重启一次 Gateway。** 9.1 的插件重载不会换代码。
3. **整文件替换的叠加风险。** #305 和 #229 也整文件替换同一个 monitor。哪个后上线，都必须从当时 V 线上的字节用 patch 脚本重新生成，否则会把补拉功能静默回退。
4. **重启空档不覆盖。** 表里 10/12 的两段强制重启窗口共 22 条消息，属于这一类。新进程没有会话列表，也不知道空档从什么时候开始。这需要单独的后续工作：持久化最后存活时间和会话列表。
5. **其他覆盖限制**：
   - 话题回复不拉；
   - 私聊只覆盖本进程启动后见过的会话；
   - 断线被 SDK 发现之前超过 60 s 的那一段，不在窗口内。
6. **频控余量。** 在 200 会话、80 ms 延迟时，峰值 47/s，接近 50/s 的频控。超限时出错的会话退回等重推。按 V 现在的规模（26 个会话）离这个上限很远。
7. **未验证：** 列表接口返回的 text content 是否和推送原文逐字节一致。只有在"进程或飞书通道启动后 60 s 内就断线或停顿"时才会用到这个比较；即便不一致，也只会在这个窄窗口里重复处理。
