// V's web_search and web_fetch fallback on DeepSeek's Search & Fetch API.
//
// web_search provider "deepseek": DeepSeek's in-house engine, raw results with a model-facing
// summary each (benchmark 2026-10-17: answer score 7.25 vs Parallel 5.77, search p50 0.33 s).
// web_fetch provider "deepseek": OpenClaw's built-in web_fetch stays first; core only calls this
// when its own fetch errors, gets a non-2xx status or extracts nothing (403 walls, Baidu Baike,
// Weibo, Bilibili…). Credentials come from V's deepseek model provider unless configured here.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createWebSearchProviderContractFields } from "openclaw/plugin-sdk/provider-web-search-contract";
import { enablePluginInConfig } from "openclaw/plugin-sdk/provider-web-fetch-contract";
import {
  buildQuery, clampQuery, postDeepSeek, resolveCount, resolveCredentials, toFetchPayload, toSearchPayload, SNIPPET_MAX_CHARS,
} from "./core/deepseek.js";

const PLUGIN_ID = "v-deepseek-web";
const PROVIDER_ID = "deepseek";
const DOCS = "https://api-docs.deepseek.com/guides/search/";

const SearchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query (keywords or a short question; at most 128 characters are used). Supports site:, -site:, \"phrase\", lang:zh,en." },
    count: { type: "integer", minimum: 1, maximum: 8, description: "Number of results (1-8, default 6)." },
    freshness: { type: "string", description: "Only recent results: day, week, month or year." },
    date_after: { type: "string", description: "Only results after this date (YYYY-MM-DD)." },
    date_before: { type: "string", description: "Only results before this date (YYYY-MM-DD)." },
  },
  required: ["query"],
  additionalProperties: false,
};

const pluginConfigOf = (config) => config?.plugins?.entries?.[PLUGIN_ID]?.config ?? {};

function createSearchProvider() {
  return {
    id: PROVIDER_ID,
    label: "DeepSeek Search",
    hint: "DeepSeek's own search engine; uses the DeepSeek API key",
    requiresCredential: false,
    envVars: [],
    placeholder: "(uses the DeepSeek model provider key)",
    signupUrl: "https://platform.deepseek.com/",
    docsUrl: DOCS,
    credentialPath: "",
    ...createWebSearchProviderContractFields({
      credentialPath: "",
      searchCredential: { type: "scoped", scopeId: PROVIDER_ID },
      selectionPluginId: PLUGIN_ID,
    }),
    createTool: (ctx) => ({
      description: "Search the web with DeepSeek's search engine (strong on Chinese and English). Returns ranked pages with a summary each; read the relevant ones and fetch a page with web_fetch only when the summary is not enough.",
      parameters: SearchSchema,
      execute: async (args, context) => {
        context?.signal?.throwIfAborted();
        const pluginConfig = pluginConfigOf(ctx.config);
        const { apiKey, baseUrl } = resolveCredentials(ctx.config, pluginConfig);
        const query = clampQuery(args?.query);
        if (!query) return { error: "invalid_query", message: "query is required." };
        const sentQuery = buildQuery({ ...args, query });
        const started = Date.now();
        const data = await postDeepSeek({
          baseUrl, apiKey, path: "/v1/tools/search", signal: context?.signal,
          timeoutMs: (Number(ctx.searchConfig?.timeoutSeconds) || 15) * 1000,
          body: { query: sentQuery, count: resolveCount(args?.count, pluginConfig.webSearch?.count) },
        });
        return toSearchPayload({ query: String(args.query), sentQuery, data, tookMs: Date.now() - started,
          snippetMaxChars: Number(pluginConfig.webSearch?.snippetMaxChars) || SNIPPET_MAX_CHARS });
      },
    }),
  };
}

function createFetchProvider() {
  return {
    id: PROVIDER_ID,
    label: "DeepSeek Fetch",
    hint: "Fallback reader for pages the direct fetch cannot get",
    requiresCredential: false,
    envVars: [],
    placeholder: "(uses the DeepSeek model provider key)",
    signupUrl: "https://platform.deepseek.com/",
    docsUrl: DOCS,
    autoDetectOrder: 90,
    credentialPath: "",
    applySelectionConfig: (config) => enablePluginInConfig(config, PLUGIN_ID).config,
    createTool: ({ config }) => ({
      description: "Fetch a page through DeepSeek's reader.",
      parameters: {},
      execute: async (args, executionContext) => {
        executionContext?.signal?.throwIfAborted();
        const url = typeof args?.url === "string" ? args.url : "";
        if (!/^https?:\/\//iu.test(url)) throw new Error("DeepSeek fetch needs an http(s) URL.");
        const pluginConfig = pluginConfigOf(config);
        const { apiKey, baseUrl } = resolveCredentials(config, pluginConfig);
        const started = Date.now();
        const data = await postDeepSeek({
          baseUrl, apiKey, path: "/v1/tools/fetch", signal: executionContext?.signal,
          timeoutMs: (Number(pluginConfig.webFetch?.timeoutSeconds) || 20) * 1000,
          body: { url },
        });
        return toFetchPayload({ url, data, extractMode: args.extractMode === "text" ? "text" : "markdown", tookMs: Date.now() - started });
      },
    }),
  };
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "V DeepSeek Web",
  description: "web_search on DeepSeek Search, and DeepSeek Fetch as the web_fetch fallback.",
  register(api) {
    api.registerWebSearchProvider(createSearchProvider());
    api.registerWebFetchProvider(createFetchProvider());
  },
});
