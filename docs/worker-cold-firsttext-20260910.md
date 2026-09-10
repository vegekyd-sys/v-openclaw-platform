# Worker 冷启动：第一项可验证优化，待用户批准合入

状态：独立源码分支 `codex/worker-cold-firsttext-20260910`，基线 `645c24d4f952ce226fd4904bb797db12b8ec431b`。未合入 dev、未部署共享 Gateway、未上线生产。本报告仅证明进程启动改善，不表示冷态首段回复目标已达成。

## 结果

在 VLab 已安装的原生 Node `v22.23.1`、原生 Worker 和 OpenClaw 代码上，以独立受限进程交替做三组 baseline/candidate 对照：

| fork → ready（毫秒） | 第 1 组 | 第 2 组 | 第 3 组 | 中位数 |
| --- | ---: | ---: | ---: | ---: |
| 当前 Worker | 4603 | 4557 | 4893 | **4603** |
| 候选 Worker | 2583 | 2654 | 2600 | **2600** |

中位数下降 **2003 ms / 43.5%**。六次均成功加载原生 Agent Runtime 和 Skill telemetry，并完成启动后 IPC hold 往返。每次均为新进程、新的空白诊断 state；没有常驻 Worker 复用、编译磁盘缓存、模型或工具调用。

该测试不是 `receive → dispatch → visible reply`，不能把 2.600 秒称为首段回复时间。样本每组 n=3，足以确认该局部方向，但不能当作生产延迟 SLA。

完整数字与最终代码校验值见 [数值证据](evidence/worker-cold-start-20260910.json)。最终原生测试单元为 `worker-cold-firsttext-final-ready-20260910.service`，退出成功。

## 为什么启动慢，以及本次修什么

原生模块图的 CPU 采样中，Agent Runtime 导入 wall time 为 5864 ms，其中包 `exports` getter 自耗时约 2226 ms，JS 编译约 926 ms，GC 约 671 ms。这是诊断采样，不用于上述无采样对照的分位数。

同一个 dist 目录里的多个模块大量重复解析相同的相对依赖；Node 在不同 importer URL 下重复做解析工作。实验中消除了约 9030 次重复边解析，保留 1859 个原生首次解析结果。仅缓存 bare package imports 或仅启用 Node 编译缓存的初步收益较小，因此没有把那些方案加入发布补丁。

正式补丁只包括：

- `production-worker/worker.mjs` 在首次 `loadAgentRuntime` 的原生 import 前接入 helper。入口仅增加一个 import 和一次安装调用；去掉这两行后，运行、配置加载、prepared runtime、原生权限、工具、事件、transcript、取消和收尾逻辑与当前代码逐字一致。
- `production-worker/native-module-resolution-cache.mjs`：利用 Node 同步 resolve hook，进程内最多 4096 项。只缓存已由 Node 成功解析过的、OpenClaw dist 树内部的相对 `.js` ESM 依赖；缓存键区分 importer 目录、conditions、import attributes。相同 URL 仍由 Node 加载和维护模块实例。

不缓存包名/`#` imports、越界目录、query/hash、失败、重定向或非 ESM 结果，不混用不同导入条件；包 exports 禁止访问仍走原生规则。权限、模型选择、配置、插件 generation、消息和会话结果不进入缓存。无磁盘写入，无数据库绕过，无新增常驻进程，不提高常驻 Worker 数，不更改池并发。

只对 `name=openclaw,type=module` 的标准 `dist/plugin-sdk/agent-runtime.js` 布局启用；不支持的 Node/布局、检测到外部 loader/preload 参数或 `OPENCLAW_WORKER_RESOLVE_CACHE=0` 时原生路径照常运行。该 helper 在 Worker bootstrap 中安装；若未来通过程序在它之前注册自定义 resolver，应显式关闭本优化，不能假定任意第三方 resolver 的 importer-file 语义可共享。不可变 runtime 按现行发布流程更换并重启，不支持活进程内热写 dist 文件。

