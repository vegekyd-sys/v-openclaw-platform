# 9.6 无 worker 补丁回归（共享 VLab）

2026-09-27 那套 `/srv/vlab-upgrade96-backups/regress/`（worker 模式）改成无 worker 模式后的副本，在服务器上位于
`/srv/vlab-upgrade96-backups/regress-nw/`，结果在其 `results/<label>/`。`run-all.sh <label> [phases]`。

改动：去掉 worker 池断言，改为本 Gateway cgroup 内无 vlab-worker 进程、会话 `agentRuntime.id` 为 `openclaw`、
`vlab.workers.status` 不存在（`r2-rpc.mjs no-worker`）；B7 改为 exec 在 Gateway 内看到 Gateway 配置；9.6 媒体任务状态是
`completed`；`lib.mjs` 认识 claude-cli 放在 assistant 消息里的 `tool_result` 块；新增 `browser`、`computer`、`vcc-*`
场景，`r9-desktop.mjs`（插件清单里只有一个 cua-computer、桌面单元、CUA node 在线）和 `r10-cua.mjs`（/vcc、原生、/vcodex
跨 runtime 的 computer 与接管链接）；`r4-static.mjs` 加上 eb465f0 之后各提交的标记。`core-dist-manifest.json`
（构建产物逐文件 sha256）不入库，按所测构建生成。
