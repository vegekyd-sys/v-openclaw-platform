#!/usr/bin/env node
// Compare xAI x_search request variants (latency, tokens, citations, answer text).
//
// Runs on a host that holds an xAI credential. The bearer token is read from
// XAI_BEARER (never printed). Writes one JSON line per call to --out.
//
//   XAI_BEARER=... node lab/x-search-effort-eval.mjs --out r.jsonl \
//     --variants current,low --repeat 2 --concurrency 3
//
// Variants mirror what OpenClaw 9.1 would send for model grok-4.6:
//   current  -> max_turns 2, no reasoning field (xAI default effort)
//   low      -> max_turns 2, reasoning.effort "low" (the patched behaviour)
//   original -> no max_turns, no reasoning field (before 2026-10-04 tuning)
import { appendFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const out = args.out ?? "x-search-effort-eval.jsonl";
const repeat = Number(args.repeat ?? 2);
const concurrency = Number(args.concurrency ?? 3);
const model = args.model ?? "grok-4.6";
const timeoutMs = Number(args.timeoutMs ?? 180_000);
const token = process.env.XAI_BEARER;
if (!token) throw new Error("XAI_BEARER is required");

const VARIANTS = {
  original: {},
  current: { max_turns: 2 },
  low: { max_turns: 2, reasoning: { effort: "low" } },
};
const variants = (args.variants ?? "current,low").split(",");

// Queries are phrased the way agents on V actually write x_search queries.
const QUERIES = [
  { id: "latest-handle", query: "Find the most recent original post from the X account @xai. Return the post URL, exact text and timestamp.", tool: { allowed_x_handles: ["xai"] } },
  { id: "post-stats", query: "For the X post https://x.com/SpaceXAI/status/2074214064746832060, report its current repost, reply, like, bookmark and view counts." },
  { id: "thread-replies", query: "Summarize the main reactions in the replies to https://x.com/SpaceXAI/status/2074214064746832060. Quote 3 representative replies with their URLs." },
  { id: "zh-topic", query: "X 上最近一周关于 DeepSeek 的讨论有哪些主要观点？给出 3-5 个代表性帖子链接，用中文总结。", tool: { from_date: "2026-09-27" } },
  { id: "handle-topic", query: "What has @elonmusk posted about Grok in the last 14 days? List the posts with URLs and dates.", tool: { allowed_x_handles: ["elonmusk"], from_date: "2026-09-20" } },
  { id: "karpathy-month", query: "Summarize the key topics @karpathy posted about in the last 30 days, with 3 example post URLs.", tool: { allowed_x_handles: ["karpathy"], from_date: "2026-09-04" } },
  { id: "date-range", query: "List the posts @NASA made between 2026-09-01 and 2026-09-07 about Artemis, with URLs.", tool: { allowed_x_handles: ["NASA"], from_date: "2026-09-01", to_date: "2026-09-07" } },
  { id: "sentiment-news", query: "What are people on X saying about OpenAI's most recent model release? Give the overall sentiment and 4 representative posts with URLs.", tool: { from_date: "2026-09-20" } },
  { id: "who-discusses", query: "Which accounts are most actively discussing Tesla FSD on X in the past week? Name 5 accounts with one example post URL each.", tool: { from_date: "2026-09-27" } },
  { id: "fact-check", query: "Did @xai officially announce a handle change to @SpaceXAI? Find the announcement post and any official confirmation, with URLs and dates." },
  { id: "openclaw", query: "Find recent posts on X about OpenClaw (the open-source AI agent gateway). Summarize what users are saying and give post URLs.", tool: { from_date: "2026-09-01" } },
];
const only = args.only ? new Set(args.only.split(",")) : null;
const queries = QUERIES.filter((q) => !only || only.has(q.id));

function extract(data) {
  const texts = [];
  const urls = new Set();
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const block of item.content ?? []) {
      if (block.type !== "output_text") continue;
      texts.push(block.text ?? "");
      for (const ann of block.annotations ?? []) if (ann.url) urls.add(ann.url);
    }
  }
  for (const c of data.citations ?? []) urls.add(typeof c === "string" ? c : c?.url);
  const text = texts.join("\n");
  for (const m of text.matchAll(/https?:\/\/(?:x|twitter)\.com\/[^\s)\]>"']+/g)) urls.add(m[0]);
  urls.delete(undefined);
  return { text, urls: [...urls] };
}

async function call(q, variant, rep) {
  const body = {
    model,
    input: [{ role: "user", content: q.query }],
    tools: [{ type: "x_search", ...(q.tool ?? {}) }],
    store: false,
    ...VARIANTS[variant],
  };
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let row;
  try {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json();
    const { text, urls } = extract(data);
    const u = data.usage ?? {};
    row = {
      query: q.id, variant, rep, http: res.status, ms: Date.now() - started,
      error: data.error ?? (res.ok ? null : data),
      input: u.input_tokens, output: u.output_tokens,
      reasoning: u.output_tokens_details?.reasoning_tokens,
      xSearchCalls: u.server_side_tool_usage_details?.x_search_calls,
      postsFetched: u.server_side_tool_usage_details?.x_posts_fetched,
      usd: u.cost_in_usd_ticks ? u.cost_in_usd_ticks / 1e10 : null,
      urls, text,
    };
  } catch (error) {
    row = { query: q.id, variant, rep, http: null, ms: Date.now() - started, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
  appendFileSync(out, `${JSON.stringify(row)}\n`);
  console.log(`${row.query.padEnd(15)} ${variant.padEnd(8)} rep${rep} http=${row.http} ${(row.ms / 1000).toFixed(1)}s reasoning=${row.reasoning ?? "-"} urls=${row.urls?.length ?? 0}`);
}

writeFileSync(out, "");
// Interleave variants so drift in xAI load hits both equally.
const jobs = [];
for (let rep = 1; rep <= repeat; rep++) for (const q of queries) for (const v of variants) jobs.push(() => call(q, v, rep));
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < jobs.length) await jobs[next++]();
}));
