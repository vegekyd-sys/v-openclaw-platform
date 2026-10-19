# Codex 进程登记在主线程忙时不再失败（codex-process-inspection-budget-v1）

2026-10-17 CST。接 `docs/gateway-freeze-20261016.md`、PR #404。

## 问题

V 10/17 03:28，Tianyi 主会话（7612daa9，21,327 条事件，/vds）发出的第一条消息，3.6 s 后报错 `Cannot inspect Codex processes. Process inspection exceeded its deadline`，用户看到「Something went wrong」。重发一次就成功了。

## 根因

Codex 插件 `transport-stdio-CyPldczm.js` 启动 app-server 时要先「登记」子进程：

1. `reapRegisteredCodexAppServerOrphans`：读出之前的登记，检查对应进程是否还活着。
2. `register` 回调：读新子进程和自己的 `/proc/<pid>/stat` 和 `cmdline`，写入登记。

这两步只读 2–3 个指定 pid，不是扫全部进程。但它们沿用了 containment（暂停、杀子进程）的 2 s deadline：

- `readCodexAppServerProcessSnapshot` 的默认值是 `Date.now() + MAX_PROCESS_CONTAINMENT_MS`（2 s）；
- 读命令行那一步写死了 `+ 2e3`。

每次 `readFile` 之后都要等主线程回来才能继续。V 上同一回合的 `codex-bounded-history` 在主线程上同步读了 2.57 s（日志 `ms:2574`）。等主线程空出来，deadline 已经过了，回合失败。

另外，profile 里 `readLinuxProcesses` 一共只占 140 ms CPU，所以问题不在读取本身慢。

## 改动

只改 Codex 插件的 `transport-stdio-CyPldczm.js`：

- 目标路径：`npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/transport-stdio-CyPldczm.js`
- before `513e62ddeba5545431e34fc8a189ae53ee3425752c859cc1454d3eb1ce554d2d`（V = 共享 VLab）
- after `cd3d59c5bfa3eafd26339b62cbb2819381f3e3d43d739d8169f4f5d142658831`

具体：

- 新增 `PROCESS_IDENTITY_INSPECTION_MS = 15e3`，作为登记和孤儿回收的身份读取预算：`readCodexAppServerProcessSnapshot` 的默认 deadline，以及登记时读命令行的 deadline。
- 孤儿回收整体预算改为 2 × 15 s，保证一次重试也放得下。
- 登记的两次读取和孤儿回收的读取，遇到 `deadline` 超时会用新预算重试一次；其他错误（权限、`/proc` 不可用）照旧直接抛出。
- containment 不变：它的常量和所有显式传入 2 s 的调用都没动，单测逐字节比对过这一段。

没做的：把有界历史读取挪到登记之后，或者让它不阻塞主线程。

- 那次读取在另一个文件里（Codex 插件 run-attempt / session-history），本身是同步 SQLite 读。
- 只调整先后顺序不会让它变成非阻塞，反而会把 app-server 启动整体推后，首字更慢。
- 真要不阻塞，需要把读取挪到 worker 线程，这属于 #405（checkpoint-hotpath-fix）正在改的读取路径。

## 验证

VLab candidate（`lab/candidate/codex-process-inspection.mjs`）：

- 用插件真实的 `createStdioTransport` 启动一个 stub app-server（一个只做 `sleep` 的脚本）。
- 子进程一启动，就让主线程同步忙等 N 秒，模拟 V 上那次 2.57 s 的读取。
- 测试用的是 candidate 私有状态库副本，先清空其中的 Codex 进程登记，不读也不回收共享 VLab 的任何进程。

| 主线程阻塞 | 原版 candidate-7329719f | 修复 candidate-daba93ad |
|---|---|---|
| 无 | 3/3 成功 | 3/3 成功 |
| 2.6 s | **0/3**（deadline） | **3/3**，阻塞结束即完成，2.61 s |
| 5 s | 0/3（deadline） | 3/3，5.01 s |
| 16 s（超过 15 s 预算，走重试） | — | 2/2，candidate-19151e49 |

所有轮次都没有残留子进程，共享 VLab 不受影响。

单测：`lab/patch-codex-process-inspection-budget.test.mjs`。

Monitor 要求用 7612daa9 的 V 副本复现「冷缓存首条 /vds」：V 的数据库有 18.5 GB，VLab 放不下这份副本；而且失败只取决于「登记时主线程被占用超过 2 s」。所以这里改用确定性的主线程阻塞来复现同一机制。
