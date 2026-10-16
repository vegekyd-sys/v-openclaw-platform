# 慢事务日志带上调用方（sqlite-hold-callsite-v1）

2026-10-16 CST。

## 问题

V（db91.6）的 Gateway 主进程反复长时间持有 agent 库写锁：10/16 08:01 持锁 11.8 s、11:51 持锁 9.1 s。
期间其他回合等锁超过 5 s，就报 `Agent DB process coordinator wait exceeded 5000ms`，用户看到回复中断。

文件日志 `/tmp/openclaw/openclaw-YYYY-MM-DD.log` 只有：

```
slow SQLite transaction hold {async:false, database, elapsedMs, operation:"agent.write", pid, thresholdMs:1000}
```

`agent.write` 是 `runOpenClawAgentWriteTransaction` 在调用方没给 label 时的默认值，从日志看不出是哪段代码。
抓 inspector CPU profile 会额外卡主线程约 5 s，而且要 Tianyi 批准。

## 改法

只改一个 core dist 文件 `node-sqlite-CL-d6drd.js`。底本是 V 的字节 b4516f85（npm 2026.9.1 + codex-turn-tail-v1），产物 da24951c。

- `runSqliteTransactionSync` 是同步的（operation 返回 Promise 会直接报错），`logSlowTransactionHold` 在它返回之前调用。
- 所以打日志那一刻的调用栈，就是进入事务时的调用栈。不需要在事务开始时先存一份栈，只在持锁已经超过阈值、确定要打日志时再取。
- 阈值沿用 1000 ms。低于阈值的事务不执行任何新增代码。
- 取栈时临时把 `Error.stackTraceLimit` 提到 40，然后去掉包装层：
  - node-sqlite 自己的帧；
  - 对 agent.write，一直去到 `runOpenClawAgentWriteTransaction` 为止（进程协调器、BEGIN 争用重试、post-commit publication 都在这一段里）。
- 余下的前 8 帧放进同一条日志的 `callers` 字段，每帧格式是 `函数名 (目录/文件.js:行:列)`。取栈出任何错，就照旧打这一行，只是不带 `callers`。

上线后日志会变成这样：

```
slow SQLite transaction hold {..., operation:"agent.write", pid, thresholdMs:1000,
  callers:["<进入事务的函数> (dist/xxx.js:行:列)", "<它的调用方> (...)", ...]}
```

## Candidate（VLab，V 的运行时字节）

- 共享 VLab 的 `node-sqlite` 和 `openclaw-agent-db` 与 V 字节一致（b4516f85 / 046d7a82，10/16 在两台机器上核对）。
- 数据：V 镜像里 dealclaw 的 agent 库，在线备份出的私有副本，398 MB、10,643 条 transcript_events。
- 写入路径：走真实的 `runOpenClawAgentWriteTransaction`，经过进程协调器、BEGIN 争用重试、post-commit publication。
- 日志：生产用的 subsystem logger，写到私有文件。
- 对照：A 臂用原文件，B 臂用补丁文件，A、B 交替跑 3 轮，每轮各一个进程。
- 脚本 `lab/candidate/sqlite-hold-callsite.mjs`，plan `lab/candidate/sqlite-hold-callsite.plan.json`。
- 结果：candidate-b60406f8，全部检查通过。

| 场景 | A（原字节） | B（补丁） |
|---|---|---|
| 3 次持锁 300 ms | 不打日志 | 不打日志 |
| 3000 次短 agent.write，每次耗时（中位） | 272.4 µs | 273.1 µs（三轮 264–285 µs，A、B 在同一噪声范围） |
| 一次持锁约 1.5 s（整表读 transcript_events，再补足时长） | 1 行，没有 callers | 1 行，`callers[0]` = `vlabHoldProbeFullScan`，`callers[1]` = `vlabHoldProbeTurn` |
| 每打一行慢日志的额外成本（日志器为空操作） | 4.7 µs | 35.9 µs，多约 31 µs，只在持锁 ≥1 s 时发生 |

B 臂实际打出的日志行：

```json
{"async":false,"database":".../agents/dealclaw/agent/openclaw-agent.sqlite","elapsedMs":1500,"operation":"agent.write",
 "pid":667678,"thresholdMs":1000,"callers":["vlabHoldProbeFullScan (candidate/sqlite-hold-callsite.mjs:72:12)",
 "vlabHoldProbeTurn (candidate/sqlite-hold-callsite.mjs:81:41)","child (candidate/sqlite-hold-callsite.mjs:83:3)",
 "async candidate/sqlite-hold-callsite.mjs:31:32"]}
```

离线单测 `lab/sqlite-hold-callsite.test.mjs` 覆盖以下几点：

- release 文件等于对 V 字节打补丁的结果；
- 已经打过补丁的文件会被拒绝；
- 用真实 `node:sqlite` 驱动补丁文件：
  - agent.write 的 callers 从调用方开始，不含包装层，不含绝对路径；
  - 直接事务只跳过 node-sqlite 的帧；
  - 低于阈值不打日志；
  - `stackTraceLimit` 会还原；
  - 取栈出错时仍照常打这一行。

## 上线

需要 Tianyi 决定合入 dev 并说「上线」：

1. 从 dev 打包 `lab/sqlite-hold-callsite.plan.json`：1 个文件，目标 `openclaw/dist/node-sqlite-CL-d6drd.js`，before b4516f85。
2. 用 promote-to-v 推到 V。
3. 执行一次 `v-self-restart`。Gateway 进程和 worker 都从 core dist 加载这个模块，重启后生效。
4. 上线前在 V 上核对一遍 before 哈希。如果别的发版先替换了这个文件，就重跑 `node lab/build-sqlite-hold-callsite.mjs`，改用新的底本。

上线后的验收方法：等下一次 `slow SQLite transaction hold`，看这一行有没有 `callers`。持锁不到 1 s 的事务不会打日志，所以不打日志是正常的。

## 没有覆盖

- 真实 Gateway 里 agent.write 调用方的具体栈形状，要等 V 上真的出现一次持锁才能看到。8 帧是否够用，届时再看。如果 8 帧全是框架帧，就把 `CALLER_FRAMES` 调大。
- 只记录了进入事务的调用方，没有记录事务内部哪一步慢（栈取的是打日志那一刻，operation 已经返回）。知道是哪个调用方之后，再针对那段代码定位。
