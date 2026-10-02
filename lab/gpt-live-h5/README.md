# GPT Live one 通话候选

独立 H5 使用现有 V 头像和样式，通过 `gpt-live-1-codex` / `sol` 的原生 WebRTC 连续传输音频。后台 consult 由同一个 Gateway 的原生 sideband 执行；网页不轮询完整答案，也不另外生成 TTS。临时 client secret 只保留在本机 bridge，浏览器交换 SDP。

仅供本机或 SSH 转发的私有实验，server 强制监听 `127.0.0.1`，不提供公开访问认证。不要把该服务直接发布到公网。正式外部入口应复用 `rtc-h5` 的访问 cookie 和每访客会话设计。首版一次支持一通实验电话，不连接飞书机器人。

页面预览（不会创建模型会话）：

```sh
GPT_LIVE_H5_PREVIEW=1 node lab/gpt-live-h5/server.mjs
```

真实候选运行需要 `OPENCLAW_CONFIG_PATH` 和 `GPT_LIVE_H5_RUNTIME_ROOT`，且候选配置的 `talk.realtime.provider` 必须为 `openai`。该 server 不修改 Gateway 配置；候选脚本只在自己的配置副本指定 provider、exact model、voice。`GPT_LIVE_H5_PORT` 默认 `26244`。通过 SSH local forward 后打开 localhost。

实验语音指令见 `instructions.mjs`；在候选配置副本的 `talk.realtime.instructions` 使用相同值。它要求进度只描述真实步骤，日期、时间、数字与时区等待完整后台结果并保留原值。此提示词是模型约束，不能代替结果保真验收；共享配置更新仍按批准与 lease 流程执行。

先检查开始/结束/重新开始、麦克风权限拒绝和连接失败恢复；再验收后台阶段结果真的播出、说话中插话、补充条件被采纳、取消后无旧结果播出。文字补充和取消调用现有 `talk.client.steer`，服务端失败时不会伪装成功。声音插话依赖 GPT Live 原生能力，尚待真实浏览器和真人听感验收。
