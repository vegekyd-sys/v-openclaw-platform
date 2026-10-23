// Switch V's web_search from Parallel (free MCP) to DeepSeek Search, and make DeepSeek Fetch the
// web_fetch fallback, through the V-owned plugin apps/v-deepseek-web/plugin.
//
// Benchmark 2026-10-17 (experiments/web-search-bench/RESULTS-20261017-deepseek.md), 60 recent
// real V queries, answers written by V's deepseek-v4-flash and graded blind: DeepSeek Search 7.25
// vs Parallel 5.77 (+1.48, 95% CI +0.87..+2.12), Chinese 7.2 vs 5.0, search p50 0.33 s vs 1.23 s.
// Fetch on 86 URLs: DeepSeek gets main content on 63/81 vs built-in 51/81 but p50 4.2 s vs
// 0.36 s, so it only runs when the built-in fetch fails (OpenClaw's existing provider fallback).
//
// Rollback puts web_search back on parallel-free and removes the fetch fallback; the plugin
// stays loaded and unused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const PLUGIN_ID = 'v-deepseek-web';
export const PROVIDER = 'deepseek';
export const PREVIOUS_PROVIDER = 'parallel-free';
export const PRODUCTION_PLUGIN_PATH = '/opt/v-deepseek-web/plugin';

export function useDeepSeekWeb(input, pluginPath = PRODUCTION_PLUGIN_PATH) {
  const cfg = structuredClone(input);
  const search = cfg.tools?.web?.search;
  assert(search && typeof search === 'object', 'tools.web.search missing');
  assert.notEqual(search.enabled, false, 'web_search is disabled; review before switching');
  assert.equal(cfg.tools.web.fetch?.enabled === false, false, 'web_fetch is disabled; review before switching');
  assert(typeof cfg.models?.providers?.deepseek?.apiKey === 'string' && cfg.models.providers.deepseek.apiKey, 'deepseek model provider has no API key to reuse');
  // Anything else means search was changed after this review.
  assert(['parallel-free', 'gemini', PROVIDER].includes(search.provider), `unexpected web_search provider ${search.provider}`);
  const fetchProvider = cfg.tools.web.fetch?.provider;
  assert(fetchProvider === undefined || fetchProvider === PROVIDER, `unexpected web_fetch provider ${fetchProvider}`);
  const before = JSON.stringify(cfg);
  search.provider = PROVIDER;
  cfg.tools.web.fetch = {...(cfg.tools.web.fetch ?? {}), provider: PROVIDER};
  cfg.plugins ??= {};
  cfg.plugins.load ??= {};
  cfg.plugins.load.paths ??= [];
  if (!cfg.plugins.load.paths.includes(pluginPath)) cfg.plugins.load.paths.push(pluginPath);
  cfg.plugins.entries ??= {};
  cfg.plugins.entries[PLUGIN_ID] = {...(cfg.plugins.entries[PLUGIN_ID] ?? {}), enabled: true};
  if (Array.isArray(cfg.plugins.allow) && !cfg.plugins.allow.includes(PLUGIN_ID)) cfg.plugins.allow.push(PLUGIN_ID);
  const changed = JSON.stringify(cfg) !== before;
  return {config: cfg, changed, reason: changed ? 'switched to deepseek' : 'already deepseek'};
}

export function rollbackDeepSeekWeb(input) {
  const cfg = structuredClone(input);
  const search = cfg.tools?.web?.search;
  assert(search && typeof search === 'object', 'tools.web.search missing');
  const before = JSON.stringify(cfg);
  if (search.provider === PROVIDER) search.provider = PREVIOUS_PROVIDER;
  assert.equal(search.provider, PREVIOUS_PROVIDER, `unexpected web_search provider ${search.provider}`);
  assert(cfg.plugins?.entries?.parallel?.enabled === true, 'parallel plugin is not enabled; cannot roll back by provider switch');
  if (cfg.tools.web.fetch?.provider === PROVIDER) {
    const {provider: _drop, ...rest} = cfg.tools.web.fetch;
    if (Object.keys(rest).length) cfg.tools.web.fetch = rest; else delete cfg.tools.web.fetch;
  }
  const changed = JSON.stringify(cfg) !== before;
  return {config: cfg, changed, reason: changed ? 'switched back to parallel-free' : 'already parallel-free'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2);
  assert(file && flags.every(f => ['--apply', '--rollback'].includes(f)), 'usage: node config.mjs /absolute/openclaw.json [--rollback] [--apply]');
  const apply = flags.includes('--apply');
  const rollback = flags.includes('--rollback');
  const text = fs.readFileSync(file, 'utf8');
  const {config, changed, reason} = rollback ? rollbackDeepSeekWeb(JSON.parse(text)) : useDeepSeekWeb(JSON.parse(text));
  console.log(JSON.stringify({file, apply, rollback, changed, reason, search: config.tools.web.search.provider, fetch: config.tools.web.fetch?.provider ?? null,
    pluginLoaded: config.plugins?.load?.paths?.includes(PRODUCTION_PLUGIN_PATH) ?? false, allowed: config.plugins?.allow?.includes?.(PLUGIN_ID) ?? null}));
  if (apply && changed) {
    const stat = fs.statSync(file);
    const tag = rollback ? 'web-search-parallel-restore' : 'web-search-deepseek';
    const backup = `${file}.before-${tag}-${Date.now()}`;
    fs.writeFileSync(backup, text, {flag: 'wx', mode: stat.mode & 0o777});
    fs.chownSync(backup, stat.uid, stat.gid);
    const temp = `${file}.${tag}-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: stat.mode & 0o777});
    fs.chownSync(temp, stat.uid, stat.gid);
    fs.renameSync(temp, file);
    console.log(JSON.stringify({backup}));
  }
}
