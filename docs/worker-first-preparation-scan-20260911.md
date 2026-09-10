# 首次准备第二项优化：减少全库校验的 JSON 搬运与解析

状态：任务分支 `codex/worker-cold-firsttext-20260910`，未合入 dev、未安装到共享运行目录、未上线生产。此前模块解析补丁仍保留；本次新增一个原生会话模块的 SELECT 投影优化。**首段 P50 15 秒尚未验证或达成。**

## 这次到底修哪里

不是继续只测 fork → ready。对共享 VLab 新启动且尚未执行 Agent 的真实 Worker，使用原有配置、真实数据库和模型做首次请求 CPU 采样，发现两个原生数据库句柄各自首次校验全部 session_nodes：

1. `prepareAgentCommandExecution → resolveSession → loadExactSessionEntryReadOnly → assertCanonicalSqliteSessionKeysCurrent`，只读句柄。
2. `agentCommandInternal → beginSessionWorkAdmission → runExclusiveSessionLifecycle → loadSessionEntry → assertCanonicalSqliteSessionKeysCurrent`，写入生命周期句柄。

两轮采样的全库校验 inclusive CPU 分别为 1733.7 / 2009.0 ms；JSON.parse 对应函数 self 为 1007.0 / 1129.3 ms，迭代器 self 为 538.0 / 652.1 ms。这些是有 profiler 的热点归因，不能当作无采样延迟，或从生产中位数直接扣除。

同时观察到插件加载 inclusive 约 2.34 / 3.07 秒，与首次准备嵌套；已有 resolver 补丁针对重复解析，原生最小夹具证明它也影响首次准备，但真实完整配置下能省多少仍需合入后的对照。状态 DB 完整性检查约 340 ms，原样保留。不能将只读入口、全库校验、插件加载等嵌套时间重复相加；既有生产 hooks → model 的 8.432 秒尚未全部量化解释。

## 改动与安全合同

只改 `scanCanonicalSqliteSessionEntries` 的验证用 SELECT。当没有 visitor 且未显式关闭优化时，SQLite 先验证整个 JSON 文档，再从返回的 JSON 投影去掉 `skillsSnapshot`、`systemPromptReport`。原生 metadata 查询本来就不返回这两项；本模块的身份、lineage、delivery 校验也不使用它们。

不是删除数据库字段，不修改已有记录，不跳过任何行，不共享两个句柄的 validation 标记。会话 ID、updatedAt、父子/派生关系、delivery 大小写证明、main-key 合同、缓存失效和所有原生错误检查仍保留。坏 JSON、非文本值、entry_valid 异常与精确 tombstone 原样进入原逻辑；带 visitor 的读取继续返回完整字段。整个 JSON 仍受语法校验，坏字段不会因投影移除而被掩盖。

将新增投影代码还原后，整个文件 SHA256 与当前原生文件完全相同，测试对此作硬断言。该共享模块可被 Gateway/Worker 使用，因此不是只作用于 Worker 的特殊旁路。无配置、schema 或依赖变化。

## 最终真实库只读对照

Linux 原生 Node v22.23.1；同一只读 SQLite 事务快照、同一原生完整校验函数，候选仅通过诊断进程的 import hook 替换目标模块，运行目录不变。3702 行全部通过；不导出内容，只记录聚合尺寸和耗时。

| 指标 | 原始 | 候选 |
| --- | ---: | ---: |
| 传给 JS 的 JSON 字符数 | 106,846,389 | 9,148,575 |
| 第 1 次扫描 ms | 534.1 | 322.7 |
| 第 2 次扫描 ms | 585.9 | 305.8 |
| 第 3 次扫描 ms | 749.4 | 408.7 |
| 扫描中位数 ms | 585.9 | 322.7 |

交替顺序 baseline/candidate/candidate/baseline/baseline/candidate，差值 263.2 ms，降幅 44.9%。这是预读聚合信息后的**暖页缓存单次扫描**，不是首次请求或 C15。真实首请求两次扫描的 profiler 热点约 1.7–2.0 秒，不能拿 44.9% 直接换算承诺收益。先前同代码无 typeof guard 的对照为 546.6 → 304.7 ms；最终表包含该 guard。

