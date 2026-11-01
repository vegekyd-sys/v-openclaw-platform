# PR #511 生产发布记录

用户于 2026-10-30 明确授权上线，并要求使用 `v-self-restart`。

## 版本与边界

- 已验收 dev 提交：`60afc19494127f10bc188fdd0aa8b4c00b5c25d9`。
- 共享 VLab release：`desktop-handback-progress-20261029-v1`，117 项回归及真实页面交还链路通过。
- 验收主产物 SHA-256：`1876a504b6e0c7687fe5fabea0f07be0a5b88b652583f1e1c8fe8de0fc3ef46f`。
- 生产发布名：`v-desktop-handback-progress-20261030`。只更新两份飞书产物及两份桌面插件文件；配置不变。
- 相对 2026-10-28 发布的七组件快照，只有飞书两份文件变化；桌面插件单独按下面的清单记录。

## 回滚

- 飞书产物备份及 undo.json：`/opt/v-release-backups/v-desktop-handback-progress-20261030-20261029T162319`。
- 桌面插件备份、权限和 undo.json：`/opt/v-release-backups/v-desktop-handback-progress-20261030-sidecar`。
- 回滚恢复上述四文件，再通过 `v-self-restart` 激活，随后重新 capture、更新漂移期望与 VLab 对齐。

## 激活与生产验证

重启请求 `20261030-002355-8763`：`--delay 0 --if-busy abort --idle-timeout 3600`；等待其他回合自然结束，禁止超时强制重启。结果 `ok`、无告警：等待空闲 405 秒后正常停机，启动 111 秒、恢复检查 50 秒；00:33:21 CST 完成。5/5 workers 就绪，2/2 streams 恢复。旧失效 Codex 登记清理 3 条，重启后已知错误统计均为 0。

真实生产确认 HB511Q（Codex / VDS DeepSeek）：页面自动接管稳定后单击“交还给 V”，页面与服务均确认控制权归还；插件认领只启动一个 run。原群同一张卡先显示 `HB511Q_PROGRESS` 和 Bash 状态，随后显示 `HB511Q_RESULT`；ledger 为 completed/delivered，原生 ACK 的 messageId 与该卡一致。

- [真实最终消息](https://applink.feishu.cn/client/chat/open?openChatId=oc_104de99774aea6a55f5ae46863e99ef3&position=304)。
- [脱敏证据](desktop-handback-production-evidence-20261030.json)：按时间排序的可见卡片快照、唯一 run 与投递回执。
- V/VLab 对齐检查比较 18850 个文件，状态 ALIGNED；生产漂移检查 9251 文件 / 7 roots，0 findings；825 个归档文件逐字节验证且七组件 manifest 通过可复现性检查。
- 测试接管均已结束，控制权已释放；验收群模型恢复原默认 `deepseek/deepseek-flash`，integration lease 已释放。
- 首次 P 验收的自动化点击与页面自动接管刷新交错，额外点击重新接管；未产生重复续跑。随后 Q 按稳定页面状态单击交还通过，不把这个测试时序问题归因为本次补丁回归。

