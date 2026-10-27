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
- 用户授权后已合入 dev：`5fedf65d2a576e2ec52b9ba03a99fd61a0d7548d`。共享 VLab 受控部署 `dm-phone-direct-20261027-v1`，artifact SHA `27f861bc5df182eecd9325e8725cbfc0e5b6b8a78766689c94b744dc1d02b1a7`；仅 readiness，尚未 accept。
- Voice 隔离预览运行 `7565b691fa35b229767f079cd9ec9f581babe3d8`；V - Lab 应用 1.0.13 已发布可切换菜单、默认输入框、URL 直达，并移除了用户误加的链接预览能力。未合并 Voice main 或发布生产。
- 内部已有私聊真人验证通过：默认输入框 → 切换菜单 → 打给 V → 右侧共用电话页，自动显示本人身份和「飞书单聊」。未发送新入口卡、未操作顶部入口、未手动确认、未拨号。
- 清空本候选定位目录后，真实进入上述已有私聊的事件重建映射；约 4.77 秒完成自动身份显示。这是已有私聊的冷映射验收，不是真正新私聊。
- 首次实测发现 Gateway 的 ProtectSystem=strict 不允许写隔离 Voice 私有目录；将定位目录移至 Gateway 既有可写 state 子目录、保持目录 0700 / 文件 0600 后通过，未放宽系统保护。
- 群菜单、原私聊顶部标签、私聊最后消息的 API 前后摘要一致；没有新增中转消息。平台群事件路径定向回归通过。
- 外部已有账号的真实进入事件已写入第二条映射，但同一客户端未显示底部菜单；此项未通过，尚未证实原因，不可推断为官方不支持。
- 真正新私聊仍待用户稍后登录符合条件的账号；不能用清空已有映射代替。
- 外部账号须验证实际 SDK 能力及既有身份状态；不得以内部账号通过推断外部首次通过，也不得重新引入私聊独立确认路线。

用户要求撤出共享 VLab，为其他 session 释放集成槽。本候选不继续常驻共享环境；代码、构建脚本与上述未完成验收项保留在平台 PR #495 和 Voice PR #166，供后续发版集成。不得把已有内部私聊结果写成外部账号或真正新私聊通过，也不得随其他版本未经补验上线。


## 撤出共享 VLab（2026-10-27）

按用户要求已通过 vlab.mjs rollback 撤回 dm-phone-direct-20261027-v1，恢复 unified-session-20261027-v3（runtime SHA cb2f9e4eb91871822dcd7c34ef9286cc97f196d616950edb80745b11fda15de5）。Gateway 已就绪，integration lease 已释放。本轮 phone-tabs 配置按备份原字节恢复；独立 Voice 和临时隧道均在 idle 后停止。代码继续保存在 PR 中，不占共享集成槽。
