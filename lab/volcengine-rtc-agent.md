# V × 小何 RTC Agent（OpenClaw 2026.9.1）

Control UI 中显示为 `volcenine-rtc`，内部稳定 ID 仍为
`volcengine-rtc-agent`。在 `/settings/talk` 选择该项后，新建的语音会话走小何 RTC；
选择 GPT Live One 时仍走原来的 GPT Live 链路。Provider 选择不绑定固定 Session，
启动语音时沿用当前 Control UI 会话的 `sessionKey`。

这是现有 GPT Live One `provider-direct` 思路在火山 RTC 上的对应实现：浏览器直接加入
火山 RTC 房间，音频采集、VAD、转录、打断、生成和播放都由火山 RTC/小何负责；OpenClaw
Gateway 只签发房间、保存 Talk 会话，并在小何发起 Function Call 时调用 V。

它不升级 OpenClaw，也不改变 Node 主版本。构建和 candidate 固定以当前
`talk-input-stall-v1`（OpenClaw 2026.9.1、Node 22）为基线。

## 数据路径

```text
browser microphone --WebRTC--> VolcEngine RTC / 小何 --WebRTC--> browser speaker
                                      |
                                 Function Call
                                      |
                                      v
browser control message --> talk.client.toolCall --> V / DeepSeek Flash
                                      |
                                 function result
                                      |
                                      v
                              小何继续自然播报
```

浏览器不再上传 PCM 到 Gateway，也不在 OpenClaw 内做 VAD、重采样、播放排队或语音
回传。允许转交给 V 的工具只有 `openclaw_agent_consult` 和
`openclaw_agent_control`；未知工具会被拒绝，重复 call ID 不会执行两次。

## 服务端配置

凭据只放服务环境，不进入 Git、浏览器或 `roomUrl`：

```text
VOLCENGINE_ACCESS_KEY_ID
VOLCENGINE_SECRET_ACCESS_KEY
RTC_APP_ID
RTC_APP_KEY
RTC_AGENT_USER_ID
```

Provider 可以用 `botId`，也可以先用唯一的 `botName: "小何"` 自动读取控制台保存的
`Config + AgentConfig`。`RTC_APP_ID` 与 `RTC_APP_KEY` 必须来自 RTC 应用管理，AppKey
只放服务端环境；控制台查询接口不会返回它。若智能体配置没有 `AgentConfig.UserId`，
Provider 会使用 `RTC_AGENT_USER_ID` 作为 RTC 里的小何用户 ID。

```json
{
  "talk": {
    "realtime": {
      "provider": "volcengine-rtc-agent",
      "mode": "realtime",
      "transport": "managed-room",
      "brain": "agent-consult",
      "providers": {
        "volcengine-rtc-agent": {
          "botName": "小何",
          "agentModel": "deepseek/deepseek-v4-flash"
        }
      }
    }
  }
}
```

如果控制台存在重名智能体，Provider 会拒绝启动并要求改用精确 `botId`。也可以显式提供
`voiceChat`，用于离线固定配置；生产首选控制台智能体，但 AppKey 始终必须由服务端配置。

## 验收边界

已经自动验证：OpenAPI 官方签名向量、房间创建/停止、控制台小何配置解析、浏览器 SDK
加载、RTC TLV、Function Call 到 V 以及结果回传、Node 22 candidate 和现有 Seeduplex
回归。

尚未自动外推为通过：真实火山账号进房、真实麦克风/扬声器、iPhone Safari、长语音、
停顿后的第二/第三句、后端工具完成后的连续播报。只有部署到共享 VLab 并完成这些真实
场景，才能判定用户体验问题解决。
