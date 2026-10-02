# GPT Live 与 V 的实时通话实验

2026-10-02。状态：独立 worktree 中已实现候选源码，局部测试通过；本文是可审阅的实验设计，不代表已合入 dev、已部署共享 VLab、已上线 V 或已通过真实听觉验收。

目标是让用户与 GPT Live 连续交谈时，V 能在后台办事，并把可公开的进度和已确认的部分结果及时带回谈话。用户可以在播报中补充、纠正或取消需求，不必等待一次完整的后台回答才能再次开口。首版先验证浏览器通话，再验证手机浏览器；电话接入留给下一阶段。

## 场地判断与当前基线

本实验需要修改 consult 的输出桥接、任务状态与语音交互代码，属于 V 运行链路改动，应在任务 worktree 开发和独立 candidate 中测试，然后经用户明确授权合入 dev，再进入共享 VLab 最后验收。现有线上网页可用于观察和对照，不应直接热改生产实现。

本任务开始时（2026-10-02）的现场核对结果如下。运行状态会变化，共享写入前重新核对；后续并行部署变化记录在阶段边界。

| 项目 | 已核实状态 | 对本实验的影响 |
| --- | --- | --- |
| 共享 VLab | 开始时 `memory-search-1s-20261002` 已 accepted，与 V 为 ALIGNED，当时无 integration lease | 此状态来自本任务现场核对；候选开发不占共享槽位，部署与重启仍需取得 lease |
| 线上 H5 | `https://openclaw.tianyi.live/voice/`；`openclaw-rtc-h5.service` 活跃，当前 release 为 `65051986429b3b06df199ba520481facde9c2093` | 网页强制使用 `volcengine-rtc-agent` 的 managed room；不是 Gateway 默认模型的直接前端 |
| V 默认 Talk | OpenAI native，exact model 为 `gpt-live-1-codex`，voice 与 speakerVoice 为 `sol` | 首版沿用已有 OAuth、模型、声音与 direct WebRTC 路径，不默换为 `gpt-realtime` 或 API 模型 |
| H5 consult | 每个浏览器专用 voice H5 session，token 留在服务端；等待最终结果后 HTTP 返回 | 需要改造输出流，不能只替换前端模型名称 |
| native consult | sideband controller 同样等待完整 `runAgentConsult` 结果后 append | 首版从这里补可公开的流式回调 |

线上库存依据是 SSH 只读配置与服务检查；H5 对应 `lab/rtc-h5/server.mjs` 的会话和 consult 逻辑。native controller 现场读取的基线 hash 为 `e7a27df564dc8296dba853e27752f592f68ebf660736176793ede1bbb2762679`。这些记录证明基线，不证明新实验行为已通过。

## 首版架构

```text
浏览器或手机麦克风  ── WebRTC 音频 ──  GPT Live native
                                           │
                                  同一会话的 sideband
                                           │
                               应用的委托与任务状态控制器
                                           │
                                      V agent consult
                                           │
                              公开 partial 与 preamble 回调
                                           │
                               native append → Live 播报
```

浏览器音频直接走现有 WebRTC；凭据、工具和后台工作留在服务端。GPT Live 负责听说、短确认、澄清和自然接话，V 负责模型推理、记忆、工具与工作流。委托不暂停麦克风，也不把用户锁在“等结果”状态。字幕和后台任务状态分别显示；“正在说话”应由实际音频播放状态判断。

候选补丁为 consult runner 增加公开输出回调：观察 `onPartialReply.text`，以及严格匹配的公开 `onAgentEvent` preamble（`stream: "item"`，`kind: "preamble"`，`phase: "update" | "end"`，`progressText`）。不接 thought、tool 或 reasoning；公开累计文本先组成完整句子或空白段落事实块，再发送尚未播过的块，不等待整个 consult 结束。内部 `onProgress({ text, kind: "commentary" })` 经 runner 与 owner 传到 native provider，再以 `delegation.context.append` 的 `speakable` 通道回传。

