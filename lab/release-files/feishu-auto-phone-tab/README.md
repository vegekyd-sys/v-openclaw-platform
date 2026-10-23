# 飞书私聊顶部电话标签候选

用户进入机器人私聊后，在已开启的账号和试用名单内检查「📞 打给 V」顶部 URL 标签。缺失时新增一个，已有相同标签时沿用；同名不同链接报告冲突，不覆盖用户内容。不发送欢迎消息，不触发模型，也不使用机器人悬浮菜单。

## 运行配置

`OPENCLAW_FEISHU_PHONE_TABS_FILE` 指向账号独立的 0600 普通 JSON 文件；不接受软链接，未设置时功能关闭。配置不得加入 Git。

```json
{"version":1,"accounts":{"default":{"enabled":true,"appId":"cli_EXAMPLE","allowedOpenIds":["ou_EXAMPLE"],"url":"https://voice.example/voice/feishu"}}}
```

通用入口经飞书登录后由 Voice 服务解析用户及会话。多用户上线必须使用通用登录 URL，并在 Voice 服务注册各用户独立身份和权限；不能把 Tianyi 的 `?phone=...` 私人入口复制给其他用户。当前仅单用户试验，尚未证明多人覆盖。

飞书应用需要 `im:chat.tabs:read`、`im:chat.tabs:write_only`，以及 `im.chat.access_event.bot_p2p_chat_entered_v1` 事件订阅。VLab 测试应用在 2026-10-23 已启用两项权限，并以 1.0.4 发布事件配置，原悬浮菜单停用；正式 V 未改。

## 验证

`node --test lab/feishu-phone-tabs.test.mjs`：11 项通过。涵盖首次新增、重入、POST 回包丢失、同名冲突、错误退避、错误用户/群聊、队列合并/上限/停止、URL 与文件配置校验、默认关闭、无关事件保留及独立静默 SDK 客户端。

`candidate-evidence.json` 是脱敏回执：实际补丁后的 Feishu monitor + 实际 SDK EventDispatcher，输入为模拟进入事件；向真实飞书 API 验证已有私人标签、重复进入 10 次不重复新增、名单外 actor 不执行 API、原有标签完整保留。SDK 的真实错误路径也已执行，stdout/stderr 未输出请求凭据。候选使用独立 API 客户端保留原代理/域名/超时配置，避免 SDK 默认错误日志输出请求头；不修改共享消息客户端日志行为。

事件确认耗时 1.02ms；候选 API 验证 13.2 秒，独立快照 4.2 秒。没有启动第二个机器人长连接、Gateway、模型 turn 或发送消息；共享 Gateway PID 不变。聊天消息 debounce 仅为注册时占位依赖，若被调用立即抛错，没有测试消息处理。

未覆盖：真实飞书推送触发、真实缺失标签的首次创建、多用户身份/权限与手机最终体验。当前真实 DM 已有用户安装的标签，没有删除它以制造测试条件。

## 合入与回滚

分支 `codex/feishu-auto-phone-tab`，遵循仓库 AGENTS.md：用户批准后才合入 dev 和共享 VLab 集成。发布计划固定到 `nightshift-throughput-v1` 的实际文件 SHA；若共享基线变化，重新读取基线并应用 patch 函数，不能强制覆盖。

`release-plan.json` 部署两个最小补丁的 runtime 文件与独立模块。事件处理默认关闭；共享验收时仅配置已有试用者及其现有入口。关闭配置中的 enabled 即停止后续补齐；删除环境变量并按 VLab release 流程回滚代码可完整回退。已存在的用户标签不会自动删除。

来源：[飞书会话标签页](https://open.feishu.cn/document/group/chat-tab/chat-tab-overview)、[进入机器人会话事件](https://open.feishu.cn/document/group/chat-member/event/bot_p2p_chat_entered)。
