// Switch V's web_search from Gemini (Google Search grounding) to Parallel's free Search MCP.
//
// Benchmark 2026-10-04 (experiments/web-search-bench/RESULTS-20261004.md), 60 real V queries,
// answer written by V's own deepseek-v4-flash and graded blind: gemini-3.5-flash-lite 5.9 at
// 8.2 s end to end; parallel-free 6.6 (+0.77, 95% CI +0.25..+1.32) at 4.4 s. Gemini writes its
// own summary with a small model before V reads it; Parallel returns ranked excerpts in ~1 s
// and V's model reads them directly.
//
// Needs @openclaw/parallel-plugin@2026.9.1 installed (plugin id "parallel", providers
// "parallel" and "parallel-free"). The Gemini settings stay in place, so rollback is setting
// tools.web.search.provider back to "gemini".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const PROVIDER = 'parallel-free';
export const PLUGIN_ID = 'parallel';
export const PREVIOUS_PROVIDER = 'gemini';

export function useParallelWebSearch(input) {
  const cfg = structuredClone(input);
  const search = cfg.tools?.web?.search;
  assert(search && typeof search === 'object', 'tools.web.search missing');
  assert.notEqual(search.enabled, false, 'web_search is disabled; review before switching');
  const entry = cfg.plugins?.entries?.[PLUGIN_ID];
  const allow = cfg.plugins?.allow;
  if (search.provider === PROVIDER && entry?.enabled === true && (!Array.isArray(allow) || allow.includes(PLUGIN_ID))) {
    return {config: cfg, changed: false, reason: 'already parallel-free'};
  }
  // Anything but the reviewed starting point means someone changed search after this review.
  assert([PREVIOUS_PROVIDER, PROVIDER].includes(search.provider), `unexpected web_search provider ${search.provider}`);
  search.provider = PROVIDER;
  cfg.plugins ??= {};
  cfg.plugins.entries ??= {};
  cfg.plugins.entries[PLUGIN_ID] = {...(entry ?? {}), enabled: true};
  if (Array.isArray(allow) && !allow.includes(PLUGIN_ID)) allow.push(PLUGIN_ID);
  return {config: cfg, changed: true, reason: 'switched to parallel-free'};
}

export function useGeminiWebSearch(input) {
  const cfg = structuredClone(input);
  const search = cfg.tools?.web?.search;
  assert(search && typeof search === 'object', 'tools.web.search missing');
  if (search.provider === PREVIOUS_PROVIDER) return {config: cfg, changed: false, reason: 'already gemini'};
  assert.equal(search.provider, PROVIDER, `unexpected web_search provider ${search.provider}`);
  assert(cfg.plugins?.entries?.google?.config?.webSearch, 'Gemini web search settings are gone; cannot roll back by provider switch');
  search.provider = PREVIOUS_PROVIDER;
  return {config: cfg, changed: true, reason: 'switched back to gemini'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2);
  assert(file && flags.every(f => ['--apply', '--rollback'].includes(f)), 'usage: node config.mjs /absolute/openclaw.json [--rollback] [--apply]');
  const apply = flags.includes('--apply');
  const rollback = flags.includes('--rollback');
  const text = fs.readFileSync(file, 'utf8');
  const {config, changed, reason} = (rollback ? useGeminiWebSearch : useParallelWebSearch)(JSON.parse(text));
  console.log(JSON.stringify({file, apply, rollback, changed, reason, provider: config.tools.web.search.provider,
    pluginEnabled: config.plugins?.entries?.[PLUGIN_ID]?.enabled ?? null, allowed: config.plugins?.allow?.includes?.(PLUGIN_ID) ?? null}));
  if (apply && changed) {
    const stat = fs.statSync(file);
    const tag = rollback ? 'web-search-gemini' : 'web-search-parallel';
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
