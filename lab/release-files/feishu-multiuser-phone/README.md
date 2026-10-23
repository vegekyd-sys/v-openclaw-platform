# Feishu 多账号自动电话：Candidate v1

2026-10-23。配套 Voice 分支：`codex/feishu-multiuser-phone-20261023`。本目录为候选产物，不是已部署 release。

## 行为与授权

电话入口对新群机器人加入、进入机器人私聊、首条消息事件自动安装；以 account/chat 幂等合并，配置每次刷新。只有私有 tab 配置显式启用 `conversations:true` 才打开此模式。旧 `allowedOpenIds` 模式及其已有 tab 保留；同名不同 URL 的 tab 不覆盖，返回冲突。没有发送聊天消息或触发模型的安装步骤。

公开 URL 的 phone 是 account/chat 的可逆编码，不是权限。Voice 必须用真实 OAuth 确认来电者，再由服务器用对应应用凭据签名具体 RPC。签名覆盖 method、完整参数、account/app/tenant/user/chat、时间。浏览器与模型不能提供这个 envelope，服务凭据不进入浏览器。

Gateway 仅接受管理员服务连接上带 `voice-feishu-actor-v1` 能力的有效签名，逐次读取当前 runtime config、验证真实成员资格，并调用**原有** Feishu ingress、pairing store、路由和 command authorization。无需独立个人名单或新的工具权限表。native tool policy 使用同一 sender、group、account；`senderIsOwner` 不再来自服务连接的 admin scope。

DM/group 的 route 必须仍对应原生飞书 peer。共享 main、别的 peer alias、topic、ACP 初始化拒绝接入。任务、结果、通话与 bearer capability 在同一服务连接内继续按真人/会话隔离。发送仅允许回到已确认的这个聊天。成员被移除或配置撤权后新请求拒绝；正在执行任务的中途撤权与恢复仍需真人集成测试。

新 RPC envelope 在 Gateway dispatcher 的原生 schema 校验之前消耗；不修改浏览器权限。`sessions.resolve` 与 `sessions.describe` 均按 `params.key` 验证。没有 envelope 的既有入口走原处理器。GPT 原生 SDK 接收可信 sender 与 Feishu delivery context；旧内部 chat.send fallback 拒绝动态 actor。

## 构建及验证

`lab/build-feishu-voice-actor.mjs` 从只读 runtime 基线生成本目录，逐个 patch 检查唯一 anchor，产物保留已有其他修复。源补丁与纯授权逻辑在 `lab/patch-feishu-voice-actor.mjs`、`lab/feishu-voice-actor.mjs`、`lab/feishu-voice-policy.mjs`。`candidate-files.json` 记录产物与 before/after hash，不包含环境或聊天数据。

合入前执行 `lab/candidate/feishu-multiuser-phone.plan.json`。候选加载真实 VLab runtime、原生 Feishu channel registry、ingress/routing/owner 和工具策略；配置、OAuth subjects、成员响应是明确的合成 fixture。原生 tools.invoke 的 memory_search 与 exec 拒绝测试实际经过处理器，未使用模型或付费语音。

最终通过的 receipt 摘要在 `candidate-evidence.json`。原始 receipt 留在本地 ignored `tmp/candidate/`，不把线上配置/日志/数据快照放入 Git。没有共享 VLab 写入、lease、Gateway 重启、飞书发信、自动拨号、合并 dev 或生产发布。

## 尚需真实集成验收

第二个真人账号尚缺。还需两位真实用户 OAuth、两个真实群与两个私聊的入口创建/刷新、成员撤销和各自工具账号、真实模型工具调用、手机音频/打断/重拨。合成 subject 不算真人验收，模块候选通过不算共享 Gateway/客户端通过。

本改动涉及身份、工具策略和跨服务协议，最后走共享 VLab。按项目规则由 Tianyi 决定合入 dev 后取得空闲 lease，打包前重新核对 runtime/config/before hash；集成完毕按 VLab 流程回滚或经另行授权推广，不能占着共享环境等待第二个账号。生产不在本任务授权范围。

官方规范核对：[群成员列表](https://open.feishu.cn/document/server-docs/group/chat-member/get)、[机器人进群事件](https://open.feishu.cn/document/server-docs/group/chat-member/event/added-2)、[进入机器人私聊事件](https://open.feishu.cn/document/group/chat-member/event/bot_p2p_chat_entered)。成员查询需要对应应用已具备该接口任一受支持权限；不追加个人日历、通讯录或离线授权 scope。
