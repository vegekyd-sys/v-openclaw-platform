# v-meeting-bridge

有人在群里或私聊里给 V 一个飞书会议号，让它进会，V 就以应用身份入会。之后会议字幕和会议聊天会作为新的回合，送进**叫它进会的那个会话**。回答问题的是这个会话里完整的 V，用同一段上下文、同一套工具和记忆，中间没有转述的模型。V 觉得该说话，回复会同时发到会议聊天区和原来那个聊天（加「【会中】」前缀）；觉得不该说，就回 NO_REPLY。会议结束后，V 在原聊天里发会后纪要，逐字稿和纪要都写进这个 agent 的 `memory/projects/meetings/sessions/`，私聊和群里都能搜到，可以接着聊。

V 只在有人明确让它进会时才进。插件不监听会议邀请，也不会自动入会（Tianyi 2026-11-18 定的）。

这是 2026-11-17/18 工作区脚本 `scripts/meeting-bridge/meeting_bridge.py` 的正式版。脚本版在 2026-11-18 那场真实会议（「V｜会议体验打通｜1117」群）跑通了：7 次回复、1 次判断不回、没有乱插话。正式版相对脚本版改了这些：

| | 脚本版 | 本插件 |
|---|---|---|
| 进程 | setsid 后台 Python，Gateway 重启后没人管 | Gateway 服务，记录落盘，重启后从 page token 和没送出的字幕接着跑 |
| V 的回合 | 每轮起一个 `openclaw agent` CLI 进程 | 进程内 `runtime.subagent.run`，`deliver:false`，再用 `waitForRun` 取 terminalReply |
| 回原聊天 | `lark-cli im +messages-send` | 渠道 outbound adapter，用 Gateway 自己的渠道凭据，不经过 lark-cli |
| 自己的回声 | 会议聊天里 V 的每条消息在逐字稿里记了两遍 | 按发出时拿到的 message_id 和发出的文本过滤，第一次回声时记下 selfId |
| 进度 | 没有 | V 可以用 `meeting_say` 先说一句；V 一直没出声时，12 s 发一个 `OnIt` 表情，60 s 发一句"还在弄" |
| 延迟 | 只记了说话时间 | 每条字幕记录从说完到拉到的延迟（p50/p95 在 `vmeeting.list` 里） |
| 截图 | 没有 | `meeting_screenshot`：截会议画面（共享屏幕、白板），V 再用看图工具看 |

## 工具（每个进程都注册；不在 Gateway 进程里时经 RPC 调用）

- `meeting_join { meetingNumber, waitMinutes? }`：入会，并绑定到当前会话和它的聊天。会议还没开始、或主持人还没打开「允许智能体入会」时，在后台每 10 s 重试一次，最多等 `waitMinutes`（默认 15 分钟）；等到超时就在聊天里说一声。
- `meeting_say { text }`：往当前会话所在的会议发一句话，同时镜像到聊天。
- `meeting_screenshot {}`：截会议画面，返回 JPEG 路径。需要 `vc:meeting.realtime:read`。
- `meeting_leave {}`：退会。立即返回，收尾和纪要在后台进行：这个工具本身就在绑定会话的一个回合里跑，如果等纪要写完才返回，纪要回合要排在它后面，就会死锁。

一个会话同一时间只绑定一个会议。

## Gateway 方法

`vmeeting.start`、`vmeeting.say`、`vmeeting.screenshot`、`vmeeting.stop`、`vmeeting.reload`（operator.write），`vmeeting.list`（operator.read）。参数和对应的工具一样，另外可以显式传 `sessionKey`、`agentId`、`delivery {channel,to,accountId}`、`workspaceDir`，方便不经过工具、直接由运维发起。

## 热更新（2026-11-25 起，不用重启 Gateway）

`core/` 里的代码（会议轮询、给 V 的提示词、回复过滤、lark-cli 调用、会议管理）可以热更新：

1. 把新的 `core/*.js` 装到插件目录（生产：`~/.openclaw/extensions/v-meeting-bridge/core/`）。
2. `openclaw gateway call vmeeting.reload --json --timeout 150000`

reload 按文件内容算版本号，复制到 `<stateDir>/v-meeting-bridge/core-versions/<版本>/` 后 import（ESM 按 URL 缓存，新版本必须换路径）。正在开的会不会断：每场会先跑完手上那一轮、存盘，新代码再从同一份记录接着听。文件没变就什么也不做。有会正在写会后纪要时会拒绝，过一会再试。超过 120 秒还没空闲就放弃，继续用旧代码。新代码起不来，会自动退回旧版本。

`index.js`、`core-loader.js` 和 `openclaw.plugin.json`（工具定义、Gateway 方法、服务本身）还是 Gateway 启动时加载的，改这几个文件仍然要重启。

## 飞书应用权限

| 权限 | 用来做什么 |
|---|---|
| `vc:meeting.bot.join:write` | 入会、读会议事件（字幕和聊天）、退会 |
| `vc:meeting.message:write` | 会中发文字和表情 |
| `vc:meeting.realtime:read` | 会议截图（可选；没有这项其他功能照常） |

每场会还需要主持人打开「AI 纪要」和「允许智能体入会」，飞书客户端版本不低于 7.68。会中发言（语音）要 `vc:meeting.bot.realtime:write`，这是飞书的限量共创权限，本插件不涉及。

## 配置

```json
{
  "enabled": true,
  "config": {
    "larkCli": { "bin": "lark-cli", "profile": "vlab-bot" },
    "progressEmoji": "OnIt",
    "timing": { "pollMs": 2000, "progressReactMs": 12000, "stillWorkingMs": 60000, "maxMinutes": 180 }
  }
}
```

`larkCli.profile` 选 Gateway 用户下 lark-cli 的哪个 profile，也就是用哪个应用的身份。生产 V 用默认 profile（V - Makaron）；共享 VLab 用 `vlab-bot`（V - Lab，`cli_aae2c999c7789bd9`，2026-11-18 已经加到 lab-db91-parity 用户下）。lark-cli 至少要 1.0.97，`+meeting-screenshot` 从这个版本起才有；VLab 主机上现在是 1.0.72。

会议记录存在 `<stateDir>/v-meeting-bridge/meetings/<meeting_id>.json`。

## 止血与回滚

- 停掉某一场会：调 `meeting_leave`，或者调 `vmeeting.stop { meetingId }`。
- 停用插件：先把配置里的插件改成 `enabled: false`，再删目录。还没结束的会议记录留在 store 目录里，以后重新启用插件时会接着跑；不想接着跑，就把对应记录的 `status` 改成 `ended`。

## 测试

```sh
node --test tests/v-meeting-bridge.test.mjs            # CI 入口
cd apps/v-meeting-bridge/plugin && node --test 'tests/*.test.mjs'
```

测试覆盖这些场景：字幕送进一个回合，回复同时发到会议和聊天；NO_REPLY 什么都不发；回声过滤和 selfId；回合进行中新来的字幕合并进下一轮；进度表情和"还在弄"，以及 V 自己先说过一句时两者都不发；会议结束后写纪要并发到聊天；入会重试和超时；Gateway 重启后从记录恢复；`meeting_leave` 不死锁；lark-cli 参数（`--as bot`、`--profile`）和错误分类。
