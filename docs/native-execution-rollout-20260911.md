# VLab 原生执行试运行

用户在主任务明确授权去掉 Worker、合入 VLab 试运行并做好回滚。仅限共享 VLab 24993，生产不动。不删除 Worker 文件，也不合入另外三项冷启动候选补丁。

本变更是独立配置迁移，不是 runtime 文件发布：现有 release/全量代码校验保持不变。禁用 Worker 插件，从 allow/load 移除其加载项，将模型表中 vlab-worker 执行选择替换为 openclaw。其他配置不变，数据库不复制、不回退。

脚本 lab/native-execution-rollout.mjs 复用已实测 A/B 驱动，改为当前任务 owner 和独立证据目录，并增加 release 漂移保护、切换中启动失败时恢复先前配置。配置转换有纯函数测试。所有写入必须持有当前任务 integration lease。

服务器脚本目录：/srv/vlab-production-mirror/labs/shared-workflow/source/lab/。Node：/opt/vlab/node-v22.23.1-linux-x64/bin/node。

切换：sudo NODE SCRIPT switch native；运行前保存 original-config.json 和 manifest.json，仅服务器私有权限0600。恢复：sudo NODE SCRIPT restore worker，通过原生 drain 后逐字节恢复配置。若服务已经停止/失败，使用 lab/native-execution-recover-offline.mjs；该命令拒绝停止任何活跃Gateway。先核对服务失败原因、lease、config/release SHA，不删除pending记录或抢占任务。

私有回滚和证据目录：/srv/vlab-production-mirror/labs/control/native-execution-rollout-20260911。不得将配置备份传到本机或 Git。

验收：完整重启后不预热Agent，先冷态 C15 短回复（与旧C15相同模型/high）；随后暖态对照、真实工具和独立上下文。首正文、完成、控制面超时分别记录。任何错误先停止升压并诊断；明显退化或功能不通过则回滚。通过也不等于生产可直接移除Worker。

本地配置范围与现有安全合同：8/8通过。实测待补。
