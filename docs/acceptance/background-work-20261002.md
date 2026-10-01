# 后台工作可见 + Codex 原生子 agent 修复：验收记录（2026-10-02）

授权：Tianyi 2026-10-02 01:4x CST——行写在 footer 上面、卡片最后；harness 为 vds、vcc、vcodex、vlab worker；在共享 VLab 上确保后台任务和后台 agent 在所有 harness 上跑通；确认无误后上线 V 并做回归。

- PR：#136（卡片后台行）、#137（Codex 原生子 agent 中继与唤醒），dev `84eceb39e2f24c6d330f4efa4f5b792fdcee7e8b`。
- VLab 发版：`vlab-codex-parity-20261002`（只在 VLab，把 Codex 插件三个文件对齐到 V）→ `background-work-20261002`（6 个文件，产物 `dfc2b3fe…`）。
- V 发版：`v2026.9.1-db91.6-background-work-20261002`，03:13 安装，03:13:20 重启 Gateway（PID 2505136），03:15:24 监听、约 03:15:36 飞书连上。备份 `/opt/v-release-backups/v2026.9.1-db91.6-background-work-20261002-*`。

## 卡片样式

后台行是独立的灰色小字元素 `v_bg_tasks`，插在正文之后、分隔线和 footer 之前，是卡片最后一行内容：

```
<正文>
⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1
---
Agent: V × Makaron | Model: … | Runtime: …
```

全部结束后变为 `☑️ 后台任务已结束`。没有后台工作的回复不插这个元素。会话来了新回复时，后台行挪到新卡片，旧卡片上的删掉。

## 共享 VLab（lark-cli 用户身份，真实飞书）

群 B `oc_5afced473a29eb6f5fed3ba9966aa9ff`；`/vds` 用「VLab 压测 01」`oc_abfb8965c3dd0f8d089c7346a98b4ce5`（见下文 vds 的会话限制）。每一轮都要求：一个子 agent（`sleep 60 && echo`）+ 一个后台 `sleep 45` + 立即回复。

| Harness | 任务消息 | 卡片 | 回复 | 后台行时间线 |
|---|---|---|---|---|
| /vcodex（sessions_spawn） | om_x100b64dec4698ca0b1d1167d265a3a5 | om_x100b64dec41944a4b240de4f700bbe8 | 30 s | 24 s 子 agent 1 → 30 s 2 项（子 agent 1 · 后台命令 1）→ 72 s 1 项 → 104 s ☑️ |
| /vcodex（原生 spawn_agent） | om_x100b64dedc512ca4b4be5ed9f2031a4 | om_x100b64dedc742ca0b3f44007d05e1c1 | 24 s | 12 s 子 agent 1 → 85 s ☑️ |
| /vcc | om_x100b64ded57740a4b25d2b329d79667 | om_x100b64ded51534a4b27b10acd824ba7 | 31 s | 18 s 子 agent 1 → 86 s ☑️ |
| /vds | om_x100b64deecd63068b3b8e372b12db56 | om_x100b64deecfdb8a0b10510d0f066c2b | 12 s | 12 s 子 agent 1 → 79 s ☑️ |
| worker | om_x100b64dee78ba0a0b25bd58bf6ff160 | om_x100b64dee795b0a0b364cd08cf31e65 | 12 s | 12 s 2 项（子 agent 1 · 后台命令 1）→ 55 s 1 项 → 73 s ☑️ |

每一轮：回复后仍显示进行中，位置始终在 footer 上面，最后都变成 ☑️。子 agent 完成后父会话都自动把结果发进群（例如“子任务已完成，输出：`TS_VCODEX_NATIVE-CHILD`”）。改动前的基线（同一驱动脚本，worker）：卡片上没有任何后台行。

**生产原始故障场景（/vcodex 原生子 agent + 中途追问）**：子 agent 依次 `sleep 75`、写入哈希文件、读回；父回合 STARTED 后 20 s 发一条追问（新父回合，不 yield）。
- 修复前（VLab Gateway 实际加载的 Codex 副本未打补丁，见下）：子 agent 第二步被拦，`native hook relay not found` ×2，与生产 00:17 的现象一致。
- 修复后：`NSB030842` 哈希 `117b0dbb736e5470…` 由父会话自动发到群里；任务 `ff36f4c4` succeeded/delivered；日志无中继错误。后台行 03:09:16 出现在 STARTED 卡片，03:09:49 移交到追问卡片，03:10:52 变 ☑️（任务 03:10:51 结束）。

