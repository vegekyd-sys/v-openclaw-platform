# GPT Live 飞书兼容验收

目标：证明启用 GPT Live 的原生插件热重载不再破坏普通 Worker / 飞书。不是 V Platform 升级。用户明确授权两条 V - Lab 私聊测试消息；集成负责人交接后，由任务 01a074fd-0a5f-7c02-b86a-10dbed7c4eb4 获取 integration lease，未操作生产。

## 基线与候选

共享实例 24993 / OpenClaw 2026.9.1，原 Worker 为 0.2.10，路径 worker-image-provenance-5f9e136。候选固定为 2368bdbfae2e869d0966e4a27d84e004a1291536 / 0.2.12-rc.1，复制到新目录 worker-gpt-live-2368bdb，旧路径完整保留。不是声称在共享 0.2.11 上仅叠加补丁。

5f9e136 是候选祖先；差异包括已在生产 0.2.11 接受的 native steer 修复与本次生命周期修复。native-harness-data.mjs 与共享原文件一致，SHA256 3e0b35195ed9652b5a2dac829ef3a67a4dcdddb915c0de50d27a5f08bff095ca；保留原生图片事实归属。未引入 9.2、媒体适配、浏览器或渠道实现变化，未修改默认模型和会话模型。

## 真实消息结果

专用目标为 Tianyi 与 V - Lab 的私聊 oc_8f28eb6bcb3b847471693f066dac61c4，以用户身份发送恰好两条消息。

| 阶段 | 输入消息 ID | 可见回复 ID | 结果 |
| --- | --- | --- | --- |
| Google 配置 / generation 1 | om_x100b66e02fee0cacddbd4d00e3c00e6 | om_x100b66e02ac800a0b2c2d6aeed76b8d | VLAB_HOT_RELOAD_BEFORE_OK |
| 启用 GPT Live / generation 2 | om_x100b66e0223faca0c2c770e657f25e0 | om_x100b66e02052c4a8b1726578b28dbe9 | VLAB_HOT_RELOAD_AFTER_OK |

两轮均有 receive → dispatch → 真实 exec printf 工具结果 → 飞书卡片最终回复的证据，实际 deepseek-v4-pro / vlab-worker，无 fallback。两轮分别于 18:53:07、18:56:16 收到消息，18:53:54、18:56:44 完成 dispatch，replies=1。

Google → OpenAI 配置热重载期间 Gateway PID 1622738 不变，Worker PID 1622887 → 1623057，generation 1→2，closing=false。恢复原 Talk 后 generation 3 / Worker PID 1623182；内部 deliver=false 的真实 DeepSeek / exec / final 恢复检查也通过，未增加第三条外部消息。

GPT Live 实际语音输入、Worker 工具执行和可听语音回复在独立 gpt-live91 实例验证；本共享检查证明配置启用与飞书兼容，不冒充共享实例完整语音账号或音箱硬件验收。

## 部署过程中的失败与修正

首次同时改变 load.paths 并将 reload off→hybrid，触发 9.1 自动退出；共享服务是 transient unit，干净退出后定义消失，随后 restart 找不到 unit。部署前已确认无活动任务；生产未受影响，测试消息当时尚未发送。

使用既有 /srv/vlab/staging/vlab91-start-mirror.sh 恢复原启动定义。该脚本与仓库版本 SHA256 同为 375a333c9dc99fe44ab7770e7abe8c8dbf4b903d53dc2c2333f21ac733d64e6d，原用户、环境引用和资源参数保持一致。恢复加载期间有明显数据库磁盘冷读等待，约六分钟后 Gateway / Worker / 飞书长连接完整就绪，之后才发消息。脚本现改为先保持 reload off、保存 unit 定义、受控重启后再单独 arm。

第一次启用配置缺少现有 providers map 中的 openai 项，被原生校验拒绝并跳过重载，未计为通过。补齐 provider map 后观察到真实 generation 递增；脚本已改为每次临时配置均先 validate 再原子替换。

原配置备份仅保留服务器私有目录 state/gpt-live-channel-check-20260906。收尾恢复原 Talk 和 reload=off，保留已验收的新 Worker 路径，交還 integration lease。不得把这一 VLab 验收写成生产 GPT Live 已恢复。