native provider 已对 supersede、generation、abort 和终止后的迟到回调作保护；回调异常不破坏最终答复，旧 caller 的 final 路径保留。2026-10-02 最新 VLab 私有 candidate 实际执行六个测试文件，62/62 通过；receipt 为 `candidate-094bd6c0-fbfe-4141-945c-f42487bb3c50`，base 为 `memory-search-mixed-20261002`，`sharedUnchanged=true`，shared PID 保持 `1302337`。三项 runtime overlay 的 SHA-256 分别为 native `c23c174d6e208dc9af0c3ad252b6eb00ad34e3ff950934bd08d4f381eb4b4d2c`、harness `9101f93860b175145c833d545a0d3602bbd8474cc2395d2c26e43d4d4ad6a47b`、Talk `e8b2df8d97d5351c3d07e95a03388c56bec1699f604b6edf977d73c9cf090c82`。这证明局部执行链路、事实块与镜像回归、H5 生命周期及临时访问凭据处理，不单独证明真实模型已接收更新或用户已听到；完整事实块的真实语音 smoke 仍在运行，暂不记结果。

真实运行暴露了完成镜像的去重边界：native token 流有时没有 itemId，完成时 builtin 产生新 ID；部分输出的 commentary phase 也可能迟到，同一全文由 partial 与 preamble 两个公开 hook 回传。现在 partial 共享累计游标，所有公开 snapshot 额外按规范化空白的全文作相邻去重；两个 source 各自的游标仍推进，以保留后续新增文字和真实修订。回归使用实际 Codex projector 与 builtin delivery，不把这个修复解释成最终语音复述已经解决。

`lab/gpt-live-h5/` 已有候选网页与本机 broker 源码：固定 native OAuth 模型和 WebRTC，服务端交换 offer，前端接音频、字幕、后台状态及 steer/cancel。当前 HTTP 仅绑定 loopback；真实通话和手机入口仍待验证，线上字节 H5 保留为比较基线。已用实际 app 的 VM 行为回归检查迟到麦克风授权、播放初始化、结束及重连、字幕合并与旧请求隔离；桌面 1200×1000、手机 390×844 的页面预览均已在 Chrome 检查，控制台无错误，预览点击不会创建模型会话。

建议内部更新至少携带：

```ts
{
  sessionId,
  delegationId,
  taskId,
  revision,
  sequence,
  kind: "progress" | "result",
  text,
  final: boolean
}
```

建议后续任务协议携带上述字段；当前补丁用 delegation 与 generation 保护回调。进度应描述实际发生的事，不转隐藏 reasoning、系统提示、凭据或原始工具日志。早期逐 token 播报试验已证明部分语音可早于后台完成，但一次真实运行把后台日期时间说成了另一日期，因此没有通过结果保真。现在先组成完整事实块，避免把数字前缀交给 Live 自由补全；最终全文仍由原路径交给 Live。`lab/gpt-live-h5/instructions.mjs` 明确要求等待完整数值、保留日期时间及原始时区。提示词与分块均不能当作准确性保证，最终复述与准确数值仍需真实声音验收。

## 已完成的候选验证

完整事实块版本的真实模型样本为 `candidate-149efd34-ae44-4744-bef3-fa204cf4aa1f`，在独立、一次性 Gateway 和 Chrome WebRTC 中执行，使用 `gpt-live-1-codex` / `sol`。该 receipt 为 `ok=true`、退出码 0、`sharedUnchanged=true`；三项 overlay 与上述 62 项测试产物的 hash 相同。此样本通过，不将早期失败样本算作通过，也不以单个样本推导 p50/p95。

| 检查 | 本次观测 |
| --- | --- |
| 真实后台委托 | 观测到 consult tool call/result；公开进度 append 先于最终 append |
| 提前进度 | 已辨认进度内容的 native 输出转写提前 8,887 毫秒；整段进度 turn.done 提前 6,192 毫秒 |
| 实际音频 | 从已辨认进度转写时刻起、后台 final 之前，有 15 个非零 PCM 窗口；首窗提前 8,866 毫秒。录音解码 peak 17,385、RMS 1,230.69 |
| 结果复述 | native 最终输出转写与后台全文的年月日、时分秒六个数值逐项一致；不是逐字声学比对，也未自动比对时区语义 |
| 去重与完成 | 公开全文镜像重复 append 为 0；terminal append 为 1 |

