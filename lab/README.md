# VLab: 一个任务，一个 worktree，一个运行实例

之前的冲突不是 Git 分支没分开，而是多个分支的脚本都指向同一个 24993 Gateway、可写 bundle、配置和状态。**worktree 只隔离源码，不隔离部署。**

## 简单流程

1. 从确定的集成提交建立自己的 `codex/<任务>` 分支和独立 worktree。不要在其他任务的 worktree 开发。
2. 提交代码，在自己的实例测试；实例绑定 owner（Codex thread ID 或明确负责人）、branch、完整 commit SHA。未提交代码不能作为验收候选。
3. 通过后合到集成分支；获取唯一的 integration lease，再用共享 VLab 机器人验真实飞书链路。完成后明确交还 lease，不凭过期时间抢占。
4. 最后按已有发布、备份、回滚流程上 V。个人实验不会自动部署生产。

**个人实例不连接飞书/企微机器人、不跑 NightShift/cron。** 同一机器人凭证不是可并发共享的测试资源。渠道、夜班、浏览器等端到端测试仍在独占集成验收环境，或者另外申请完全独立的测试账号/浏览器。

## 实例边界

- 独立本机 Git worktree；服务器独立 Git checkout（Git bundle 输入，禁止 hardlink）。
- 独立 Gateway、端口、随机 token、Linux 用户、HOME、STATE、Session、Memory、workspace、npm cache、Codex HOME。
- OpenClaw、Worker、插件代码从只读、带 checksum 的稳定基线复制，**不共享可写 runtime**。修改 baseline 必须新建版本，不能原地更新。
- 默认 Worker 1 × 2，main/subagent 上限各 2，cgroup CPU 100%、MemoryHigh 2 GiB / Max 3 GiB；最多同时开两个个人实例，保留数据盘至少 3 GiB。现有 VLab 大并发验收独占进行，不照搬生产 45 并发。
- 服务使用 `ProtectSystem=strict`、自己的 `ReadWritePaths` 和独立 UID。普通实验进程不能改共享 Gateway 或其他实例；管理员 sudo 仍能绕过，所以运维也必须遵守入口规则。
- 模型供应商额度不因进程隔离而独立。OAuth 登录单独配置，不复制整个认证库或 refresh token。可由管理员在服务器内为实验注入指定静态 API key，不进 Git、不输出。
- 基础实例并非“全功能验收已通过”的声明；运行机制、渠道和迁移测试需在候选报告逐项记录。

## 用法（服务器端）

只通过 `/Users/tianyicai/v-upgrade-private/20260904/ssh-config` 的 `vlab91` 别名连接。`labctl.mjs` 固定检查 VLab hostname，不接受生产地址参数。

```sh
# 本机：在任务自己的 worktree 中提交，打包精确分支
git status --short
git rev-parse HEAD
git bundle create /tmp/my-experiment.bundle codex/my-experiment
# 将 bundle 复制到 VLab 的 labs/control/；不要复制 .env/session/credentials

# VLab：必须明确 name 和 owner；不存在“默认 VLab”写入
sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node \
  /srv/vlab-production-mirror/labs/control/labctl.mjs create my-experiment \
  --owner THREAD_ID --baseline v-production91-20260905 \
  --bundle /srv/vlab-production-mirror/labs/control/my-experiment.bundle \
  --branch codex/my-experiment --commit FULL_40_CHAR_SHA

# 以下用 labctl 简写上面 sudo node 的完整入口
labctl start my-experiment --owner THREAD_ID
labctl status my-experiment --owner THREAD_ID
labctl cli my-experiment --owner THREAD_ID -- gateway health --json
labctl restart my-experiment --owner THREAD_ID
labctl stop my-experiment --owner THREAD_ID
labctl list

labctl lease integration --owner THREAD_ID
# 此处才允许操作共享 VLab，先检查活跃业务及其他验收；lease 不是强杀授权。
labctl lease integration --owner THREAD_ID --release true
```

`--provider-config PATH` 仅用于服务器端从明确的已有 VLab 配置提取 DeepSeek 静态 key，生成实例私有 `secrets.env`；不会复制原渠道、绑定、Session 或凭证库。默认不注入密钥。

源码 checkout 在 `instances/<name>/source`，运行代码在同实例 `runtime/`。应用本任务补丁时必须指定该 runtime 路径，记录 patch commit；不要运行仍写死旧 generation/24993 的脚本。换候选推荐创建新实例名，旧实例可停止保留证据；目前无自动删除命令。

## 集成与回滚

- 接收者先 review feature commit，再在专用 integration worktree 合入；**不能把 checkout 后的未提交热改视为已合入**。
- 精确记录 code SHA、基线 SHA、补丁列表、配置差异、验收证据；Gateway 健康不代替真实模型/工具/消息回传验收。
- 失败实验只停自己的 unit，不重启共享 Gateway。切回此前已验收实例/发布包，不用 `git reset --hard` 清其他人的工作。
- 旧 hardcoded mirror 脚本只属于集成操作，需要 lease；新功能开发禁止直接调用。lease 是协作防误操作锁，不是针对有 sudo 权限管理员的安全沙箱。

## 自检

`node --test lab/config.test.mjs` 验证随机凭证、路径、双层 runtime、owner、禁渠道与并发限制。实机还必须证明两个 Gateway 同时运行，A 重启不改变 B/共享 Gateway PID，A 用户无法读取/写入 B 状态，私有代码改动不改变基线和 B 的 hash。
