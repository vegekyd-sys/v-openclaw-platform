# V Platform 0.1.0-integration.1 — 共享 VLab 集成

2026-09-06。用户明确授权「合入共享 VLab」。本记录仅覆盖共享集成，不是生产发布、干净安装包或全能力验收。

## 版本与来源

- 发行标识：`v-platform-0.1.0-integration.1`；package 版本 `0.1.0-integration.1`。
- 集成分支：`codex/v-platform-shared-integration-20260906`。
- 已部署源码：`4f7854fd1b0bf795a6619b84a5b5ce7152d05fed`。
- 合并提交 `723da7d` 收拢 V Platform `ce29d2a` 与 GPT Live 共享验收 `5b24c9d`。三处冲突均为已审阅的同源修复重叠，保留 V Platform 已验证的 pool/start 防竞态增量；合并后 Worker 树与 `ce29d2a` 完全一致。
- Worker 内部版本仍 `0.2.12-rc.1`，不能仅靠它区分候选；整体发行号、精确 SHA 和逐文件清单才是本次身份。

## 共享切换

目标 hostname `VM-0-4-ubuntu`，服务 `openclaw-vlab-production-mirror-v8.service`，端口 24993。经前负责人明确交接并取得 `codex-v-platform-20260906` integration lease；切换前两次确认 Worker 无 pending/active/queued 且 sessions 无活动运行。

保持 OpenClaw `2026.9.1`，没有应用 9.2 核心或媒体补丁。保持所有 Talk、模型、渠道、数据库、会话和 Browser 配置。配置对象比较证明唯一差异为 `plugins.load.paths` 中的 Worker 路径替换：

- 旧：`runtime/plugins/worker-gpt-live-2368bdb`，原目录保留。
- 新：`runtime/plugins/worker-v-platform-0.1.0-integration.1`，从已提交集成源码复制，逐文件 SHA 校验，未覆盖旧运行目录。
- `worker-runtime-lifecycle.mjs` 与旧共享 GPT Live 基线 SHA 相同：`05ae993de04d4b2df9ab836c4190988affa4567672f8a077d7fcbd1010995c17`。
- 原生图片事实归属 `native-harness-data.mjs` 与旧共享文件相同。

配置原文件和原 transient unit 定义仅备份在服务器私有目录，不进入 Git。保留 reload=off，通过原生 config validate 后原子切换配置，再显式 systemctl restart。Gateway PID `1622738 → 1627600`，NRestarts=0；没有重演同时打开 reload 导致 transient unit 丢失的问题。

## 本次验收

- 合并后的本机离线回归：222/222，无 skip/todo。
- 已部署 `4f7854f` 在 Linux Node 22.23.1：222/222，无 skip/todo；版本清单 audit 通过，但 releaseReady=false。
- 新共享 Worker 进程 PID 1627660、1627669 的实际命令行均指向新版本目录。
- 独立合成会话真实运行 `deepseek-v4-pro`，runtime=`vlab-worker`，exec 返回独有测试标记，最终回复正确，模型集合只有 DeepSeek Pro，无错误或 fallback。
- 合成会话使用 deliver=false；未向飞书/企微发送额外消息。未改业务会话模型、未覆盖历史或数据库。
- 收尾逐文件指纹与 staging 清单一致，配置对象仅 Worker 路径变化，所有 Worker ready 且 pending/active/queued=0。

服务器证据目录：`/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/v-platform-0.1.0-integration.1`。

- `1788700229865-staged.json`：原配置指纹、文件清单、切换前 idle。
- `1788700298373-probe.json`：真实模型、工具、回复证明。
- `1788700312046-verified.json`：配置差异、指纹、idle 收尾证明。

## 回退与未完成项

旧 Worker 目录、原始配置字节 `original-openclaw.json` 和 `unit.before.txt` 均保留于服务器。若后续需要回退，必须重新持有 lease 并检查活跃业务；只将 Worker 路径切回旧目录，保留回退时其他合法配置和所有新增业务数据，验证后受控重启。不可直接覆盖整份历史配置或回滚 Session/Memory 数据库。

本轮没有新做共享配置热重载循环、外部渠道 receive→dispatch→visible reply、真实媒体交付、Browser、Night Shift 或完整语音验收。先前私有双版本/热重载与 GPT Live 渠道报告保持各自证据边界，不能冒充本候选整包验收。

制品锁、干净安装、迁移/回滚实测及全能力集成仍是正式发布门槛。生产 V 未访问/修改；本次代码仅本地 Git 合入与 VLab 部署，未向远端 Git 推送。