本次解码 PCM SHA-256 为 `bd671ade537eefbbbc0582d225d9806561b28d9e02db6cdbfd5306a851a07929`；录音、事件与完整 receipt 保存在 Git 外的实验 evidence 中，仓库仅保留代码、设计和这些汇总证据。`humanListeningAccepted=false`，精确命令执行的独立证据 `execHistoryWitness=null`，因此不声称已验证特定 sleep/date 命令或真人听觉验收。

这个样本运行的是受控原生 WebRTC 测试页。候选 H5 的页面和生命周期已有前述浏览器预览及行为回归，但完整 H5 的真人麦克风、自然插话、纠正、取消、手机和重连仍需下一阶段验收。电话线路接入也未实施。

## native 与公开 API 的协议边界

公开 OpenAI API 已提供 `gpt-live-1`，入口为 `POST /v1/live/sessions`；它与当前 `gpt-live-1-codex` 的 native OAuth 路径不能按名称视为相同契约。官方公开文档未建立 exact native 模型与 OAuth endpoint 的完整契约，首版以现有实现和候选实测为准。

| 项目 | 当前 native 路径 | 公开 GPT Live API |
| --- | --- | --- |
| 模型与认证 | `gpt-live-1-codex`，已有 ChatGPT OAuth | `gpt-live-1`，project API key |
| 接收委托 | `delegation.created`，含 `item` | `session.delegation.created`，含 delegation metadata 与时间，不含任务正文 |
| 发送更新 | `delegation.context.append`，`delegation_item_id`，content 数组 | `session.thinking.append` 或 `session.commentary.append`，`delegation_id`，plain string content |
| 当前 channel 语义 | `speakable` 可说；`commentary` 静默，依据现有 native instructions | `thinking` 静默上下文；`commentary` 请求说出来，可被改述 |
| 单次大小 | 现有 native chunk helper 限制 500 UTF-8 bytes | 官方每次 append 最多 500 tokens |

native 首版发送示例：

```json
{
  "type": "delegation.context.append",
  "delegation_item_id": "item_example",
  "channel": "speakable",
  "content": [{ "type": "input_text", "text": "已经确认第一个方案可用，另一个方案还在核对。" }]
}
```

GA 示例仅供将来明确选择 API 路线时参考，不直接发送到当前 native 会话：

```json
{
  "type": "session.commentary.append",
  "event_id": "result_1",
  "delegation_id": "item_example",
  "content": "已经确认第一个方案可用，另一个方案还在核对。"
}
```

公开 API 的 append acknowledgment 表示上下文注入，不能当成播报完成。native 的事件接收、错误与实际音频也须分别验证。不要为了套用公开文档而要求新 key、更换模型或替换当前 endpoint。

## 交谈与任务控制

| 用户行为 | 语音层应发生什么 | 后台应发生什么 |
| --- | --- | --- |
| 播报中开口 | 原生全双工继续接收；模型让出交谈并理解补充 | 任务不因一次开口自动取消 |
| “不是周五，是周四” | 简短确认新条件，随后只谈周四 | 更新任务 revision；使用最新上下文 steering，丢弃周五的迟到结果 |
| “先别查了” | 确认已收到停止要求 | 请求 abort；取消成功后才宣布已取消；无法取消的工作停止回传并保留真实状态 |
| “先讲已经查到的” | 立即使用已有完整事实块 | 继续剩余只读查询，不重复已完成工作 |
| 断线后重连 | 恢复必要上下文 | 先核对任务状态，避免重新执行已完成的动作 |

讲话被打断与任务取消是两件事。当前 native controller 的委托 supersede/abort 行为也需要回归，不能仅用前端静音证明后台已停止。控制器在每次流式回调与最终输出前检查当前 delegation、revision 和 abort 状态，防止旧结果进入新任务。

保留原生 full duplex 和连续输入，不另加“一轮说完再一轮回答”的手动 VAD/commit 循环。公开 Live 不提供 Realtime 的逐轮 response/audio done 契约，也不应套用 Realtime 的 cancel/truncate 事件。若应用确需立即停止已缓冲音频，控制播放端清队列；自然打断仍由当前 native 路径实测。

## 验收案例与指标

以下数值是首版实验目标，不是模型保证或已有成绩。记录客户端播放与服务器任务时间，并报告样本量、p50/p95 和未通过案例。先用可控延迟及已知事实块验证桥接，再用真实 V 的只读 consult 验证完整用户路径。

