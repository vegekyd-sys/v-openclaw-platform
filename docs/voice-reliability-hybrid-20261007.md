# Voice 可靠性与混合执行候选

本轮针对用户的 iOS Safari 重复播放/权限、两种模型卡顿、查询等待和复杂任务慢的问题。分支 codex/voice-safari-playback，PR 251。尚未上线。

## 实现

- 播放：设备原生采样率 + AudioWorklet 连续 FIFO，小何120ms、Grok400ms启动/欠载缓冲；消费过的 PCM 不重放。只按明确事件/传输身份去重，不删除真实重复波形。旧播放 epoch、挂断后回调隔离。两种模型共用该链路。
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

Worker 的 run 隔离、取消 RPC 和退休任务归属需要实际运行文件，不只合入 H5 源码。`lab/build-voice-reliability-runtime.mjs` 在独立目录读取五个已捕获的现行 runtime 文件，先核验冻结 before hash，再生成五个补丁文件及新的 `voice-process-owner.mjs`。它不连接或修改 Gateway。最终文件、before/after proof 与 package plan 位于 `lab/release-files/voice-reliability-20261007/`，当前基线为 `firsttext-r2-20261007`；集成前必须实时复核基线与文件，漂移则重新适配，不能覆盖其他任务。

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

## R8 与本地执行域复核

497ac3e8 原整轮 FAIL 保留。取消 USER 在实际队列与声卡静尾之后进入，模型确实调用 cancel_task，后台返回终态，但没有执行进程的 terminal poll 证明，因此 Grok 被退出保护阻断。自己的 Candidate unit/rundir 已实读 not-found/gone。

`nativeAttempt91` 的经典本地 Worker 适配器与独立云 Worker 的 `runWorkerEmbeddedTurn` 不是同一个执行域；不能仅凭该标识期待云 Worker 生命周期事件。Gateway exec 代理也可能返回 handled=false，不能仅凭代理代码存在就断言实际执行位于 Gateway。后续本地 Worker 使用实际 SDK 的本进程 native process 工具与原 session scope，但只清理本 run 已观察的 exec ID，不恢复或清理共享 session 中的其他执行。尚未返回 ID 的命令保持退出未确认，不能猜测归属。

独立 Linux 原生工具复核实际创建两个同 scope 后台 sleep：本 run 已观察的命令经原生 kill/poll 后真实 PID 消失，另一个命令仍在运行。最后正常清理该独立测试的另一个命令，两个 PID 均实读消失。此为真实原生工具/OS 证据，不是 H5 语音或 iOS Safari 验收。1900 项本地检查通过；新语音复验仍待。


## R9：两种模型的退出控制通过，日历与播放仍有独立失败

3e8dac97 原整轮 FAIL 保留，20项流程检查中19项通过。两种模型均真实委派后台命令，再由模型调用 cancel_task；原生 process poll 确认终止，独立 PID/start witness 消失。自然告别→实际 end_call→声音排空→关闭→新 owner 问候均观察，同页 getUserMedia 请求各为1。Grok 简单记忆和 Web 未委派后端；一条 USER 查询实际返回答案 PCM，没有第二句话，Memory 选工具延迟3439ms。复杂目标只委派一次，正常配置的 deepseek-flash 产生23个实际工具事件、公开进度和自动最终语音，等待期间仍能聊天。

Grok 日历原 CLI exit3，原因是私有配置把 base/openclaw 当作 base；原生 OpenClaw 子进程会再次追加 openclaw。相同 access-only 登录在真实 OpenClaw 环境中改用 base 后，CLI 真实查询 exit0/ok=true。后续 Candidate 启动在数据库/Gateway之前检查 base/openclaw/config.json，防止裸 CLI 身份检查通过、原工具路径却失败。原语音失败不改为通过，待独立日历语音复验。

