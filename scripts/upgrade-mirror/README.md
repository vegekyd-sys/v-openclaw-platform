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
| 其余 | 9.1 基线、9.5 生产配置测速、状态切换、诊断 |

脚本里不含任何密钥；密钥在演练机 `secrets.env`，不入库。