诊断单元 `canonical-scan-final-bench-20260911.service` 成功；脚本 `scripts/benchmark-canonical-session-scan.mjs` 只读真实 DB，query_only + BEGIN/ROLLBACK，校验 lease 和原始模块 hash，受 PrivateNetwork/PrivateTmp/ProtectSystem=strict/ProtectHome=read-only/CPUQuota=200%/MemoryMax=2G/RuntimeMaxSec=120 限制。

## 验证与现场收尾

- Mac Worker 全套 + firsttext + 新投影测试：220/220，通过，0 skip。
- Linux 已安装原生实现与候选逐案对照 + 投影测试：22/22，通过，0 skip，单元 `canonical-scan-contract-final-20260911`。包括完整 visitor、身份错误、坏 JSON、异常 flags、tombstone、三类 lineage、非 canonical key、main-key generation、重复 JSON 字段、大小写 delivery、大字段及关闭优化。
- 两轮真实首次请求采样各 3/3 专用会话回复正确；用于确认热点，不是候选成绩。每轮仅占用自己发起的三项有界 hold 以触发原生 warm spare；最后取消自己的 hold，关闭新 Worker 的 loopback inspector。Gateway 未重启、未热改运行代码；生成的专用测试对话保留。
- 16:37 UTC 后复核 9229 无监听。没有生产新压测或生产写入。
- 最终共享 status：Gateway PID 1821937、配置 SHA `8d32f91b7d9d85a44d3c46e2e755bda18e43f2171d0aed4813e7aa5e01d62a7e`、release `three-fixes-20260910-v2`、runtime fingerprint `86d99aceff1326966bded9cd43410113386c1adb700f0b4f90274c8406dafcc1` 均未变，pending=null。

新增 `scripts/profile-vlab-worker-first-preparation.mjs` 为带 lease/宿主/进程关系校验的受控诊断入口，只输出匿名函数栈与聚合计时，不记录业务正文。它通过 SIGUSR1 暂时开启指定 Worker 的 inspector，最终关闭；不得当作无需占用的普通只读工具。最小 Agent 夹具增加了 profiler 和 C3 诊断，但 36 工具的合成配置不能代表真实完整工具集，不作为生产收益证据。

## 合入和后续验收

第二项候选 SHA256：`dd00be09cbeff5bbf3ffeb9b16d3a1205e3f3abc783bf6ffbc3594c97071c208`；原始 SHA256：`686ae2059ab36a85f9c93a9de9fdc8c75212b5fc978ebcb780c6abca1bd595e5`。

组合发布使用 `lab/worker-cold-firsttext-v2-plan.json`，基于 `three-fixes-20260910-v2`，包含原来的 Worker/helper 和此次会话模块，共 3 个文件。原 v1 plan 保留，不冒充已打包产物。发布前重新核对 release、配置、源 SHA 与 runtime fingerprint。

等待用户明确批准合入 dev 后，才按共享流程合并、部署，在相同真实配置下做无 profiler 的冷态 C1/C5/C15 与热态配对，报告首段正文 P50/P95、首次准备、hooks → model、CPU/内存和错误率。不得用新 profiler 样本、局部 benchmark 或提高常驻 Worker 数代替该验收。

失败按发布工具回退本次 3 个代码文件，保留配置与所有对话；`OPENCLAW_CANONICAL_SCAN_LEAN=0` 是新扫描优化的停用开关，使用须通过相应配置流程，本次没有更改服务环境。后续原生升级若替换目标模块，应重新定位源码并重跑合同测试，不能沿用本文件名强行覆盖新版。

SQLite 投影语义参考官方 [json_remove 文档](https://www.sqlite.org/json1.html#the_json_remove_function)；兼容性结论以本机和实际 Linux Node 的原生对照为准。
