# 豆包小何 / Grok Voice Candidate

本次增加 `/voice` 的模型选择，保留 GPT Live WebRTC 和原桌面/H5结构。豆包固定 Seeduplex 3.0 对应模型 `1.2.6.1`，小何音色 `zh_female_xiaohe_uranus_bigtts`；Grok 固定 `grok-voice-think-fast-2.0`、Eve，中文输入提示。

生产已配置的 Grok subscription relay 仅有 chat/video HTTP 路由，没有语音 WebSocket upgrade 或 Realtime 路由。依照用户授权，本次 Grok 使用 xAI API 备用线路；不宣称订阅覆盖语音费用。密钥只在服务端，浏览器持有本通电话的一次性 relay ticket 和原入口 cookie。

两条新路径均由语音模型选择原生 function call，OpenClaw `tools.invoke` 执行并返回结果，无 `agent-consult` 中间模型。常用工具包括记忆、Web搜索/网页、本人飞书日历、上海时间、自然挂断、取消任务；其余工具通过开放目录中的 `openclaw_tool` 直接执行。原 Gateway 工具策略和审批仍生效，RPC 不允许模型自行设置 `confirm`。取消只处理本通电话实际发起的执行 session；保留原终止结果和迟到隔离证据。

每次拨号创建新语音连接和 call ID；个人上下文仍固定到 `agent:makaron:feishu:group:oc_adda79fa3d492cca82869c0c72bc62ae`，载入最近个人群上下文。不会复用上一通的音频/工具回调。模型调用 `end_call` 后，需有实际告别音频和浏览器队列播放结束，才关闭本通；新用户讲话撤销挂断。

## 验证项

| 场景 | 验证依据 |
| --- | --- |
| 原 GPT Live 未回归 | 原 app/server、麦克风、播放、hosted 本地测试 |
| 豆包/小何与 Grok 接通 | 原 H5 拨号、真实 provider ready、模型/音色配置 |
| 问候、中文聊天 | 真实字幕 + provider PCM + 原浏览器 speaker PCM |
| 多步记忆/日历/Web/原生工具 | 一次完整 USER → exact call/result → 连续下一步 → 原音频总结 |
| 多工具结果续传 | 相同 native response 的输出批次完成后只续传一次 |
| 插话换题 | provider旧回应终态、清空旧播放、真实新题回复；静音不等于通过 |
| 取消与迟到隔离 | 实际 process kill/poll终态，旧结果不再交付；不强杀他人进程 |
| 自然挂断/讨论挂断/重拨 | 原生语义工具、实际告别、播放排空、新call问候 |
| 安全边界 | 原 cookie/origin/ticket校验、无客户端密钥、原生工具策略 |
| 手机与桌面 | 新选择器不挤压原结构；手机动画和文字区可读 |

本地检查不等于真实通话通过。物理扬声器AEC、中文声音自然程度仍需真人听觉验收。历史最终答案保真/双向音频 FAIL 不改为通过；暂停的旧修复不在本补丁中恢复。

本轮仅 Candidate；未合入 dev、未写共享 VLab、未部署 V。共享串行验收与上线须在用户授权当前补丁合入后，沿 canonical流程执行。本次真实测试发现原 `tools.invoke` RPC 未提供 coding tools，新增仅本人服务端 voice-direct-tools capability 可进入的原生 mediated resolver，保留原策略与审批。后续上线需受控重启 Gateway 加载这一个 runtime 模块，再更新 H5 服务；需按实际忙闲排空并保留回退。


## 2026-10-06 Candidate 实测记录

源码运行包 `7d351b96705139b1878fe7dc4ebd60a725cde935`。真实隔离 Gateway 复用本任务 `7a1d810` 的内存快照及相同 runtime patch，H5 另有明确 revision receipt，未重启共享或 V。本地 166/166、零 skip，只代表本地检查。

原 H5 在 Linux Chrome / 私有 PulseAudio 上采集 USER 音频；provider PCM 和实际浏览器 speaker PCM 分别保留。模拟的仅是 USER 声音，不制造工具结果、assistant 字幕或模型事件。以下为功能证据，不是全部产品验收。

| 项目 | 豆包小何 | Grok Voice |
| --- | --- | --- |
| 真实接通与问候 | SayHello 原生 TTS 返回及浏览器播放；固定问候，非模型生成 | 模型生成中文问候及浏览器播放 |
| 一次输入要求记忆→本人日历→Web→读取文件 | 四个实际 call/result 成功，自动续做、最终原语音返回 | 四个实际 call/result 成功，并行结果聚合后原语音返回 |
| 本人飞书日历 | `lark-cli` user 身份、exit 0；返回空日程样本 | `lark-cli` user 身份、exit 0；返回空日程样本 |
| 网页读取 | 原生 `web_fetch` 成功、原语音返回 | 原生 `web_fetch` 成功、原语音返回 |
| 仅讨论挂断不结束电话 | 已观察 | 已观察 |
| 取消实际长任务 | 原生 `sleep 60` 执行会话 kill/poll 读回 SIGTERM 终态 | 同左 |
| 自然告别挂断 | 模型真实 `end_call`、host 接受、告别/播放结束/关闭 | 同左 |
| 结束后重新拨号 | 新 call ID、SayHello 原音频，专项复验通过 | 新 call ID、模型问候原音频，专项复验通过 |
| 严格插话终态 | 原检查 FAIL：缺 cancelled/interrupted 终态证据 | 原检查 FAIL：缺 cancelled/interrupted 终态证据 |
| 真迟到回调、网络异常重连、物理回录、中文听感 | 待验收，不能用本地测试或静音代替 | 待验收 |
| 文字补充 | 当前历史注入路径未证明可触发新回答；试用以语音为主 | 原生文本消息已接入，专项真人验收待做 |
| 原 GPT Live | 原路线保留，本轮仅本地回归 | 同左 |

真实 evidence：`native-run-5` 的原 FAIL 不修改。单独 `independent-native-review.json` 按完整日志复核：Grok 的第一个汇总检查发生在第四个工具结果到达前，全部四个结果实际成功，最后结果以后也有原语音。测试脚本已修为等四个结果返回后再检查。`native-run-6` 仅新增网页读取与重拨专项，六个功能检查通过；豆包问候不再误要求模型字幕。插话 FAIL 仍保留，未降低门槛。

Candidate 本人日历使用现有登录的 access-only 私有副本，不带 refresh token；不写入/刷新 V 的登录配置。真人临时入口从 Mac loopback 转发到本任务 H5，硬到期为 2026-10-06 上海 04:00。服务端独立 guard 按 invocation 身份停止本任务 H5/Candidate，canonical 清理完成后删除本轮私有凭据；本地独立守卫按 PID/UID/argv/微秒 start 身份停止自己的 SSH forward。到期会结束通话，不声明 busy-safe 延长。

Draft PR217 已提交；功能候选可试用，未合入 dev / 共享 VLab / V。发布仍需共享验收及本补丁合入授权。最终答案保真和旧双向音频修复保持暂停，不将这轮工具功能证据等同这些旧 gate 已通过。
