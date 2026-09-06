# V-Platform：首轮独占 VLab 9.2 验证

2026-09-06，所有时间为北京时间。结论：**方向已经得到真实运行验证，但完整 V 安装包和全能力 9.2 验收尚未完成。**

## 范围与精确来源

- 独立分支：`codex/v-platform-package-20260906`。
- VLab：`VM-0-4-ubuntu`；仅通过规定的 Tailscale SSH 配置访问。
- 独占实例：`vplatform92`，owner `codex-v-platform-20260906`，端口 `26220`，用户 `lab-vplatform92`。
- 实测源码候选：`f81c163f311559aedfc2aa0378cddf4c5dbe97fa`；本报告之后的文档/清单文字提交不冒充重新部署。
- Worker：0.2.11 源码上的未发布候选构建，91 个文件，实际树 SHA256 `b2ef8d46c04ced0acc1b6f0a9b2e330cde4a4c2c868275842f17df6d2030364b`。不是一个新生产版本。
- Linux Node：`22.23.1`。
- 9.1 基线由封存的 `v-production91-20260905` 创建，该封存的原始 Worker 还是 `0.2.9-rc.2`，本轮先显式升级私有 Worker 到上述源码；不能称为当前生产完整克隆。
- 9.2 核心使用 npm 精确 `openclaw@2026.9.2`，CLI 实报 `OpenClaw 2026.9.2 (3928bad)`；npm lifecycle 未执行，不据此宣称完整安装配方已完成。
- npm integrity：`sha512-M6C7UsnX815nv26qBJFYGe6aGzv+ftZLRzV6S9oRXUtXg2Yn67eVntpssT94kgkquKVSeUxerUg0j1ONp4WYQg==`。
- 私有前缀 package-lock SHA256：`c10afa4836fc3db9c6b9f0210671b9b394fd3ed1f7921211b6933f4c55043813`。核心此后由统一原生桥修改了五个 bundle，不能将上游 integrity 当成修改后制品 hash。

实例 channels 为空，cron/browser 禁用。只注入服务器已有的指定 VLab 静态模型 key，不复制生产配置、OAuth 认证库、Session、Memory 或浏览器配对。

## 实际通过的检查

| 检查 | 结果与边界 |
| --- | --- |
| 统一离线回归 | 本机及 Linux **202/202**，54 个文件，零失败/skip/todo；目标 Linux 13:03 完成，约 8.5 秒 |
| 9.1 基本 Worker 链路 | 12:43 完成，真实 DeepSeek V4 Pro → exec 输出 → 最终回复，Session done，15.49 秒 |
| 9.2 基本 Worker 链路 | 三次成功分别为 13:01、13:03、13:07，约 15.68 / 10.08 / 16.12 秒；均为实际 `vlab-worker`，同一指定模型，无 fallback |
| 9.2 运行中修改 | 13:02 完成；到真实 exec 边界后注入修改；最终采用新目标，原目标未输出；只有 **一次 Worker attempt**；两条用户记录各写入一次 |
| 9.2 停止后继续 | 13:03 完成；旧任务停止、原目标未输出，新一轮实际 exec 与回复成功；停止任务在 agent.wait 返回 error，而非伪造 ok；此项不代表所有后台副作用都已验证取消 |
| 9.2 → 9.1 | 13:06 完成；保留当前状态，读取到升级前后 3 条先前成功测试历史；9.1 再次执行工具与最终回复成功，16.10 秒 |
| 9.1 → 9.2 再升级 | 13:07 完成；4 条先前成功历史保留；9.2 新任务成功。没有用旧快照覆盖新增记录 |
| 共享环境不受影响 | 共享集成 Gateway PID 始终 `1596728`，NRestarts=0，active；未获取/修改集成租约，未接入共享机器人 |

