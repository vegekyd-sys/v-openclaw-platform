# 私聊菜单直达电话候选

用户要求默认输入框，切换菜单后点「打给 V」直接进入既有电话页。不得发中转入口卡，不得要求首次回顶部确认，群聊保持原状。前一轮发卡方案已否决并回退，本候选不包含它的菜单事件或专用确认 action。

原生 `bot_p2p_chat_entered` / p2p 消息事件通过当前 SDK 接收后，只读核验实际聊天类型与操作人 membership，并将 app/open_id 对应的 chat_id 原子写入 0600 的服务端定位目录。配置未启用目录时不增加 API 请求；群事件不进入目录流程，原群菜单和原电话入口逻辑保持原实现。

Voice 的静态菜单 URL 使用 `phone=feishu_self`，复用当前 H5、SDK 身份交换和 Gateway actor-scoped 准入。身份确认后，服务端按该 actor 定位自己的 DM；页面原地更新为标准会话入口。目录不是授权证明，Gateway 仍校验当前成员关系、原文本聊天策略及工具权限。首次事件与网页并发时最多等待五秒；无法确认时停止，不发送中转卡、不猜其他会话、不静默切到 Public。

## 配置与构建

Gateway 既有 phone-tabs 0600 配置中，本应用账号可选 `privateConversationsFile` 绝对路径。Voice 的私有登录配置用同名字段读取该目录。生产、群聊及既有配置未启用该字段时保持原行为。运行目录必须服务端持有，不发布目录内容、凭据或入口绑定。

`lab/build-feishu-private-direct.mjs BASELINE_MONITOR` 从核验后的当前 monitor 构建三个受控文件；只为私聊进入事件补充明确的事件类型，其余 monitor 代码保留。平台合入及受控部署仍按 lab/README.md；不能热改共享 runtime。

## 当前证据

- Voice `c95d925` 完整本地回归 972 项通过；等待首次事件的后续修改 `7565b69` 定向 31 项通过。
- 平台本地 23 项通过；VLab candidate `candidate-4377ab16-dc9f-4438-8131-c41f9b995e47` 共 24 项通过，input SHA `2574486dea9fbee66808931b22dc0f4afbb52653eea230533af3e7e8f0b2acca`。
- VLab 测试加载实际原生模块和 SDK，为已存在的 pilot DM 注入标注为 synthetic 的进入事件；真实 GET API 核验 p2p 与成员关系，未发送消息、未修改群菜单、未启动第二个机器人连接，sharedUnchanged=true。该结果不是新私聊的真人推送验收。
- 已有私聊真人直达、真正新私聊、外部账号：仍待实际操作，不能标记通过。用户已说明稍后登录新测试账号。
- 外部账号须验证实际 SDK 能力及既有身份状态；不得以内部账号通过推断外部首次通过，也不得重新引入私聊独立确认路线。

当前只做 VLab 候选，不合并 Voice main 或发布生产。共享 VLab 的平台集成必须使用本改动的明确 dev 合入授权；未取得授权前只执行独立 candidate 与隔离电话页。
