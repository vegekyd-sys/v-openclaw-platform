# Codex 模型等待看门狗：candidate 证据（2026-11-01）

V 的 Codex 字节（整包 `c2bbae59`，VLab 与 V 相同）+ `lab/release-files/codex-model-wait-watchdog/patch-codex-model-wait-watchdog.mjs`。
每个场景都是一个私有 Gateway、Codex 0.159.2、DeepSeek 经本地故障代理，provider 超时按 V 设为 90 s。原始记录在同目录的 `*-progress.jsonl`，文件名对应 `lab/candidate/codex-model-wait-*.plan.json`。

n=2、n=3 里各有一个或两个样本来自更早的一轮：当时没配超时的 provider 默认 300 s，DeepSeek 这条路径逻辑相同。那一轮的文件被最终一轮覆盖了，所以 jsonl 里每个场景通常只有最终那个样本：挂起 99.4、卡死 98.4、工具后挂起 93.6、响应头慢 79.1、sleep 204.9、无推理静默 98.2 与 95.6、真实长参数 35.1。

## 官方机制

上游 main（2026-11-01）没有可回移的看门狗。#134755（2026-09-01）有意删除了 Codex 的四个空闲看门狗，只留总执行预算和 2 分钟收尾，原因是工具参数生成时没有 app-server 事件，空闲看门狗在打断真实工作。它留下的 `run-attempt.turn-watches` 测试要求 11–31 分钟静默也不打断。
本补丁因此不用通用空闲窗口，并且只对配了 `models.providers.<id>.timeoutSeconds` 的 provider 生效；第一版对所有 provider 默认 300 s，这些测试有 11 条失败，所以改成了显式开启。

## 挂起和卡死

| 场景 | 修复前 Codex | 修复后 Codex | Worker 对照 |
|---|---|---|---|
| 响应头前挂起，有回退 | > 450 s 无回复（测试上限，n=1；此前记录 > 930 s） | **99.4、100.8 s**，回退到 flash（n=2） | 185.3 s 报错，不回退（n=1） |
| 首个数据块后卡死，有回退 | > 450 s 无回复（n=1） | **97.7、98.4 s**，回退（n=2） | 191.7 s 回退（n=1） |
| 模型推理输出后卡死 | 未测 | 193.4 s，回退（n=1） | 未测 |
| 响应头前挂起，手动选模型（无回退） | 未测 | 186.9 s，同模型重试 1 次后明确报错（n=1） | 未测 |
| 工具执行后的下一次请求挂起 | 未测 | 93.6、94.2 s，明确报错，不回退（n=2） | 未测 |

报错文字：`Codex model request timed out: no response from deepseek for 91 s`。

**同会话下一条：** 修复后全部正常，3.1–7.1 s，已保存的 12 次全部回复正确。修复前 78.1、81.4 s，且回复的是上一条被卡住的请求，不是这一条（n=2）。

**故障路径确实被触发：** 对照组代理日志是 `hang`、`stall`，回合在上限内没有结束；修复组日志是 `hang:responses` 后接 `ok:completions`（flash 接手），`model fallback decision` 为 `candidate_failed → candidate_succeeded`。

## 不能误杀

| 场景 | 结果 | 说明 |
|---|---|---|
| shell `sleep 200` | 回复正确，204.9、205.6 s（n=2） | 工具期间最长静默 168 s |
| OpenClaw 动态工具耗时 200 s | 回复正确，205.4 s（n=1） | 候选补丁让 session_status 等 200 s，代替长 computer 回合 |
| 响应头慢 75 s，低于上限 | 回复正确，78.6、79.1 s（n=2） | |
| 推理之后工具参数静默 120 s | 回复正确，126.5 s，未回退（n=1） | 第二档 180 s 生效 |
| 真实长工具参数（DeepSeek 现写长文） | 回复正确，35.1、134.2 s（n=2） | 最长静默 33.8 s，未打断 |

## 已知误判

**没有任何推理或正文、直接生成工具参数，且超过 90 s。** 这时模型其实在输出，但 Codex 不发事件，和挂起分不开。代理模拟的 120 s 静默被判超时，95.6–99.0 s 回退（n=3）。回退由 flash 重做，没有丢回复，只是多花一次调用。

实测 DeepSeek 工具参数速度 108–121 token/s，90 s 约 1 万 token、1.6–1.9 万字符（n=3，`codex-model-wait-arg-rate`）。所以单次工具调用要写约 1.6 万字符以上，并且模型没先推理，才会撞上。同样提示下 DeepSeek 有时确实跳过推理。

## 未覆盖

- 没配 `timeoutSeconds` 的 provider（V 上含 Luna 走 Codex）仍可能无限等。开关是 `OPENCLAW_CODEX_MODEL_WAIT_DEFAULT_SECONDS`，默认不开，见上文 11 条测试。
- ChatGPT 订阅的 websocket 路径没测，避免消耗额度。
- 上下文压缩中的挂起不受看门狗管：压缩项算在忙，仍只靠总预算。
- 真实 computer 回合没跑，用 200 s 动态工具代替。
- 并发、大会话、子 agent 等待、挂起期间插话没有端到端验证；样本都是单会话小会话。
- 未在共享 VLab 和 V 上跑。fork 源码构建未与 dist 做字节对比，发布字节未生成，这两步留到批准上线时。
- 一次早期运行里，回退后下一条的 `session_windows` 显示 harness 为 openclaw、模型仍是 vds（回复正确，n=1），后续运行未复现，原因未查。