这些时间仅是小型固定合成任务的端到端时间，不是供应商性能结论或生产并发容量验收。
历史保留覆盖本次探针的工具/最终回复，**不等于真实业务数据库或 Memory 索引迁移验收**。

## 被检测并收拢的三项兼容问题

1. 9.2 内部导出的短名称改变：`withPluginRuntimeGatewayContextResolver` 从 `s` 变为 `c`，`s` 改指 `hasGatewayContextOwner`。改为语义名解析、唯一性检查和导出类型检查，不再盲猜缩写；同时移除完成投递的 `t/n` 猜测。
2. 官方核心升级未带上 V 的原生执行桥。把主体升级来源的 attempt、消息、Gateway 身份、host capability、loader 上下文五 bundle 适配收进本仓库，先验证全部锚点，再仅对停止的 owner 实例应用。第二次检查全部 unchanged。
3. 9.2 在进入 attempt 前建立本地工具权限。旧桥覆盖本地指纹导致原生 `embedded tool authority registration does not match its attempt` 拒绝。现在保留 Worker 原生指纹，并仅在当前可信 IPC owner 内验证 Gateway 指纹后交给当前 Worker handle；未知指纹、不同 handle generation、已关闭 owner 均拒绝。**未删除或放宽原生权限检查。**

修复提交依次为 `aba0dbd`、`5daaeb7`、`8c14c0e`；每项均有离线回归，并有后续真实运行证据。
首轮 Linux 还有一个测试 fixture 受 UMask 0077 影响：显式设置 fixture 0640 后验证原函数保留实际权限，未放宽运行用户 umask 或生产权限。

## 批量检查明确发现的未闭合项

`lab-compat.mjs` 对 15 条登记适配一次输出状态，不逐个依赖用户回忆。

- 媒体完成回传：**9.2 锚点结构已漂移**，旧变换报告 `media completion schedule function was not found`。没有强行应用，媒体完成全链路仍阻断。
- 子任务 spawn / yield、Skill Workshop、exec 配置域、渠道注册、原生 setup probe owner：目前能找到变换锚点，但未在本 9.2 候选应用/完整验收。锚点存在不是兼容证明。
- Session Hotset 旧锚点落在 legacy state migration 模块，不能把它误当现行 SQLite 热路径，更不能机械应用旧补丁。
- 飞书 Steer 与流式呈现、Astra/Codex、企微工具要求对应组件原生审查及真实验收；本轮没有接入凭据或发外部测试消息。
- 两项 Browser 诊断/超时实验候选继续排除，不因打包而混入已接受生产基线。
- Browser 配套仓库、Night Shift、实际启动链、可信插件安装 provenance、完整制品锁及干净安装仍未闭合。

因此 `release-check` 必须继续非零。不能声称“官方 9.2 + 一个 Plugin 已经恢复全部 V 功能”。当前只是安装包构建流程中的首轮运行兼容验证。

## 留存与收尾

仅安全元数据在实例 `/srv/vlab-production-mirror/labs/instances/vplatform92/platform-evidence/` 留存；不将原始会话、配置或凭据提交 Git。
候选运行目录（含该实例保留的旧版本）labctl 指纹为 `725e9cc2d3fe8d9ac65cb8abca4d1b971843745911b75f6e09aa55b5c7af6ede`，96049 文件；这是运行目录记录，不是一个可分发安装包的制品证明。

13:07 已通过 labctl 停止本任务实例，保留旧核心、旧 Worker、自有状态检查点、当前合成状态与证据；未删除资源。磁盘余量约 7.9 GiB。
生产 V 未访问/修改/升级；源码未合并、未推送远端、未发布 npm。

下一阶段顺序：完整来源/启动链对账与制品锁 → 私有实例补齐并回归剩余能力 → 独占集成环境的双 runtime/渠道/媒体/负载验收 → 精确 release ID 的生产批准。
涉及共享机器人、外部消息或生产发布仍需要覆盖具体动作的授权和相应集成交接。
