# VLab：独立候选测试 → 用户决定合入 dev → 最后共享验收

2026-09-10 用户进一步明确：合入 dev 的决定权只属于 Tianyi。agent 在自己的 worktree 完成开发和合入前测试，报告结果后等待用户明确批准，不能自主合入；lease、测试通过或一般修复授权不代替批准。

2026-09-15 用户更新：每个任务在自己的 worktree 执行自己的候选代码，复用 VLab 的数据来源；共享 VLab 是上线前的 Dev 集成门禁。默认用 [candidate](candidate/README.md) 直接执行 Agent 指定的测试，不创建常驻 Gateway；工具不限制网络、能力或资源，Agent 自主判断。配置快照与选定 SQLite 备份可并行使用，可写状态各自独立；在线数据库不共写。

首次接手请先读 [给其他 agent 的操作入口](AGENT-QUICKSTART.md)。其中区分源码开发、共享验收占用与成功/失败两条收尾路径。

## 固定入口

本机集成工作区 `/Users/tianyicai/vlab-dev`，分支 `dev`，共用 `/Users/tianyicai/v-openclaw-platform/.git`。任务可在 `/Users/tianyicai/v-worktrees/<task>` 或显式 `--path` 中开发。以下命令在 dev 或任一同仓库 worktree 中执行；也可以为每条命令加 `--repo /Users/tianyicai/vlab-dev`。

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs status
node /Users/tianyicai/vlab-dev/lab/vlab.mjs new --task my-fix --owner THREAD_ID
```

`new` 只检出源码、共用 Git 对象，不复制 runtime/state，不启动 Gateway，不创建可写 node_modules 链接。安装依赖可复用包管理器缓存，依赖变化保留任务独立安装目录。不要在其他任务工作区开发。

## VLab 上直接开发

`node lab/vlab.mjs sync --owner THREAD_ID` 按服务器已有提交增量同步 Mac 已提交 dev 到 VLab 的 `labs/shared-workflow/source`，相同提交直接跳过。同步只允许 fast-forward，拒绝服务器脏工作区。服务器共用 `labs/shared-workflow/code.git`；不会改旧 db91-parity/source。

通过既有 `vlab91` 入口连接后，可用服务器 Node 调用：

```sh
sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/source/lab/vlab.mjs new --repo /srv/vlab-production-mirror/labs/shared-workflow/source --task my-fix --owner THREAD_ID
```

默认 worktree 位于 `labs/shared-workflow/v-worktrees/my-fix`，RPC/test 在主机内连接同一个 Gateway，不需要本机 SSH 配置，也不复制凭据。保持服务器 dev 为镜像；唯一集成入口在 Mac，服务器任务提交后通过 Git bundle 导回 Mac 仓库，再用相同的 merge 流程合入。不要在两台机器各自合并出不同的 dev。

## 使用共享设置和对话

```sh
node lab/vlab.mjs rpc --method sessions.list --params '{"agentId":"makaron","limit":10,"includeLastMessage":false}'
node lab/vlab.mjs rpc --method chat.history --params '{"agentId":"makaron","sessionKey":"EXACT_SESSION_KEY","limit":10}'
node lab/vlab.mjs lease --owner THREAD_ID
node lab/vlab.mjs test --owner THREAD_ID --task my-fix --message '执行这次专用验收。'
# 返回 sessionKey/runId；继续同一测试对话可以传 --sessionKey
node lab/vlab.mjs rpc --method agent.wait --params '{"runId":"RUN_ID","timeoutMs":1}'
```

请求经本机已配置的 `vlab91` SSH 入口在服务器调用 Gateway。密钥只在服务器进程中使用。status 返回脱敏配置摘要；现有对话可读取。`test` 使用专用 `vlab-dev-*` session、`deliver:false`，可连续测试上下文，不向飞书等外部渠道发消息。完整配置及所有工具仍由共享 VLab 加载；接口不会把凭据明文交给 agent。针对原业务会话的写入或渠道验收另按明确授权操作。

调用共享 Gateway 执行的是已部署代码。合并前用 `node lab/vlab.mjs candidate --repo "$PWD" --owner TASK_ID --plan PLAN` 运行当前 worktree 的实际候选代码和真实数据副本；它不需要 lease、commit、merge 或共享 Gateway 重启。

## 合并与打包

在任务 worktree 提交、测试后，报告改动、测试结果、未验证项和精确 SHA，然后等待 Tianyi 决定。只有用户明确批准本次变更合入 dev，才进入以下集成步骤：

```sh
node lab/vlab.mjs merge --branch codex/my-fix --commit FULL_TASK_SHA
# 在 /Users/tianyicai/vlab-dev 跑本改动相关测试，记录合并后的 SHA
node lab/vlab.mjs read-code --target openclaw/dist/example.mjs
```

`merge` 要求 dev 干净、任务分支精确匹配指定 SHA，并用本机 Git 操作锁串行合并。有冲突时保留现场，由集成者处理，禁止 reset/覆盖其他任务。dev 只是集成状态，不自动表示已经验收。

为本次变更写一个本地 plan（不含凭据），例如：

```json
{
  "baseRelease": "status 返回的 current.release",
  "files": [{
    "source": "lab/release-files/example.mjs",
    "target": "openclaw/dist/example.mjs",
    "before": "read-code 返回的 sha256；新文件为 null"
  }]
}
```

`source` 是 dev 中已提交的精确产物文件。修改打包后的 OpenClaw 时，先在独立目录运行补丁脚本，将最终修改文件纳入提交；不要在共享 runtime 直接跑旧 patch 脚本。当前入口支持已有目录内的新增/替换代码文件；配置、依赖安装、删除文件、数据库迁移和大版本升级不走这个代码覆盖入口。

```sh
node lab/vlab.mjs package --id my-fix-v1 --commit FULL_TESTED_DEV_SHA --owner THREAD_ID --plan /absolute/plan.json
# 仅需服务器源码镜像时运行 sync；代码产物部署本身无需同步 Git 历史
node lab/vlab.mjs stage --artifact /absolute/artifact.json
node lab/vlab.mjs deploy --id my-fix-v1 --owner THREAD_ID
```

发布必须基于当前 release。服务代码全量 fingerprint、配置 hash、目标文件原 hash 都需匹配；有外部热改就拒绝，先核实并纳入新的受控基线。产物 ID 不复用。部署会请求 Gateway suspend/drain，等无活跃任务再停止、逐文件原子替换并启动；忙时有界退出并恢复接入，不强杀业务。配置、会话数据库、浏览器与 workspace 不随代码替换。不要在 A 验收时部署 B。

## 验收、回退、生产

验收通过时：

```sh
node lab/vlab.mjs accept --id my-fix-v1 --owner THREAD_ID --artifactSha EXACT_ARTIFACT_SHA --evidence '验收报告路径及实际模型、工具、连续对话结果'
```

失败需回退时执行下面的 rollback；不要回滚后再接受已经不是 current 的产物：

```sh
node lab/vlab.mjs rollback --id my-fix-v1 --owner THREAD_ID
```

完成验收或回退后释放占用：

```sh
node lab/vlab.mjs lease --owner THREAD_ID --release true
```

`deploy` 只报告部署与 Gateway readiness；`accept` 必须引用真实功能证据，不能以健康检查代替。回滚只恢复本次代码，保留新增对话。产物、回滚前文件和 receipts 在服务器 `labs/shared-workflow/`，不进入 Git。

共享 VLab 的现有启动前数据校验在本次实测约 78 秒，发布入口给启动就绪保留 180 秒；该耗时来自现有运行环境，不是 worktree 复制。

服务启动失败或进程中断时保留 `pending.json`，自动阻止后续发布。恢复者先核对 manifest、当前文件是否分别匹配 before/after 及服务活跃业务，再按保存的文件恢复；不能盲删 journal 或强行重试。普通回滚仅支持当前 release，配置变化需先明确协调恢复。

VLab 验收后按生产授权推广同一精确代码产物；V 的配置、数据独立保留，连接只走 Tailscale。本工具固定为 VLab，不提供生产地址或隐式生产部署。

## 基线与限制

初始基线从已更新的共享 VLab 导入代码归档，保存 checksum；它包括历史热补丁，因此标明 imported live artifact，不能声称全部由 Git 上游源码重建。后续每个发布绑定该二进制基线、dev SHA 和精确变更。基线归档不包含在线 state，也排除 `.env`、`.npmrc`、SQLite、JSONL。

这期代码覆盖模式保留既有服务路径，减少迁移影响；不是切换完整目录的 release symlink，也不支持数据库 schema 回滚。当前范围外的依赖、大版本、配置或迁移变更需要单独方案与相应验收。

验证入口：`node --test lab/shared/files.test.mjs lab/config.test.mjs`。实机验收记录见 `docs/vlab-shared-workflow-acceptance-20260910.md`。

## 执行速度与验收范围

- 开发：一个 candidate 命令完成基线、输入、配置/数据库快照、测试与 receipt。普通修改不走部署链。
- 交付：只重测受影响行为；基线与输入文件一致的证据可复用。修改被测文件、依赖、数据或相关集成行为后再重跑。
- 集成：lease 只用于共享写入、部署与真实集成测试。基线缓存和任务私有测试目录不持有 integration lease。
- 先看 receipt 的 inspect/baseline/snapshot/overlay/test 耗时，定位慢步骤；不要根据模型名称直接判断服务器瓶颈。
- SOL/Astra 使用相同确定性入口。不要每轮重读全部历史说明、手动发几十次 SSH、轮询 unchanged 状态或默认重跑完整发布验收。
