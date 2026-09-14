# 在合入前测试自己的代码

`candidate` 在 VLab 主机上运行当前 worktree 的实际候选模块，复用已校验的代码基线，以及当前 VLab 配置/选定数据库的副本。它不调用共享 Gateway 来冒充候选测试，也不需要先 commit、merge、lease、stage 或重启服务。

```sh
# 在自己的 worktree 内，plan 和测试代码也放在该 worktree
node lab/vlab.mjs candidate --repo "$PWD" --owner YOUR_TASK_ID --plan lab/candidate/examples/config.plan.json
```

命令退出码为 0 才代表通过。完整 JSON receipt 写到 worktree 的 `tmp/candidate/`，stdout 同时返回结果。默认支持 Mac 通过既有 `vlab91` SSH 入口运行；无需安装/替换服务器控制工具，使用的是调用方 worktree 内的 runner。

## 指定修改、测试和数据

```json
{
  "baseRelease": "当前 status 的 current.release，可省略以采用执行时版本",
  "files": [{
    "source": "lab/release-files/my-module.js",
    "target": "openclaw/dist/my-module.js",
    "before": "read-code 返回的原文件 SHA256；新增文件用 null"
  }],
  "tests": ["tests/my-change.test.mjs"],
  "support": ["tests/helpers.mjs"],
  "databases": ["agents/openclaw/agent/openclaw-agent.sqlite"],
  "timeoutSeconds": 120
}
```

- `files`：相对于 runtime 的候选覆盖文件，实际写入新 inode。原文件 hash 不匹配时报告基线漂移，不偷偷应用。新增模块也支持。
- `tests`：Node test runner 入口。静态 import 的本地辅助文件列入 `support`；仅发送列出的文件，不上传整个 Git 历史。
- `databases`：相对于共享 state 的明确数据库路径。默认空，不复制整个 state。最多 3 个，每个不超过 512 MiB；用 SQLite 在线 backup API 生成一致性副本，15 秒有界退出，然后 quick_check。7.8 GB 的主 Agent 数据库不会被隐式复制；需要大库/完整 Memory 的专项测试仍需另行准备有界数据集或最后集成验收。
- 不依赖模型的配置/schema/模块/存储回归优先使用本入口。完整 Worker 调度、provider/OAuth、浏览器和飞书渠道端到端路径保留在最终共享验收。

## 测试内可用的路径

| 路径 / 环境变量 | 内容 |
|---|---|
| `/runtime` / `VLAB_CANDIDATE_RUNTIME` | 已校验基线 + 本次修改，只读；import 此处才是候选代码 |
| `/candidate` | plan 中的测试与辅助文件，只读 |
| `/fixture/shared-config.json` / `VLAB_SHARED_CONFIG_FIXTURE` | 当前共享配置的脱敏副本，保留插件设置用于纯逻辑测试 |
| `/data/state/openclaw.json` / `OPENCLAW_CONFIG_PATH` | 本次可写配置；状态路径改为本次目录，禁用渠道/cron/browser/插件自动加载 |
| `/data/state/<数据库相对路径>` | 本次独立的真实数据库副本 |
| `/data/workspace` | 本次独立可写 workspace |

在 Node 测试中 import `/runtime/openclaw/dist/plugin-sdk/config-runtime.js`，可以直接调用真实 `writeConfigFile` / `loadConfig`，无需请求模型。示例验证了实际改值、清缓存、独立读回、恢复及 SQLite 写入。

配置脱敏不保留可用凭据；SecretRef 只保留引用结构，不注入原环境。运行配置会关闭外部集成，原插件配置仍在只读 fixture。由此产生的差异必须作为验收边界，而不能声称完整复刻在线行为。涉及插件时，显式 import 对应候选模块并传入 fixture 配置；依赖 runtime 之外插件代码的测试需补齐自己的候选代码输入。

## 隔离与速度

同一代码基线只复制并全量校验一次，缓存位于服务器数据盘 `labs/candidate-tests/baselines/`。每个测试只创建目录/硬链接元数据；变化文件原子替换，测试进程以只读方式挂载代码，不能修改缓存或共享 runtime。配置每次新取，数据库只复制明确选择的文件。

每个任务独立 mount/PID/network namespace，不可连接共享 Gateway。临时 systemd cgroup 限制 CPU 100%、Memory 1 GiB、Tasks 128、默认 120 秒/最多 300 秒；目前最多两条候选测试并行。这是主机容量上限，不是共享 Gateway 的集成锁。失败和超时退出后回收自己的进程、临时状态；只保留代码缓存和 receipt。不要把临时槽位目录当作业务实例，更不要抢共享 lease。

receipt 记录 HEAD/branch/dirty、实际输入 hash、runner hash、每个 patch 的 before/after hash、代码基线、配置 hash、数据库路径/大小、分段耗时与共享 PID/配置是否变化。`dirty` 是 Git 状态，ignored 测试文件仍由输入 hash 绑定；不能仅凭 HEAD 宣称所有输入都已提交。共享 Dev 在测试期间发生更新时只记录观察差异，已冻结输入的候选测试结果仍有效；最终合入/发布时核对目标基线。提交后按文件 hash 核对既有测试证据，不因单纯 commit 动作重复部署整套环境。

2026-09-15 实测：配置改写/恢复 + 真 SQLite 副本测试端到端 6.2 秒；两个 worktree 的 A/B 模块覆盖并行运行，各 3 项测试，合计墙钟 10.4 秒。耗时包含当前网络，不是所有修复的 SLA。证据见 [验收记录](../../docs/vlab-candidate-acceptance-20260915.md)。
