# V-Platform

V 的整体发行与验收入口。用户只选择一个 V 版本；内部保留插件、OpenClaw 适配器、Worker、Browser 与配套服务的边界。

## 当前边界

当前已完成 **发行装配骨架与独占 VLab 的首轮 9.1 / 9.2 Worker 往返验证**，不是已完成的安装包。
详见 [首轮 VLab 验收与未闭合项](./VLAB-92-FIRST-PASS-20260906.md)。
后续 [热重载与媒体契约修复](./RELOAD-MEDIA-REGRESSION-20260906.md) 已通过 218 项本机/Linux 回归；新候选真实运行验收仍待 VLab 名额，不继承首轮结果。
当前生产的功能验收不能自动转移为新发行包的验收；必须证明干净实例可重建。
默认 CLI 不安装软件、不重启服务、不读取凭据内容或业务会话；任何入口都不修改生产。

```sh
node platform/cli.mjs audit
node platform/cli.mjs test
node platform/cli.mjs plan --openclaw 2026.9.2
node platform/cli.mjs release-check
node --test platform/platform.test.mjs
```

- `audit` 检查登记完整性、补丁源码指纹、测试文件与组件引用。未登记的新补丁、缺失文件、指纹漂移均失败。
- `test` 只运行已审阅的本地确定性测试；清除继承的模型/生产环境变量，用临时 HOME，最多两个测试进程并发。跳过、todo、零测试或超时都不算通过。
- `plan` 输出升级影响范围和必要门槛，不下载、不调用模型、不执行补丁。
- `release-check` 是严格阻断入口：缺少完整制品锁、干净安装、数据迁移回滚或真实链路验收时退出非零。它目前有意不能给出可发布结论。
- 命令输出 JSON；`test` 可用 `--report /绝对路径/report.json` 保存自身测试报告（独占创建，不覆盖已有文件）。

## 不再依赖用户记忆

`catalog.json` 是版本化能力账本。每个能力必须说明组件、离线回归和真实结果的验收条件；每个补丁有源码指纹、宿主边界和处置状态。
新发现的失败必须先变成固定回归，再修实现。历史报告是定位依据，不是新版本可复用的绿色测试结果。
本机 catalog 目前只能覆盖这个来源树；其他分支、配套仓库及线上启动脚本尚需对齐，缺口在 `assemblyBlockers` 中显式保留。

## 发行目标

1. 收拢已验收 9.1 的精确来源和实际安装指纹，包括主 Gateway、shell CLI、Worker overlay、Codex 指定 CLI、独立 Browser Gateway/Broker、渠道插件、Night Shift、启动脚本及本机连接组件。
2. 形成内容校验的不可变制品与配置迁移计划；密钥、Session、Memory、浏览器配对/状态留在各自主机，绝不装进包。
3. 经 owner 隔离实例完成干净安装和固定输入验收；渠道端到端使用独占集成租约或独立账号，不能双连生产机器人。
4. 先在同一原生 9.1 上证明整包可重建，再让 9.2 走同一流水线。没有验证的版本失败关闭，不沿用宽泛的 `>=` 兼容声明。
5. V review 与 Codex 验收均完成后，由 Tianyi 针对精确 release ID 批准生产窗口。代码、配置和数据库分别制定切换/回退策略；不得用旧快照静默覆盖升级后新增业务数据。

## 设计约束

- 官方 SDK 优先；依赖内部模块的部分集中登记为适配债务。把字符串补丁装进 npm 包不等于消除内部耦合。
- Worker 尽可能只改变执行位置，不重写 OpenClaw 的权限、会话归属、取消、工具和最终回复语义。
- 先快而省 token 的本地契约回归，再少量真实模型/工具/渠道结果验证。健康检查不是验收替代品。
- 性能基线保留 9 月 6 日的并发繁忙与延迟观察；配置 45 路不等于容量验收。
- 暂不提供 install/promote/rollback 执行命令；在尚未完成制品和状态兼容性设计时拒绝提供假一键安装。

## VLab 实验入口（不是生产安装器）

`lab-instance.mjs`、`lab-stage.mjs` 和 `lab-probe.mjs` 只允许 VLab 的已登记自有实例，
强制 hostname、owner、root、无渠道/cron/browser 和提交来源检查。运行与停止仍通过 labctl。
它们用于先对齐 Worker 0.2.11，再检查原生 9.1/9.2 的实际模型、工具和最终回复。
9.2 依赖从精确 npm 版本安装到实例独立前缀，保留 package-lock，切换前留存旧核心和自有状态检查点。
这不是干净重建或完整 V 能力验收；新制品只有拿到全部门槛证据后才能成为可安装发行包。

- `lab-control-probe.mjs steer|stop INSTANCE OWNER VERSION`：真实工具边界上的同任务修改，以及停止后执行新一轮；只创建自有合成会话。
- `lab-probe.mjs INSTANCE OWNER VERSION`：核对先前通过的合成会话历史仍在，再执行指定模型的工具与最终回复。
- `lab-compat.mjs INSTANCE OWNER VERSION`：对当前登记适配做一批只读检查；锚点存在仅表示可以继续 review，不表示应应用旧补丁。
- `lab-reload-probe.mjs INSTANCE OWNER VERSION`：仅在自有空闲实例改变并还原一个 Worker 参数，检查原生热重载前后的真实工具与最终回复，要求 Gateway PID 不变。
- `lab-media-contract.mjs INSTANCE OWNER`：读取自有 9.2 原生媒体函数进行合成契约验证，不修改核心、不生成媒体、不发渠道消息。
- `lab-stage.mjs select91|select92 INSTANCE OWNER`：只切换已暂存的自有核心代码链接，必须先由 labctl 停止实例；不恢复、覆盖或删除状态。
- `scripts/patch-openclaw-worker-native-attempt.mjs CORE --check`：只读检查五个原生桥的 bundle 契约；`--apply INSTANCE OWNER` 只允许停止的自有 VLab 核心。

这些是构建期实验工具，不是公开安装 API。生产发布门仍保持阻断。
