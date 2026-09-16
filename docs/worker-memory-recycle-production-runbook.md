# Worker 内存回收：生产 V 上线手册（2026-09-16）

共享 VLab 已验收通过：`worker-memory-recycle-v4`，`accepted: true`，commit `fd9b1c96024c`。
VLab 与生产现在跑**同一份 worker 代码**（本次把 VLab 降到了生产血脉）。

## 要部署的四个文件

目标目录：`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/worker/`

| 文件 | 部署前（已核对未变） | 部署后 |
|---|---|---|
| `worker-pool.mjs` | `80184d12…b917f3` | `a9f718d0…3b5ea3` |
| `worker.mjs` | `4ca913d1…dcc80` | `4bf1472d…276c51` |
| `index.mjs` | `9a2825c9…f209790` | `6655f0ca…658191` |
| `openclaw.plugin.json` | `b677514d…7f7988f` | `1ec103e3…2644f6` |

源文件在 `lab/release-files/worker-memory-recycle/production-worker-*`（dev 分支 `fd9b1c96`）。

## 必须知道的一点：需要重启才生效

`worker-pool.mjs` 和 `index.mjs` 跑在 **Gateway 进程内**，不是 worker 里。换了文件不重启 Gateway 就完全不生效。
`worker.mjs` 走 fork，新 worker 会自动用新版，但 pool 逻辑仍需重启。

重启会中断**当时正在跑的 run**。部署前先看有没有活跃 run：

```bash
ssh v 'sudo journalctl -u openclaw-gateway.service --since "-2min" | grep -c firsttext-metrics'
```

## 生效后的参数（全部用默认值，不需要改配置）

| 参数 | 默认 | 含义 |
|---|---|---|
| `recycleRssMb` | 1536 | 主触发。worker 超过就等它空闲后换新 |
| `recycleMaxLifetimeMs` | 12h | 兜底，接住不越 RSS 线的慢增长 |
| `recycleMaxSessions` | 0（关） | V 的 turn 轻重差异大，不用 |
| `recycleCooldownMs` | 60s | 两次回收最小间隔 |
| `recycleMinAgeMs` | 300s | 新 worker 保护期 |
| `workerMaxOldSpaceMb` | 0（继承） | 未启用，留待 A/B |

**不要手动往配置里加这些键**除非真的要调——虽然 manifest 现在已经声明了它们（不加声明会让 Gateway 起不来，这个坑已经踩过）。

## 阈值是否合适：按 2026-09-16 12:05 的生产实测

| worker | RSS | 年龄 |
|---|---|---|
| 3534376 | 1041 MB | 2.8h |
| 3534388 | 873 MB | 2.8h |
| 3534396 | 829 MB | 2.8h |
| 3596706 | 664 MB | 1.5h |
| 3612427 | 745 MB | 1.1h |

2.8 小时长到 1041MB，外推 12 小时约 3–4GB，与之前观测的 3.3GB@15h 吻合。
所以 1536MB 大约对应**每 4–5 小时回收一轮**，12h lifetime 作为更慢的兜底。
当前这批（664–1041MB）**不会立刻被回收**，要等它们继续长或到 12 小时。

## 回滚

部署前先备份四个文件，出问题按原哈希还原再重启即可。改动没有数据迁移、没有配置变更、没有 schema 变更，回滚就是换回文件。

## 这次修复管不到的

- **Gateway 自己**：2.8 小时 3455MB，它是 pool 的宿主，无法被回收。这是独立的、更大的问题。
- **饱和负载下不触发**：回收要求 worker 完全空闲满 180 秒。持续高并发时机制自动休眠（实测 100 session 压测期间回收 0 次）。它在空档期干活，不在峰值期。2026-09-16 的采样显示生产 worker 40 秒内 CPU tick 几乎不动，空档期是充足的。

---

## 上线记录（2026-09-16 12:41 CST）

已上线。四个文件安装完成、哈希核对一致、权限原样保持（`worker-pool.mjs` 是 `644 root:root`，另三个是 `644/664 root:openclaw`，各不相同，用 `cp` 覆盖内容保留目标属性）。
备份在 `/opt/openclaw-experiments/backups/worker-memory-recycle-20260916/`。

- 12:41:52 重启，12:43:27 五个 worker 就绪，无配置错误
- `openclaw gateway call vlab.workers.status` 确认回收配置全部生效，`memory` 遥测有数据
- 真实对话返回 `V_WORKER_RECYCLE_PROD_OK`，链路完整
- Feishu WebSocket 已连
- 整机：used 9GB→8GB，swap 2GB→1GB

### 上线后立刻观察到的重要数据

**worker 增长比预估快得多。** slot 0 服务 2 个 session、154 秒内从 226MB 涨到 **1501MB**，同伴保持 222–226MB。

这意味着 **1536MB 阈值可能偏低**：按这个速度，worker 每两三个 session 就会越线，回收会相当频繁。虽然回收本身对用户无感（先起替补再退休、只在空闲时动手），但频繁换 worker 会持续消耗 CPU 和启动时间。

上线后需要按真实运行数据校准这个阈值，不要当成定值。查看当前分布：

```bash
ssh v 'sudo -u openclaw env HOME=/home/openclaw openclaw gateway call vlab.workers.status'
```

调整方式（manifest 已声明该键，可安全写入配置）：在 `/home/openclaw/.openclaw/openclaw.json` 的
`plugins.entries.vlab-agent-worker-isolation.config` 里设 `recycleRssMb`，然后重启 Gateway。
