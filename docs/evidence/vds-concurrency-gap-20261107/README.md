# /vds 并发变慢拆成“等模型”和“其他”（2026-11-07）

11/01 V 上 bash5（五步全 shell）c5 /vds 14.8 s、Worker 9.9 s，c15 约 24 vs 15 s，原因没定位。这次在 VLab 上让两边的 DeepSeek 请求都过一个本机计时代理，把每回合拆成“等 DeepSeek 的时间”和“其他”。

## 环境

- VLab candidate-71f9c844，V 当前字节（Codex 插件 `c2bbae59`，不打补丁），`lab/candidate/vds-gap-bash5.plan.json`。
- 同一个 Gateway，Worker（`deepseek/deepseek-flash`）和 /vds 交替，每档先 Worker 后 /vds（`PAIRED=1`），档位 c1、c5、c5、c10。
- `MODEL_PROXY=1`：Codex 的 `/responses` 和 Worker 的 `/chat/completions` 都经 `127.0.0.1` 上的转发代理，记每个请求的开始、首字节、结束。两边都多一跳本机转发。
- 任务 bash5：`uname -r`、`ls /tmp | wc -l`、读 AGENTS.md 前 5 行、`date +%s`、`printf … | sha256sum`，只回复最后一步的 12 个字符。答对证明工具真的跑了。
- **噪声大：** 4 核 VLab 同时有其他 session 的 1–4 个 candidate 和升级演练（`otherCandidates`、`loadMax` 见下表）。只看同一档内两边的相对差，不看绝对值，也不能外推到 16 核的 V。

原始记录 `bash5-progress.jsonl`（`phase: level`）。

## 结果

| 档 | 运行时 | 正确 | 完成 p50 / p95 (s) | 到首个工具 p50 (s) | 每回合模型请求 | 每回合等模型 (s) | Gateway 事件循环占用 | 机器 load 峰值 |
|---|---|---|---|---|---|---|---|---|
| c1 | Worker | 1/1 | 10.9 | 4.3 | 6 | 9.2 | 0.01 | 1.6 |
| c1 | /vds | 1/1 | 13.9 | 5.2 | 6 | 8.0 | 0.06 | 3.4 |
| c5 | Worker | 5/5 | 19.7 / 21.5 | 12.9 | 4.8 | 8.3 | 0.08 | 3.3 |
| c5 | /vds | 5/5 | 27.6 / 30.3 | 15.9 | 6 | 9.3 | 0.17 | 9.4 |
| c5 | Worker | 5/5 | 13.9 / 15.3 | 6.4 | 4.8 | 5.9 | 0.09 | 6.4 |
| c5 | /vds | 5/5 | 16.9 / 17.8 | 6.7 | 6 | 9.0 | 0.12 | 5.9 |
| c10 | Worker | 10/10 | 13.5 / 21.1 | 5.3 | 4.4 | 7.0 | 0.09 | 5.0 |
| c10 | /vds | 10/10 | 27.7 / 30.6 | 11.7 | 6 | 9.9 | 0.20 | 10.0 |

“每回合等模型”是该档所有请求从发出到结束的时长之和除以回合数。单个请求的首字节 p50 两边都是 0.4–0.5 s，时长 p50 1.1–1.5 s，没有差别。

## 读出来的三件事

1. **DeepSeek 本身不慢。** 两边单个请求的首字节和时长一样，Responses 接口没有比 Chat Completions 慢。
2. **Codex 每回合多 1.2–1.6 次模型请求。** Worker 平均 4.4–4.8 次，说明 DeepSeek 在 Worker 上会把互不依赖的工具调用放进同一次回复；Codex 每回合固定 6 次，一个工具一次往返。V 的 `v-deepseek-model-catalog.json` 没写 `supports_parallel_tool_calls`，Codex 按不支持处理。多出的往返每回合约 1.5–3 s，是 c5 差距的大半。
3. **c10 时 /vds 到首个工具慢一倍（11.7 vs 5.3 s）**，同档机器 load 到 10（4 核）。VLab 上 Gateway 事件循环只占 0.2，没像 V 那样打满；VLab 的这段更像是整机 CPU 被 Codex 进程、钩子进程和别的 candidate 抢光。这一段归哪个进程没拆，V 上的主线程忙（11/01 89–97%）也还没解释。

## 未覆盖

- V 上没有跑（V 不做负载测试，需要 Tianyi 同意）。
- 每档 n 小，VLab 同时有别的实验。
- 代理记的请求字节数（`reqKBP50`）两边都显示 0.2 KB，明显不对，可能是请求体压缩或计数方式问题，没用这个数。