原长故事105.58秒，该播放 epoch 欠载/重复计数0，但问候和短提示有首包欠载；整段源/声卡固定时钟波形检查仍FAIL，不能仅凭播放器计数宣布不卡。实际 Grok 首包244.67ms、第二包晚595ms，原120ms缓冲不足。后续只给 Grok 400ms音频线程启动窗口；小何保持120ms，完整短响应仍可立即播放。使用原包长度/到达时刻在24/44.1/48kHz回归，没有中间空帧或重播；新原H5录音和物理Safari仍需实测。

本轮自己的 Candidate unit/rundir 已独立读回 not-found/gone，完整原录音、audit和FAIL回执保存。sharedUnchanged=false 属于并行共享更新，本任务没有修改共享或V。

## 仍需完成的验收

- 日历和Grok缓冲原H5流程复验见R11；物理Safari与原严格波形门槛仍独立未过。
- iPhone Safari实际不重复/不卡、权限重拨、后台/锁屏恢复和人声插话听觉。
- 后台取消已返回执行ID的原H5路径通过。前台未返回ID已完成下述真实原生工厂/OS复核，最新语音Worker集成仍待独立原H5复验；禁止从共享session猜测其他任务。
- 原固定时钟PCM失败、物理回声、未知/迟到回调和OAuth自动续期等原未完成项保留。局部通过不表示整个实验已验收。
- 共享VLab部署仍需当前补丁的合入授权、合法lease、实时before/controller核对，不能覆盖并行任务。生产本补丁未发布。

## R11：日历与缓冲修正后的真实语音复验

59ba36ab 的独立原H5测试5/5流程检查通过，完整原录音和回执保留。小何/Grok各一条USER直接调用飞书本人日历，原CLI exit0/业务ok，并返回实际答案PCM；没有第二句话或后端委派。选工具在输入结束后分别1962ms/3057ms，这不是完整答案延迟。小何查询说明原PCM出现在实际工具执行之前，工具结果交付无需等说明结束。

Grok真实长故事42.24秒，最新400ms缓冲下全部问候/日历/长故事播放epoch的欠载和重复帧计数均为0，队列排空。独立Linux源/声卡录音全段相关性0.99505、四个整段锚点无相对漂移，但部分100ms窗口未过原严格相关性门槛，该独立FAIL仍保留。不能据此宣布iOS Safari物理听感已经通过。原Candidate unit/rundir已实读not-found/gone；sharedUnchanged=true，未改共享或V。R10启动前因并行共享版本变化被基线保护拒绝，没有开始语音，不修改原拒绝记录。

## 未返回进程ID的取消：真实注册表生命周期

经典Worker另走`agent-tools-djVuP1H1.js`工厂，现将voice run的exec与process同时绑定到可信runId；普通飞书/非voice scope保持原逻辑。原生process list刻意不列前台命令，空list不能证明退出。清理先kill/poll本run已列出的后台任务，再调用原生`waitForExecScope`等待隐藏前台命令真实关闭；不能先join仍活着的后台进程而死锁。缺少原生join或退出未知继续保留责任。

独立Linux实际原生工具工厂创建同个人session的本run后台与未返回结果的前台命令，以及另一个run的后台命令。当前helper实际取消后，本run两个原PID/start witness消失，foreign仍活着；随后仅清理本测试的foreign，三PID均独立实读消失。无模型/Gateway修改；这不代替最新语音Worker集成验收。Worker RPC增加真实join审计字段，下一原H5 controls针对前台无普通结果路径，不重复已完成的付费长故事/日历。

## R12：未返回ID的小何取消通过；Grok接通前失败保留

48d5acbb 的原H5独立controls整轮FAIL保留。小何实际前台sleep60尚无普通工具结果时，用户通过原麦克风发送取消，模型真正调用cancel_task。匹配run的Worker回执nativeExecScopeJoined=true，独立原PID/start witness消失；从工具调用到退出确认620ms。自然告别、真实排空挂断、新owner问候和同页麦克风仅请求一次共5项通过。本轮Candidate unit/rundir/Mac CLI已独立读回消失；sharedUnchanged=true。

