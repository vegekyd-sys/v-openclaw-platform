# Voice 准入读取等待优化候选

2026-10-27，基于平台 dev `ef7723a4`，分支 `codex/voice-admission-latency-20261027`。用户要求优化实际接通速度，以线上为 benchmark。本 PR 只调整 `createFeishuVoicePolicy` 的只读请求调度，不改账号准入条件、签名、路由、owner 或工具权限。

## 线上对照

Voice 线上为 `b4ed555`。服务器内的三次真实只读 Gateway 成员准入为 652、686、4969ms；工具/上下文并行环境准备为 792、775、629ms。长等待不等同于飞书 HTTP 全部耗时；Gateway 自身排队/同步工作仍可能影响尾部。

随后每次 policy 请求都按生产行为新建安装的飞书客户端，使用真实 chat/member API，对比生产安装 policy 源码与本候选，交替顺序 baseline→candidate、candidate→baseline、baseline→candidate。后续 ingress/routing 依赖使用 fixture；因此这是 HTTP 准入读取段的 A/B，不是候选 Gateway 完整集成验收。没有模型连接、音频、消息发送或生产文件改动。

| 读取场景 | 生产源码 | 候选 |
| --- | ---: | ---: |
| 三次完整两项读取 | 739 / 521 / 502ms | 309 / 269 / 280ms |
| 中位数 | 521ms | 280ms |
| 同时两个请求：时间 / 实际 GET 数 | 962ms / 4 | 280ms / 2 |

仅这段中位数减少约 46%，样本少，不作为 P95 或电话整体收益。见 [live-readonly-ab.json](live-readonly-ab.json)。生产 policy SHA256 `88e361a38810e9a609e3073759a8daafc3a084462f871b7a281784bde7482bf6`。

## 实现与权限

- chat mode 与首个成员页并行，二者成功后才能继续准入；成员翻页仍逐页、完整校验。
- 相同账号、应用、凭据、域名和 URL 的 GET 只在请求尚未返回时共用 promise；成功和失败均立即删除，不保留 TTL/跨通话授权缓存。
- 不共用 policy/admission 结果。每个 actor 独立检查成员，继续执行当前 account/config、群/DM ingress、路由、senderIsOwner 和工具授权。没有成员权限时仍拒绝。
- 账号/凭据/会话隔离、失败重试、成员撤销、malformed 分页，以及两个 actor 共用网络读取但得到不同准入结果，均有确定性回归。

## VLab 和交付

使用 `lab/candidate/voice-admission-latency.plan.json`，在隔离 VLab runtime overlay 到实际目标 `openclaw/dist/v-feishu-voice-policy.mjs`。测试在 VLab 动态 import overlay 后的模块，12 项通过，包含 actor 签名/跨账号资源隔离测试。没有启动常驻 Gateway、修改共享服务或生产；见 [validation.json](validation.json)。

共享 VLab 当时仍是其他任务的待验 release，未抢占。当前仅是合入前独立 Candidate；须由 Tianyi 决定合入 dev，再按平台流程做共享集成及正式推广。版本控制的旧 release/captured 产物保持历史原样。正式 package 应使用本文件作为单目标 overlay，并验证当时目标文件的 before hash；不能直接运行旧全量 actor patch 覆盖其他任务的新代码。

Voice 侧重复准入去重、延后 CLI 探测和模型/辅助 ASR 并行由独立 Voice PR 维护。本 PR 不依赖新 iOS binary；端到端拨号、真实手机音频和稳定打断仍未验。
