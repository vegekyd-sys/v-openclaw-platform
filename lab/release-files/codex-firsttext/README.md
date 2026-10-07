# Codex harness 首字：答案不等写库 + /vds 持久线程（2026.9.1）

`patch-codex-firsttext.mjs --codex <@openclaw/codex 目录>`，幂等。基线是 V 当前加载的
`@openclaw/codex@2026.9.1`（generation `g-b42d646e5561ece2`，已含 /vds G1 与
codex-native-subagent）：`run-attempt-D1hJO4fX.js` 694e3817…、`thread-lifecycle-DAcEJ_Om.js`
94d5420f…。共享 VLab（db91-parity）上是同一份字节。

## 现象（V，2026-10-04～10-07，[firsttext-e2e.1] 中 codex 59 条）

- /vcodex 私聊：Codex 已经整段答完，卡片还要再等 0.8–8.4 s。例 83bd9daa：Codex 8.0 s 完成，Gateway 16.4 s 才出首字。
- /vds 私聊 16/16：约 4.7 s 时 `pre-bind notification buffer exceeded 256`，整轮作废，换新线程重跑，首字中位 12.7 s。
- /vds 每轮都是新 Codex 线程（29 轮 29 个），整段历史当 prompt 重放：群 oc_fab91 每轮输入约 40 万 token，缓存只命中约 9 万。

## 根因与改法

### A. 答案流等用户消息写库（run-attempt）

`bindProjection` 先 `await promptMirrorPromise`（把用户消息写进会话记录），再 `bindTurn`。在此之前，
app-server 的所有通知都进 256 条的 pre-bind 缓冲。大私聊写一次要几秒：vcodex 的答案被扣住，
vds 的 delta 多，缓冲溢出后整轮重试。

等待的目的只是让持久化的会话记录保持时间顺序（用户消息在回答之前）。改为：

- 回合路由立即绑定，流式内容照常推出。
- `CodexTranscriptCheckpoint` 的写入链排在用户消息写入之后（`orderAfter`）。通知处理和工具调用
  只在用户消息写完之后才等待自己的 flush（`flushInOrder`）；之前不等，写入顺序仍由写入链保证。
- async 用户消息的投递、回合结束时的最终 mirror 也排在用户消息写入之后。

### B. /vds 每轮新开临时线程（thread-lifecycle）

G1 让 deepseek 关掉 code mode（`nativeCodeModeEnabled=false`）。上游把这个值理解成「本回合临时
限制」：保留会话原有绑定，另开临时线程，并把完整历史投影进 prompt。DeepSeek 的 code mode 是永久
关闭的，所以：

- provider 是 deepseek 时，code mode 关闭不再算临时限制（三处判断：`transientNativeToolRestriction`、
  `isTransientWebSearchRestriction`、`deferLegacyWebSearchRotationToTransientNativeSurface`），
  vds 正常创建、续用持久绑定。
- 绑定的 provider 家族（deepseek / 其他）和本回合不同时，轮换线程（`rotating a cross-provider
  thread binding`）。DeepSeek 会把明文 `reasoning_text` 写进线程，OpenAI 拒收
  （`invalid_request_error … input[N].content`），所以两家不能共用一个线程。新线程用完整的 OpenClaw
  会话记录灌入上下文。

顺带修掉一个切换问题：以前 vds 回合不写入 GPT 线程；切回 vcodex 时，续接逻辑
（`selectNewerVisibleHistoryAfterBinding`）又会排除所有 codex 写入的消息，所以 vcodex 看不到 vds
那几轮。现在换家族时开新线程，从完整会话记录灌入，两边都看得到。

代价：每次在 vds 和 vcodex 之间切换，第一轮要重放一次历史（缓存未命中一次）。同一模型连续对话
线程续用，缓存可以命中。

## 验证

- `lab/candidate/codex-firsttext.mjs`：隔离 Gateway，/vds 按 V 原样配置（共享 VLab 本身没有 /vds）。
  只在 candidate 副本里把写用户消息人为延迟 6 s，同一脚本先跑 V 原样字节、再跑补丁版，比较首字、
  pre-bind 溢出、会话记录顺序、线程数和缓存命中。
- vds↔vcodex 来回切换需要 ChatGPT 登录，在共享 VLab 上用 `vlab.mjs test` 验证。
