# DeepSeek Search & Fetch vs current V (2026-10-17)

DeepSeek opened `POST /v1/tools/search` and `POST /v1/tools/fetch` (in-house engine, normal
DeepSeek key, $0.75 per 1,000 successful requests, 5 QPS per account each). Benchmarked on V
with the same method as round 1. Work dir on V: `/var/lib/v-web-search-bench` (700, openclaw;
real queries and URLs stay there, not in git).

## Search: 60 most recent real V queries (45% Chinese), 2 runs each, answer by deepseek-v4-flash, blind judge

| | parallel-free (production since 10-04) | deepseek-search |
|---|---|---|
| search p50 / p90 | 1.23 s / 1.60 s | **0.33 s / 0.43 s** |
| failures | 2/120 | 0/120 |
| answer score | 5.77 | **7.25** (+1.48, 95% CI +0.87..+2.12, 40 wins / 14 losses) |
| Chinese queries (27) | 5.00 | **7.22** |
| English queries (33) | 6.39 | **7.27** |
| e2e p50 / p90 | 5.1 s / 10.1 s | 4.5 s / 9.2 s |

Passing the query as `ori_question` too changes nothing (−0.02). DeepSeek's losses are niche
English site lookups (Apify pricing pages, Pexels, a GitHub repo); its biggest wins are Chinese
and Japanese long-tail queries where Parallel returned nothing relevant.

Production Parallel 10-04..10-17 (`daily-review.mjs --hours 312`): 321 parsed calls, 0 failed,
p50 1.4 s; 101 more calls on /vcodex and /vds were cut at Codex's 10,000-character native tool
output cap (Parallel results p50 12K, p90 19K characters).

## Fetch: 86 URLs (56 the agent really fetched, 30 Chinese result pages), judged per URL

| | built-in web_fetch (production code) | DeepSeek fetch |
|---|---|---|
| main content (full + partial) | 51/81 | **63/81** |
| failed | 30 | 18 |
| latency p50 / p90 | **0.36 s / 2.0 s** | 4.2 s / 7.8 s |
| better on agent-fetched URLs | **27** | 19 (6 ties) |
| better on Chinese result pages | 5 | **14** (10 ties) |

DeepSeek recovers 16 URLs the built-in fetch fails on (Baidu Baike, Weibo, Bilibili, Wikipedia,
YouTube, Apple, ETS, Canton Fair…, mostly 403/empty); the built-in fetch alone gets 4. Both fail
on 14 (Tianyancha, Zhihu column, Damai detail, cninfo PDF, NGA…).

## Conclusion

- **Search: replace Parallel with DeepSeek Search.** Better on both languages, 4× faster
  search, no extra key. Cap the payload (summary only, ~6 results ≈ 5K characters) so Codex
  harnesses do not truncate it.
- **Fetch: keep the built-in fetch first, DeepSeek Fetch as the fallback** when it fails
  (OpenClaw web_fetch already falls back to a fetch provider). Same speed in the common case;
  failures roughly 30 → 14 of 81.
- No OpenClaw plugin exists for these endpoints on 9.1 (checked @openclaw/deepseek-provider up
  to 2026.10.10-beta.2); needs a small V plugin registering a web_search and a web_fetch provider.
