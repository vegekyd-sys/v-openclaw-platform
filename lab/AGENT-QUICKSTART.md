# 给其他 agent 的 VLab 开发入口

用户于 2026-09-10 确认并已实机验收的新默认：**每个任务一个轻量源码 worktree → 合入唯一 dev → 共享 VLab 验收 → 按授权上线同一产物。**

完整合同见 [README.md](README.md)，实机证据见 [验收记录](../docs/vlab-shared-workflow-acceptance-20260910.md)。本页是操作入口，不是要求重新搭环境。

## 1. 开始任务：不需要占用 Gateway

Mac 上从任何目录都可定义这个便利函数（参数中的路径解决当前 cwd 不是平台仓库的问题）：

```sh
vlab() {
  node /Users/tianyicai/vlab-dev/lab/vlab.mjs "$@" --repo /Users/tianyicai/vlab-dev
}
# 用当前任务 ID / 明确负责人替换；不要沿用本页占位值或别人的 owner。
vlab_owner='YOUR_THREAD_ID'
vlab_task='unique-fix-name'
vlab status
vlab new --task "$vlab_task" --owner "$vlab_owner"
```

进入 `new` 返回的 worktree 开发，分支为 `codex/<task>`。默认目录 `/Users/tianyicai/v-worktrees/<task>`。不要重跑 `init`、`baseline`，不要运行旧 `labctl create` 为每个任务复制实例。源码开发不持有长时间 integration lease。

`status` 中：`current` 是当前已部署产物；`devSource` 是服务器源码镜像，两者可能不同。`lease` 非空表示有人占用；`pending` 非空表示未完成发布需要恢复。不要绕过这些状态直接热改 runtime。

## 2. 使用共享配置与历史

```sh
vlab rpc --method sessions.list --params '{"agentId":"makaron","limit":10,"includeLastMessage":false}'
vlab rpc --method chat.history --params '{"agentId":"makaron","sessionKey":"EXACT_SESSION_KEY","limit":10}'
```

模型、Skills、工具、Memory、浏览器登录状态由共享 Gateway 使用，worktree 不复制配置、凭据和在线数据库。以上只读查询不需要 lease。已有历史可读取；专用测试对话见下文。

**共享服务运行的是当前已部署代码。** 未合入、未部署的 worktree 修改不能通过共享 RPC 自动生效。先在 worktree 做针对性单测、静态检查或最小数据夹具测试，再进入共享验收。

## 3. 提交并合入 dev

在自己的 worktree 只提交本任务内容，交付：任务分支、完整 commit SHA、测试结果、待部署文件清单和回退说明。同一个 agent 可以负责开发和集成，不要求另开任务或新增实例。

```sh
vlab merge --branch codex/unique-fix-name --commit FULL_TASK_COMMIT_SHA
```

唯一集成目录是 `/Users/tianyicai/vlab-dev`，分支 `dev`。在合并结果上跑相关测试，记录新的完整 dev SHA。dev 脏、分支 SHA 不符或合并冲突时先处理具体问题，不 reset/覆盖其他人的修改。

## 4. 取得共享验收窗口后部署

先确认当前负责人已完成或明确交接，再获取 lease。别人占用时继续源码工作，不能按过期时间抢占。

```sh
vlab lease --owner "$vlab_owner"
vlab status
```

按 README 的 plan 格式准备发布：`baseRelease` 来自当前 status；每个文件的 `source` 必须是 dev 已提交的最终代码文件；`target` 是 runtime 内相对路径；`before` 是 `read-code` 返回的旧 SHA256，新文件用 JSON null。

```sh
vlab read-code --target openclaw/dist/CHANGED_FILE.mjs
vlab package --id unique-fix-v1 --commit FULL_TESTED_DEV_SHA --owner "$vlab_owner" --plan /absolute/plan.json
vlab sync --owner "$vlab_owner"
vlab stage --artifact /absolute/PATH_RETURNED_BY_PACKAGE.json
vlab deploy --id unique-fix-v1 --owner "$vlab_owner"
```

必须等上一步成功再继续。`package` 返回真实 artifact 路径；不要把占位路径直接执行。产物 ID 不复用。若 dev 在打包后变化，重新验证合并结果并打包。配置或代码漂移、占用冲突、磁盘不足、活跃工作未排空时，处理具体原因，不关闭保护。

## 5. 实际验收，再按结果分支处理

```sh
vlab test --owner "$vlab_owner" --task "$vlab_task" --idempotencyKey UNIQUE_RUN_ID --message '这次改动的具体工具、输入和预期输出验收要求'
vlab rpc --method agent.wait --params '{"runId":"RETURNED_RUN_ID","timeoutMs":1}'
vlab rpc --method chat.history --params '{"agentId":"makaron","sessionKey":"RETURNED_SESSION_KEY","limit":30}'
```

检查真实工具结果和最终回复，不能只信模型说“成功”。`test` 返回专用 sessionKey，可传 `--sessionKey` 继续同一条对话，验证跨部署上下文。`deliver:false` 不会把测试发到飞书；原业务会话写入与外部渠道验收按已有授权另行操作。调用结果不确定时先查历史/运行状态，需要重试时复用 idempotencyKey。

**通过时**记录证据并接受当前产物：

```sh
vlab accept --id unique-fix-v1 --owner "$vlab_owner" --artifactSha EXACT_STAGE_ARTIFACT_SHA --evidence '具体验收报告路径及实际结果'
```

**失败且需回退时**恢复本次代码，再核对配置、对话和实际行为：

```sh
vlab rollback --id unique-fix-v1 --owner "$vlab_owner"
```

以上是两个分支，不是先 rollback 再 accept 的连续步骤。仅能回滚当前 release；有 pending journal 时按 README 恢复，不能盲删。

结束后释放占用，并记录最终运行 release、验收结果和遗留问题：

```sh
vlab lease --owner "$vlab_owner" --release true
```

释放前确认没有尚待完成的部署或测试交接。VLab 通过不等于生产上线；本 CLI 不部署 V。按用户已有生产授权推广同一产物，生产配置/数据独立保留，连接 V 只走 Tailscale。

## 服务器上的 agent

具备既有 VLab 管理入口的 agent 可在服务器 `labs/shared-workflow/source` 中调用同一 CLI；Node 路径、sudo 和完整命令见 README。源码 worktree 共用服务器 Git 对象库，RPC 在主机内访问共享 Gateway。

服务器 dev 是镜像，不能在那里另行合并成第二条 dev。服务器任务提交后导出 Git bundle，由 Mac 集成者校验精确 branch/SHA、导入一个未占用的任务分支，再按上述 merge 流程集成。同步 dev 不等于更新业务 runtime，也不等于自动替换控制工具。

生产 V 上的 agent 不会因为本流程自动获得 VLab 的 SSH 权限；没有已配置入口时由有权限的集成者执行，不复制管理私钥。

## 当前适用范围

小批代码文件新增/替换；配置调整、依赖安装、大版本升级、删除资源和数据库迁移需单独处理。历史导入基线包含旧热补丁，不能仅凭平台 Git SHA 宣称完整运行时代码相同。以实际 status、artifact checksum 和验收证据为准。
