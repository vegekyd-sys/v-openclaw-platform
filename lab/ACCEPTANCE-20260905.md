# VLab 实例隔离验收 — 2026-09-05

状态：**基础设施隔离已在 VLab 实测通过；未修改生产 V。** 这不是 Astra、Worker 新候选或完整迁移的功能验收结论。

## 实际创建

| 实例 | 本机分支 | 运行端口 | Linux 用户 |
| --- | --- | --- | --- |
| astra | codex/gpt6-astra-support | 26100 | lab-astra |
| isolation-check | codex/lab-instance-isolation | 26120 | lab-isolation-check |

两者分别有独立 source checkout、runtime、config、worker overlay、HOME、STATE、workspace、Codex HOME、Gateway token 和 systemd cgroup。代码从基线复制，不使用 hardlink。

基线：`v-production91-20260905`，完整 runtime SHA-256：
`7c7c154754b9f03a4409989da8488ed9621233dbc9beecc166c931cc1a7446ef`

来源边界：生产 OpenClaw 核心逐文件 SHA-256 校验通过；Worker 从生产版本复制（报告 0.2.9-rc.2）；npm 依赖代码来自 VLab 快照并重定位链接，**不能把整个依赖树称为与生产逐字节一致**。没有复制生产 Session、Memory、认证库或渠道配置。没有继承共享 VLab Worker 0.2.10-rc.1 的验收结论。

## 隔离验证（14:12:52 Asia/Shanghai）

`accept-isolation.mjs` 的 8 项检查全部通过：

- 两个 Gateway 同时 health OK，plugins.errors 为空；channels 为空。
- A、B、基线 package.json inode 不同。
- 用 A 的 Linux 用户改 A 的代码文件，B 和基线 hash 不变；测试修改已恢复。
- A 用户无法访问 B 或共享集成 Gateway 的配置。
- 用错误 owner 停 B 被拒绝，B PID 不变。
- 重启 A：PID `1561275 -> 1562023`。
- B PID 保持 `1561300`；共享 24993 PID 保持 `1558949`。
- A 重启后 B health 仍正常。

服务器证据：`/srv/vlab-production-mirror/labs/control/isolation-acceptance.log`。

## 真实 Worker 短工具验收（约14:14–14:15）

在 isolation-check 的新 Session 运行 `printf LAB_PRIVATE_TOOL_OK`，随后回复 `LAB_PRIVATE_REPLY_OK`。

- runId：`031c467a-d893-4af8-b7c6-ad9bdf03daf5`
- 结果：status=ok / completed，返回 `LAB_PRIVATE_REPLY_OK`
- runtime：`agentHarnessId=vlab-worker`
- 模型：`deepseek/deepseek-v4-pro`，无 fallback
- 工具：exec 调用 1 次，失败 0 次
- 耗时：11,437 ms
- Worker status：1 个 ready Worker，maxActiveSessions=2，pending=0

这条测试经本实例原生 CLI/Gateway/Worker 完成，**没有向共享 VLab 或生产机器人发送消息**。

## 容量和交接

- 每实例 CPU100%、MemoryHigh2GiB/Max3GiB，最多两个个人实例同时启动；数据盘保留3GiB。
- 额外 Control UI/Browser QA 仍需由统筹负责人合并计算宿主机预算；labctl 的两实例限制不计算遗留的外部 systemd 服务，不能当成全主机总预算保证。
- 共享24993交给统筹任务 `01a06fbe-7654-7331-8d6e-73a8cd2dcd7e` 持有 integration lease，不再作为个人开发默认目标。
- 验收结束后停止 isolation-check，仅保留数据和证据；astra 供后续 Astra 独立验收。
- Astra 双路径验收及生产交接完成后，由本任务确认自己的 Worker 无 active/pending/queued，再停止 astra；保留目录、代码和证据，不释放统筹线程持有的 integration lease。
- `vlab91` SSH 入口只存在 Tianyi 本机。生产 V 没有 `vlab` SSH 别名，本轮没有建立 V 到 VLab 的自助访问授权。
- 管理员 sudo 可以绕过保护；已补共同项目 AGENTS 入口并通知并行任务。旧脚本若绕过 labctl 直接操作共享路径，仍是违反流程，不能宣称操作系统能阻止有 root 权限的人。

## 本轮发现并处理

- 绝对 npm 插件链接指向旧共享 OpenClaw：仅在新基线重定位为相对私有代码链接。
- 全新9.1状态可能自动安装缺失插件并要求启动收敛：工厂配置改为显式指定已有私有 provider 代码，避免隐式安装最新版。
- maxWorkers=1 时 warmSpareWorkers 默认1非法：实例模板显式设为0。
- 初次尝试全量跨机流式复制因 Tailscale 吞吐低而终止；改为本地代码复用、生产只读 hash 比较、仅传输5个差异核心文件。生产未写文件、未重启。
