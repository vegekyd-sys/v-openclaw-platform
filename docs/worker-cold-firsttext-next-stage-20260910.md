# 冷态首段 P50 向 15 秒优化：首次准备阶段诊断

后续：真实共享 Worker 已定位全库校验热点，并完成第二项源码补丁；以 [2026-09-11 后续报告](worker-first-preparation-scan-20260911.md) 为最新状态。本文保留此前最小夹具的结果和限制。

用户目标：从既有生产冷态 C15 首段正文 P50 25.435 秒逐步降到约 15 秒。当前没有新的合入 dev 或部署授权。本轮继续在 `codex/worker-cold-firsttext-20260910` 工作；运行补丁仍为 `580a263391f47755dd5475f2bba5949fb5130e14`，没有加入未经证明的池扩容或权限变更。

## 本轮排除与定位

只读核对生产既有冷态请求 `6101061d-305d-4139-9cc3-5a1b04d543cf` 的分段记录。不是新发生产压测：

| 阶段 | 单请求观察 |
| --- | ---: |
| 发送到 Gateway harness | 4.071 秒 |
| 入池后等待到 IPC 发送 | 4.693 秒 |
| 首次 prepared runtime | 4.876 秒 |
| hooks 结束到模型调用 | 8.432 秒 |
| 其中 hooks 到 bundle 开始 | 5.665 秒 |
| bundle 准备 | 0.545 秒 |
| system prompt 准备 | 0.255 秒 |
| 其中 project-memory manager | 0.204 秒 |

表中部分区间包含子区间，不能把整表相加；这是一个冷请求的定位，不是 C15 中位数分解。bundle 之后到模型调用仍有约 1.9 秒。生产这次大头不在 MCP 或项目记忆；历史项目记忆慢样本不能直接套用为本次根因。

## 新增原生离线夹具

`scripts/diagnose-worker-first-run.mjs` 使用已安装的原生 Worker / OpenClaw，候选只替换任务 Worker 和 resolver helper。每个变体新建空白 state / workspace / config，执行首次和第二次原生 Agent 请求；不绕过 DB、会话所有权或原生权限检查。只用私网本机 SSE 响应器返回 `DIAGNOSTIC_OK`，不调用真实模型或工具，不复制业务数据库、配置或凭据。

夹具输出 ready、首次模型请求、首次正文、prepared runtime、hooks 到 bundle/模型、prompt、project-memory 等阶段；同时校验实际模型请求的工具数。timeline 只汇总阶段耗时，不保存提示词或业务数据。

早期最小夹具（36 工具）的一对样本：baseline 首次模型请求 4639 ms、首次正文 5322 ms；candidate 3345 / 4103 ms。这里从 Worker ready 后发请求开始计时，不包括启动。它提示 resolver 补丁对首次原生准备也有收益，但 n=1、空白 DB、单进程且模型是模拟的，不能把差值直接扣到生产 P50 上。

此前已验证的新进程 ready 中位数仍为 4603 → 2600 ms（各 n=3）；详细证据见 `worker-cold-firsttext-20260910.md`。本轮本地重新执行全套 Worker + firsttext 回归，211/211 通过。

最终脚本以服务同身份、相同私网与只读隔离重跑最小夹具，单元 `worker-cold-first-run-final-20260910.service` 成功退出，4/4 回复内容正确、每次恰好 1 个本地模型请求、实际请求均 36 工具。该单对样本 baseline / candidate：ready 5216 / 3018 ms，ready 后首次模型请求 3851 / 3200 ms、首次正文 4353 / 3864 ms，prepared runtime 1375 / 921 ms；第二次正文 442 / 393 ms。不同单对差值会波动，不将其作为稳定的首段 P50；它进一步支持先对已完成的 resolver 补丁做真实集成验收。

脚本 `node --check`、`git diff --check` 通过。各诊断单元使用 PrivateNetwork、PrivateTmp、ProtectSystem=strict、ProtectHome=read-only、MemoryMax=2G、CPUQuota=200%、RuntimeMaxSec=180；临时状态和本地 HTTP 响应器均在收尾时关闭/清理。

### 飞书组合未通过代表性检查

为复现生产 130 工具的准备开销，夹具可接收已安装 Feishu 插件路径，只配置诊断假凭据，不启动频道。最初以 root 跑时被原生 ownership 检查阻止；改用已核对的服务用户 `lab-db91-parity` 后，插件模块和 registerFull 正常加载，但实际模型请求仍只有 36 工具、Feishu 工具为 0。显式开启工具和插件 alsoAllow 也未补齐该差异。

因此这种插件组合**没有通过代表性检查**，夹具显式失败退出，未拿它宣称生产性能改善。没有放宽 ownership、伪造生产 requester 或复制生产配置来取得通过。该结果只说明当前合成上下文不能代表生产工具/授权组合，不据此判定生产飞书故障。

## 下一步决策

1. 第一项模块解析补丁已能独立证明局部收益，先由 Tianyi 决定是否合入，再按授权在共享 VLab 验证相同真实配置、工具、模型、上下文下的 C1/C5/C15 冷热配对。
2. 将同产物的首段 P50/P95、首次准备、两批扩容、CPU/内存与错误率一起比较。15 秒仍是目标，不是本轮已达成结果，也不承诺先到某个未经测量的数字。
3. 如果剩余主要耗时确在分批扩容，再在独立 worktree 做按排队需求且有资源上限的并行启动实验。当前 VLab 4 vCPU、生产 8 vCPU，不能用更高启动并发直接保证更快，也不能靠提高常驻 Worker 数冒充冷启动优化。

未合入 dev，未更新共享 Gateway / 生产运行文件、配置或数据；所有诊断单元均为有界私网进程，不是新 Gateway 实例。运行文件清单、SHA256、回退计划继续沿用第一项补丁报告。
