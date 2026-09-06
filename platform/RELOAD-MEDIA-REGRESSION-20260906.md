# V-Platform：Worker 热重载与 9.2 媒体完成契约

2026-09-06 17:52（北京时间）。本轮是候选修复与契约验证，**不是新发行包或生产验收**。

## 来源与隔离

- 分支：`codex/v-platform-package-20260906`，独立 worktree。
- `f2760487974fcbebc107af5f8d173f84a5440e8b`：Worker 代际生命周期、服务租约、原生热重载探针。
- `c05948c5bd4a500baabc44a3498cbffafb7c075d`：9.2 媒体状态适配、原生代码契约探针。
- VLab 自有实例 `vplatform92`，owner `codex-v-platform-20260906`，端口 `26220`；只用规定的 Tailscale SSH 入口。
- 17:51 暂存的 Worker 候选树：93 文件，SHA256 `4b77933d9efb59ccc8eddc1535aaab0b70b9ed6429a505c3aecf98667e499e1e`。
- 同时包含历史备份的运行目录指纹 `3c040ec6fe1f6634a91f248ac4c328dcb6a2818523ab1da7b1052c567bd56b31`，不是分发制品指纹。
- 源码和候选已同步到自有 VLab；未合并、未推送远端 Git、未发布。生产未连接、未修改。共享 Gateway PID `1596728` 未变。

## 修复及通过的证据

1. 关闭的 Worker pool 不再被共享全局入口复用；新一代使用独立请求表、进度桥和统计状态。进度回调绑定创建它的代际，而非查当前全局代际。
2. 服务 start/stop 使用独立租约；重复 stop、延迟旧 stop、并行 start、启动中 stop 均有回归。关闭操作等待同一个终止 Promise，已关闭池不能伪报启动成功。
3. 9.2 媒体 wake 函数前移，且返回 delivered/pending/permanent_failure。新增显式 9.2 变换，保留原生调用参数、requesterAgentId、附件、幂等键、返回值判断和重试逻辑。旧版本变换仍独立保留，不把新代码直接套在旧 bundle 上。
4. Gateway 事件桥保留 disposition/error；pending 不缓存为已完成，ambiguous 终态不重复投递。9.2 Worker IPC 失败不转为可能无效或重复的本地投递。
5. 本机 Node 24.1.0 和 VLab Linux Node 22.23.1：55 个测试文件，**218/218**，零失败/skip/todo。Linux 17:50 完成，8.935 秒。
6. 在实际 9.2 `openclaw-tools-CNOZOjlX.js` 上，变换、全 bundle 语法检查和幂等性通过。执行实际 wake/schedule 函数体，以合成依赖验证 pending→delivered、ambiguous、permanent_failure、生成成功/失败均释放 detached ownership，保留原生无 transcript 写入上下文。

原生媒体 bundle 检查前 SHA256：`3f38540ae7f8b2935316d31a7b3fda0bab1b785634788a3a5b1a5ac69932b672`；变换后内存中 SHA256：`dbe425365b0390e397595060fd2e52e22c8cce3e99315fbccfe601974511ddff`。**没有把此变换写入运行核心**。

元数据证据在自有实例 `platform-evidence/2026-09-06T09-50-14.221Z-media-contract-probe.json`。没有实际生成媒体或向渠道发送消息，因此不能标记媒体用户链路完成。

## 当前阻断与下一步

17:44 `labctl start vplatform92` 被资源控制拒绝：`Two-instance CPU/memory budget reached; stop your unused instance first`。17:51 复核两个名额仍由另一个任务的 `gpt-live91` / `worker-reload` 占用，owner 均为 `01a074fd-0a5f-7c02-b86a-10dbed7c4eb4`。

未停用其他任务、未扩大资源限额；自有实例保持 inactive、PID 0。本轮没有模型调用和配置热重载，不能将之前 13 点首轮运行验收当作本次修复后的证据。

名额释放后：

1. 用 labctl 启动本实例，执行 `lab-reload-probe.mjs vplatform92 codex-v-platform-20260906 2026.9.2`。探针先跑真实模型/工具/最终回复，再变动一个 Worker 超时参数 1 ms 触发原生插件热重载，等待新 Worker PID，验证 Gateway 不重启及真实回复；恢复原配置后重复验证。
2. 同候选在 9.1 上重复生命周期验收，仍由 labctl 控制核心切换和服务。
3. 媒体补丁需通过 owner/停止态检查的装配入口应用，再进行真实完成回传、附件交付及失败重试验收；外部渠道需对应授权/独占交接。
4. 完整来源盘点、制品锁、干净安装、全能力与迁移/回滚门槛继续保留，release-check 仍应阻断。

注：原有媒体补丁 CLI 的历史版本限制没有放宽为 9.2；新 9.2 纯变换由 V-Platform 检查入口调用，不提供未经 owner 检查的运行时写入捷径。
