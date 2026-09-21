# V × 小何 RTC Agent（OpenClaw 2026.9.1）

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
```

Provider 可以用 `botId`，也可以先用唯一的 `botName: "小何"` 自动读取控制台保存的
`Config + AgentConfig`。AppKey 通过服务端 `DescribeAppKeys` 获取，不需要复制到
OpenClaw 配置。

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
`voiceChat` 和 `appKey`，用于离线固定配置，但生产首选控制台智能体。

## 验收边界

已经自动验证：OpenAPI 官方签名向量、房间创建/停止、控制台小何配置解析、浏览器 SDK
加载、RTC TLV、Function Call 到 V 以及结果回传、Node 22 candidate 和现有 Seeduplex
回归。

尚未自动外推为通过：真实火山账号进房、真实麦克风/扬声器、iPhone Safari、长语音、
停顿后的第二/第三句、后端工具完成后的连续播报。只有部署到共享 VLab 并完成这些真实
场景，才能判定用户体验问题解决。
