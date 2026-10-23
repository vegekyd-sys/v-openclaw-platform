// DeepSeek Search & Fetch API client (https://api-docs.deepseek.com/guides/search/).
// Pure request/response shaping plus one retrying POST; no OpenClaw imports, so it is testable alone.

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const QUERY_MAX_CHARS = 128;
export const DEFAULT_COUNT = 6;
export const MAX_COUNT = 8;
export const SNIPPET_MAX_CHARS = 500;
// Codex harnesses cut native tool output at 10,000 characters. OpenClaw wraps every title,
// snippet and site name in an untrusted-content envelope, about 800 characters per result with the
// JSON around it (measured on VLab 2026-10-17), so snippets shrink when more results are asked for.
export const RESULT_TEXT_BUDGET = 9000;
export const RESULT_OVERHEAD_CHARS = 800;
export function snippetBudget(count, max = SNIPPET_MAX_CHARS) {
  return Math.max(150, Math.min(max, Math.floor((RESULT_TEXT_BUDGET - RESULT_OVERHEAD_CHARS * count) / Math.max(1, count))));
}
const FRESHNESS_DAYS = { day: 1, week: 7, month: 31, year: 366, pd: 1, pw: 7, pm: 31, py: 366 };

/** API key and base URL: plugin config, then DEEPSEEK_API_KEY, then V's deepseek model provider. */
export function resolveCredentials(config, pluginConfig, env = process.env) {
  const provider = config?.models?.providers?.deepseek;
  const apiKey = [pluginConfig?.apiKey, env.DEEPSEEK_API_KEY, provider?.apiKey].find((v) => typeof v === "string" && v.trim());
  const providerBase = typeof provider?.baseUrl === "string" && /^https:\/\/api\.deepseek\.com(\/|$)/u.test(provider.baseUrl) ? provider.baseUrl : undefined;
  const baseUrl = String(pluginConfig?.baseUrl ?? providerBase ?? DEFAULT_BASE_URL).replace(/\/+$/u, "").replace(/\/v1$/u, "");
  return { apiKey: apiKey?.trim(), baseUrl };
}

/** Cuts to the API's 128-character limit at a word boundary when one is near. */
export function clampQuery(query) {
  const q = String(query ?? "").replace(/\s+/gu, " ").trim();
  if ([...q].length <= QUERY_MAX_CHARS) return q;
  const cut = [...q].slice(0, QUERY_MAX_CHARS).join("");
  const space = cut.lastIndexOf(" ");
  return (space > QUERY_MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).trim();
}

const isoDate = (d) => d.toISOString().slice(0, 10);

/** Freshness and date filters become DeepSeek's after:/before: operators, appended only if they fit. */
export function buildQuery(args, now = new Date()) {
  const base = clampQuery(args.query);
  const ops = [];
  const freshness = typeof args.freshness === "string" ? args.freshness.trim().toLowerCase() : "";
  if (FRESHNESS_DAYS[freshness]) ops.push(`after:${isoDate(new Date(now.getTime() - FRESHNESS_DAYS[freshness] * 86400e3))}`);
  else if (/^\d{4}-\d{2}-\d{2}$/u.test(args.date_after ?? "")) ops.push(`after:${args.date_after}`);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(args.date_before ?? "")) ops.push(`before:${args.date_before}`);
  let query = base;
  for (const op of ops) if ([...`${query} ${op}`].length <= QUERY_MAX_CHARS) query = `${query} ${op}`;
  return query;
}

export function resolveCount(value, configured) {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : Number(configured) || DEFAULT_COUNT;
  return Math.max(1, Math.min(MAX_COUNT, n));
}

function clip(text, max) {
  const s = String(text ?? "").replace(/\s+/gu, " ").trim();
  return [...s].length <= max ? s : `${[...s].slice(0, max - 1).join("")}…`;
}

/** Maps DeepSeek results to the shape OpenClaw's web_search boundary normalizes (title/url/description/siteName/published). */
export function toSearchPayload({ query, sentQuery, data, tookMs, snippetMaxChars = SNIPPET_MAX_CHARS }) {
  const rows = (Array.isArray(data?.results) ? data.results : []).filter((r) => r && typeof r.url === "string" && /^https?:\/\//u.test(r.url));
  const perResult = snippetBudget(rows.length, snippetMaxChars);
  const results = rows.map((r) => {
    const out = { title: clip(r.title, 160), url: r.url, description: clip(r.summary || r.snippet, perResult) };
    if (typeof r.site_name === "string" && r.site_name) out.siteName = clip(r.site_name, 80);
    if (typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}/u.test(r.date)) out.published = r.date.slice(0, 10);
    return out;
  });
  return {
    query,
    ...(sentQuery !== query ? { sentQuery } : {}),
    provider: "deepseek",
    count: results.length,
    tookMs,
    externalContent: { untrusted: true, source: "web_search", provider: "deepseek", wrapped: true },
    results,
  };
}

/** Strips Markdown syntax for extractMode=text. */
export function markdownToPlain(md) {
  return String(md ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/(\*\*|__|`{1,3})/gu, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function toFetchPayload({ url, data, extractMode, tookMs }) {
  const markdown = typeof data?.content === "string" ? data.content : "";
  return {
    finalUrl: url,
    status: 200,
    contentType: extractMode === "text" ? "text/plain" : "text/markdown",
    title: typeof data?.title === "string" && data.title ? data.title : undefined,
    extractor: "deepseek",
    text: extractMode === "text" ? markdownToPlain(markdown) : markdown,
    tookMs,
  };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** POST with one retry on 408/429/5xx (the documented retryable statuses). */
export async function postDeepSeek({ baseUrl, apiKey, path, body, signal, timeoutMs, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!apiKey) throw new Error("DeepSeek API key is not configured (models.providers.deepseek.apiKey or DEEPSEEK_API_KEY).");
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if (attempt === 0 && RETRYABLE.has(res.status) && !signal?.aborted) { await sleep(res.status === 429 ? 1200 : 500); continue; }
    let message = text.slice(0, 300);
    try { message = JSON.parse(text)?.error?.message ?? message; } catch {}
    const error = new Error(`DeepSeek ${path.split("/").pop()} failed (${res.status}): ${message}`);
    error.status = res.status;
    throw error;
  }
}
