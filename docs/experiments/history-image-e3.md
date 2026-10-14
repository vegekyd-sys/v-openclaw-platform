# #355 + #345 合并发版：历史图片不再重复缩放 + DeepSeek 预算补漏（2026-10-15）

一个发版装两个 PR：
- **#355** 历史图片不再重复缩放：首字变慢的主因之一。
- **#345** E3 遗漏补齐：provider 副本按张数计图片；中文提示真正送到用户。

两个 PR 都整文件替换 `embedded-agent-helpers-CzpaLpCq.js`，所以必须对 V 当前字节重建一次组合版本，不能直接发任一 PR 自带的文件，否则会互相回退。

## 1. 组合重建

底本是 V 当前 release `restart-speed-2-reconcile-20261014`。2026-10-15 00:1x CST 在 V 上直接核对了五个文件的 sha256，与两个补丁器的 before 一致：

| 文件 | V 当前 | 补丁 | 组合后 |
|---|---|---|---|
| `dist/embedded-agent-helpers-CzpaLpCq.js` | `342e6269` | #355 + #345 | **`79f7f268`**（新字节） |
| `dist/history-image-prune-Dg0CDQ4a.js` | `2811753f` | #355 | `dbe28902`（= #355 发布文件） |
| `dist/embedded-agent-DaSvA-Yk.js` | `22dad1ef` | #345 | `142d248f`（= #345 发布文件） |
| `dist/agent-runner.runtime-CAdsMsQt.js` | `75b5b4b1` | #345 | `8c192b9d`（= #345 发布文件） |
| `node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs` | `6a34cb79` | #345 | `915ac13d`（= #345 发布文件） |

- 构建：`node lab/build-history-image-e3.mjs`。它按固定顺序把该文件涉及的补丁依次套在 V 字节上，生成 `lab/release-files/history-image-e3/` 和 `lab/history-image-e3.plan.json`。
- 测试：`lab/history-image-e3.test.mjs`。它检查四件事：
  - 发布文件等于「V 字节 + 全部补丁」；
  - plan 与发布文件一一对应；
  - 只被一个 PR 改的四个文件，与该 PR 的发布文件逐字节相同；
  - helpers 按两种顺序打补丁，结果相同，两个补丁互不干扰。
- 没有带进来的改动：dev 上 #303/#309（early-tool-status）也整文件替换 `agent-runner.runtime`，但它们没上 V，这次不带。
- 结果：`bash tests/vlab-static.sh` 通过。

## 2. candidate A/B（VLab，不占 lease）

脚本 `lab/candidate/history-image-e3-ab.mjs`，plan 是 `lab/candidate/history-image-e3-ab.plan.json`。

**环境：两个私有 Gateway 并排跑。** 各自有独立的 runtime 副本和状态目录，各带 1 个 Worker：
- A：runtime 原字节。脚本先断言五个文件与 V 的 before 相同，所以 A 跑的就是 V 当前字节。
- B：装上组合发布文件。

**模型设置照抄 V：** `deepseek/deepseek-flash`，vision，`agentRuntime=vlab-worker`，`thinking=high`，`contextPruning` 为 cache-ttl 1m，没有 DM 历史上限。模型请求接到本机的 DeepSeek 替身。

**每个 bench 回合怎么跑：**
1. 替身先让模型调用 `view_image`，看一张新的 2400×3200 照片。
2. 会话因此每回合多一张 2048 px 的历史图。这与 #322 之后 V 上长图片会话的情况相同。
3. 替身随后作答。

**怎么交错、怎么计时：**
- A/B 按 ABBA 顺序交错跑，两边的会话内容保持一致。
- 计时：`chat.send` 发出 → 替身收到这一轮的第一个模型请求。
- 每个模型请求都把内容块按顺序记成哈希，图片记 data URL 的 sha256，用来逐字节对比 A 和 B。

**第二阶段（开关）：** 停掉 A，复制 A 的会话，在副本上起 C。C = B 的 runtime + `OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0`，再与 B 交错跑。

### 结果

一共跑了两轮，结论一致：第一轮 `candidate-9745f5af`，第二轮 `candidate-73492e00`，exit 0，全部断言通过。

**命令 → 首个模型请求，中位数，单位 s（第二轮）：**

| 回合 | A（V 字节） | B（组合） |
|---|---|---|
| 1–5 | 1.7 | 1.7 |
| 6–10 | 4.2 | 3.1 |
| 11–15 | 7.3 | 3.3 |
| 16–20 | 9.5 | 3.5 |
| 21–30 | 9.8 | 4.0 |
| 31–40 | 8.7 | 3.2 |

