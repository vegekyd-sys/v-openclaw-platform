# GPT Live 通话首版发布

2026-10-04，用户在原 H5 中亲自体验了 `5979732` Candidate，确认对话体验明显改善，并明确授权：完成下面的小改动，经 VLab 验收，再上线到 V。这更新了此前仅 Candidate、不得合 dev 或上生产的任务边界。发布过程仍需合法的共享 integration lease，不抢占其他任务。

## 本轮交付

- 后台任务状态紧邻「对话」标题，无任务时不占位。
- 手机接通后收起大头像与大拨号区域，保留会变化的小头像、通话状态和挂断按钮，使对话成为主画面；桌面和拨号页保留原结构。
- 真正接通且浏览器可播放后，由模型主动说一句问候。通过现有 native `session.context.append`，不制造用户输入、assistant 事件或另一路 TTS。
- 模型理解结束意图后调用 `openclaw_end_call`。GPT Live 当前 native browser broker 使用真实 client delegation 路由 host tool，不发送不受支持的 GA function-call/response-create 控制，不按用户字幕关键词自动挂断。
- 工具接纳只表示进入结束流程。网页在真实告别语音、对应 assistant terminal 和连续音频尾部排空后关闭原通话。用户在告别中再次开始说话时保留通话；工具失败、播放受阻或缺少证据时，保留手动挂断按钮。

## 新增验收

本地验收覆盖一次问候、错误/旧 owner 隔离、结束语字幕本身不能挂断、真实结束工具的失败反馈、告别未完成和音频尾部未排空不能关闭、采样缺口与浏览器播放受阻不能充当排空。

原 H5/WebRTC 的针对性真实案例覆盖：无用户输入的主动问候与声音；包含结束措辞但明确「先别挂」时持续通话；明确让 V 挂断时真实 native delegation、host tool、告别声音、原 H5 关闭与麦克风释放；重新拨号后新 owner 问候。共享 VLab 对同一冻结产物重复核心新功能与实际工具返回。健康检查或本地测试不能替代这些验收。

## 发布边界

需要重启 Gateway，才能加载 Core/Worker 代码；H5 也需安装同一版本并重新启动。切换前检查并排空活跃任务，不强杀业务。V 和 VLab 的配置、会话、Memory 与认证保留独立，不复制 Candidate 私有配置或诊断 trace。GPT Live 专属新指令随代码在精确 native client 路由生效，其他语音 provider 保持原配置。

标准流程为本 worktree 提交与 Candidate 验证 → 已授权 dev 合并 → 合法 lease 下 canonical package/stage/deploy → 共享真实验收/accept → `scripts/promote-to-v.mjs` 推广同一代码产物 → 受控重启与真实 V 通话 → parity/align 与释放占用。旧 PR-only 临时 controller 固定 `productionAuthorized=false`，不能用来发布生产或冒充 canonical accept。

GPT Live H5 首版保留 localhost 私有入口，部署到 V 上的独立 loopback 服务，通过 `ssh v` 转发到用户电脑；不直接公开未经认证的页面，也不替换现有小何 RTC H5。

## 保留的后续验收

用户明确允许先发布本轮已验收业务体验，原实验未通过项继续追踪，不改写原 FAIL：提前事实的严格公开来源与实际语音因果、最终值/关系/一句话条件保真、100ms 本地压声与 native 实际终止分别验证、确认后真实取消与 OS 退出、迟到隔离与重连、完整音频/麦克风连续覆盖、物理扬声器回录。v14 独立只读复核发现部分姓名字面匹配过严，但保留原回执，派生证据与产品结论单独记录。

未完成项在下一轮 Candidate 中继续；不能把用户对首版的正面评价改写为全部原实验门槛通过。运行身份、实际提交、artifact/hash、部署、验收、生产验证和回退记录由本轮私有 release-control receipt 落定。
