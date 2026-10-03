# GPT Live 第二版：续做、麦克风与通话界面

第一版 `b9c9bc864ec8b9368feaf41c71e7ba2994c4ed9c` 已提交到 PR154，保留为用户阶段体验的基线。用户给予第一版正面评价并要求 commit，同时指出多步任务停在第一步、扬声器语音回录到 user 字幕、UI 与电话声音待提升。阶段体验正面评价不等于完整实验验收。

## 第二版改动

- Live 的 consult 参数描述与通话指令保留完整目标、准确约束、已验证项和剩余步骤。后台阶段 commentary 后继续同一 run 的实际工作，只在完整完成或真实阻塞、取消、限制时 final。若真实后台已经结束而已有授权步骤仍缺失，Live 必须实际追加 consult，不能只口头说继续。没有根据文本重写 run 状态，也没有编造 child 或延长 pending。
- 麦克风采集在浏览器支持时要求 AEC，检查真实 track settings。明确报告 disabled 时终止这次连接，不退回 `audio:true`；缺失 settings 保留 unverified。RTC 与本地 VAD 使用同一持续输入 track，播报时不关闭输入，不通过文字去重伪装解决声学回录。诊断只保留处理设置，排除 device/group ID。
- 保留 V 图像、左右布局及状态动画；统一电话按钮、拨号取消与接通状态，精简重复文案。字幕按原生 turn 分组，同一字幕片段不会逐句建立新行，完成行与正在生成内容区分。只修改变化的正文或轮次顺序，阅读旧记录时不强制滚动。未知 fresh caption 没有 turn_id 时仍缺少可证明的归属，按真实接收顺序保留，由原生 final 校正，不能宣称完全消除了该协议限制。
- 手势拨号播放克制的短铃，只有真实 RTC connected 后播放一次接通提示。每通电话独占声音元素与 AudioContext；取消或迟到异步操作不重新响铃。预留同源自定义 ringSrc / pickupSrc 素材接口，用户素材尚未提供；默认声音不代表用户最终选择。离开网页也同步停止声音、麦克风、RTC、meter、SSE 与 heartbeat，beacon 保留关闭后台会话的投递。

## 验证与边界

本地候选必需检查：20 个文件，280/280 通过。包含真实 captured prompt/Harness/Talk 编译及参数完整传递、阶段 progress 不结束 promise、下一步模拟工具完成后才 final；包含持续输入、AEC 拒绝、关闭与晚到权限、轮次移行、停止与重新拨号、声音 generation/timer 清理。模型是否遵守完整目标仍须真实 H5 两步任务验证；单元中的模拟工具不能算实际任务通过。

Chrome 桌面与手机宽度已查看真实渲染。UI-only 布局样本使用原 app renderer 与标注的非真实通话内容，不访问模型或构造语音成功证据；修复手机环境光层的横向溢出。预览拨号保留预览错误，未请求麦克风或付费 session，浏览器无 error/warn。截图保存在任务的 Codex visualizations 目录。

仍需真实扬声器/麦克风检验安静期间没有 assistant-as-user、讲话时能正确打断并返回新题；AEC settings 或合成 PCM 不能替代声学验收。多步测试需一次完整用户请求、第一步真实 tool result、原 H5 播报、无需‘然后呢’的第二步真实 tool call/result 与完整 final。原提前事实播报、父子续传、取消/迟到隔离、重连、最终值保真仍各自记录，不降低门槛。

## 共享收尾

原 b9c9bc8 人工窗口于 2026-10-02 17:38:08.991 UTC 到期。原 expiry 的 TimeoutStartUSec=0 导致立即 startup timeout/SIGTERM，没有开始回退。恢复复用原守卫 plan、精确 artifact 与任务私有 controller，成对恢复原代码、C0 与 trace；17:48:59.265 UTC receipt 为 lease_released/restored=true。17:56 UTC 只读复核确认 baseline `memory-search-guards-20261002`、Gateway PID1417031 ready、C0 `9a8419243b832116e22b52283457586ed8f1a94e0fb235a095e9f7411ce150c7`、trace env null / drop-in absent、pending/lease null；本轮 H5、目录、环境文件、本机 forward 已退出或清理。未来 expiry 应用明确1800s startup timeout，并核对实际 systemd 属性。

第二版尚未部署共享、未合 dev、未部署生产。运行和回退责任仍以任务私有 control manifest 与服务端 receipt 为准。
