# 发版组件（源码形态）

这里放**不在 OpenClaw 源码 fork 里**、但随 V 一起发版的插件目录。

## worker-0.2.11-versa95.1

生产 worker 插件 0.2.11（字节见 `release/captured/v2026.9.1-db91.6-feishu-progress-20260926.worker/dist`，含 9/25 的媒体完成回传路由修复）
为适配 OpenClaw 9.5 所做的改动。9.1 继续用 0.2.11 原样；这个目录只给 9.5 用。

与 0.2.11 的完整差异：`worker-0.2.11-versa95.1.diff`（`diff -ruN`，以 0.2.11 为基准）。改动归类：

- `runtime-path.mjs`：9.5 把运行时入口按语义导出拆开，按新路径加载。
- `index.mjs`、`worker.mjs`、`worker-pool.mjs`、`harness-event-contract.mjs`：9.5 的接口兼容。
- `native-attempt-bridge.mjs`：9.5 的工具权限指纹（toolAuthorityFingerprint）随调用传递。
- `runtime-prewarm.mjs`（新增）：worker 就绪前按 agent 预备模型运行时，第一轮不再承担冷启动；准备失败则退回正常首轮。

测试：`node --test *.test.mjs`（2026-09-25：151/152 通过。唯一失败的 `native-setup-probe-owner.test.mjs` 引用了实验目录里的补丁脚本，在 0.2.11 原件上同样失败，属于目录环境问题）。
演练机验收记录见 `docs/openclaw-2026.9.5-rehearsal-20260922.md`。

## versa-runtime-providers-0.1.0

9.6 无 worker 模式用（agent 回合在 Gateway 内原生运行，`vlab-agent-worker-isolation` 停用）。它只注册配置里仍然指向的两个 provider：`volcengine-rtc-agent`（`talk.realtime.provider`）和 `versa-fast-quality-v1`（`agents.defaults.compaction.provider`）。两个 provider 的文件与 worker 组件逐字节相同。配置切换用 `scripts/upgrade-mirror/noworker96-config.mjs`。详见该目录的 README。
