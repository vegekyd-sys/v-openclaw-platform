# 共享 VLab worktree / dev 流程验收

日期：2026-09-10。负责人：01a08980-b920-7a40-8532-6494d060725b。

## 已验证

- 本机任务 worktree `/Users/tianyicai/v-worktrees/vlab-flow-proof` 约 3.4MB；服务器 `labs/shared-workflow/v-worktrees/remote-flow-proof` 约 3.6MB。没有新增 Gateway，也未复制 runtime 或 state。
- 唯一集成分支 dev 位于 `/Users/tianyicai/vlab-dev`，Git common dir 为 `/Users/tianyicai/v-openclaw-platform/.git`。服务器 dev 镜像位于 `labs/shared-workflow/source`，有自己的共享 Git 对象库。服务仍使用原来的配置与数据路径。
- 11 项自动检查通过：真实双 worktree 隔离、精确 SHA 合并、脏 dev 拒绝、路径与 symlink 拒绝、重复/损坏 payload 拒绝、代码漂移检测、原子替换不损坏 hardlink 基线、精确回滚、原生 suspend ready 协议与暂停后的 RPC 调用顺序。
- 实机错误 owner 部署被拒绝；Gateway PID 与 release 未变。
- 代码基线 `shared-20260910-base` 为服务器导入代码归档，不是全部由 Git 源码重建的声明。归档 393077238 bytes（约375MiB），61382 个代码文件/链接，未复制 state。
- 归档 SHA256：`243880cc127b54cebd9d91dc6ff88c0616081876f1c4b7f724d444a6b45659a7`。
- 初始完整 runtime fingerprint：`f3aea726862c33a748a46642aba3a8cf0b986f686f881d55b34e87c5495c21bf`。
- 演练产物 `shared-workflow-proof-v1` 来自 dev 提交 `bfa46acb5325ebc77d577896d240d952c267af9e`；新增一个无 Gateway hook、无状态写入的可执行证明模块。
- artifact SHA256：`39de7d883e908a225a6ec56e8181d4b5413c1cd13f5b6ddf0e75deaef95da6ea`。
- 部署收据时间 `2026-09-10T06:59:58.809Z`；PID 1785543 → 1788561。完整 runtime fingerprint 变为 `565cf8499b911e58b8f5bf1b86ff7d1328426c188e9f604ea52d828bc8738b1c`。
- 配置 SHA256 始终为 `8d32f91b7d9d85a44d3c46e2e755bda18e43f2171d0aed4813e7aa5e01d62a7e`。
- 专用测试 session：`agent:makaron:explicit:vlab-dev-continuity-proof-1789022965942`。部署前 run `vlab-dev-1789022965942`，部署后 run `vlab-dev-after-proof-20260910`。原生 `vlab-worker` / DeepSeek 完成前后两轮真实执行；历史记录包含实际 exec toolResult，部署后成功执行新代码并保留前文口令。无外部渠道消息发送。

## 实机发现与已修复问题

1. 9.1 的 `gateway.suspend.status` 在 ready 状态不返回 activeCount。入口改为识别 ready，保留 TTL 校验；此前错误延期没有修改 runtime。
2. 暂停后禁止调用 Worker 插件 RPC。现在先检查 Workers，再通过原生 admission fence 确认 chat/queued/cron/terminal 已排空；测试覆盖检查顺序及超时恢复接入。
3. 共享 VLab 启动前保留完整数据校验，本轮约78秒，整个启动约100秒。入口允许180秒等待就绪。这不是本次流程对冷启动性能的修复。

## 运行边界

- 本轮安装的是 VLab 开发与发布工具。生产 V 未变更。
- 对话连续性和工具执行在专用 Gateway 会话中验证；未宣称本轮做了新的飞书端到端验收。
- 新入口当前支持小批代码新增/替换。配置、依赖大版本、删除文件、数据库迁移另行处理。
- 在线 runtime 不再接受无记录热改；fingerprint 漂移会阻止后续发布。
- 基线归档留在服务器，不进入 Git；日志、对话正文、凭据和在线数据库未纳入源码仓库。

## 回滚

- 回滚收据：`2026-09-10T07:05:35.245Z`，PID 1788561 → 1788850。
- 演练模块已移除，完整 runtime fingerprint 精确恢复为初始 `f3aea726862c33a748a46642aba3a8cf0b986f686f881d55b34e87c5495c21bf`，配置 SHA 保持一致。
- 最终运行原业务代码基线；新开发/发布控制工具仍安装并启用，演练产物及接受/回滚收据留在服务器供审计。
- `current.accepted=false` 属于最初导入基线的原始标记；本次已验收演练产物的接受收据单独保留，不将基线冒称为重新完成飞书生产验收。
- 回滚后同一会话 run `vlab-dev-rollback-proof-20260910` 完成：真实 exec 确认演练文件不存在，前文口令及前一轮工具结果仍保留；最终回复通过验证。
