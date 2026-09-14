# VLab 合入前独立测试验收

范围：候选运行工具与开发流程。未合入 dev，未部署共享 Gateway 或生产 V。服务器只新增测试工具自身的数据盘缓存、短时测试进程与 receipt，未替换既有 server.mjs。

## 已验证

1. 使用真实 VLab 当前配置生成私有副本，通过 OpenClaw `writeConfigFile` 修改 `agents.defaults.maxConcurrent`，清除缓存后 `loadConfig` 及文件读回均匹配，然后恢复并再次读回。加上 606208 字节的真实 SQLite 副本写入测试，端到端 6190 ms，服务器测试 3180 ms，数据/目录准备 844 ms，缓存命中无需重扫。receipt：`candidate-442fff4d-49fe-4fec-88c7-4fd035ed9db6`。
2. 两个实际 worktree 同时覆盖同一 `config-runtime.js` 模块，分别导出 A/B 标记；双方 import 的都是自己版本。双方均通过配置改写/恢复、SQLite 私有写入、候选模块标记三项测试；总墙钟 10.373 秒。各客户端 10020 / 10104 ms；服务器测试 6686 / 6691 ms；快照/目录准备 875 / 881 ms；代码覆盖各 1 ms。
3. A receipt：`candidate-16b609e1-c228-408f-8a9e-b1f027a18c35`；B receipt：`candidate-05a8142d-af4e-4a5c-b91f-dd6b9f3272c8`。分支分别为 `codex/vlab-candidate-fastpath-20260914` 与 `codex/vlab-candidate-peer-20260915`。
4. 显式失败测试返回非零退出码；1 秒超时测试被终止并返回非零。对应 receipt：`candidate-4e33f05d-e23d-46d6-ac1a-341df988c6a0`、`candidate-08ea4861-8a01-4e48-a0b6-4ae2482a20a6`。两者均保持共享 PID/配置不变。
5. 测试中确认共享 state 路径不可读取，代码/fixture 只读，独立网络中无法连接 24993。两个并行运行可创建同名测试表，各自只读到自己的 run ID。
6. 独立只读核验：共享数据库没有 `candidate_isolation_proof` 表；共享模块与缓存模块 SHA256 同为 `c735001195c3fed5d089e31aa466eac3738c236ab467a451d3acabb0b07262b9`；共享 Gateway `MainPID=2565984`、`NRestarts=0`。
7. 本地 16 项自动测试通过，含真实 Git 增量 bundle 验证/fetch/同提交跳过/未知祖先拒绝、dirty dev 下创建新 worktree 不覆盖其他修改，输入路径与内容 hash，配置副本及既有 release 隔离回归。

## 基线与限制

- 验收时共享 release：`db91-writer-transaction-scope-v2`；runtime SHA：`c7e0083421a2d3bca05fe145437a9cdef42d44f17f4d9b920dec0be7943e35d5`；配置 SHA：`d7546232f72936f49cb85a6d43ea52b42c6413b43f161f2d7aeea106bb6e619b`。
- 1.4 GiB runtime 是每个版本一次性缓存，不是每个任务复制。缓存内容已与共享 release fingerprint 对齐；凭据/数据库不在代码缓存中。第一次 rsync 的观察耗时约 5.1 秒，基线校验另行完成，不能把此数字当作完整冷启动 benchmark。
- 本轮并未测量过去“一小时更新”的完整时间线，也未对 SOL/Astra 做对照。优化依据是实际流程中的全量传输、测试必须部署共享版本，以及重复命令/决策环节。
- 单次配置路径 6.2 秒和双候选 10.4 秒只代表本轮样本，不代表完整生产升级能在同样时间完成。
- 此入口不提供真实模型/OAuth、共享 Worker 调度、Memory 全量/FTS、浏览器或渠道集成验收。它们按改动范围进入最后 Dev 验收；不要求每个普通配置修改都执行所有场景。

回退：停止使用新增 `candidate` 入口即可，现有 dev/release 命令仍可使用。共享和生产服务无须回滚。缓存与 receipt 为本工具生成的数据，当前无自动跨版本清理策略。

最终 runner 再验收：`candidate-12dd8846-e158-4f5e-9c49-3c7bca24f302`，配置与 SQLite 两项通过，客户端总耗时 6055 ms，共享 PID/配置不变。
