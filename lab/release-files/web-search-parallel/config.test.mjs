import assert from 'node:assert/strict';
import test from 'node:test';
import {useParallelWebSearch, useGeminiWebSearch} from './config.mjs';

const base = () => ({
  tools: {web: {search: {enabled: true, provider: 'gemini', openaiCodex: {enabled: true, mode: 'cached'}}}},
  plugins: {allow: ['google', 'xai'], entries: {google: {enabled: true, config: {webSearch: {model: 'gemini-3.5-flash-lite'}}}}},
});

test('switches gemini to parallel-free, enables and allows the plugin, keeps Gemini settings', () => {
  const input = base();
  const {config, changed} = useParallelWebSearch(input);
  assert.equal(changed, true);
  assert.equal(config.tools.web.search.provider, 'parallel-free');
  assert.deepEqual(config.tools.web.search.openaiCodex, input.tools.web.search.openaiCodex);
  assert.equal(config.plugins.entries.parallel.enabled, true);
  assert.deepEqual(config.plugins.allow, ['google', 'xai', 'parallel']);
  assert.deepEqual(config.plugins.entries.google, input.plugins.entries.google);
  assert.equal(input.tools.web.search.provider, 'gemini', 'input must not be mutated');
});

test('is idempotent', () => {
  const once = useParallelWebSearch(base()).config;
  const twice = useParallelWebSearch(once);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.config, once);
});

test('works without a plugin allowlist', () => {
  const cfg = base(); delete cfg.plugins.allow;
  const {config} = useParallelWebSearch(cfg);
  assert.equal(config.plugins.allow, undefined);
  assert.equal(config.plugins.entries.parallel.enabled, true);
});

test('refuses an unreviewed provider or disabled search', () => {
  const other = base(); other.tools.web.search.provider = 'brave';
  assert.throws(() => useParallelWebSearch(other), /unexpected web_search provider brave/);
  const off = base(); off.tools.web.search.enabled = false;
  assert.throws(() => useParallelWebSearch(off), /disabled/);
});

test('rollback restores gemini and leaves the plugin entry', () => {
  const on = useParallelWebSearch(base()).config;
  const {config, changed} = useGeminiWebSearch(on);
  assert.equal(changed, true);
  assert.equal(config.tools.web.search.provider, 'gemini');
  assert.equal(config.plugins.entries.parallel.enabled, true);
  assert.equal(useGeminiWebSearch(config).changed, false);
});