| 案例 | 必须看到的结果 |
| --- | --- |
| 普通聊天 | 无需后台时自然接话，不强制每句 consult |
| 慢后台查询 | 后台尚未结束，用户已听到一个有用的部分结果；进度内容与真实步骤一致 |
| 边说边补充 | 播报期间用户补充条件，被理解并用于后续结果 |
| 纠正需求 | 旧 revision 的迟到结果不播报；最终结果符合纠正后的需求 |
| 明确取消 | 可取消任务已停止；没有继续吐出旧结果；不可取消状态说清楚 |
| 无部分结果或失败 | 不编造进展；失败明确播报；会话仍可继续 |
| 最终答复 | 部分结果和最终结果不重复，最终成功陈述有真实后台结果 |
| 桌面与手机浏览器 | 真实麦克风、扬声器、回声消除、锁定权限及网络变化均可继续交谈 |

衡量四个时间：用户表达完请求到首次自然确认；后台生成第一个可公开事实块到用户实际听到；用户开始打断到旧播报让出；请求到最终真实结果。慢任务测试目标为首次确认 p95 不超过 1.5 秒、事实块产生后转发 p95 不超过 500 毫秒，并在后台结束至少 1 秒前听到部分结果；自然打断以听觉与记录评估，暂以 500 毫秒内让出为目标。

自动测试覆盖公开回调过滤、句子事实块、数字分片、跨 source 镜像去重、supersede、abort、迟到结果、最终发送次数、失败和旧 caller 兼容；H5 还覆盖会话并发创建、凭据留在服务端、失败取消与清理重试。事实块不使用 timer，不 flush 无句尾的数字尾段，不延迟最终答复；底层仍复用现有 native chunk helper。真实验收至少保存一组脱敏时间记录、播放证据与对应后台结果；连接成功、append 发送成功、字幕出现均不能单独证明用户听到了正确内容。

## 阶段与上线边界

1. worktree 完成 native streaming callback、相关候选测试及可审阅补丁。报告分支、commit/hash、测试和未覆盖项，等待用户决定是否合入 dev。2026-10-02 14:22 CST 现场已观察到另一项 `memory-search-mixed-20261002` 由 `claude-memsearch-20261002` 持 lease 进入共享部署并正常重启；本实验的独立 candidate receipt 如实保留 `sharedUnchanged=false` 的观察，不据此声称共享未变化，也不抢占其槽位。阶段状态更正：14:45 CST 后再次核对，共享 accepted release 已为 `memory-search-mixed-20261002`，`pending=null`、integration `lease=null`；最新私有 candidate 在这一新基线上验证且 `sharedUnchanged=true`，此前另一任务部署时的变化证据仍保留。
2. 获准后取得 integration lease，部署同一候选到共享 VLab，验证真实桌面与手机浏览器交谈、部分播报、纠正、取消和最终结果。保留回滚；结束按平台流程 promotion/alignment 或 rollback。
3. 用户授权生产后才将同一已验收产物上 V，并重验真实入口。生产部署与真实听觉验收分开报告。
4. 后续电话阶段评估 SIP trunk 或 server audio bridge。公开 GA Live 提供相应方式，但必须先核对 native/GA 模型、认证、声音、事件及 telephony 兼容性；当前 native 网页能通话不代表 `gpt-live-1-codex` 已支持 SIP。首版不采购号码、不承诺现有 OAuth 可直接接电话。

## 官方参考

- [GPT Live 1 模型](https://developers.openai.com/api/docs/models/gpt-live-1)：公开模型与端点。
- [委托与工具](https://developers.openai.com/api/docs/guides/live-delegation)：client backend、流式完整结果、进度事件与后台状态。
- [GPT Live 提示词](https://developers.openai.com/api/docs/guides/live-prompting)：简短交谈 prompt 与后台流程分工。
- [会话管理](https://developers.openai.com/api/docs/guides/live-conversations)：transcript、append 时序及播放证据边界。
- [服务端控制](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live)：sideband、任务与播放控制。
- [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)：公开浏览器连接流程。
- [迁移指导](https://developers.openai.com/api/docs/guides/live-migration)：连续语音、旧 turn loop 和状态适配。
- [电话与 SIP](https://developers.openai.com/api/docs/guides/voice-sip?api=live)：后续电话连接与兼容性核对。