Grok没有进入上述流程：连接尚未ready，客户端已缓存约8秒麦克风PCM，先触发自己的“模型连接超时”；原Grok上游连接期限20秒。未收到ready或原答案PCM，不能当作Grok取消通过，也不能确定上游握手为何慢。后续只在真实provider ready后连接麦克风音频节点，保留原页面授权与已到达问候PCM；关闭连接中的电话不能晚建音频节点。增加catalog/context/provider连接阶段审计以区分本地准备与上游等待，不扩大权限或改变模型路线。下一必要复验只覆盖Grok controls，不重复小何/日历/长故事付费场景。

## R13：接通修复通过；Grok把委派混成原生exec

79660d3d 原整轮FAIL保留。Grok真实provider ready、问候PCM和整个后续播放都观察到，全部报告epoch欠载/重复0。目录读取132ms、个人上下文219ms、上游ready1855ms；原客户端连接前缓存溢出没有重现。这不是物理Safari验收。

原USER被识别为“交给后端里”，模型说“交给后端执行”却实际调用exec，而非delegate_to_v；随后反复process轮询和播报倒计时。并未进入后端模型取消场景，不能把它算作后端委派/取消通过。原Candidate unit/rundir/Mac CLI均已读回消失，sharedUnchanged=true。

后续把模型分工放到目录与历史上下文之前，工具说明明确“delegate_to_v真正调用后端语言模型，exec/process只是原生工具”，完整命令也不能代替用户要求的模型委派。长时间等待/反复轮询属于后端长任务，禁止只口头委派或密集报倒计时；短查询仍直接调工具。下一独立USER材料明确说“后台语言模型”，不改旧ASR/FAIL、不注入工具或assistant，验证实际模型是否真正选择委派后再取消。原日历/长故事与小何路径不重复付费。

## R14：分工与退出流程通过；问候欠载仍保留

7cdd7923 原H5针对样本12/12流程通过。小何和Grok各一条USER→实际Memory/read→原答案PCM，无第二句话、无后端委派，选择首工具分别1273ms/2310ms。Grok明确后台模型的长任务实际只调用一次delegate_to_v，正常deepseek-flash启动前台sleep60（background=false/yieldMs=120000/timeoutSeconds=90）；普通exec结果尚未返回时，真实cancel_task→匹配run的nativeExecScopeJoined→独立PID/start witness消失，取消至join713ms。自然告别/end_call、排空、重拨新owner问候和同页getUserMedia一次均通过。自己的unit/rundir/Mac CLI已独立实读消失。共享被其他任务更新，原sharedUnchanged=false保留，本任务未写共享或V。

流程通过不等于播放通过：全部epoch独立复核发现Grok第一次问候欠载1，重复帧0；小何和Grok重拨问候欠载0。问候第三包后还有1.867秒上游到达空隙，400ms一般回答缓冲不足以保护该短问候。原真实结果不改为播放通过。

后续仅对Grok第一段接通问候等待原audio.done后连续播，麦克风保持接通；正常回答仍400ms流式缓冲，小何仍120ms。插话audio.clear退休旧问候，后续回答不能继承等待完整的状态。用原provider PCM和真实包时间在24/44.1/48kHz离线因果重放：旧逻辑均欠载1，新逻辑均0、全部93600样本各消费一次。该样本第一声约从0.4秒变为2.41秒（相对首包），属于短问候的明确延迟取舍，不改变后续工具/回答等待策略。实际序列化worklet和插话退休回归通过，1909/1909本地零skip；这是原材料离线重放，不是新付费语音或物理Safari验收。

当前共享已进入feishu-codex-early-card-d-20261007，仍为其他任务lease/尚未accept；本补丁七个runtime目标before在最新只读核对仍匹配。原package plan基线不直接用来stage新共享，授权集成时须按当时真正已验收基线重新package并复核完整fingerprint/config/controller。
