import assert from 'node:assert/strict';
import test from 'node:test';
import {useDeepSeekWeb, rollbackDeepSeekWeb, PRODUCTION_PLUGIN_PATH} from './config.mjs';

const base = () => ({
  models: {providers: {deepseek: {apiKey: 'sk-x', baseUrl: 'https://api.deepseek.com/v1'}}},
  tools: {web: {search: {enabled: true, provider: 'parallel-free', openaiCodex: {enabled: true}}}},
  plugins: {allow: ['parallel'], load: {paths: ['/opt/a']}, entries: {parallel: {enabled: true}}},
});

test('switches search to deepseek, sets the fetch fallback and loads the plugin', () => {
  const input = base();
  const {config, changed} = useDeepSeekWeb(input);
  assert.equal(changed, true);
  assert.equal(config.tools.web.search.provider, 'deepseek');
  assert.deepEqual(config.tools.web.search.openaiCodex, {enabled: true});
  assert.deepEqual(config.tools.web.fetch, {provider: 'deepseek'});
  assert.deepEqual(config.plugins.load.paths, ['/opt/a', PRODUCTION_PLUGIN_PATH]);
  assert.deepEqual(config.plugins.allow, ['parallel', 'v-deepseek-web']);
  assert.equal(config.plugins.entries['v-deepseek-web'].enabled, true);
  assert.equal(input.tools.web.search.provider, 'parallel-free', 'input must not be mutated');
});

test('is idempotent and keeps existing fetch settings', () => {
  const cfg = base(); cfg.tools.web.fetch = {maxChars: 30000};
  const once = useDeepSeekWeb(cfg).config;
  assert.deepEqual(once.tools.web.fetch, {maxChars: 30000, provider: 'deepseek'});
  const twice = useDeepSeekWeb(once);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.config, once);
});

test('refuses unreviewed starting points', () => {
  const brave = base(); brave.tools.web.search.provider = 'brave';
  assert.throws(() => useDeepSeekWeb(brave), /unexpected web_search provider brave/);
  const fc = base(); fc.tools.web.fetch = {provider: 'firecrawl'};
  assert.throws(() => useDeepSeekWeb(fc), /unexpected web_fetch provider firecrawl/);
  const nokey = base(); delete nokey.models.providers.deepseek.apiKey;
  assert.throws(() => useDeepSeekWeb(nokey), /no API key/);
});

test('rollback restores parallel-free and drops only the fetch provider', () => {
  const cfg = base(); cfg.tools.web.fetch = {maxChars: 30000};
  const on = useDeepSeekWeb(cfg).config;
  const {config, changed} = rollbackDeepSeekWeb(on);
  assert.equal(changed, true);
  assert.equal(config.tools.web.search.provider, 'parallel-free');
  assert.deepEqual(config.tools.web.fetch, {maxChars: 30000});
  assert.equal(rollbackDeepSeekWeb(config).changed, false);
  const bare = rollbackDeepSeekWeb(useDeepSeekWeb(base()).config).config;
  assert.equal('fetch' in bare.tools.web, false);
});
