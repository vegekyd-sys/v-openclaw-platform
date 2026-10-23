# 飞书会话电话发布：移除验证码

2026-10-24：用户已明确授权移除验证码机制并合入部署。`feishu-phone-login-challenges`、`feishu-voice-login`、登录 RPC 注册与消息消费 hook 已移除；不能通过私聊验证码取得新身份。配套 Voice 同时失效旧的无来源标记浏览器身份，只保留 OAuth 认证与无账号工具的临时访客通话。

群聊使用输入框下方 menu_tree，私聊使用顶部 tab。保留原有 sender/group/account 原生工具策略；浏览器不能选身份或读取其他会话能力。匿名调用不进入此平台账号工具路径。真实内部非 owner 用户的账号工具仍取决于既有平台配置；不能将目录一致性测试当作凭据隔离验收。

移除后的原生 Candidate 28 项通过（candidate-3bcbfd55-6fae-44ec-9698-457e317c3837）；共享 VLab 最后集成与生产发布状态由对应 release receipts 记录。

以下是历史 Candidate 过程记录，范围和旧的待验证状态已由上文取代。

---

# Feishu 电话与文字能力一致：独立 Candidate

2026-10-24。配套 Voice 分支：`codex/feishu-phone-text-parity-20261024`，Voice commit `7a83022698b62d046b946172a812bac180e6ae71`。本目录仅用于独立 Candidate；没有合入 dev、部署共享 VLab 或生产。

## 行为与授权

电话入口对新群机器人加入、进入机器人私聊、首条消息事件自动安装；以 account/chat 幂等合并，配置每次刷新。只有私有 tab 配置显式启用 `conversations:true` 才打开此模式。旧 `allowedOpenIds` 模式及其已有 tab 保留；同名不同 URL 的 tab 不覆盖，返回冲突。没有发送聊天消息或触发模型的安装步骤。

公开 URL 的 phone 是 account/chat 的可逆编码，不是权限。Voice 必须用真实 OAuth 确认来电者，再由服务器用对应应用凭据签名具体 RPC。签名覆盖 method、完整参数、account/app/tenant/user/chat、时间。浏览器与模型不能提供这个 envelope，服务凭据不进入浏览器。

Gateway 仅接受管理员服务连接上带 `voice-feishu-actor-v1` 能力的有效签名，逐次读取当前 runtime config、验证真实成员资格，并调用**原有** Feishu ingress、pairing store、路由和 command authorization。无需独立个人名单或新的工具权限表。native tool policy 使用同一 sender、group、account；`senderIsOwner` 不再来自服务连接的 admin scope。

DM/group 的 route 必须仍对应原生飞书 peer。共享 main、别的 peer alias、topic、ACP 初始化拒绝接入。任务、结果、通话与 bearer capability 在同一服务连接内继续按真人/会话隔离。发送仅允许回到已确认的这个聊天。成员被移除或配置撤权后新请求拒绝；正在执行任务的中途撤权与恢复仍需真人集成测试。

新 RPC envelope 在 Gateway dispatcher 的原生 schema 校验之前消耗；不修改浏览器权限。`sessions.resolve` 与 `sessions.describe` 均按 `params.key` 验证。没有 envelope 的既有入口走原处理器。GPT 原生 SDK 接收可信 sender 与 Feishu delivery context；旧内部 chat.send fallback 拒绝动态 actor。

## 构建及验证

`lab/build-feishu-voice-actor.mjs` 从只读 runtime 基线生成本目录，逐个 patch 检查唯一 anchor，产物保留已有其他修复。源补丁与纯授权逻辑在 `lab/patch-feishu-voice-actor.mjs`、`lab/feishu-voice-actor.mjs`、`lab/feishu-voice-policy.mjs`。`candidate-files.json` 记录产物与 before/after hash，不包含环境或聊天数据。

合入前执行 `lab/candidate/feishu-multiuser-phone.plan.json`。候选加载真实 VLab runtime、原生 Feishu channel registry、ingress/routing/owner 和工具策略；配置、OAuth subjects、成员响应是明确的合成 fixture。电话 catalog 与执行共用原生工具解析；非 owner 的原生 exec 实际成功，原有 sender/group deny 保留，未使用模型或付费语音。

最新 26 项测试通过的 receipt 摘要在 `parity-candidate-evidence.json`。原始 receipt 留在本地 ignored `tmp/candidate/`，不把线上配置/日志/数据快照放入 Git。没有共享 VLab 写入、lease、共享 Gateway 重启、自动拨号、合并 dev 或生产发布。

## HTTP 回调握手与真实入口验证

V-Lab 测试应用使用独立 Candidate HTTP 回调，避免第二个长连接与共享实例随机竞争事件。实际观察到飞书的 URL 注册挑战仅携带加密正文，没有普通事件的签名头。`patch-feishu-webhook-challenge.mjs` 仅允许解密成功、类型为 `url_verification` 且 Verification Token 匹配的挑战返回结果；其他无签名/错签名事件仍然拒绝，不进入事件处理器。测试包括错误 token、普通事件、明文与损坏密文的拒绝。

真实用户先建空群再邀请 V-Lab，Candidate 收到真实 `im.chat.member.bot.added_v1`，自动创建唯一的「📞 打给 V」tab；API 回读和飞书客户端均确认。随后真实飞书 OAuth（仅既有身份标识授权）进入 Candidate「可以拨号」页。没有手工创建 tab、伪造事件或发起通话。机器人创建群、以及用户创建时直接携带 bot 的两次 API 实验未观察到入群事件和自动 tab，不能视为通过；当前已通过范围是先建群、再拉入机器人。

## 尚需真实集成验收

首次私聊所需的第二个真人账号姓名待用户提供。还需验证该账号首次打开 V-Lab 私聊时自动出现电话入口，以及该账号登录后的身份与原有能力。真实音频、模型工具调用及中途成员撤销未验证；合成 subject 和页面可拨号不等于这些场景通过。

用户当前明确要求独立 Candidate + V-Lab 飞书验证，不占共享 VLab，生产不动；本轮按该范围执行。后续合入和发布另按用户授权及项目流程进行。

官方规范核对：[群成员列表](https://open.feishu.cn/document/server-docs/group/chat-member/get)、[机器人进群事件](https://open.feishu.cn/document/server-docs/group/chat-member/event/added-2)、[进入机器人私聊事件](https://open.feishu.cn/document/group/chat-member/event/bot_p2p_chat_entered)。成员查询需要对应应用已具备该接口任一受支持权限；不追加个人日历、通讯录或离线授权 scope。
