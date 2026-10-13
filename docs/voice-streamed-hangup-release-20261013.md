# Voice 忙时挂断发布记录

平台产物 voice-streamed-hangup-20261013b 基于已在 V 上验收的 restart-speed-20261013，只替换 realtime-quicksilver-delegation-controller-B0yPpiHp.js。平台 PR #344 已合入；没有新增核心准入、权限、Worker 或业务工具改动。控制器 SHA256 3e098e6a43b5aa3bd4fc2c713e0e5616da357555629c5a2c3e7c8f8df235a03b，已验收产物 SHA256 4276fd6a34963894de7ed2b10712366b736ef94ffa5667cd92fa80b0e3bd5110。

Voice PR #4 使用稳定转录和停声确认；生产验证后，PR #5 将挂断输入统一为实际原生 USER 字幕，以消除 Gateway 转录转发差异。最终 Voice 源码 85d18ab0a8cbcfde4f6e54d4c2525fe335dfc4a1，153文件 SHA256 20b5bf56e3fcf3dfefe94a189802a3decc55c481bcd3a833581d69a958b3598b。已加载 Gateway provider 插件逐文件 SHA 与最终包相同，因此 PR #5 只切换 Voice，不再重启 Gateway。多账号 Voice PR #2 未合入。

记录区分磁盘安装与运行生效：生产单文件补丁先按共享验收产物复制并保留回滚；等待真实飞书任务排空后，通过 native suspension preserve 取得 ready 回执，再重启 Gateway，未取消或强杀非 Voice 任务。生产原有自动配置重载行为保持不变。Voice 单独在没有活动电话时切换，保留原启动参数、私有环境与回滚文件。

本目录捕获的是此次已安装平台代码相对 npm 基线的实际差异，用于后续精确重建与升级维护；没有 Voice 私有配置、凭据、聊天正文或数据库。最终浏览器业务验收结果在独立任务报告与对应 Voice PR 补齐。

后续 Gateway 重启统一使用 `v-self-restart`，继续先核对活跃任务与暂停恢复回执；不再直接调用 systemctl 重启 Gateway。最终 Voice 85d 切换后 Gateway PID 保持111909，Voice PID190845。生产真实后台任务进行中，用户说“请挂断电话”，V 回复“好的，我现在挂断。再见，下次聊。”，随后 WebRTC closed、页面 idle、聊天为空；发送轨道保持预热但 enabled=false。

最终85d生产插话验收：真实后台tool.result及delegation.context.appended后开始播报平方列表；用户插话“先别说了，我想问你现在听得见吗”，旧播报native-speech-plan-retired一次，回复“听得见，你说吧”，后续没有恢复列表。少量已排队字幕尾片段仍到达，不表示零延迟。共享VLab accepted/aligned、pending=null，integration lease已释放。
