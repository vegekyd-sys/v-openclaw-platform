# V web_search benchmark

Measures speed and quality of V's `web_search` tool and of the alternatives that
OpenClaw can plug in, on queries shaped like V's real traffic.

## Production baseline (before any change)

From V's Gateway journal, 2026-09-24 .. 10-04, the `[web-search-preparation]` line
that the citation-budget patch prints for every Gemini search (255 calls, all from
`vlab-worker`, about 25 a day):

| | p50 | p90 | max |
|---|---|---|---|
| whole search | 7.8 s | 11.8 s | 16.8 s |
| of which citation redirect resolution | 1.6 s | 2.1 s | 3.8 s |
| citations per search | 7 | 10 | 19 |

Configuration at that time: `tools.web.search.provider = gemini`,
`plugins.entries.google.config.webSearch.model = gemini-3.5-flash-lite`, default
timeout 30 s, default cache 15 min. Codex sessions use Codex native search
(`tools.web.search.openaiCodex`, mode `cached`) and are not covered here.

## Query set

`queries.json`: 50 queries shaped after 355 distinct real queries (62% Chinese):
local Shanghai/China lookups, Chinese company and market lookups, developer docs
(Feishu, Claude Code, SAP …), post-cutoff tech news, policy/procedure questions and
general English. Personal and customer-specific queries were replaced by generic
ones of the same kind. 20 items carry an answer key (`k*`) and are scored for
correctness; the other 30 are scored comparatively.

## Candidates

`run.mjs` knows these (`--candidates a,b,…`):

| name | what runs |
|---|---|
| `gemini-35-lite` | **production today**: the production dist module `executeGeminiSearch` with V's model, including the citation redirect patch |
| `gemini-31-lite`, `gemini-37-flash`, `gemini-38-flash` | same module, other Gemini models |
| `gemini-38-flash-low`, `gemini-35-lite-min` | Gemini API directly with an explicit thinking level, no redirect resolution |
| `grok-43`, `grok-420-nr` | xAI Responses `web_search`, body as built by `extensions/xai` |
| `sonar`, `sonar-pro` | Perplexity Sonar via OpenRouter |
| `perplexity-or` | `@openclaw/perplexity-plugin@2026.9.1` provider code with V's OpenRouter key |
| `exa-lite` | OpenRouter web plugin (Exa) + gemini-3.5-flash-lite |
| `duckduckgo`, `parallel-free`, `firecrawl-free`, `keenable` | official / community keyless plugins, executed through their provider code |
| `tavily`, `brave`, `exa`, `searxng` | official plugins (need keys / a SearXNG URL) |
| `baidu-qianfan`, `zhipu`, `metaso` | community plugins (`@z-imagine/openclaw-baidu-search`, `openclaw-web-search` (Zhipu), `@ww-ai-lab/openclaw-web-search`); their packages do not load on 9.1 as providers, so the bench sends the same request their source sends |
| `baidu-crawler` | `@z-imagine/openclaw-baidu-search` crawler mode through its own tool code |

Plugins are installed into a scratch directory with `setup-plugins.sh`; nothing is
installed into V's runtime.

## Stages

1. `run.mjs` — every candidate on every query; candidates of one query run side by
   side, queries one at a time; `--repeat 2` for latency (quality uses repetition 0).
2. `judge.mjs` — blind comparative grading per query (labels shuffled
   deterministically), judge `anthropic/claude-opus-5.5` via OpenRouter, which is not
   a candidate family. Scores relevance, accuracy, completeness, sources, overall
   (1–10) and `key_match` for keyed items.
3. `answer.mjs` — end to end: each candidate's tool output is handed to V's default
   model (`deepseek-v4-flash`) as a `web_search` tool result and V answers. This is
   what the user actually receives, and it charges raw-result tools for the extra
   prompt tokens and reading time they cost V. `judge.mjs --mode answer` grades the
   answers the same way.
4. `report.mjs` — one table: fail rate, search p50/p90, payload size, judge scores,
   key correctness, answer scores, answer time, prompt tokens, end-to-end p50/p90.

## Running on V

Runs as `openclaw` in `/tmp/wsbench` (mode 700), outside the Gateway; the Gemini
candidates import the production dist read-only. Low volume and sequential — this is
not a load test.

```bash
# once
bash setup-plugins.sh
# each time
. ./bench-env.sh
node run.mjs --repeat 2 --out r1.jsonl --candidates gemini-35-lite,grok-43,sonar,keenable
node judge.mjs --in r1.jsonl --out judged.jsonl
node answer.mjs --in r1.jsonl --out answers.jsonl
node judge.mjs --mode answer --in answers.jsonl --out ajudged.jsonl
node report.mjs --results r1.jsonl --judged judged.jsonl --answers answers.jsonl --answers-judged ajudged.jsonl
```

Bench-only keys go in `/tmp/wsbench/keys.env` (never in git): `TAVILY_API_KEY`,
`BRAVE_API_KEY`, `EXA_API_KEY`, `BAIDU_API_KEY`, `ZHIPU_API_KEY`, `METASO_API_KEY`,
`SEARXNG_BASE_URL`.
