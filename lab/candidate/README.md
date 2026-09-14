# 合入前候选测试：Agent 自主执行

2026-09-15 用户修正：worktree 不应被候选运行工具限制网络或能力。`candidate` 默认在 VLab 主机直接执行，没有断网沙箱，也没有预设的并发、CPU、内存、进程数、执行时长、数据大小和输出大小上限。

旧 worktree 也优先使用更新后的 dev 控制入口，`--repo` 指向自己的代码：

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner YOUR_TASK_ID --plan /absolute/candidate.plan.json
```

只有正在修改控制工具自身时才调用 worktree 内的 `lab/vlab.mjs`，避免旧 worktree 的旧 runner 继续施加已经撤销的限制。

## Agent 选择测试方式

```json
{
  "tests": ["tests/my-change.test.mjs"],
  "support": ["tests/helpers.mjs"],
  "files": [{"source": "lab/release-files/module.js", "target": "openclaw/dist/module.js"}],
  "databases": ["agents/openclaw/agent/openclaw-agent.sqlite"],
  "timeoutSeconds": 0
}
```

- `tests` 使用 Node test runner；也可以直接指定 `command` argv 数组运行 Python、shell、provider 测试等任意命令。`cwd`、`env`、`user` 可由 Agent 自行指定。
- 默认 `timeoutSeconds: 0` 表示无工具时限。需要超时时由 Agent 在 plan 中设置，不设最大值。
- 不限制分支名称、输入大小、数据库数量或大小；本机输入可来自 worktree 外，传输时映射到自己的测试目录。输入内容 hash 与目标路径校验用于防止执行错文件。
- `before` 与 `baseRelease` 均可选；Agent 需要严格基线比较时再提供。
- 配置保留真实 provider、凭据引用、插件、渠道、cron、browser 和 heartbeat 设置，不强制关闭。服务器进程环境在服务器内继承；真实凭据不回传到本机结果中。fixture 仅用于脱敏诊断，不作为执行配置。
- 默认使用 SSH 管理身份执行。OpenClaw 插件可能校验代码目录属主；Agent 可以选择 `user: "lab-db91-parity"` 来匹配共享服务身份。示例明确选用该身份做真实配置测试，而不是工具强制降权。

## 独立目录与可用上下文

| 环境变量 | 内容 |
|---|---|
| `VLAB_CANDIDATE_RUNTIME` | 当前候选 runtime，可写，直接 import 此处运行自己的代码 |
| `OPENCLAW_CONFIG_PATH` / `OPENCLAW_STATE_DIR` | 本次配置/状态副本 |
| `VLAB_CANDIDATE_DATA` | 本次数据目录，包含 workspace 与所选数据库副本 |
| `VLAB_SHARED_CONFIG_PATH` / `VLAB_SHARED_STATE_DIR` | 共享 VLab 原始路径，可按测试需要访问 |
| `VLAB_SHARED_CONFIG_FIXTURE` | 脱敏诊断配置 |
| `VLAB_CANDIDATE_UNIT` | 当前测试进程组对应的临时 systemd unit |

原来的 `/runtime`、`/data`、`/candidate` 沙箱固定路径已撤掉，请使用上表环境变量或测试进程的 cwd。配置默认重定位状态/workspace/runtime 路径并选择独立 Gateway 端口，避免普通测试意外串改；Agent 可以通过 `env` 或自己的命令选择其他路径。

代码基线仍按版本缓存。因为 runtime 现在允许写入，候选目录使用 reflink/独立文件副本，不能继续暴露可写硬链接污染缓存。选定数据库仍通过 SQLite 在线 backup API 取得一致性副本；其余数据与凭据路径由 Agent 按场景选择。

工具不自动启动 Gateway、渠道或 cron；它只执行 Agent 指定的命令。网络、provider、语音、插件或浏览器测试不再被工具判为“只能等共享 Dev”。最后集成验收覆盖哪些行为，依据改动与已有证据判断。

测试结束只回收自己的临时进程组和工作目录，保留 receipt。receipt 记录实际输入、候选版本、配置来源、所执行场景和耗时。共享 Dev 在此期间更新只记为观察差异，不使已冻结输入的测试失效。

历史断网版的验收记录只说明旧版行为，当前行为以本页和 runner 为准。
