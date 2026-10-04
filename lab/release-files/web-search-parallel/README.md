# V 的 web_search 从 Gemini 换成 Parallel（免 key 档）

## 为什么

2026-10-04 的基准测试见 `experiments/web-search-bench/RESULTS-20261004.md`。测试用的是 60 条 V 的真实查询：每个 provider 的搜索结果先交给 V 自己的 deepseek-v4-flash 写成回答，再由 Claude Opus 5.5 盲评。

| | 回答得分 | 端到端 p50 | 单次搜索 p50 |
|---|---|---|---|
| Gemini 3.5 Flash-Lite（换之前） | 5.9 | 8.2 s | 5.7 s |
| Parallel 免 key 档 | 6.6（+0.77，95% CI +0.25~+1.32） | 4.4 s | 1.2 s |

Gemini 的路径是：先用小模型把搜到的网页写成一段摘要，V 再读这段摘要。摘要会丢掉不少事实，引用链接还原还要再花 1–1.5 s。Parallel 直接返回排好序的原文摘录，约 1 s，由 V 的模型自己读。

代价是体积：每次搜索的工具结果从约 4K 字符涨到 10–24K 字符，这部分会写进会话。

Google 官方只返回结果的接口（Custom Search JSON API）已经不收新客户，2027-01-01 下线。

## 改动

- 安装 `@openclaw/parallel-plugin@2026.9.1`（官方 npm 插件，plugin id 为 `parallel`）。
- `config.mjs` 修改两处：
  - `tools.web.search.provider` 从 `gemini` 改为 `parallel-free`。
  - `plugins.entries.parallel.enabled=true`，并把 `parallel` 加进 `plugins.allow`。
- Gemini 的搜索配置原样保留。回退时用 `--rollback` 把 provider 改回 `gemini` 即可，插件可以留着不卸。
- `config.mjs` 会拒绝的情况：起点不是 gemini 或 parallel-free，或者 web_search 处于关闭状态。

`openclaw plugins install` 自己也会写配置：它会加上插件条目和白名单项，候选测试已证实这一点。所以生产上必须先停服，再安装、再写配置。

## 验证（VLab candidate，私有 Gateway + 1 个 worker，模型路由与 V 相同）

| 候选 | provider | 回合 | 结果 |
|---|---|---|---|
| `candidate-e4bf9f98` | parallel-free | 3 个冒烟问题 | 通过。worker 里每次 web_search 都走 parallel-free，单次 1.3–3.6 s，回合 70.7 / 10.5 / 12.3 s |
| `candidate-1e5f551c` | gemini（对照） | 同上 3 题 | 通过。单次 4.5–7.2 s，回合 35.6 / 19.7 / 27.3 s |
| `candidate-5096e9b4` | parallel-free | 8 个中文问题（本地生活/公司/流程） | 通过。26 次搜索，单次 1.4–3.2 s，回合中位约 19.6 s，最长 29.6 s |
| `candidate-040ed96a` | gemini（对照） | 同上 8 题 | 通过。27 次搜索，单次 3.8–9.7 s，回合中位约 24 s，最长 54.8 s |

候选测试里观察到的风险：

- Parallel 对中文本地查询的排序有噪声。「扬州小盘谷」这题前三条结果是无关景点，agent 连搜 12 次、抓了 6 次网页，用了 70.7 s，最后仍没给出开放时间和票价；Gemini 3 次搜索就答全了。8 题的中文扩展组里没有再出现这种情况。
- V 的 agent 调用时用的是 `{query, count}`，没有用插件推荐的 `objective` + `search_queries`。插件兼容这种写法，但拿不到 objective 带来的排序加成。

上线后由 7 天的每日 review（`experiments/web-search-bench/daily-review.mjs`）盯以下指标：调用量、失败与 429、耗时 p50/p90、结果体积、单轮最多搜索次数、抽样查询的前几条结果。切换前 7 天的基线：Gemini 183 次，tookMs p50 7.2 s、p90 10.9 s，结果 p50 3.9K 字符。

## 上线

```sh
sudo /opt/node-v22.23.1/bin/node lab/release-files/web-search-parallel/activate-production.mjs
sudo /opt/node-v22.23.1/bin/node lab/release-files/web-search-parallel/activate-production.mjs --rollback
```

激活流程与 codex-plugins-off 相同：

1. 取得空闲栅栏。
2. 停服。
3. 以 openclaw 身份、带 Gateway 的环境变量安装插件。
4. 以安装后的配置为基础，写入两份配置（Gateway 和 Worker）。
5. 启动并等待就绪。

启动前任何一步失败，都会把两份配置恢复成脚本开始时读到的原文。夜班随重启自动暂停并接上（PR #125）。

回退：执行 `--rollback`；或者用 `.before-web-search-parallel-*` 备份恢复配置后，再做一次受控重启。
