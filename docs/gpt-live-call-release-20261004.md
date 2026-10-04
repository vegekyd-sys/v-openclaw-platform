# GPT Live 通话首版发布

2026-10-04，用户在原 H5 中亲自体验了 `5979732` Candidate，确认对话体验明显改善，并明确授权：完成下面的小改动，经 VLab 验收，再上线到 V。这更新了此前仅 Candidate、不得合 dev 或上生产的任务边界。发布过程仍需合法的共享 integration lease，不抢占其他任务。

## 本轮交付

- 后台任务状态紧邻「对话」标题，无任务时不占位。
- 手机接通后收起大头像与大拨号区域，保留会变化的小头像、通话状态和挂断按钮，使对话成为主画面；桌面和拨号页保留原结构。
- 真正接通且浏览器可播放后，由模型主动说一句问候。通过现有 native `session.context.append`，不制造用户输入、assistant 事件或另一路 TTS。
- 模型理解结束意图后，通过 native client delegation 交给后台模型选择真正的零参数 `openclaw_end_call` 工具。工具只在当前通话的完整原用户发言已结束、原委派与当前 owner 仍有效时暴露给最初父任务；子任务、续传和外部搜索内容不获得挂断权限。宿主交叉核对实际 backend tool start/result、runId、callId 和原 native turn/delegation，再安排告别。不会按字幕关键词自动挂断，也不把普通委派文字改造成工具调用。
- 工具接纳只表示进入结束流程。网页在真实告别语音、对应 assistant terminal 和连续音频尾部排空后关闭原通话。用户在告别中再次开始说话时保留通话；工具失败、播放受阻或缺少证据时，保留手动挂断按钮。

## 新增验收

本地验收覆盖一次问候、错误/旧 owner 隔离、结束语字幕本身不能挂断、真实结束工具的失败反馈、告别未完成和音频尾部未排空不能关闭、采样缺口与浏览器播放受阻不能充当排空。

原 H5/WebRTC 的针对性真实案例覆盖：无用户输入的主动问候与声音；包含结束措辞但明确「先别挂」时持续通话；「今天就先这样，谢谢你，拜拜」这类自然告别触发真实 native delegation、host tool、告别声音、原 H5 关闭与麦克风释放；重新拨号后新 owner 问候。共享 VLab 对同一冻结产物重复核心新功能与实际工具返回。健康检查或本地测试不能替代这些验收。

共享首轮已经观察到问候、否定挂断及同一次后台执行中的 Memory Search → Web Search → 真实语音返回，原严格麦克风连续性 FAIL 保留。下一轮发现 native WebRTC 已连接时，后台的生命周期控制尚未观察到 `session.started`，四次快速 ready 请求均被拒绝，问候因此没有发出；随后测试浏览器清理的 ENOTEMPTY 错误遮住了回执。原始零 PCM、四次失败、原会话真实关闭的证据保留。该版本未接受、未上线 V，先回退共享候选再修复并重新冻结产物。修复采用 native browser broker 已实际持有的当前会话、开放侧线 socket 及未取消信号来验证接通就绪；保留真实 `session.started` 的观测与有效期处理，不制造该事件。前端 ready 请求保留 15 秒有界重试，用户先开口或换通话时停止。

共享 `a64bf6b` 的实际原 H5 复验已经取得主动问候、明确「先别挂」持续通话、同一后台父任务的 Memory Search → Web Search/web_fetch 和原 Live 语音返回。自然告别仍失败：原 native USER 完整说了「今天就先这样，谢谢你，拜拜」，Live 只发送了普通自然语言 client delegation，没有生成此前提示约定的 JSON，也没有真正的挂断工具执行。不能把口头「马上结束」当挂断成功。该候选 H5 与 Gateway 已成对回退到 `hotreload-feishu-approvals-v2`，配置 hash 与已验收基线一致，自己的 integration lease 已归还；生产 V 未改动。后续真实 backend-model tool 修复在 Candidate 验证，未验收前不推广这个失败产物。

## 当前 Candidate 证据

真实模型工具版本 `009d06f` 已观察到后台父模型调用零参数 `openclaw_end_call`、实际工具结果、同 owner 宿主接纳、原 Live 告别声音、750ms 以上尾部排空、自动关闭原通话和不同 owner 重拨。重拨问候的原始完整声音也存在；旧观察器第二次复制快照时把已完成窗口之后的采样空隙算入，原 FAIL 保留，另行记录独立复核。

仅修观察器的 `b5a1bee` 与前版 22 个运行时文件和 11 个 H5 文件逐字节一致。新一轮实际 Memory → Web 成功，Live 在同一 assistant turn 中先播阶段事实，再播最终两项结果。原观察器按 Web 完成时间裁掉同一 turn 的前缀，导致严格全文匹配超时；原录音独立复核证明完整声音、无静音、755ms 尾部排空。修复把完整语音起点与「终态必须晚于真实 Web 结果」的因果条件分别检验，保留完整字幕、原播放器、750ms 和采样连续性门槛。

两轮原始失败回执均不修改。组合证据仅允许进入共享 VLab 的完整原 H5 复验；共享新功能仍须实际验证后才接受产物并推广。原严格完整 PCM、麦克风连续性等延期项继续单独记录。

## 发布边界

需要重启 Gateway，才能加载 Core/Worker 代码；H5 也需安装同一版本并重新启动。切换前检查并排空活跃任务，不强杀业务。V 和 VLab 的配置、会话、Memory 与认证保留独立，不复制 Candidate 私有配置或诊断 trace。GPT Live 专属新指令随代码在精确 native client 路由生效，其他语音 provider 保持原配置。

标准流程为本 worktree 提交与 Candidate 验证 → 已授权 dev 合并 → 合法 lease 下 canonical package/stage/deploy → 共享真实验收/accept → `scripts/promote-to-v.mjs` 推广同一代码产物 → 受控重启与真实 V 通话 → parity/align 与释放占用。旧 PR-only 临时 controller 固定 `productionAuthorized=false`，不能用来发布生产或冒充 canonical accept。

GPT Live H5 首版保留 localhost 私有入口，部署到 V 上的独立 loopback 服务，通过 `ssh v` 转发到用户电脑；不直接公开未经认证的页面，也不替换现有小何 RTC H5。

## 保留的后续验收

用户明确允许先发布本轮已验收业务体验，原实验未通过项继续追踪，不改写原 FAIL：提前事实的严格公开来源与实际语音因果、最终值/关系/一句话条件保真、100ms 本地压声与 native 实际终止分别验证、确认后真实取消与 OS 退出、迟到隔离与重连、完整音频/麦克风连续覆盖、物理扬声器回录。v14 独立只读复核发现部分姓名字面匹配过严，但保留原回执，派生证据与产品结论单独记录。

未完成项在下一轮 Candidate 中继续；不能把用户对首版的正面评价改写为全部原实验门槛通过。运行身份、实际提交、artifact/hash、部署、验收、生产验证和回退记录由本轮私有 release-control receipt 落定。
