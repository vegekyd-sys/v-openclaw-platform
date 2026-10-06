# Voice 可靠性与混合执行候选

本轮针对用户的 iOS Safari 重复播放/权限、两种模型卡顿、查询等待和复杂任务慢的问题。分支 codex/voice-safari-playback，PR 251。尚未上线。

## 实现

- 播放：设备原生采样率 + AudioWorklet 连续 FIFO，120ms 启动/欠载缓冲；消费过的 PCM 不重放。只按明确事件/传输身份去重，不删除真实重复波形。旧播放 epoch、挂断后回调隔离。两种模型共用该链路。
- 简单查询：前端模型直接调用 OpenClaw 原生工具。日历使用飞书本人 CLI，自动等待自己的 exec/process 结果。没有额外后端模型跳转。
- 复杂任务：模型选择 delegate_to_v，把完整目标一次交给同一个个人 V session 的正常后端模型。原生工具调用先释放等待状态，可以继续聊天；后台自主完成多步，只播报实际工具返回后的公开进展。结果等待当前用户/声音退出后续传。
- 小何：查询选中工具后立即执行，用独立生成并核验 hash 的原生小何 PCM 播报一句说明；提示和回答共用同一 FIFO。提示不再向等待函数结果的主对话插入 SayHello，也不等待提示结束才交付真实工具结果。无需第二句话续接仍须原 H5 实测。
- 取消：原 Gateway 进程表不能控制 Worker 发起的 exec。新增严格对应 run/session 的 Worker 控制，在原 Worker 记录实际 exec ID，并为语音 run 隔离原生进程注册表，取消模型并用原生 process kill/poll 证明退出。模型正常结束不能提前拒绝仍在途的清理回执；前台命令中止而没有普通工具结果时，必须读取本 run 的原生注册表证明退出。未知/未退出保留责任，不关闭其他 Worker。
- 权限：同一页面只申请一次设备轨道。挂断禁用轨道并关闭所有通话传输，保持静音；重拨复用原授权，页面离开时停止设备。Safari 可能继续显示设备权限标识；刷新/导航/系统撤销授权仍遵守网站权限，不承诺网页能永久改写浏览器权限。正常挂断期间没有上传或录音链路。

## 验收清单

1. 小何/Grok：一条完整查询输入 → 原生工具实际执行 → 结果语音，无第二句催促；记录工具延迟。
2. 记忆、Web、飞书日历、文件/执行：精确工具调用和真实结果，简单项无 delegate_to_v。
3. 复杂任务：一次委派 → 多步真实工具 → 进度语音 → 自动最终语音；后台等待可聊天。
4. 长回答连续播放；检查真实 worklet 收/播回执、欠载、上传/下载间隔。实际 iPhone Safari 不重复、不卡顿是独立硬门槛。
5. 取消：本通 backend run 终止，原进程 native poll 退出，独立 PID/start witness 消失；迟到结果不能播报。
6. 模型理解自然告别 → end_call → 告别播放排空 → 关闭；重拨新 owner/问候、不复播旧声音。
7. 手机锁屏/切后台恢复、权限拒绝/允许/重拨、断网恢复、播放阻塞恢复、真正插话终止与物理回声分别记录。
8. 旧语义保真、物理 AEC、OAuth 续期等未通过证据保留；不把本地/自动 PCM/健康检查称为整体验收。

先 Candidate 原始 H5/真实语音验证，再依法取得共享 VLab lease 做集成验收。当前没有自行合 dev 或生产 V。

## 529d207e 原始 Candidate 结果

本轮未通过，证据保留。小何真实一次复杂委派完成 Memory/Web/exec 与进度、最终语音，长故事播放器欠载/重复帧均为 0。简单记忆工具在输入结束 1293ms 后启动，但旧观察器在工具交付后过早发送下一句，不能证明第一句独立答案。取消场景模型选择前台 sleep60，测试等待后台 running 结果失败；退出时暴露 Worker 完成提前拒绝清理回执的竞态，随后阻断 Grok 拨号。新回归必须验证实际第一句 PCM 与原生进程退出，不修改旧 FAIL。共享在本轮期间由其他任务从旧版本推广至 firsttext-r2，候选没有写共享；sharedUnchanged=false 如实保留。

## 80091a32 原始 Candidate 结果与后续修正

原整轮 FAIL 保留，Candidate unit/rundir 已独立读回 not-found/gone。Grok 一句记忆查询无需第二个 USER 已返回原 PCM，工具选择在输入结束后 1929ms；复杂一次委派的实际工具、进度、最终语音和长故事已观察。日历实际 exit3/not_configured，旧观察器将 RPC ok 误记为日历成功，独立复核纠正为失败。取消原 Worker 注册表未找到实际执行 ID，随后小何拨号被清理保护阻断；不能将其称为小何 provider 失败。共享由其他任务重启至2279627，sharedUnchanged=false，候选未写共享。

后续 Candidate 启动显式将继承的 VLAB_OPENCLAW_AGENT_RUNTIME 改到本候选 SDK，防止 Worker 加载共享旧代码；保留实际路径/hash证据。私有飞书配置使用现有本人登录的 access-only 加密副本，移除 refresh token，成功只读 CLI exit0/ok=true；这不是原 H5 语音验收。Worker 清理保留模型完成后的 exact Worker/run/session 归属，未确认退出不使用 Gateway 进程表冒充恢复。日历工具及观察器同时校验 CLI exit0 与业务 ok，并等待本 call 的实际结果交付后音频。

## 大首包的真实缓冲

