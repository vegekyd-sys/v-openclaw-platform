# Voice 本地飞书只读查询（2026-10-11）

## 范围与根因

Gateway 已开启 `secrets.egressProxy`，无 admitted agent run 的 Voice `tools.invoke` → `exec` 被拒绝：`Secret egress proxy requires an admitted agent run instance`。不应为电话调用放宽 Gateway 的 exec 准入。

以已合入的 #337 / `725d6e7484c5e5bb32e2fc31874bc19ce4e7a74d` 为基线，只撤回 admission 源码、patch、release-files、candidate 与对应 catalog 测试登记。保留 `voice-lark-profile.mjs`、Voice 入口专用 CLI 配置副本和 StateDirectory 日志目录改动。

## 改动

- 生产 `server.mjs` 与 Candidate 注入同一个 `createVoiceLarkReader`，`session.mjs` 接收 `calendar` 和 `larkRead`。`feishu_calendar` 不再回退 Gateway exec。
- 本地子进程使用 argv 数组、`shell:false`、固定 `--as user --format json`，只允许经过生产 CLI help 核对的日历、通讯录、消息、云盘搜索和本人待办只读 shortcuts。可查白名单命令的 help；拒绝写入、发送、授权、任意 API、配置覆盖、输出文件和不受限分页。
- 必须使用本服务拥有的私有配置副本和已有 user token；不创建新的授权，不给子进程其他 provider API key。CLI exit 0 与返回 `ok:true` 缺一不可。
- 普通插话保留查询；明确取消或挂断中止本次电话的子进程组，并等 OS close 后释放所有权。超时或结果超限失败，不把未完成查询报成成功。
- `openclaw_tool` 和语音提示指向本地工具；写操作仍须用户明确授权后由后端 Agent 执行。Memory/Web/Gateway 其他系统的执行与准入规则保持原状。
- Voice 发布文件清单包含新模块，现有日历通话验收脚本改为读取 `tool.local-start/result`，不再期待 Gateway exec。

## 已验证

1. 96/96 针对性测试通过：本地 argv/身份/权限/业务返回、真实子进程退出、两种 direct provider 协议、普通插话、取消/挂断、服务与发布入口、私有 profile、catalog。
2. `node platform/cli.mjs audit`：`catalogValid:true`、`errors:[]`、274 个登记测试文件；原有未锁定 artifact warnings 未变化，不作为部署验收。
3. 在生产主机以现有 Voice UID/GID，使用预备的 Voice 私有 CLI 副本运行本轮 reader 的真实 `calendar +agenda`。返回 `calendarOk:true`、`exitCode:0`、`source:voice-local-lark`。不在 PR 中保留个人日程正文或凭据。
4. 上述真实查询前后生产 Gateway 与 Voice PID 未变化；本轮未改动生产/共享 Gateway、未部署 runtime payload、未重启服务。

5. Grok 真实模型连接（补充文字输入）：模型自行调用本地日历，CLI `ok:true`，工具结果交回模型后收到语音；客户端 barge-in 清除播放，继续获得新回复，模型调用 `end_call` 并发出告别音频。测试端模拟匹配的 `playback.drained` 后会话关闭，无后台 Agent 或 Gateway exec 调用。仅统计音频字节，不录制原始音频；真实浏览器播放与真人语音尚未验收。
6. 小何真实模型连接（独立 provider TTS 生成合成语音并按 24kHz PCM 实时输入，持续发送麦克风静音帧）：模型自行调用 `feishu_calendar`，真实 CLI `ok:true`，交回工具结果后收到实际模型回答音频；barge-in 清除播放，插话后收到新回复，语义告别调用 `end_call` 并产生告别音频，匹配的模拟 `playback.drained` 后关闭。未录制原始音频，无 Gateway exec 或后台 Agent 调用。首轮文字补充只注入历史、及未持续发送麦克风帧的脚本均不算通过；按真实输入协议重测成功。

## 发布与验收边界

只发布 Voice 入口及其 H5 文件，使用现有 `gpt-live-voice-entry-release.mjs` 的配置准备、备份、回滚与入口更新流程。Gateway 不部署、不重启。不要复用已经撤回的 admission candidate 或四个编译 runtime 文件。

本轮本地工具服务对应小何/SeedDuplex 与 Grok direct provider；GPT Live 原有 Gateway 后端路径不在本补丁改动范围。

真人通话“查本人日程 → 返回真实结果 → 插话继续聊 → 告别挂断”尚待入口部署后的验收，未把测试或 CLI 成功写成产品验收成功。共享 VLab 由其他 agent 占用时不抢 lease、不覆盖其发布或回滚。
