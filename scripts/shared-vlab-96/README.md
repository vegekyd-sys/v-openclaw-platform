# 共享 VLab 9.1 → versa 9.6（db91-parity）

在 vlab91 上以 root 运行；实例 `/srv/vlab-production-mirror/labs/instances/db91-parity`，
单元 `openclaw-vlab-production-mirror-v8`（端口 24993），伴随单元 `nightshift-vlab-production-mirror`。
备份在根盘 `/srv/vlab-upgrade96-backups/`（实例盘 /dev/vdb 只剩约 10 GB）。先取共享 lease。

无 worker 模式（2026-09-28 起）的顺序：

1. `UPGRADE_DRY_RUN=1 upgrade96-noworker-shared-vlab.sh <core> <feishu> <codex> <providers-dir> <deepseek>`：只做前置检查和配置转换预演。
2. 同样参数去掉 `UPGRADE_DRY_RUN`：停机、备份、装 core/providers/官方插件（飞书、Codex、DeepSeek 叠加并校验哈希）、转换配置、首启（迁移约 25 分钟）。
   首启**不开流量**：`99zz-versa-traffic-closed.conf` 设 `OPENCLAW_SKIP_CHANNELS=1`、`OPENCLAW_SKIP_CRON=1`，伴随单元不启动。
3. `planned-restart96-shared-vlab.sh <备份目录>`，再用 `READY_EPOCH` 跑
   `VERSA_ROOT=<实例> VERSA_UNIT_NAME=openclaw-vlab-production-mirror-v8 post-restart-check.mjs <READY_EPOCH>`：8 个当前回执、无 verification-failed、无 slow open。
4. 通过后 `open-traffic96-shared-vlab.sh <备份目录> [--start-companion]`，然后 `vlab.mjs baseline --replaceCurrent true` 登记新基线
   （旧 `current.json` 由工具留成 `receipts/<ts>-superseded-by-baseline.json`）。

worker 模式的旧脚本 `upgrade96-shared-vlab.sh` 保留（2026-09-27 那次用的就是它）。

## 回滚

`rollback96-shared-vlab.sh <备份目录>`：恢复 9.1 core、worker 组件、两份配置（转换前的原文件）、升级前 state，
删掉 9.6 drop-in 和 `runtime/versa-runtime-providers`（移进备份目录）。9.6 的 state 默认压缩成
`state-9.6-rolledback-<ts>.tar.zst`（校验后再删目录），因为两个盘都放不下一份原样的 18 GB。

之后恢复 `labs/shared-workflow/current.json`：先把当前的另存为 `receipts/<ms>-superseded-by-rollback-to-91.json`，
再用升级时留下的 `receipts/<ms>-superseded-by-baseline.json` 覆盖回去；`vlab.mjs status` 的 `runtimeSha` 和 `configSha`
必须等于升级前记录的值。

共享 VLab 上跑演练机脚本（`../upgrade-mirror/`）时用环境变量改目标：`VERSA_UNIT`（`accept`/`stress`/`talk`/`probe`/`bench96`/`health-rtt`）、
`VERSA_PORT=24993`（`bench96`）、`VERSA_UNIT_NAME`/`VERSA_SCRIPTS`/`VERSA_RUN_USER`/`VERSA_NODE`（`soak`）、`VERSA_ROOT`/`VERSA_UNIT_NAME`（`post-restart-check`）。