80091a32 的 Grok 长故事约58秒，四个整段锚点无累积漂移，但首段录音存在缺口，原严格 PCM 检查仍 FAIL。实际首包约244ms、第二包晚约300ms到达；旧条件只在包小于120ms时等待，导致大包绕过缓冲。后续改为未完整返回的响应实际等待120ms音频线程时间，完整短响应无需等待。按真实大包/后续延迟输入在24/44.1/48kHz回归，欠载0、无中间空帧、每样本只消费一次；尚待新原H5录音与物理Safari验收。

## 共享部署产物

Worker 的 run 隔离、取消 RPC 和退休任务归属需要实际运行文件，不只合入 H5 源码。`lab/build-voice-reliability-runtime.mjs` 在独立目录读取四个已捕获的现行 runtime 文件，先核验冻结 before hash，再生成四个补丁文件及新的 `voice-process-owner.mjs`。它不连接或修改 Gateway。最终文件、before/after proof 与 package plan 位于 `lab/release-files/voice-reliability-20261007/`，当前基线为 `firsttext-r2-20261007`；集成前必须实时复核基线与文件，漂移则重新适配，不能覆盖其他任务。

这轮不是纯 UI 发布：Worker/OpenClaw 运行代码需要排空任务后受控重启 Gateway，并安装同字节 H5 bundle。合入前 Candidate 验证不动共享或生产；用户明确决定本次 SHA 合入 dev 后，再取得自己的 integration lease，通过 canonical package/stage/deploy 进入共享验收。共享工具、原 H5 语音和 iPhone Safari 听觉仍分别记录。生产尚未获本补丁发布授权。

## 1b5f4507 R4 原始复验

整轮 FAIL 保留，原 Candidate 已退出且 unit/rundir 读回 not-found/gone。小何在输入结束后约1.31秒选择 Memory 工具，结果已实际返回，但插入主 socket 的 SayHello 提示以后没有答案 PCM；没有发送第二句话补救。后续将提示改为独立原生 TTS 资产，冻结声音、文本、采样率和 hash，并移除提示对主函数结果的控制。

Grok 的 Memory、飞书日历（真实 exit0/业务 ok）、Web 及复杂 V 一次委派、多工具、进度、聊天、最终语音已观察。长故事未完成，取消/挂断/重拨未在此轮覆盖。独立复核发现观察器在队列尚有613112字节时因短暂静音放行下一句；新检查同时要求后于最后 PCM 的新鲜队列为0、上游静止和原声卡静尾。旧结果不改为通过，首句答案只允许实际模型回复 PCM，不接受缓存提示充当答案。iPhone Safari 仍待真人测试。

## R5：首句独立回答通过，取消与独立音频仍未通过

原7f8dd7ba整轮FAIL保留。小何一条USER后1220ms选择Memory，真实结果返回后生成答案PCM，没有第二句话；飞书日历、Web、一次复杂委派23个实际工具事件、进度和自动最终语音均观察到。长故事32秒，队列排空且该epoch欠载/重复0；独立源/扬声器PCM无累积漂移，但局部波形严格门槛未过。固定48kHz偏移复核仍未全部通过，不用播放器计数代替该门槛。物理iPhone Safari未验收。

取消实际sleep60的good-shoal进程时，外层Worker注册表无法证明内层原生Worker执行退出；后续Grok被正确的清理保护阻断，不能归为Grok模型故障。原Candidate unit/rundir已读回not-found/gone，sharedUnchanged=true。

后续将退出核验放入实际执行工具的原生Worker：停止模型后，只读取本语音run注册表，用真正的process kill/poll及最终list核验，再经已有认证Worker事件传回带host provenance的真实结果。外层空登记表不能冒充内层已退出，也不接收浏览器PID。只在取消时执行此生命周期清理，正常工具和飞书任务不变；未知结果继续阻止重拨。新验证先单独覆盖取消、OS退出、自然告别、重拨和同页麦克风复用，不重复已完成的付费场景。

## R6b 拨号前的观察器配置失败

36a88c22 的独立取消场景完成数据库冷启动后，被启动器旧的允许列表拒绝（Unknown direct voice observer case），没有开始付费语音。原 FAIL、247 个冻结输入和回执保留，自己的 unit/rundir 已实读 not-found/gone。后续补上 controls 并把验证提前到任何私有数据库/Gateway 操作之前；回归实际执行 bootstrap，验证未知场景早拒绝、controls 能通过场景校验。sharedUnchanged=false 原值保留，Candidate 没有写共享，不用这个失败样本证明语音或取消已通过。

### R7 cancellation diagnosis and next probe

R7 (28797865) reached real Xiaohe voice and a running native backend command. The cancel USER clip overlapped the provider reply: upstream reported transcription started but neither a completed USER transcript nor `cancel_task`. Its original strict workflow FAIL is retained. During the observer's subsequent stop, the outer Worker also failed to confirm native process cleanup. Candidate unit/rundir were independently confirmed gone; shared changes in the receipt belong to concurrent shared activity and are not relabelled unchanged.

Native cleanup now drains the trusted voice run's registry at every turn exit, including normal completion. The final actual process-list result is acknowledged through the existing native live protocol before finishing the run. Backend cancellation can verify that exact native final receipt after the outer callback bridge has stopped; a foreign run, a still-running list or a missing owned command remains unconfirmed. No Gateway registry or caller-supplied PID is used. The original Linux AudioContext was independently read as 44.1 kHz; playback stats now retain its actual sample rate. Prior 48 kHz-reference review failures are preserved.

The next frozen Candidate selects Xiaohe controls and Grok full hybrid separately. Cancellation is exercised after actual provider/FIFO/speaker quiet to distinguish cancellation lifecycle from the independently unpassed overlapping-input case. Actual iOS Safari repetition, physical listening and overlapping speech are still required and cannot be declared passed by this probe.
