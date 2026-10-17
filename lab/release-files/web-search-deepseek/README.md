# V 的 web_search 换成 DeepSeek Search，web_fetch 加 DeepSeek Fetch 兜底

## 为什么换

2026-10-17 做了一次基准测试，详见 `experiments/web-search-bench/RESULTS-20261017-deepseek.md`。

**Search**：用 V 最近的 60 条真实查询（45% 中文）。每个 provider 的结果交给 V 的 deepseek-v4-flash 写成回答，再盲评打分。

| | Parallel 免 key 档（10/04 起在用） | DeepSeek Search |
|---|---|---|
| 单次搜索 p50 | 1.23 s | 0.33 s |
| 回答得分 | 5.77 | 7.25（+1.48，95% CI +0.87~+2.12） |
| 中文 / 英文 | 5.0 / 6.4 | 7.2 / 7.3 |

**Fetch**：用 86 个 URL。DeepSeek 拿到正文的有 63/81，内置是 51/81；但 DeepSeek p50 要 4.2 s，内置只要 0.36 s。英文文档是内置抓得更完整。所以 DeepSeek Fetch 只用来兜底。

**还要修一个问题**：Parallel 在 /vcodex、/vds 里有 101 次结果被 Codex 的 1 万字符工具输出上限截断。

## 改动

- **插件 `apps/v-deepseek-web/plugin`**（V 自有，plugin id `v-deepseek-web`）：
  - web_search provider `deepseek`：调用 `POST /v1/tools/search`，返回每条结果的 `summary`；默认 6 条、最多 8 条。6 条以内每条摘要截到 500 字，7、8 条时自动缩短，保证总长约 9K 以内，不会被 Codex 截断。
  - `freshness`、`date_after`、`date_before` 转成 DeepSeek 的 `after:`、`before:` 运算符。
  - web_fetch provider `deepseek`：调用 `POST /v1/tools/fetch`。
  - 遇到 408、429、5xx 会重试一次。
  - 凭据复用 V 的 deepseek 模型 provider key（`models.providers.deepseek.apiKey`），不需要新 key。
- **`config.mjs`** 改以下配置：

  | 配置项 | 改动 |
  |---|---|
  | `tools.web.search.provider` | parallel-free → `deepseek` |
  | `tools.web.fetch.provider` | 设为 `deepseek` |
  | `plugins.load.paths` | 加 `/opt/v-deepseek-web/plugin` |
  | `plugins.allow`、`plugins.entries` | 启用 `v-deepseek-web` |

- **兜底什么时候触发**：只在 OpenClaw 内置 web_fetch 遇到这三种情况时，才交给 provider：
  - 请求出错（SSRF 拦截除外）；
  - 返回非 2xx；
  - readability 提取为空。

  能正常抓的页面完全不受影响。

  只有寥寥几十个字的 JS 空壳页不会触发兜底，这是 9.1 核心的行为。
- **回退**：执行 `activate-production.mjs --rollback`，search 改回 parallel-free，并去掉 fetch 的 provider 设置。插件文件留在原处，不会再被调用。

## 验证（VLab candidate：私有 Gateway + 1 个 worker，模型路由与 V 相同）

| 候选 | 内容 | 结果 |
|---|---|---|
| `candidate-eed9e809` | fetch：百度百科（内置 403）+ DeepSeek 文档页（内置可抓） | 通过。百科经 deepseek 兜底，答对「2016 年 6 月 16 日」，耗时 11.7 s，含先被 403 的那次；文档页走 readability，770 ms，没有触发兜底 |
| `candidate-1c10c8a1` | 冒烟 3 题（最终版插件） | 通过。单次 0.47–0.66 s；agent 要 10 条时插件返回 8 条，总长 8.6–8.9K 字符；回合 7.7 / 18.2 / 37.2 s |
| `candidate-be25b850` | 中文 8 题（摘要 500 字版） | 通过。25 次搜索，单次 0.43–1.0 s，结果都在 1 万字符以内；回合 8.7–31.7 s，中位约 14 s（同题 Parallel 约 19.6 s、Gemini 约 24 s） |
| `candidate-fdaa3a7c`、`candidate-1282a0d9`、`candidate-52129da6` | 早期版本 | 功能全部通过，只有体积断言没过：摘要截断上限因此从 700 降到 600、再到 500，并改为按条数自适应 |

### 共享 VLab（2026-10-17 21:12–21:20 CST，lease `web-search-deepseek`）

脚本 `lab/web-search-deepseek-shared-accept.mjs`，按 backup → apply → restart → run 的顺序执行。测试用专用 `vlab-dev-wsd-*` 会话，先发 `/deepseek` 切模型，`deliver:false`，结果从会话库核对。

- **第一次 apply 被校验拦下**，共享配置没有被改动。原因是插件文件保留了上传者的 uid 501，OpenClaw 判定为「suspicious ownership」，拒绝加载插件；因此注册表里没有 `deepseek`，`tools.web.search.provider` 校验失败。候选测试没有暴露这个问题，因为那里插件属主恰好就是服务用户。修复：两个脚本复制插件后都 `chown root:root`。
- **修复后两份配置都通过 `openclaw config validate`**，重启用时 71 s。
- **5 个回合全部通过**，都由 deepseek/deepseek-flash 作答：
  - 搜索 3 题，回合 11 / 9.2 / 14.4 s，单次搜索 0.49–0.71 s；
  - 百度百科经 deepseek 兜底，用时 8.9 s，答对开园日期；
  - DeepSeek 文档页走 readability，用时 220 ms，没有触发兜底；
  - 共享 Gateway 日志里没有相关报错。
- 验收后配置保持应用状态，等 V 切换后两边一致。

上次 Parallel 连搜 12 次、70 s 还没答出开放时间和票价的「扬州小盘谷」，这次 3–4 次搜索、30 s 左右答全。

## 上线

```sh
sudo /opt/node-v22.23.1/bin/node lab/release-files/web-search-deepseek/activate-production.mjs
sudo /opt/node-v22.23.1/bin/node lab/release-files/web-search-deepseek/activate-production.mjs --rollback
```

1. 先把插件文件装到 `/opt/v-deepseek-web/plugin`。重启之前这些文件不会被加载。
2. 空闲栅栏 → 停服 → 写两份配置 → 启动 → 等就绪。
3. 启动前任何一步失败，两份配置都会恢复成脚本开始时读到的原文。夜班会随重启自动暂停并接上。

## 费用与限额

- Search 和 Fetch 都是 $0.75 每千次成功请求；失败、空结果、超时不计费。
- 按 V 现在每天约 30 次搜索加少量兜底抓取，一个月约 1 美元。
- 每个账号 Search、Fetch 各 5 QPS，与模型并发额度分开计算；超限返回 429，插件会重试一次。
