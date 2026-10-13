# GPT Live one 通话候选

当前状态（2026-10-04）：用户真人体验后已明确授权完成 UI、主动问候与模型挂断工具，再经 VLab 验收并上线 V。原实验未通过项保留，在 Candidate 中继续。本轮交付、重启和分阶段验收边界见 [首版发布计划](../../docs/gpt-live-call-release-20261004.md)。实际部署与验收以新发布 receipt 为准，不继承历史 current/PID/hash。

## 三模型内容阅读 UI（2026-10-10）

GPT Live、小何和 Grok 共用实际 `app.js`、通话控件和 transcript presentation。桌面为头像与聊天两列；手机使用紧凑头像、较大的正文和底部控制 pill。手机补充输入默认收起，点击键盘图标展开；收起保留草稿，服务端接受后才清空。

`backend.result` 的原始完整文本保留在卡片中，展开后安全渲染 Markdown、表格和列表，可保存为 Markdown。较长文档或有标题的报告在当前通话中自动展开一次，短查询保留为安静的卡片；收起返回原聊天位置。明确的 Markdown 图片和带媒体扩展名的视频链接可以作为独立媒体卡片，按需加载，视频不自动播放，关闭时暂停。仅允许 HTTPS 或同源 HTTP；不执行模型返回的 HTML、iframe，不读取任意本地文件路径。后端仅返回文件路径时，需要另行提供可访问附件，阅读层不会假装已取得文件正文。

阅读层移动原有通话控件和正在运行的头像节点，保留同一通电话、任务取消、文字补充与 Reaction。静音按钮只切换本通电话的麦克风 track.enabled；报告开关不改变音频传输或任务路由。服务端公开模块列表、Candidate support 和 `H5_PATHS` 发布清单包含新增的两个浏览器模块。

验证：

```sh
node --test lab/gpt-live-h5/*.test.mjs lab/gpt-live-h5-release.test.mjs
```

浏览器还需检查桌面/手机布局、报告展开收起、媒体按需打开、草稿、阅读中挂断与取消，以及三模型真实拨号。自动回归和静音输入连接验证不代表物理 iOS 播放、声学回声或最终回复插话已经验收。

以下为历史实验记录：

2026-10-02：源码保留在独立 PR #154（`codex/gpt-live-streaming-call-pr`），未合入 dev。原共享试跑失败并已回退。修复后的候选在真实 H5/WebRTC 路径通过一次严格私有验证：exec 随机码 9959 在最终结果前约 19 秒实际播出；子任务完成、父任务自动恢复，同一通电话最终准确播报码值及六字段时间；一份 final、无重复镜像，关闭后麦克风与 RTC 清理。143 项相关测试通过，控制路径的 14 项本地回归通过，真实插话/取消/重连仍待运行。共享部署与用户亲耳验收尚未完成。

独立 H5 使用现有 V 头像和样式，通过 `gpt-live-1-codex` / `sol` 的原生 WebRTC 连续传输音频。后台 consult 由同一个 Gateway 的原生 sideband 执行；网页不轮询完整答案，也不另外生成 TTS。临时 client secret 只保留在本机 bridge，浏览器交换 SDP。

仅供本机或 SSH 转发的私有实验，server 强制监听 `127.0.0.1`，不提供公开访问认证。不要把该服务直接发布到公网。正式外部入口应复用 `rtc-h5` 的访问 cookie 和每访客会话设计。首版一次支持一通实验电话，不连接飞书机器人。

页面预览（不会创建模型会话）：

```sh
GPT_LIVE_H5_PREVIEW=1 node lab/gpt-live-h5/server.mjs
```

真实候选运行需要 `OPENCLAW_CONFIG_PATH` 和 `GPT_LIVE_H5_RUNTIME_ROOT`。H5 的 `talk.client.create` 明确指定 `openai` provider、exact model 和 voice，Gateway 必须支持这些会话参数；共享 Talk 全局 provider 可以保留原值。该 server 不修改 Gateway 配置。`GPT_LIVE_H5_PORT` 默认 `26244`。通过 SSH local forward 后打开 localhost。

实验语音指令见 `instructions.mjs`；在候选配置副本的 `talk.realtime.instructions` 使用相同值。它要求进度只描述真实步骤，日期、时间、数字与时区等待完整后台结果并保留原值。此提示词是模型约束，不能代替结果保真验收；共享配置更新仍按批准与 lease 流程执行。

先检查开始/结束/重新开始、麦克风权限拒绝和连接失败恢复；再验收后台阶段结果真的播出、说话中插话、补充条件被采纳、取消后无旧结果播出。文字补充和取消调用现有 `talk.client.steer`，服务端失败时不会伪装成功。声音插话依赖 GPT Live 原生能力，尚待真实浏览器和真人听感验收。

2026-10-02 共享试跑发现子任务 yield 后的 completion 权限与原语音 delegation 续传均未通过；不能把“已交办”的第一次 tool.result 当成完整终态。完整记录见 [共享试跑记录](../../docs/gpt-live-shared-trial-20261002.md)。

重新合入前必须用完整 H5 验证 `sessions_spawn → sessions_yield → 子任务完成 → 父任务恢复最终结果 → 同一有效 Live 会话实际播放`，并核实提前进度确实来自后台公开输出、符合真实执行阶段；私有主链路已通过，共享主链路与真实 controls 仍待运行。还须覆盖讲话打断不等于任务取消，以及 owner/generation 失效、关闭、改口、迟到结果和重复 completion 的保护。

现有 plan baseline、receipt、部署 hash 和收尾状态仅是历史记录。用户已授权在 PR 中继续开发；原共享授权已被本轮退出共享、Candidate 修复要求更新。受控 PR 试运行与回退见 [运行手册](../../docs/gpt-live-pr154-shared-runbook-20261002.md)。
