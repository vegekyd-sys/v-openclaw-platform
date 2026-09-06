# V-Platform：缓存代际修复收敛与双版本回归

2026-09-06。此记录接续 `RELOAD-MEDIA-REGRESSION-20260906.md`，后者的名额阻断已解除；旧报告中的 218 项离线结果不是本次最终运行验收。

## 共同实现与来源

- 语音修复任务主动停止其 `gpt-live91`，释放名额；V-Platform 没有停止其他任务的实例或扩大资源限额。
- 独立分支 `codex/v-platform-package-20260906`。整合提交 `4fbbfd9abe2f4ed0323b8cb3ad3cbc9a30a408b5`，基于语音修复分支的 `690134196b83f1c12ed87b5b8e2bffa5a3c06e27` 和 `2368bdbfae2e869d0966e4a27d84e004a1291536`；两套 helper 已收敛为一套，没有重复合入。
- `worker-runtime-lifecycle.mjs` 与 `2368bdb` 内容完全一致，SHA256 `05ae993de04d4b2df9ab836c4190988affa4567672f8a077d7fcbd1010995c17`。
- Worker `0.2.12-rc.1`，V-Platform 候选树 94 文件，SHA256 `2a0d10fff51c220ca23afabeb5d44a033476b80d06ce1b300dc45cf494c7198c`；包含 9.2 原生权限适配和媒体桥，不将另一分支的制品指纹混用。
- 后续 `b2678f3e36e498d33ffb86059fa0fc056bd85a8e` 只补充自有停止态的媒体核心装配入口与备份/路径检查，Worker 内容不变。
- 自有实例 `vplatform92`，owner `codex-v-platform-20260906`，端口 26220。未申请共享集成 lease、未连接渠道、未访问或修改生产。

## 必须保留的失败证据

1. 最初嵌套探针继承 Gateway PATH，找不到 `runuser`；改为已核实的绝对路径。这不是 Worker 失败，尚未调用模型或改配置。
2. VLab 基线 `gateway.reload.mode=off`，配置变更只产生 `config reload disabled`。没有把无效触发当成兼容通过。后续仅在本实例停止态备份原 reload 设置并改为 hybrid；探针增加前置断言。
3. 18:02 在启用原生重载后，我的初版代际修复完成首次 Talk 变更及真实回复；恢复原配置后新 Worker ready，下一聊天却在 1 ms 报 `worker pool is closing`。失败证据为 `2026-09-06T10-02-50.324Z-hot-reload-probe-failed.json`。

原因不止全局池关闭：原生缓存可能保留旧 service registration，也可能保留不会再次走 service.start 的 prepared model harness。共同实现同时处理 service context 激活和新请求 admission；不按旧快照配置新建池，不在请求中途换代、迁移或重放。

## 已通过的范围

- 本机 Node 24.1.0 / Linux Node 22.23.1：**222/222**，56 个测试文件，零失败/skip/todo。Linux 18:06:48 完成，9.350 秒。清单指纹 `42bdda0ca94dfa838ead072720fdad4c656845ca5f4edc36a95a23d440a69cb0`，只覆盖清单及登记源码，不冒充整包指纹。
- 9.2 首次完整运行：18:08:54 完成，Gateway PID `1620352`、NRestarts 0 不变。Talk provider 三次切换再恢复原配置，generation 1→5，四次旧 Worker 均退出、新 Worker ready；before 加四轮，五次真实 DeepSeek V4 Pro → exec → 最终回复全部通过，无 fallback。
- 上述四轮总耗时分别 19.012 / 23.970 / 18.849 / 18.865 秒，包含热重载和完整小型模型任务，不是供应商性能测量。
- 证据：实例 `platform-evidence/2026-09-06T10-08-54.284Z-hot-reload-probe.json`，包含每轮真实执行记录的独立引用。
- 同一整合 Worker 回切 9.1：18:13:46 完成，Gateway PID `1620832`、NRestarts 0 不变，同样四次重载、generation 1→5、五次真实模型/工具/最终回复通过。四轮耗时 24.118 / 24.491 / 26.000 / 24.374 秒。证据 `2026-09-06T10-13-46.173Z-hot-reload-probe.json`，源码 `b2678f3`，Worker 内容未变。
- 最终回到已装入媒体适配的 9.2：18:18:10 完成，Gateway PID `1621230`、NRestarts 0 不变。再次四次重载、generation 1→5、五次真实模型/工具/最终回复通过；四轮耗时 19.247 / 18.912 / 23.965 / 23.957 秒。证据 `2026-09-06T10-18-10.531Z-hot-reload-probe.json`，源码 `b2678f3`，与上一轮 Worker 内容一致。
- 共享集成 Gateway PID 始终 `1596728`、NRestarts 0。所有测试均为自有合成会话，原成功测试历史逐轮校验保留，没有生产数据复制或状态快照回灌。

## 媒体装配边界

18:10:54 仅在停止的自有 9.2 核心应用媒体适配；第二次应用 unchanged。原文件与回滚备份校验一致，保留 owner/mode，拒绝路径通过 symlink 逃逸。

- Bundle：`openclaw-tools-CNOZOjlX.js`。
- 应用前 `3f38540ae7f8b2935316d31a7b3fda0bab1b785634788a3a5b1a5ac69932b672`。
- 应用后 `dbe425365b0390e397595060fd2e52e22c8cce3e99315fbccfe601974511ddff`。
- 证据：`2026-09-06T10-10-54.110Z-media92-staged.json` 与 `2026-09-06T10-10-54.245Z-media92-staged.json`。

先前实际原生函数体的媒体契约检查已通过，包含 pending 重试、附件、歧义终态、成功/失败清理。但本轮尚未生成真实媒体或发到渠道，不能标记媒体用户链路完成。

## 收尾状态

三轮最终候选运行（9.2 → 9.1 → 含媒体适配的 9.2）均通过，各四次热重载、各五次真实模型/工具/最终回复；此处的 15 次成功不包含前面明确保留的反例和环境前置失败。

18:23 已停止自有 `vplatform92`，PID 0；恢复实验前的 `gateway.reload.mode=off`，每轮临时 Talk 配置也已按原字节还原。所有旧核心、Worker、原媒体 bundle 备份和合成证据保留，没有删除其他任务资源。

最终登记候选 `b2678f3e36e498d33ffb86059fa0fc056bd85a8e`，含历史备份的运行目录指纹 `5daf6f5d84d3ba030a2e0d5fd4106d0c672924d243ef9a92b6dcdb6c1949b843`，96330 文件；不是可分发安装包的制品锁。

18:27 控制器补充 `3fb289e8163dd6847f3784999f97f001a18ed002`，允许后续实验复用内容核对一致的 reload 基线备份，不覆盖旧回滚记录。已在停止态实际重复 enable/restore，配置前后 SHA256 同为 `3713dcc582456e27aa87caba946542e10719bed5b347594fb90685815a260fe1`，实例始终 PID 0；Worker/核心制品未变化。此控制器与文档更新不计为新的模型验收轮次。

源码已本地提交，并同步候选至自有 VLab；文档后续提交不冒充重新部署。未合并共享集成分支、未推送远端 Git、未发布生产、未发渠道测试消息。另一任务曾提出共享飞书验收计划但随后明确撤回，V-Platform 未据此取得 lease 或做共享/渠道操作。

完整安装包、组件制品锁、Codex/渠道/Browser/记忆/调度/负载、业务数据迁移和生产发布仍分别受 release-check 阻断；以上不是这些门槛的替代证明。
