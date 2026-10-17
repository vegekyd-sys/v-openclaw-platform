import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuery, clampQuery, markdownToPlain, postDeepSeek, resolveCount, resolveCredentials, toFetchPayload, toSearchPayload,
} from "../core/deepseek.js";

test("credentials: plugin config, then env, then V's deepseek model provider; base URL drops /v1", () => {
  const config = { models: { providers: { deepseek: { apiKey: "sk-provider", baseUrl: "https://api.deepseek.com/v1" } } } };
  assert.deepEqual(resolveCredentials(config, {}, {}), { apiKey: "sk-provider", baseUrl: "https://api.deepseek.com" });
  assert.equal(resolveCredentials(config, {}, { DEEPSEEK_API_KEY: "sk-env" }).apiKey, "sk-env");
  assert.equal(resolveCredentials(config, { apiKey: "sk-plugin" }, { DEEPSEEK_API_KEY: "sk-env" }).apiKey, "sk-plugin");
});

test("a proxied model base URL is not used for the tools API", () => {
  const config = { models: { providers: { deepseek: { apiKey: "k", baseUrl: "http://127.0.0.1:9999/v1" } } } };
  assert.equal(resolveCredentials(config, {}, {}).baseUrl, "https://api.deepseek.com");
});

test("queries are cut to 128 characters, at a word boundary when one is near", () => {
  const long = "word ".repeat(40);
  const q = clampQuery(long);
  assert(q.length <= 128 && !q.endsWith(" ") && q.endsWith("word"));
  assert.equal([...clampQuery("中".repeat(200))].length, 128);
});

test("freshness and dates become after:/before: operators only when they fit", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  assert.equal(buildQuery({ query: "OpenAI DevDay", freshness: "week" }, now), "OpenAI DevDay after:2026-10-10");
  assert.equal(buildQuery({ query: "x", date_after: "2026-01-01", date_before: "2026-02-01" }, now), "x after:2026-01-01 before:2026-02-01");
  const full = "a".repeat(128);
  assert.equal(buildQuery({ query: full, freshness: "day" }, now), full);
});

test("count defaults to 6 and stays within 1..10", () => {
  assert.equal(resolveCount(undefined), 6);
  assert.equal(resolveCount(undefined, 4), 4);
  assert.equal(resolveCount(50), 8);
  assert.equal(resolveCount(0), 1);
});

test("search payload uses the model-facing summary, clipped, with date and site", () => {
  const data = { results: [
    { title: "T", url: "https://a.example/x", snippet: "short", summary: "s".repeat(900), site_name: "A", date: "2026-10-01T00:00:00+00:00", authority: 3, rerank_score: 2 },
    { title: "bad", url: "javascript:alert(1)", summary: "x" },
  ] };
  const p = toSearchPayload({ query: "q", sentQuery: "q", data, tookMs: 5 });
  assert.equal(p.provider, "deepseek");
  assert.equal(p.count, 1);
  assert.equal(p.results[0].description.length, 500);
  assert.equal(p.results[0].published, "2026-10-01");
  assert.equal(p.results[0].siteName, "A");
  assert.equal("sentQuery" in p, false);
});

test("snippets shrink with the result count: 500 up to six results, shorter for seven or eight", async () => {
  const { snippetBudget } = await import("../core/deepseek.js");
  assert.equal(snippetBudget(6), 500);
  assert.equal(snippetBudget(7), 485);
  assert.equal(snippetBudget(8), 325);
  assert.equal(snippetBudget(1), 500);
});

test("eight results stay under Codex's 10,000-character tool output cap", () => {
  const data = { results: Array.from({ length: 8 }, (_, i) => ({ title: "t".repeat(80), url: `https://e.example/${i}`, summary: "中".repeat(800), site_name: "E", date: null })) };
  assert(JSON.stringify(toSearchPayload({ query: "q", sentQuery: "q", data, tookMs: 1 })).length < 7000);
});

test("fetch payload keeps markdown, or strips it for text mode", () => {
  const data = { title: "Page", content: "# Head\n\nSee [docs](https://x.example) and **bold** `code`." };
  assert.equal(toFetchPayload({ url: "https://p.example", data, extractMode: "markdown", tookMs: 1 }).text, data.content);
  assert.equal(toFetchPayload({ url: "https://p.example", data, extractMode: "text", tookMs: 1 }).text, "Head\n\nSee docs and bold code.");
  assert.equal(markdownToPlain("a\\_b"), "a_b");
});

test("POST retries once on 429 and 5xx, not on 404, and never without a key", async () => {
  const calls = [];
  const reply = (status, body) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) });
  const seq = [reply(429, { error: { message: "slow down" } }), reply(200, { results: [] })];
  const out = await postDeepSeek({ baseUrl: "https://b", apiKey: "k", path: "/v1/tools/search", body: { query: "q" }, timeoutMs: 1000,
    fetchImpl: async (url, init) => { calls.push([url, JSON.parse(init.body)]); return seq.shift(); }, sleep: async () => {} });
  assert.deepEqual(out, { results: [] });
  assert.equal(calls.length, 2);
  await assert.rejects(postDeepSeek({ baseUrl: "https://b", apiKey: "k", path: "/v1/tools/fetch", body: {}, timeoutMs: 1000,
    fetchImpl: async () => reply(404, { error: { message: "failed to fetch" } }), sleep: async () => {} }), /fetch failed \(404\): failed to fetch/);
  await assert.rejects(postDeepSeek({ baseUrl: "https://b", apiKey: "", path: "/v1/tools/search", body: {}, timeoutMs: 1000 }), /not configured/);
});
