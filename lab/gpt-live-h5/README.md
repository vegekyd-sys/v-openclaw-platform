# GPT Live one 通话候选

2026-10-02：源码已撤回 dev，仅保留在独立 PR 候选分支 `codex/gpt-live-streaming-call-pr`。共享试跑未通过并已回退，本任务占用已释放，共享现由其他任务使用。PR 新基线 62 项相关测试通过，完整功能仍未通过；此目录不表示当前共享实例部署了它。

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

重新合入前必须用完整 H5 验证 `sessions_spawn → sessions_yield → 子任务完成 → 父任务恢复最终结果 → 同一有效 Live 会话实际播放`，并核实提前进度确实来自后台公开输出、符合真实执行阶段；当前均未通过。还须覆盖讲话打断不等于任务取消，以及 owner/generation 失效、关闭、改口、迟到结果和重复 completion 的保护。

现有 plan baseline、receipt、部署 hash 和收尾状态仅是历史记录。用户已授权在 PR 中继续开发；未来运行须重新核对 runtime、配置、认证、插件与占用，重新合入及共享验收仍需当前补丁的新授权，不能直接沿用旧基线或旧批准。
