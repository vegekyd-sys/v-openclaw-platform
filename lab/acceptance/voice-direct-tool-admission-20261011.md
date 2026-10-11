# Voice 直接工具调用修复（候选）

## 问题与改动

2026-10-11 生产语音直接调用 `exec` 在命令执行前报 `Secret egress proxy requires an admitted agent run instance`。修复只为已授权 session、owner 身份且声明 `voice-direct-tools` 的 `exec` 创建 Gateway 内部准入身份。身份不接受 RPC 参数传入，原 session 授权、工具策略、审批 hook 和密钥出口保护保留。

直接命令等到真正完成才释放身份；明确 deny、错误和 host abort 均清理该身份。没有该内部身份的普通 exec 保留原后台续跑行为。此处没有修改 Worker、飞书消息渠道、夜班调度或模型路由。H5 挂断与正在执行的 foreground RPC 的全链路取消，仍需共享集成自然通话覆盖，本候选不把 host abort 测试称为该项验收。

只读排查还发现 Voice 指向旧的飞书 CLI 配置：新版 CLI 自动在配置根目录追加 `openclaw`，要求 native binding，而 `config bind` 会重置用户列表。发布准备阶段创建 Voice 专用私有 workspace，保留同一个应用、已有用户记录和加密 token 数据目录。bot-only、不同应用、多应用歧义、已有目标目录、绑定失败、用户 token 不可用均拒绝切换；原共享 profile 不改写。该副本尚未被活动 Voice 服务使用。

文字与头像日志原默认目录位于只读主目录。Voice unit 使用独立 `StateDirectory=openclaw-voice-h5`，目录 0700、日志 0600，继续保留 `ProtectHome=read-only`。每日拉取脚本已支持从当前 Voice 进程环境读取 `RTC_H5_TRANSCRIPT_DIR` / `RTC_H5_AVATAR_LOG_DIR`，不修改其他任务的采集脚本。

## 已完成验证

- 94 项离线回归通过：原生工具授权、直接工具调度、Worker 运行身份与进程归属、错误与取消、CLI profile 隔离、切换/回滚、文字与头像隐私日志。
- 真实候选 runtime + 原生 secret egress proxy：原始实现复现 500；修复后执行成功。模型要求后台返回时仍等待终态；非 owner / 非 Voice 不增加权限；显式工具 deny 生效；host abort 释放相同身份。
- 候选 receipt：`candidate-1310a4e7-9b79-4104-a592-8f48738aa14c`，基线 `voice-content-product-20261011-v3`，四文件 overlay 含 before hash，共享 Gateway PID 前后均为 `2996085`。
- 真实 systemd fixture：`ProtectHome=read-only` + 专用 StateDirectory 下，两类日志实际写入成功并验证 0700/0600。receipt：`candidate-94f9fdfa-f139-483f-ab8d-24481cc0a93c`。fixture service 和目录已清理。
- 候选没有本人 CLI profile，因此没有把该项标为候选飞书 API 验收。另在生产主机以现有 Voice UID/GID 与实际发布 helper 创建隔离绑定副本，既有 user token ready，同应用 `calendar +agenda --as user --format json` 返回 `ok=true` / exit 0；原 profile 与 Gateway/Voice service PID 不变。未发送消息、改日程或改生产服务。

## 发布边界

当前仅任务分支修复与候选验证；未合入 dev、未部署共享集成 Gateway、未上线。当前补丁涉及 Gateway，需用户批准合入 dev 后取得 integration lease，完成共享 VLab 自然通话（飞书查询返回、插话、后台任务、挂断）验收，再部署同一产物并做生产语音验收。

用 `lab/patch-voice-direct-exec-admission.mjs` 在待发布的确切 runtime 基线上生成四文件。不要用旧整文件覆盖其他任务的新补丁；基线改变时重新生成并重测。发布 CLI workspace 由现有 `gpt-live-voice-entry-release.mjs` 准备，binding/token 检查在服务停止前执行。失败保留旧入口。

回滚：Gateway 回到之前验收的完整产物；Voice 按已有 receipt 恢复原 pointer 与原 launch drop-in。共享 CLI profile 不变，新 Voice workspace 在回滚后不再引用。日志目录保留用于审计，不删除历史记录。