## 生产 V 回归（lark-cli 用户身份，「V 生产发布验收 0910」`oc_104de99774aea6a55f5ae46863e99ef3`）

| Harness | 任务消息 | 卡片 | 回复 | 后台行时间线 |
|---|---|---|---|---|
| worker | om_x100b64df569ab4a0b2aa89a5698cdd9 | om_x100b64df549c0ca0b1a463d17474cdc | 42 s | 36 s 2 项（子 agent 1 · 后台命令 1）→ 85 s 1 项 → 103 s ☑️ |
| /vds | om_x100b64df5159f8a0b04cb35704660be | om_x100b64df6fff30a4b3ffd9863e5b0e7 | 47 s | 35 s 2 项（两个原生子 agent）→ 113 s ☑️；两个子 agent 都回传 `TSV_VDS-CHILD` |
| /vcc | om_x100b64df700f88a0b1a7c68b89a9749 | om_x100b64df71d980a0b1c02d5571dcf6d | 18 s | 18 s 子 agent 1 → 03:38:04 ☑️（子 agent 当时 DeepSeek 卡了 300 s，行如实一直显示进行中，结束同一秒变 ☑️） |
| /vcodex 原生 + 中途追问 | NSV033818 | — | — | 父会话自动发出哈希 `8abafe174ae8ebea…`（与本地计算一致）；日志 0 次 `native hook relay not found` |

重启后检查：worker 6 个进程；夜班检测到重启并自动接上；`nightshift-workboard`、`openclaw-rtc-h5` 等随 Gateway 恢复；Codex 孤儿登记（旧 Gateway PID 1838251 的 3 行，进程已确认不存在）按既有流程删除；漂移哨兵 8734 文件 0 findings；VLab 与 V 对齐。

## 测试中的非本次问题（如实记录）

- **03:27 起 DeepSeek 卡住**：V 与 VLab 的 deepseek-flash 调用都在 HTTP 200 后挂 300 s 失败（V 03:32/03:37/03:45 三次，VLab 一次 ping 超过 7 分钟），grok 正常。V 默认模型是 deepseek-flash，此时用户会等很久才得到失败或回退。与本次发版无关：重启后 03:16–03:26 DeepSeek 调用全部成功；Gateway 只有一次轻微 liveness 告警（ELU 0.29）。
- **worker 子 agent 被 `/model` 切换中止**：生产第一轮 worker 子 agent 在 03:18:04 被中止，正好是驱动脚本给同一群发 `/model vds` 的时刻。父会话切模型会取消在跑的子 agent，这是测试顺序造成的。
- **会话忙时的追问不出卡片**：子 agent 回传期间发来的消息会被并入正在跑的回合，回复走普通消息而不是回复卡片（dispatcher `replies=0`），这种回复上没有后台行。
- **vcc / 原生 Codex 的后台命令不计数**：这两种 harness 自己执行 shell（Claude Code 的 Bash、Codex 自带 shell），不是 OpenClaw 的后台任务，所以只显示子 agent。
- **VLab 上 `/vds` 401**：同一会话先用过 `/vcodex` 再切 `/vds` 会报认证错误（会话绑定的 OpenAI profile）。用从没跑过 `/vcodex` 的群测 `/vds` 即可。V 上同样存在。
- **VLab 冷 worker 首轮被 120 s 看门狗杀**：已知的页缓存问题，先 ping 一次让 worker 读热即可。

## VLab 与 V 的布局差异（新发现）

- V 的 Codex 插件只有一份：`~/.openclaw/npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2`，就是本次发版的目标。
- 共享 VLab 有两份：`runtime/npm/projects/openclaw-codex-…__generation…`（只有 worker 用；`vlab-codex-parity-20261002` 把它对齐到 V）和 `state/npm/projects/openclaw-codex-8902d781d4`（9/22 手工装的，Gateway 实际加载的是这一份）。后者不是发布工具允许的目标，所以 02:58 用同一个补丁脚本手工打成和 V 一样的字节 `94d5420f…`（备份 `state/backups/codex-native-subagent-20261002`）。
- `vlab-v-parity` 只比较 core/worker/飞书，看不到这两份 Codex 副本；`promote-to-v.mjs` 已加上 V 上 Codex 插件的映射，但这份插件不在 V 的捕获和漂移哨兵里，重装或升级插件会同时丢掉 `/vds` 补丁和本次修复。
