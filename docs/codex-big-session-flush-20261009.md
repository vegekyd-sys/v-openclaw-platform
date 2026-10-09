# /vds 大会话：后台记忆整理循环与回合开始整读（2026-10-09）

数据来源：V `/tmp/openclaw/openclaw-2026-10-08.log`、`openclaw-2026-10-09.1.log`、`openclaw-2026-10-09.log`（18:51 轮转），V makaron 库与 codex-home rollout 只读查询，V 的 db91.6 core 与 `@openclaw/codex@2026.9.1` dist。

## 1. 现象

- 推迟的记忆整理（`[memory-flush-deferred.1]`，#243）在同一会话每次回复后都会再跑一次：9bdbd6925432（飞书私聊 ou_0674，/vds）10/09 一天 15 次，每次 30–190 s，约三成以 `Error` 失败。
- Codex 回合开始时 Gateway 主线程 `session context window read` 2–9.8 s（09–17 点 11 次 ≥3 s）。
- Gateway RSS 一天几次冲到 6.6–9.6 GB，自行回落。

## 2. 四种 runtime 什么时候整理（V 10/08–09）

| runtime | 有整理的会话 | 整理运行 | 规则 |
|---|---|---|---|
| /vds（codex + deepseek-flash） | 10 | 113（64 成功、49 失败） | 每次 Codex 原生压缩开一个新周期 |
| vlab-worker（默认） | 7 | 7 + 6 次「已整理」跳过 | 每次 OpenClaw 压缩一个周期，OpenClaw 在约 97.6 万 token 才压缩 |
| vcodex（codex + GPT） | 1 | 1 | 同 /vds |
| vcc（claude-cli） | 0 | 0 | CLI 后端自己管压缩，OpenClaw 不整理（`followupUsesCliRuntime` / `ownsNativeCompaction`） |

/vds 特别频繁有两个原因。

**原因一：整理把自己的标记弄过期。** Codex 会话的推迟整理在临时 Codex 线程里跑（#277，trigger `memory`），把整段历史重放进去：V 10/09 每个整理线程第一次调用都是 29–46 万 token，几乎每次立刻 `compacted`，一次整理总输入约 200 万 token。`runMemoryFlushIfNeeded` 在 finally 里把这次压缩的 durable 事实加到会话 `compactionCount` 上，而成功标记写的是开跑前的计数，所以写完就过期，下一次回复又会推迟一次整理。两天里 9 个会话共 60 次「marked:true 之后又触发」，之间都没有持久线程压缩。上游 9.5–9.9 写法相同。

**原因二：Codex 压缩得勤。** Codex 按 258,400 token 的窗口处理所有会话（`entry.contextTokens`，`contextTokensSource: runtime`），deepseek-flash 的 OpenClaw 整理阈值是 976,000。即使没有原因一，/vds 每积累同样多的对话也要整理约 4 次，默认 runtime 只整理 1 次。

## 3. 回合开始整读

调用方是 Codex 插件 run-attempt 的 `readFencedHistory`，即 `SessionManager.openModelContext`。#286（F2）只读最近一次 compaction/reset 之后的窗口，但 OpenClaw 从不压缩 Codex 会话：ou_0674 有 12,421 条、178 MB（41 行 view_image 内联 base64），整段同步读取并解析，留在回合期间。日志 trace id 能把窗口读取对回同一个整理 run。

V 上的渲染文字密度很低，约 25 字符/KB。新线程投影最多 100 万字符，要从尾部读 95–125 MB（ou_0674 95 MB，群「十二家」125 MB）。所以直接照搬上游 9.5 的有界读取（`contextTokenBudget × 8` 字节，8 MB）会让新线程看到的历史从 100 万字符缩到 8.4 万（VLab 实测）。

## 4. 修复（分支 claude/sweet-tesla-4507c1）

| 提交 | 内容 |
|---|---|
| e259423f | 推迟整理写成功标记时，把整理自己的压缩算进同一周期；`ran` 日志带 `ownCompactions` |
| c9371855 | 统一节奏：Codex 会话按尺寸触发的整理，周期覆盖 ⌊整理阈值 ÷ contextTokens⌋ 次原生压缩（/vds 3 次，GPT 类 1 次）。按 token 触发、默认 runtime、CLI 不变 |
| e4ce8d17 | core `openModelContext(target, { limits })` 在同一 admission fence 下调用 9.1 原生有界读取；Codex 插件段 H：回合只读最新尾部（9.5 上限），新线程、换绑定、绑定早于尾部时补读全量；失败退回全量；`OPENCLAW_V_CODEX_BOUNDED_HISTORY=0` 关闭 |

发布产物：`lab/release-files/memory-flush-defer/`（agent-runner-memory、agent-runner.runtime），`lab/release-files/context-window-read/session-manager-CNTG_BAJ.js`，`lab/release-files/codex-firsttext/dist/`（run-attempt、attempt-context、session-history）。

## 5. VLab candidate（`lab/candidate/codex-big-history.mjs`）

共享 VLab 里最大的无压缩 Codex 会话放大 8 倍，再插 45 行 view_image 形状的 base64，得到 172.6 MB、24,953 条、无压缩的 /vds 会话。同一 Gateway 先跑 V 字节，再跑修复版。

| | V 字节 | 修复版 |
|---|---|---|
| 直接读取（同进程三次） | 4.5–6.1 s，留存堆约 157 MB | 尾部 0.19–0.24 s，约 10 MB |
| 第 1 轮（新线程）投影 | 1,000,024 字符 | 逐字相同（sha 28b69213） |
| 第 1 轮主线程读取 | 整读 4.3–5.4 s | 尾部 0.2 s + 补读全量 5.9 s |
| 整理 | 以 Error 失败；计数 8→9，无标记 | `completed marked:true ownCompactions:1`，标记 = 计数 = 9 |
| 第 2 轮（续用线程）主线程 | 整读 4.5–5.1 s | 尾部 0.17–0.18 s |
| 第 2 轮后 | 又推迟一次整理 | 不再推迟 |

RSS 单轮对比受 GC 时机影响（一轮 955→679 MB，另一轮修复版反而更高），不作为结论。

测试中踩到的坑：
- 镜像会话超过 `session.reset.idleMinutes`（30 天），第一条消息就会把它重置；`sessions.patch` 切模型也会重置。
- 复制来的条目带着「已整理」标记。
- VLab 上 V 字节整读 5 s，会让 Codex 2 s 的进程检查超时、回合失败（`Cannot inspect Codex processes`），V 10/08–09 没有这条错误，两版都放宽到 15 s。
- 独立 node 进程里插件的 `openclaw/*` 不经过 sdk-alias，会解析到共享 VLab runtime，要注册 resolve 钩子。
- 控制台日志行尾带颜色码。

## 6. 没有覆盖的

- 新线程（包括每次推迟整理）仍然整读一次，4–6 s。
- 每次 /vds 整理仍然约 200 万 token。上游 #143193 把整理的上下文预算限制在宿主的窗口内，可作为后续。
- 约三成整理以 `Error` 失败、而 Codex 侧已正常完成，原因只在 verbose 日志，未查。
- 09:00–09:03、18:23–18:28 两段内存冲高，前后既没有整理，也没有大的读取，来源未明。监控 session 指出 `workboard.cards.create` 全量 list 是另一个卡顿源，与这几次冲高的时间对不上。
