# VLab 原生执行试运行

用户在主任务明确授权去掉 Worker、合入 VLab 试运行并做好回滚。仅限共享 VLab 24993，生产不动。不删除 Worker 文件，也不合入另外三项冷启动候选补丁。

本变更是独立配置迁移，不是 runtime 文件发布：现有 release/全量代码校验保持不变。禁用 Worker 插件，从 allow/load 移除其加载项，将模型表中 vlab-worker 执行选择替换为 openclaw。其他配置不变，数据库不复制、不回退。

脚本 lab/native-execution-rollout.mjs 复用已实测 A/B 驱动，改为当前任务 owner 和独立证据目录，并增加 release 漂移保护、切换中启动失败时恢复先前配置。配置转换有纯函数测试。所有写入必须持有当前任务 integration lease。

服务器脚本目录：/srv/vlab-production-mirror/labs/shared-workflow/source/lab/。Node：/opt/vlab/node-v22.23.1-linux-x64/bin/node。

切换：sudo NODE SCRIPT switch native；运行前保存 original-config.json 和 manifest.json，仅服务器私有权限0600。恢复：sudo NODE SCRIPT restore worker，通过原生 drain 后逐字节恢复配置。若服务已经停止/失败，使用 lab/native-execution-recover-offline.mjs；该命令拒绝停止任何活跃Gateway。先核对服务失败原因、lease、config/release SHA，不删除pending记录或抢占任务。

私有回滚和证据目录：/srv/vlab-production-mirror/labs/control/native-execution-rollout-20260911。不得将配置备份传到本机或 Git。

验收：完整重启后不预热Agent，先冷态 C15 短回复（与旧C15相同模型/high）；随后暖态对照、真实工具和独立上下文。首正文、完成、控制面超时分别记录。任何错误先停止升压并诊断；明显退化或功能不通过则回滚。通过也不等于生产可直接移除Worker。

本地配置范围与现有安全合同：8/8通过，合入后重跑通过。

## 实测结果（2026-09-11）

已合入dev并同步到VLab的执行脚本提交：33950511290ab38459c6ac00371a8644ae4dce1a。runtime代码未更新，current.release仍为worker-cold-firsttext-20260911-v2；该名称仅表示保留的代码产物，实际执行配置已是native，不能用release旧acceptance描述本次模式。

原配置SHA256：26dbea9e8fadfd6ba1a546f06f0a1297805b1cc99bfe437f3d4868e1167c37f7。
原生配置SHA256：ecd3d0706b9a0cb20fab21050c762fcf71e9df5529df4f54e5a26083104100fb。
运行时SHA256基线：6d0ce20734bb8188f5c7042d08bbba9620067f7f6e3b17f2cf929f9dd22bb91f。

Gateway PID1848884，服务08:32:27 CST启动，08:35:34.257监听，约187秒；其中原生完整数据库预检162.685秒。此段不是请求TTFT，未跳过完整性检查。

| 测试 | 正确且持久化 | 首正文P50/P95 | 最终P95 | HTTP最大/超时 |
| --- | --- | --- | --- | --- |
| 冷态C15短回复，无Agent预热 | 15/15 | 13.136/14.746秒 | 14.837秒 | 2136ms / 0 |
| 后续暖态C15短回复 | 15/15 | 10.705/12.081秒 | 12.122秒 | 1710ms / 0 |
| C5真实exec，10秒等待+唯一标记 | 5/5 | 16.117/16.461秒 | 16.600秒 | 391ms / 0 |

三批使用deepseek/deepseek-v4-flash与high，原配置默认deepseek/deepseek-flash未改。每批均检查真实模型、唯一正文、工具结果（适用时）和已持久化终态；无HTTP/health RPC错误。观测最高cgroup内存约10.10GB，无Worker槽位。工具事件区间峰值5，仅是事件跨度，不宣称精确同时工具进程数。

与此前Worker完整冷态C15的P50/P95=70.272/77.936秒相比，这一批原生结果明显更短，但不是交替多轮严格A/B，也未重置数据库或清空OS页面缓存，不构成稳定SLA。暖态本次10.705秒没有优于此前Worker暖态8.265秒。

专用session agent:makaron:explicit:vlab-dev-native-context-20260911-a 的连续两轮也通过：第一轮记住合成代号，第二轮不提供代号而正确回忆NATIVE_7319；两轮默认Flash均持久化，最后status=done、hasActiveRun=false、agentRuntime.id=openclaw。共37回合功能通过；独立HTTP监测覆盖上表35回合。只读RPC入口拒绝sessions.patch后改用正式test命令，没有绕开保护。只读验收脚本初版函数名错误已修正，未影响运行时。

原始三批证据：native-short-15-1789086974878.json、native-short-15-1789087006618.json、native-tools-5-1789087029210.json，位于上述服务器私有证据目录。

仍未验证：本次原生C30/C40、真实渠道端到端、Browser/Memory、长历史压缩、取消与崩溃隔离、其他harness。VLab可供试用，不代表生产去Worker全部验收。启动前187秒和忙时控制面1–2秒级停顿仍在。

回滚不需要删除代码：持有lease后执行服务器node + lab/native-execution-rollout.mjs restore worker。该路径排空任务后恢复备份原字节并重启；若服务已失败则用recover-offline脚本。恢复后执行native-execution-verify.mjs校验，并以真实回复验收。此次没有为了演练再次来回重启；原配置备份保留，不回退新增对话。
