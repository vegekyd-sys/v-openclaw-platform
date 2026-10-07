# Voice 2026-10-08 上线记录

用户授权「可以安排上线」后，将 PR #251 的同一运行时产物从共享 VLab 推广到 V，原 `/voice/?entry=tianyi` 入口保留。共享 VLab 的功能验收、媒体严格检查及真人听觉结论分别记录。

- 功能源码：PR #251，合入 dev `dd5e4cdb389148e39ca81c9130a61f77287fa557`。
- 共享 release：`voice-reliability-20261008`；stage artifact SHA256 `f1a7f7eef03346182c267bbe4725d1047ae29b7084f5a1c2272b09b5923f30ab`。
- V release：`v2026.9.1-db91.6-voice-reliability-20261008`，11 个运行时文件，捕获五个组件并更新漂移哨兵，首次检查 9137 文件、0 findings。
- H5：同一提交的 38 个文件，集合 SHA256 `1f0d855faf2cf3f7ec96e8dde0a56dacfc83ae53bee25a490682786a4a237f98`。

## 共享功能证据

小何/Grok 分别经过原 H5 的一次完整 USER 输入、实际 Memory 工具调用及原语音回答；简单查询未委派后端，复杂问题一次委派后端并自动返回结果。GPT Live 另有 Memory → Web search → 官方原文读取与原语音样本。新长任务样本 `eda62700-cf35-4b39-9aa0-8a7637d9a181` 经过实际 exec、后台状态、完整 Markdown 方案、原音频摘要，再对后续用户输入回答「好，不挂，你说吧」，未重复旧方案，精确关闭后自有浏览器/媒体退出。

独立功能检查 15/15 通过；整体旧严格 observer FAIL 保留。原媒体 observer 对同页授权复用后的 retained mic track 仍判 captureEnded=false，浏览器实际退出后资源已释放；直接模式 observer 忽略 injected-speech 的旧失败与 Grok 单次 underflow 也保留。最终保真、物理 Safari/AEC 与双向音频严格门槛没有因此改为通过。

## V 切换

原 Gateway 排空、取得 native ready fence 后受控停止，推广同一份 11 个字节并保留 `/opt/v-release-backups/` 的 undo。新 Gateway PID 129267，配置 SHA256 `9395cc48061647fb9cd26590aac74894e5a74ffeb32fe337f6e4377bec93b9ec` 保持；原 H5 冷启动期间首次就绪期限失败，其 prepared 原回执保留。新 H5 通过实际字节与 HTTPS ready 读回，PID 133716。Gateway 启动守卫在恢复旧 RTC 身份时拒绝，因为本轮授权的新 H5 切换已改变 RTC 定义；原失败未覆盖，也未再次启动 Gateway。独立健康检查确认新 Gateway/5 Workers ready 与 11 个 after 字节。

VLab align 已成功：18658 文件比较、当前 release accepted=true、aligned=true。生产原 HTTPS `/voice/?entry=tianyi` 的实际通话已验证：GPT Live 的独立年份问题经过原生通话返回 2021，原 WebRTC 接收音频实际解码为 PCM（RMS 0.02462）；小何一次实际 memory_search 调用/结果后回答 2021，Grok 从已有上下文直接回答 2021。后二者原 AudioWorklet 播放输出已实际录制解码。三模型分别使用原拨号/挂断按钮，最终 idle，所有自有测试 Chrome 退出，Gateway/H5 身份保持。Grok 这条生产样本没有再次调用工具；其实际工具回路由共享独立样本验证，不能把本条生产缓存回答计作新的工具调用。

生产独立回顾只验收以上功能范围。r1 的 60 秒答案期限 FAIL、r2 姓名字幕保真偏差 FAIL，以及 r3 直接音频观察器只录了同一 AudioContext 的拨号声音而跳过 speaker 的 FAIL 均保留。r4 只补验未取得真实输出音频的两个直接模型，观察器连接原 speaker 输出，产品代码不变；没有重复已通过的 GPT Live 音频样本。所有严格门槛与真机听觉仍未整体验收。私人生产功能证据汇总 SHA256：`58a7a14d4f6299a135632e795e7463088c4edcbf41c8f26ce0cdc86b3eb2859a`。

私人证据目录：任务 worktree `tmp/voice-reliability/release-20261008`，包含原始失败和独立检查；不公开对话、音频或凭据。
