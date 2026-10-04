# GPT Live 双向语音体验复核（2026-10-03）

状态：已完成官方资料/native 契约复核、独立真实纯聊天观测和本地修复候选。用户反馈为等待播报过密、说话时不能及时打断；新版共享部署与真人复验仍须独立记录，不能作为完整实验验收。

## 官方已经说明的机制

- GPT-Live 支持同时听和说；用户插话时应停止当前回答并听。官方推荐保留 `Backchannel policy`、`Interruption policy`、`Delegation policy` 三个提示词标题。“moderate”不是数值频率设置。停止讲话与取消后台任务分开处理。[Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting)
- 公开 Live 的 `session.thinking.append` 提供静默上下文，`session.commentary.append` 提供需要口述的内容。应用应选择完整、已验证、可独立理解的阶段块，不逐 token 转播。内容最多 500 tokens，并保留关联 delegation ID。[Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
- `session.instructions.append` 可以打断正在进行的讲话。确认事件 `session.instructions.appended` 通过 `client_event_id` 对齐；确认只代表估计的上下文注入，不能证明播放已停止，也不是恢复播放的信号。[Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls)
- 可靠阻止用户继续听到旧语音，需要客户端或媒体桥 mute/drop 输出并清理过期待播音频。输入静音不会停止输出或后台任务。输出静音也不能证明模型已听懂插话。[Playback controls](https://developers.openai.com/api/docs/guides/voice-server-controls)
- WebRTC 应保持麦克风轨道持续运行；双方字幕独立增长。公开 Live 的 transcript delta 没有完整 turn 标记，WebRTC 音频由媒体轨道传送。[Managing sessions](https://developers.openai.com/api/docs/guides/live-conversations)

## 当前 native 与公开 API 的界限

本轮官方检索没有找到 exact `gpt-live-1-codex` / Quicksilver / `delegation.context.append` 的公开协议页。已打开的官方 Live 文档使用 `gpt-live-1`、`session.*` 和 `POST /v1/live/sessions`；其 project API key 路径不能代替当前已授权的 OAuth native 路径。[WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)

当前现场 builder 只有 model、instructions、audio.output.voice、delegation.client。本地 native bridge 支持 `session.context.append` / `delegation.context.append`，`content` 是 `input_text` 数组，channel 可为 `commentary` / `speakable`；`handleBargeIn()` 调用本地 `onClearAudio("barge-in")`，没有发送服务端 cancel。这只能证明既有客户端契约，不能证明数据通道已处理同样的中断或服务器已经停播。

公开 Live 已证实可用于兼容性探测的字段如下；英文内容为应用建议，事件结构来自官方：

```js
{
  type: "session.instructions.append",
  event_id: "interrupt_probe_1",
  delegation_id: null,
  content: "Stop speaking immediately. Listen to the caller and wait."
}
```

没有找到公开 Live 的 `session.turn.cancel` 或 `session.output_audio_buffer.clear`。GA Realtime 的 `server_vad`、`interrupt_response`、`response.cancel` 等只能作为另一协议的参考，不能未经验证发送到 native。native 未配置 GA VAD 字段本身不证明配置错误。[GA Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)

## 最小体验建议与验证

1. 等待只做一次简短确认；没有新事实便不再播报。完整的新阶段事实和最终结果才用 speakable，其他执行状态作为静默上下文或页面状态。具体频率是产品策略，需要真人听感验证。
2. 明确用户开始说话时让出讲话；普通打断保持后台任务继续，只有明确取消才走已有可信任务取消链。
3. 探测控制指令的 exact ack/error；不把“没有错误”视为被接受。若公开事件明确不受支持，单独记录既有 native context 契约的试验结果。
4. 分别验证麦克风仍发送、旧语音实际停止、模型正确回应新话题。浏览器静音只能验证第二项，不能冒充模型接话。

当前服务 metadata 没有人类插话时的完整数据通道与 PCM 边界，因此不能断言模型没收到声音或未发中断事件。任何下一轮真实测试需使用新的现场身份与当前授权，不沿用历史 PASS 作为本轮结论。

## 独立纯聊天兼容性观测

用户授权的共享空闲窗口内，用真实 H5、Chrome 与合成用户 PCM 完成一次 51.173 秒观测（2026-10-03）：`session.instructions.append` 收到 exact `client_event_id` 对应的 `error`，code 为 `invalid_value`。因此该控制没有被接受；证据没有保存原始错误全文，无法进一步确认是否为 event type 不受支持，也没有续发 native fallback。

之后的真实用户 PCM 要求改聊绿色；native `turn.done` 回复“好的,我喜欢绿色。”，对应新 assistant turn 有 6 个非零音频窗，解码远端 PCM RMS 为 1177.9（PCM16）。这只证明该样本的插话识别与新话题声音回传，不证明官方控制有效或人类实际能随时打断。数数本就要求每个数字停顿半秒，观察到的静音窗不能归因控制。

自己的 `/api/close` 返回 200，PC、麦克风、合成音轨/AudioContext、播放器与 Chrome 全部清理。没有部署、重启或配置变更。完整实验与真人听感验收仍未通过。证据：任务私有 `tmp/gpt-live-pr/duplex-probe/native-probe-receipt.json`；runner SHA `c622efdc74cc10124cd6fcd670ecbdabee7d32b048475e51d96dda2d5d52471a`。

## 本轮修复候选

真人共享通话在2026-10-02 15:49 UTC明确未通过等待与插话体验。元数据单个委托有8、7、13个progress帧，峰值每秒8帧；此项是发送密度，不能单独等同声学播放密度。

候选将一次请求的等待确认限制为一句，同一通话跨委托的公开进度每15秒最多一段不超过320 UTF-8字节的短事实；明显等待话术与连发/长文进入 native commentary 静默上下文，完整主任务最终结果仍按原值传递。等待句过滤是防重复话术的启发式，不能凭它证明任意剩余文本来自真实工具，因果验收继续独立执行。

H5在持续麦克风活动100ms后本地静音，保持麦克风、RTP消费与后台任务。仅静默250ms不能证明旧回答结束：旧回答的句间停顿可能重新漏出旧尾巴，因此恢复须先观察被冻结旧 assistant turn 的真实终止（或实际 native cleared），再从 gate 后真实远端音频观察250ms连续排空，并等用户静默450ms。排空可在用户仍讲话时确认；新的 turn.created、字幕、上下文 ack 均不能直接解锁。缺少终止/排空证据时保持压住旧语音并提示结束后重接，不能用超时伪造安全恢复。此项是本地播放控制；模型停止旧回答、理解新话题仍须真实会话证据。

取证仅接受实际speakable append作为语音因果候选。commentary、缺失或未知channel不得算新验收通过；停止讲话、原生新话题回应、后台继续及最终结果保真分别记录。

部署仍为PR 154候选。未经真人重新验收不合dev，不部署生产V。新部署、音频证据和共享回退以独立control manifest及运行手册的最新记录为准。

候选限制：短促“嗯”若被本地VAD捕获、而provider继续旧turn，本地会压住声音直到旧turn结束并排空；此策略仍需真人听感验证。不能把立即本地静音称作全双工体验已通过。

本地验证：candidate plan的17个测试文件共233项通过，包含本轮helper/app的47项与实际生成Native源码、进度节流、最终值/取消隔离、配置/trace及语音来源取证检查。语法及diff空白检查通过；这不代替新版共享语音与真人验收。
