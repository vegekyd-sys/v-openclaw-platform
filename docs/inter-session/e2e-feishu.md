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

2026-10-21 Codex 接手时核对原始 candidate receipt 和 owner 读回；没有重新发送消息。

| 运行 | 场景 | 结论 |
|---|---|---|
| fullA-worker / `candidate-084eebfd` | F1i、F1、F2、F3、F7、F13 | 六项通过（含真实飞书出站与 owner 读回） |
| fullA-vds / `candidate-0b7f81db` | 同上 | F2、F3 通过；其他四项保留失败，见下文 |
| fullA-vcc / `candidate-1855a5ec` | 同上 | 前五项通过；F13 目标调用被 Claude 组织停用拒绝，未完成 |
| crash-worker / `candidate-63cb7634` | F5、F6-posting、F6-running、F6-waking | 四项通过；Codex 重试只读飞书读回后补齐证据 |
| vlabenv-worker / `candidate-df003c51` | F1i、F1、F2、F3 | 四项通过（无生产 steer 环境变量） |
| C-stock / worker、vds、vcc2 | C1、C2、C3 | 最新有效运行均通过：成功复现旧行为，不表示新功能验收通过 |
| C-fallback / worker2、vds、vcc2 | CF2 | 最新有效运行均通过：停用插件后回退旧路径 |

所有上述 receipt 的 `sharedUnchanged=true`。结果只限 candidate；没有因此完成共享 VLab 集成或生产上线。

## 运行明细

## 修复的缺陷

本轮 Claude 在 `92c635ee` 之后提交了四个测试驱动修订，接手基线为 `6edbce8578fc0fe1ec5b077ae4ccbd561a74aa2c`：vcc 模型别名、fallback 日志来源、Claude 工具块读取、Codex 嵌套 toolResult 和 F7/F13 判据。后两项在 fullA-vds 的 receipt 生成后才改，不能追认旧失败为通过。

- VDS F1i/F1：receipt 中 toolResult 的正文已被旧归一化函数丢弃；修正解析器通过离线测试，但原始内容不在旧 receipt 中，仍待补证。
- VDS F7：三件任务的账本在 18:42:40.171–18:42:40.719 CST 短暂重叠；状态行只记录了 1、2、1、结束。最新“账本峰值”判据也不能直接把它判绿。请求/结果读回通过，后台行瞬态是否必须完整呈现需继续核对刷新机制和产品要求。
- VDS F13：最终汇总包含三个房间的实际答案，旧断言要求逐个保留 `-a/-b/-c` 标签因而失败。新判据检查汇总来源，但 `reduceSend` 没把 `result.fromRunId` 存进 receipt；且“任意四字符重合”不能严格证明每个答案完整。保留待审，不能只为变绿放宽。
- VCC F13：日志明确为 `API Error: 400 This organization has been disabled`，随后等待三房间派活超时；属于本次运行的账号阻塞证据，不能据此判定协同引擎失败或通过。

## requester_tail_ms（S-tail，§8.7.4 判据）

核心矩阵记录：worker 5 个样本 1956–2852 ms；vds 5 个样本 1808–6416 ms；vcc 4 个样本 2379–6180 ms。它们来自不同场景，不是设计要求的“每个 harness 的 F2 重复五次”实验，不能据此关闭 S-tail。

## 没有跑的与原因

- 本轮已保存回执尚未覆盖 F3b/F3c、F4a/F4b、F8–F12、F14–F17，以及专用 S-tail。
- 正式三房间协调者 TR1/TR2 尚未实现完整驱动；F13 的两层汇总通过不能替代含创建房间、追问及重启的 TR 验收。
- `/vcodex`、真实飞书 WS、配置启停和 Worker 换代仍需最终共享 VLab 集成。
- Telegram、钉钉、企微已有桥和假平台驱动，但本页不对其历史运行作最终验收结论。

## 剩余风险

- 2026-10-21 用户要求停止持续的 VLab 飞书测试发送；接手保持暂停，不启动 run/watch/candidate，也不向聊天发消息。
- 原始消息、transcript、watch 和 receipt 保存在被 git 忽略的私有证据目录；不要提交到仓库。接手记录见 [takeover-20261021.md](takeover-20261021.md)。
