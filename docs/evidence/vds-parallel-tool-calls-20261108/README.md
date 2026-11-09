# /vds 打开并行工具调用（2026-11-08）

接 `docs/evidence/vds-concurrency-gap-20261107/`（PR #534 分支）：bash5 同一任务，/vds 每回合固定 6 次 DeepSeek 请求，Worker 4.4–4.8 次。
原因是 V 的 `v-deepseek-model-catalog.json` 没写 `supports_parallel_tool_calls`，Codex 按不支持处理，请求里带
`parallel_tool_calls=false`，DeepSeek 只能一个工具一次往返。这次在 VLab 上只把这一项打开，其余字节不变，再跑同一组对比。

## 改动

- 源码：openclaw-versa `versa/vds-parallel-tool-calls-20261108` `9a64665f56b`（基于 `versa/port-backlog-20261029`，
  即 source-map 里这个文件当前对应的 `3951d3e691b` 那条线）。`extensions/codex/assets/v-deepseek-model-catalog.json`
  加一行 `"supports_parallel_tool_calls": true`，`v-deepseek-window.test.ts` 加一条断言。
  去掉这一行，测试 1 failed / 6 passed；带上这一行，7 passed。
- 新文件 sha256 `70e6e032318e0b74b5aca5ecfbcbbebd75398c5bb51baecb61d466870879862a`（V 当前 `6df9d13d…`）。
- `lab/release-files/codex-ds-window/build-deepseek-model-files.mjs` 生成器同步加这一项，以后重新生成不会丢。
- 本 PR 不改发版文件、不改 `release/source-map.json`；上线时随下一次 Codex 插件发版捕获，source 填 `versa:9a64665f56b`。

## 环境

- VLab candidate-29b4f303，2026-11-08 01:29–02:11 CST，V 当前 Codex 插件字节 `c2bbae59`，
  加载时用 `lab/candidate/codex-catalog-parallel-tools.mjs` 只改 catalog 这一项（`CODEX_PATCHES`）。
- 计划 `lab/candidate/vds-gap-parallel.plan.json`；压测台用 PR #534 分支上的 `runtime-concurrency.mjs`（`MODEL_PROXY`、bash5、`PAIRED`）。
- 同一个 Gateway，每档先 Worker（`deepseek/deepseek-flash`）后 /vds，档位 c1、c1、c5、c5、c10。
- 同时有首字 session 的一个大库 candidate 在跑（新的 candidate 内存预算下）。我这组单元 `memory.events` high=0（主 session 01:35 核对），
  内存峰值 4.5 GB，没被限流。
- 基线是 11/07 的 candidate-71f9c844（不打补丁），当时机器更吵（load 峰值到 10），所以只看同一次运行里两边的相对差。

原始记录：`parallel-levels.jsonl`（本次）、`baseline-levels.jsonl`（11/07），都是 `phase: level` 行。

## 结果

| 档 | 运行时 | 正确 | 完成 p50 / p95 (s) | 到首个工具 p50 (s) | 每回合 DeepSeek 请求 | 基线：完成 p50 (s) | 基线：每回合请求 |
|---|---|---|---|---|---|---|---|
| c1 | Worker | 1/1 | 6.9 | 5.5 | 2 | 10.9 | 6 |
| c1 | /vds | 1/1 | 12.2 | 4.1 | 6 | 13.9 | 6 |
| c1 | Worker | 1/1 | 4.3 | 2.9 | 2 | — | — |
| c1 | /vds | 1/1 | 9.9 | 2.4 | 6 | — | — |
| c5 | Worker | 5/5 | 10.9 / 12.0 | 5.3 | 4.4 | 19.7 | 4.8 |
| c5 | /vds | 5/5 | 11.8 / 12.6 | 5.2 | **5.2** | 27.6 | 6 |
| c5 | Worker | 5/5 | 9.1 / 9.7 | 3.4 | 4.4 | 13.9 | 4.8 |
| c5 | /vds | 5/5 | 11.9 / 12.1 | 3.7 | **5.2** | 16.9 | 6 |
| c10 | Worker | 10/10 | 12.2 / 21.5 | 5.5 | 4.4 | 13.5 | 4.4 |
| c10 | /vds | 10/10 | 13.6 / 15.7 | 6.2 | **4.9** | 27.7 | 6 |

单个 DeepSeek 请求的首字节 p50 两边都是 0.4–0.5 s，时长 p50 1.1–1.5 s，和基线一样。

## 读法

1. **开关生效。** 基线 /vds 每回合都是整 6 次（30/5、60/10）；打开后 c5 是 26/5、c10 是 49/10，说明有一部分回合 DeepSeek 把几个工具放进了同一次回复。/vds 22/22、Worker 22/22 回合全部答对，没有出错。
2. **c5、c10 时 /vds 和 Worker 的差距缩到 0.9–2.8 s**（完成 p50）。基线同档差 3.0–14.2 s，但基线机器更吵，这个对比只能算方向一致，不当精确收益。
3. **c1 没变。** 两个 c1 回合 DeepSeek 在 /vds 上仍然一个工具一次往返（6 次），Worker 在这两回合一次就把 5 个工具都发出来了（2 次）。是否批量由模型决定，Codex 只是允许了；c1 的 /vds 仍比 Worker 慢 5.3–5.6 s。
4. 剩下的差距里，Codex 每回合仍多 0.5–0.8 次请求；c10 到首个工具 6.2 vs 5.5 s，比基线（11.7 vs 5.3）小很多。

## 风险

- 并行工具调用是 Codex 对支持的模型的原生行为（OpenAI 模型默认开），这里只是让 DeepSeek 条目和它们一致。
- 同一回合里多个工具同时执行：互相依赖的步骤由模型决定顺序；bash5 里五步互不依赖。没有覆盖「模型把有依赖的两步并发发出」的情况，
  上线后看飞书群里 /vds 的工具报错有没有变多。
- 关闭办法：回到 V 当前的 catalog（`6df9d13d…`）；或者在 catalog 里把这一项改成 `false`。catalog 在 Codex app-server 启动时读，两种都要等 app-server 重启（V 上随 Gateway 重启）才生效，不用改代码。

## 未覆盖

- V 上没有跑（V 不做负载测试）。
- 每档 n 小（c1 各 1 回合 ×2，c5 各 5 ×2，c10 10）；c1 的模型选择有随机性。
