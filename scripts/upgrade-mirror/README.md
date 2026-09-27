# 升级演练机脚本（vlab91 `/srv/versa-mirror95`）

演练机是 vlab91 上独立的一份 V 镜像（端口 25096，用户 versa-rehearsal），不碰共享 VLab、不碰 V。
这些脚本在演练机的 `/srv/versa-mirror95/scripts/` 下运行，这里是入库副本。

| 脚本 | 作用 |
| --- | --- |
| `start-gateway-prod.sh prod91\|95` | 按生产 V 的开关、堆上限、资源限制启动 Gateway（`VERSA_CORE_DIR` 换核心） |
| `candidate91-run.sh <包\|prod91> <标签> [飞书包]` | 装候选包 → 生产配置启动 → 预热 → 功能验收 → c1×3 c5×3 c15×2 |
| `accept.mjs` | 功能验收：普通对话、exec、memory_search、cron、workboard、sessions_spawn + 6 个接口 |
| `bench.mjs` | 并发测速（标签只能小写字母、数字、连字符） |
| `cpu-c15.sh` | 15 并发期间按进程类别统计 CPU 秒数 |
| `noworker96-config.mjs` | 9.6 无 worker 模式配置转换：`vlab-worker` 改为 `openclaw`，停用 worker 插件，装上 `versa-runtime-providers`；可重复执行；先备份 `.pre-noworker-<时间戳>`；形状不符时拒绝执行（退出码 2）；只打印键名 |
| `upgrade96-noworker.sh <core> <feishu> <codex> <providers-dir>` | 9.1 → 9.6 无 worker 升级：流程同 `upgrade95-final.sh`，但不装 worker 组件，改装 `versa-runtime-providers` 并用 `noworker96-config.mjs` 转换 Gateway 配置（`--worker-config` 列出漂移，`--disable-mcp voice-memory` 与 V 一致）；worker 配置原样保留（无 worker 模式下没人读它）；关 swarm；validate → doctor → `start-gateway-prod.sh 95` |
| `reset-and-upgrade96-noworker.sh [pkg-dir]` | 先删当前 state 再解压 9.1 归档（磁盘放不下两份 state），恢复配置后跑上一行；包按 `SHA256SUMS` 校验 |
| `planned-restart.sh` | 升级后的计划内重启（带 inspector，供 ELD/堆采样），打印 `READY_EPOCH` 与停机秒数 |
| `post-restart-check.mjs <readyEpoch>` | 重启后检查：本轮 `.db91-integrity/<epoch>/` 8 个收据都在当前 fence 下、无 verification-failed 撤销、ready 之后无 slow agent database open / 未处理的 rejection |
| `talk-compact-check.mjs` | 无 worker 下两个迁出的 provider：`talk.catalog` + `talk.client.create/close`（火山托管房间，真实 StartVoiceChat/StopVoiceChat，无音频）；长会话 `sessions.compact` 走快速压缩 |
| `stress-tools96c.mjs` | 12 个并行工具回合（skill_workshop、openclaw、sessions_spawn、image），按模式决定 RPC 列表 |
| `soak.mjs <label> <min> <out>` | 轻量混合流量（每轮 bench c3 + accept 工具回合）下每 5 分钟采样 RSS/堆/任务数/进程分类/liveness 与哨兵计数 |
| `runtime-mode.mjs` | worker / no-worker 模式判定（与 V 哨兵同一规则），`probe.mjs`、`accept.mjs`、`bench.mjs` 据此决定是否检查 worker 池、是否调用 `vlab.workers.status` |
| 其余 | 9.1 基线、9.5 生产配置测速、状态切换、诊断 |

脚本里不含任何密钥；密钥在演练机 `secrets.env`，不入库。
