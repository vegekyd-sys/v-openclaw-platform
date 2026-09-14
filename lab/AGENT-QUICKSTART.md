# VLab 开发入口

2026-09-15：**worktree 开发与独立测试 → 用户决定合入 dev → 共享 VLab 最后集成验收 → 按授权上 V。**

普通开发测试不占 integration lease，不要求先合 dev，不重启共享 Gateway。共享 VLab 是 Dev 环境，不是每次修改的测试运行器。

## 开始

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs new --task unique-fix --owner YOUR_TASK_ID --repo /Users/tianyicai/vlab-dev
```

进入返回的 worktree，候选测试优先使用 dev 的控制入口并将 `--repo` 指向当前 worktree；修改控制工具自身时才调用自己的 `lab/vlab.mjs`。

## 一条命令测试候选

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner YOUR_TASK_ID --plan /absolute/candidate.plan.json
```

plan 指定本次测试文件、替换的 runtime 文件、需要的 SQLite 数据库；格式与例子见 [candidate/README.md](candidate/README.md)。第一次缓存当前 runtime；之后只传代码差量并复用基线。配置每次复用共享 VLab 当前设置与服务器环境，数据库按需生成一致性备份；默认使用自己的可写目录，也可按场景访问共享资源。候选工具不限制网络、并发、CPU/内存、时长或数据大小，Agent 自主决定测试方式。

支持未提交修改，receipt 记录输入文件 hash、HEAD、dirty、真实代码基线、数据来源、结果和分段耗时。开发迭代不必为测试先 commit/merge/package/stage。准备交付时提交并核对被测试文件 hash。

配置、模型、OAuth、语音、插件等都可按需要在 candidate 中测试，不再以“候选无网络/凭据”为由推迟到 Dev。结果只证明实际执行过的场景，最后集成验收范围由 Agent 根据改动和证据判断。

只读查看共享历史无需 lease：

```sh
node lab/vlab.mjs rpc --method sessions.list --params '{"agentId":"makaron","limit":10,"includeLastMessage":false}'
```

## 最后集成

提交自己的修改，报告结果和完整 SHA，由 Tianyi 决定是否合 dev。已有明确授权直接执行，不反复确认。

获准后：合并 → 相关回归 → 获取空闲 integration lease → package/stage/deploy → 一次有针对性的真实验收 → accept/释放。命令与失败回退见 [README.md](README.md)。`sync` 仅在需要更新服务器源码镜像时运行；已有相同提交会跳过，否则增量传输。共享业务有活跃运行时不强杀，不抢其他任务的 lease。

普通配置/模块修复不默认扩大成全套渠道、媒体、压力与冷启动验收。只有改动涉及这些行为、相关测试失败，或出现新的回归证据才扩大。复用同一输入 hash/代码基线下已有证据。

## 结果怎么报告

报告改动、候选测试实际结果与耗时、未覆盖的集成场景、分支/commit。部署结果与业务验收分开表述。VLab 通过不代表生产已上线；生产连接只走 Tailscale。