**汇总：**

| | A | B |
|---|---|---|
| 40 回合 p50 | 8.6 s | 3.3 s |
| 40 回合 p90 | 9.9 s | 4.0 s |
| 后 10 回合 p50 | 8.7 s | 3.2 s |
| 后 10 回合整回合耗时 p50 | 11.5 s | 5.9 s |
| 工具调用 → 第二个请求 p50 | 1.65 s | 1.71 s |

第一轮：后 10 回合 p50 A 9.0 s、B 3.2 s。

- 第二个请求那一段两边一样，符合预期：改动只影响回合开始时整理历史的那一遍。
- **请求内容：** 80/80 个请求的图片逐字节相同；除系统提示外的内容 80/80 逐字节相同，包括全部消息、文字、工具调用和图片。系统提示有 2 个请求不同，都在第 4 回合，是 B 多出 `## Bootstrap Pending` 一段：两个 Gateway 共用同一个 workspace，`BOOTSTRAP.md` 的状态与时间有关。补丁文件里没有生成系统提示的代码。
- **请求形态（与 V 配置一致）：** 每个请求带 2 张图：上一回合的图已缩到 1200×900，本回合的图是 2048×1536。更早的图被 contextPruning 去掉了，所以请求里没有裁剪标记。A 每回合仍在 Worker 主线程上把全部历史图重新缩放一遍，结果被丢弃。
- **开关：** C（开关=0）p50 9.0 s，B 3.1 s。12/12 请求完全相同，连系统提示也相同。开关能把行为完整恢复成 V 现状。
- **全部回合都在 Worker 上跑：** 替身按 socket 反查发起进程，全是 `worker.mjs`。每回合都拿到了替身的答复。
- **日志：** 两臂各有 6 条 `lane task error … Worker native attempt is no longer active`，数量相同。V 当天也有这种错误（10/14 共 717 条，其中飞书会话 lane 36 条），是现有行为，与本改动无关。
- **B 的剩余成本：** B 从第 8 回合起稳定在约 3.2 s。这是最近 4 个已完成回合的图仍要缩放（VLab 4 核、负载约 5）。可以接着做的事：在 Worker 内按图缓存缩放结果。不在本发版里做。
- **A 不再上涨的原因没有查：** A 在第 16 回合左右停在约 9–10 s，原因没有追查。V 上 10/12 那个私聊最高到 12 s。

#345 的效果证据沿用它自己的 candidate（见 `deepseek-budget-completions.md`）。本次组合里，#345 的四个文件与它的发布文件逐字节相同。上面 A/B 里 B 臂装着全部五个文件，普通带图回合 0 异常，也算一条回归。

证据副本：`~/v-upgrade-private/history-image-e3-20261015/`，含两轮输出和 receipt。

## 3. 共享 VLab 回归（未做）

`vlab.mjs package/stage` 要求提交等于 dev HEAD，所以必须先由 Tianyi 授权合 dev。另一个前提：2026-10-15 01:3x 时共享 VLab = V + `voice-background-20261015`（已 accept，`aligned=false`），lease 在 01a0fb0e-… 手里。这个发版上 V 并 align 之前，任何人都 stage 不了。

合 dev 后的回归计划：
- `vlab.mjs status` 确认 aligned → 拿 lease → package/stage/deploy。
- 在「VLab 发布验收 B」群做真实飞书 vlab-worker 回合，覆盖多轮发图，加上让 V 用 `view_image` 看 workspace 里的图。素材在 `~/v-upgrade-private/history-image-e3-20261015/feishu-photos/`，8 张 4032×3024，每张有可核对的四位数字。
- 记录首字，用 `~/.cache/v-firsttext/chat-seq-bench.py` 口径；核对回答（数字是否正确）；journal ERROR 0。
- accept 或 rollback，释放 lease。

## 4. 上线

- 需要 Gateway 重启：dist 文件由 Gateway 和 Worker 加载。
- 用 `promote-to-v` 按 `lab/history-image-e3.plan.json` 装 5 个文件，然后一次 `v-self-restart`。
- 上 V 后的判据：热回合 cmd→send P90 回到 10/10 的水平（约 2 s），长图片会话里大于 3 s 的回合数下降。
- 回滚：`promote-to-v --undo` + 重启；或者不回滚，只设 `OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0` 再重启，关掉 #355 的部分。
