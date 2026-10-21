# 飞书端到端验收（设计 §10.3）记录

> 2026-10-21 起 · 分支 `isc/feishu-e2e`（worktree `.claude/worktrees/isc-feishu-e2e`，基于 `claude/cross-session-task-coordination-f7789a` @92c635ee）
> 上一轮 e2e（`isc/e2e-feishu`）修过两个缺陷，但 receipt 已丢，本轮全部重跑。

## 做法

- 每个场景都在 vlab91 的私有 candidate Gateway 里跑（`vlab.mjs candidate --owner isc-feishu-e2e`，用户 `lab-db91-parity`），产品字节只经 plan 的 `files` 进入（带 `before` sha256，runner 逐个核对）。
- 飞书：loopback webhook 入站（签名 + AES 加密的 `im.message.receive_v1`），出站走真实 VLab app「V - Lab」，**不开第二条长连接**。群里的「真人消息」先由 bot 发一条标明测试的种子消息，事件引用它；从不以 Tianyi 身份发消息。
- 判定只看两样：Mac 上 owner 身份的 lark-cli 只读读回（`im/v1/messages`，服务器 create/update 时间），以及 candidate 自己的账本（`v-session-relay/v2`）和 transcript（`chat.history`）。每条消息带唯一 RUN_TAG。
- 读回之外，跑的过程中 Mac 上每 15 s 拍一次五个聊天的快照（`watch`），用来看最终读回看不到的中间态（⏳ 行被编辑前）。
- 环境：`env=v` = `VLAB_FEISHU_STEER_ENABLED=1`、`VLAB_FEISHU_STEER_CHAT_IDS=*`、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`；`env=vlab` 不带。
- harness：worker = `deepseek/deepseek-flash`（vlab-worker）、vds = `deepseek/vds-deepseek-flash`（codex）、vcc = `anthropic/claude-opus-5-5`（claude-cli，V 的 /vcc 别名；共享 VLab 配置里只有 claude-opus-5，candidate 从它派生）。vcodex 不在 candidate 里跑。

## 基线核对（2026-10-21 17:10 CST，只读）

- V 上 15 个目标文件 `sha256sum -c` 全部 OK（与 `tests/fixtures/inter-session-v-bytes.json` 一致）。
- V 工作区：11 个输入文件里只有 `TOOLS.md` 与 10/20 的副本不同（V 现在 `0d62db1e…`，副本 `62a21bb3…`）；candidate 仍用 10/20 副本，`TOOLS.md` 不涉及 sessions_send。
- 共享 VLab 当前 release `memsearch-overlap-20261021`（runtimeSha `ce23776f…`，比 V 多一个 manager-runtime.js 的记忆检索改动），candidate 基线缓存命中，不新建基线。
- vlab91 `/srv/vlab-production-mirror` 开跑前 17G 可用。

## 结果总表

（逐场景 × harness，跑完一项填一项）

## 运行明细

## 修复的缺陷

## requester_tail_ms（S-tail，§8.7.4 判据）

## 没有跑的与原因

## 剩余风险
