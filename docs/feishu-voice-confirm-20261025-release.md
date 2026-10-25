# 飞书卡片确认电话身份：2026-10-25 发布验收

## 实际变化

用户从原飞书会话打开电话页，点击原拨号按钮后，页面在头像和 V 下方显示“回飞书确认一下，我等你”及核对标记。在同一飞书会话点击相符的确认卡后，原页面恢复拨号入口，可将当前账号与会话绑定到 iOS。

Gateway 仅在原生 SDK 验证的 `card.action.trigger` 入口处理 `v.voice.confirm.v1`，从 operator/context 取身份及会话，签名转发到配置指定的 Voice 服务；确认卡在普通卡片、审批和模型分发之前处理。没有新增模型决策或放宽工具授权。

## 版本与范围

- 平台源提交：`874b748dae1b45a3455ac2435da7cab7bc511308`，共享 dev：`bf271e72469025d12767a82bbfe11d78d9942fb0`。
- 共享产物：`voice-feishu-confirm-20261025`；SHA-256：`266274a570b6a4c71a9d04dd3145c02df20a661694665104a900da6a0a6f2d50`。
- 本次推广只有 Feishu `dist/monitor.account-WFdlCDhR.js` 与新增的 `dist/v-feishu-voice-confirm.mjs` 两个文件。完整 capture 同时归档此前已经运行的其他组件；不把归档新增量算作本次新功能。
- Voice 主分支：`ccebd66084d44d87cdf452b84741fe21c08d936a`；首页版本 `voice-feishu-confirm.20261025.1`。
- Native iOS 采用 Debug build 39 模拟器验收；此次服务发布不表示提交了新的 TestFlight 二进制。

## 共享 VLab 门禁

使用真实 Feishu 长连接回调、真实群成员查询及共享 Gateway 的 actor 解析和 `tools.catalog`。同一群内内部与外部两个账号分别确认成功；账号和租户哈希不同，群及会话哈希相同，工具目录分别为 127 和 114 项。网页显示对应账号，iOS 分别保存两个绑定并保留原有会话；过期绑定链接被拒绝。

候选 6 项、平台定向 4 项、Voice 955 项测试通过。网页提示位置与 reaction 已核对。此路径不调用模型，真实卡片和绑定验收没有发起付费音频通话。

共享临时配置按原 SHA-256 恢复，专用测试服务已停止。共享验收截图与脱敏审计保存在本机发布审计目录，不提交个人入口、原始身份、凭据或日志。

## 生产激活与验收

2026-10-25 21:40 CST，promotion 完成生产文件安装、六组件 capture、漂移期望更新和 align。比较 18,820 个文件，VLab 与 V 为 ALIGNED；生产漂移检查覆盖 9,222 个文件，0 findings。平台静态检查通过。

`v-self-restart` 请求 `20261025-212713-fa39` 等待既有编译任务自然完成后，于 21:46:32 停止旧进程，21:48:25 完成稳定性检查。Gateway PID 从 1041284 变为 1500835；2/2 streams 正常，5/5 workers 就绪，warnings 为空。

21:50，统一 fleet 发布完成 web/iOS 与上海 devices 两节点切换，均为 Voice `ccebd66084d44d87cdf452b84741fe21c08d936a`，产物 SHA-256 `07c1af61d86c461efee83314037808c7ff12c8797ddf808864d80af9914019db`。两个节点 ready、接入 hold 已释放，Voice 切换过程中 Gateway PID/Invocation 保持不变。21:57 幂等复核未改变两个服务 PID。

生产真实验收：原页面请求确认卡，真实飞书私聊点击匹配标记后，原页显示 Tianyi 身份和 V 私聊并恢复拨号；过期请求可从原按钮重试。随后使用页面生成的链接，在实际 iOS Debug 39 模拟器完成验证和保存，设置中显示对应姓名、V 私聊和当前入口，既有绑定保留。右侧模拟器镜像确认实际画面；生产首页更新日志已打开并验证最新条目。没有自动拨号或付费音频通话。

共享测试专用服务已停止、临时 phone-tabs 按原始 SHA 恢复、integration lease 已释放。

## 回滚

平台两个原文件由 promotion 保留在 `/opt/v-release-backups/v-feishu-voice-confirm-20261025-20261025T132151`，包含 `undo.json`。私有登录与标签配置的原字节分别保存在 `/opt/v-release-backups/voice-confirm-private-20261025`，恢复时保留原属主和权限。平台回退后仍使用 `v-self-restart` 激活并重新 capture/align。

Voice 双节点的原版本、启动参数、私有环境与切换回执由统一 fleet 发布工具保留。设备固件、真实手机麦克风、连续音频和打断体验不在本轮身份确认验收范围。