使用的是 Node 官方 [同步模块解析 hook](https://nodejs.org/download/release/v22.18.0/docs/api/module.html#synchronous-resolvespecifier-context-nextresolve)；实际接口及导入语义在 VLab 的 v22.23.1 上执行验证。

## 合入前测试与隔离

本地完整 Worker 测试及历史 firsttext observer 回归合计 **211/211 通过**：

```sh
node --test --test-concurrency=2 experiments/agent-worker-isolation-v1/*.test.mjs lab/firsttext-transport.test.mjs
```

覆盖原生桥接权限和 requester、tool cap、跨会话隔离、原生配置/prepared generation、超时取消、事件背压、Steer、动态工具、媒体结果、池扩缩容/affinity 等已有合同。新增测试覆盖解析 cache hit、目录/条件/属性隔离、模块 singleton、原生 exports 拒绝、缺文件后再试、错误不缓存、键/条目上限、opt-out/loader fallback，以及发布 Worker 的逐字不变边界。

Linux 原生 Node 的同一 helper 测试另在独立私网单元执行，最终 **9/9 通过**（`worker-cold-firsttext-final-contracts-20260910.service`）。两份 benchmark 脚本和发布 Worker 均 `node --check` 通过；`git diff --check` 通过。

原生基准使用 `PrivateNetwork=yes`、`PrivateTmp=yes`、`ProtectSystem=strict`、`ProtectHome=read-only`、CPUQuota 200%、MemoryMax 2 GiB、最长 240 秒。只读引用已安装依赖；候选 fixture 将源码的相对 support imports 指向已安装模块，将新 helper 指向任务源码。没有复制 runtime/config/state，没有新建 Gateway，没有使用业务数据库、凭据或模型 API。仅终止自己创建的无业务诊断子进程；临时目录由测试清理。

复现入口（必须沿用上述独立进程隔离边界）：

```sh
node scripts/benchmark-worker-native-ready.mjs /absolute/installed/runtime
WORKER_RESOLVE_BENCH=1 node scripts/benchmark-worker-native-import.mjs matrix /absolute/installed/runtime/openclaw
```

## 部署与回退边界

发布计划预置为 [worker-cold-firsttext-plan.json](../lab/worker-cold-firsttext-plan.json)，基于 `three-fixes-20260910-v2`，仅两个运行文件；当前 Worker 原 SHA256 必须为 `4ca913d1dcffc8aac28cb02fa9e446c5f61456af1bbbab292c5eb4914cfdcc80`。新增 helper 的 before 为 null。

候选 Worker SHA256：`5b49deac1c9eaafe69ec93d4c0ce9b2328d19fa44ec47158aa1b6c664effddf9`。

候选 helper SHA256：`287da78fdea204a160d0a85efb0753763facc64f371167862577ce3fe7795166`。

Mac 与远端任务源码校验一致，远端已部署 Worker 仍为上述 before。测试后只读 status：共享服务 PID `1821937` 未变，仍为已接受的 `three-fixes-20260910-v2` / `645c24d4`，pending=null；配置 SHA256 `8d32f91b7d9d85a44d3c46e2e755bda18e43f2171d0aed4813e7aa5e01d62a7e` 未变。没有生产操作。

等待 Tianyi 明确批准本补丁合入 dev。获准后才做精确 merge/package/stage/deploy，再对同一产物验收；失败按发布工具回退两个代码文件，保留配置、会话和新数据。开关是应急停用能力，本次未改任何服务环境配置。

## 仍须真实首段验收的部分

既有生产冷态 C15 首段正文中位数 25.435 秒，已验证热态两轮为 8.670/9.727 秒；这些是本次之前的结果，不是候选成绩。

本次只修了可独立证明的启动热点。首次 prepared runtime、hooks 后原生执行准备、分批扩容和 Gateway 排队仍需要在同一候选产物、真实消息下分段测量；不能从 fork→ready 的 2 秒收益直接推算正文能快多少。

合入获批后的验收应包括真实 C1/C5/C15 冷态与热态配对、首段正文 P50/P95、真实模型/工具/上下文、完整数据库与授权合同、内存/CPU/磁盘和错误保护。只有这些通过，才讨论生产推广及下一项扩容/首次准备优化。此次不通过先合入来获取测试条件。
