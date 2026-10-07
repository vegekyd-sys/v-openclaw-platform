import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { MARKER, patchIdsChunk } from './patch-chat-channel-id-memo.mjs';

const release = fs.readFileSync(new URL('./release-files/chat-channel-id-memo/ids-DeNBb0Rp.js', import.meta.url), 'utf8');
const ORIGINAL_LOOKUP = `function normalizeRuntimeBundledChatChannelId(normalized) {
	for (const entry of listBundledChannelCatalogEntries()) if (entry.id === normalized || entry.aliases.includes(normalized)) return entry.id;
	return null;
}`;

function unpatch(source) {
  const from = source.indexOf(MARKER);
  const to = source.indexOf('/**\n* Normalizes a raw chat channel id or alias');
  assert(from > 0 && to > from);
  return (source.slice(0, from) + ORIGINAL_LOOKUP + '\n' + source.slice(to))
    .replace('import { a as getPluginCache } from "./plugin-cache-DGWspMEc.js";\n', '');
}

test('release is npm openclaw@2026.9.1 ids chunk plus only the memo', () => {
  const base = unpatch(release);
  assert.equal(createHash('sha256').update(base).digest('hex'), '91cc9358c885211e5a1d882dc70b2d614c04ee5ff31adbe565b4fe3234ffabe6');
  assert.equal(patchIdsChunk(base), release);
  assert.throws(() => patchIdsChunk(release), /already patched/);
});

// ---- the patched lookup against a fake plugin cache and catalog ----
function harness({ env = {} } = {}) {
  const from = release.indexOf(MARKER);
  const to = release.indexOf('/**\n* Normalizes a raw chat channel id or alias');
  const state = { cache: { metadata: { bundledChannelCatalogs: new Map() } }, walks: 0, key: 'k1', catalog: [] };
  const listBundledChannelCatalogEntries = () => {
    state.walks += 1;
    const catalogs = state.cache.metadata.bundledChannelCatalogs;
    if (!catalogs.has(state.key)) catalogs.set(state.key, state.catalog);
    return catalogs.get(state.key);
  };
  const saved = process.env.OPENCLAW_CHAT_CHANNEL_ID_MEMO;
  if ('OPENCLAW_CHAT_CHANNEL_ID_MEMO' in env) process.env.OPENCLAW_CHAT_CHANNEL_ID_MEMO = env.OPENCLAW_CHAT_CHANNEL_ID_MEMO;
  try {
    const lookup = new Function('listBundledChannelCatalogEntries', 'getPluginCache',
      `${release.slice(from, to)}\nreturn normalizeRuntimeBundledChatChannelId;`)(listBundledChannelCatalogEntries, () => state.cache);
    return { lookup, state };
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_CHAT_CHANNEL_ID_MEMO; else process.env.OPENCLAW_CHAT_CHANNEL_ID_MEMO = saved;
  }
}
const catalog = [{ id: 'feishu', aliases: ['lark'] }, { id: 'wecom', aliases: ['wework', 'weixin-work'] }];

test('answers are the same as the walk, and repeat lookups do not walk the catalog', () => {
  const { lookup, state } = harness();
  state.catalog = catalog;
  for (let round = 0; round < 3; round += 1) {
    assert.equal(lookup('feishu'), 'feishu');
    assert.equal(lookup('lark'), 'feishu');
    assert.equal(lookup('wework'), 'wecom');
    assert.equal(lookup('memory-core'), null);
  }
  // one walk per distinct id, the first one included
  assert.equal(state.walks, 4);
});

test('a second catalog, a new plugin cache, or the off switch go back to walking', () => {
  const two = harness();
  two.state.catalog = catalog;
  two.lookup('feishu'); two.lookup('feishu');
  const before = two.state.walks;
  two.state.key = 'k2';
  two.state.catalog = [{ id: 'feishu', aliases: [] }];
  assert.equal(two.lookup('lark'), null);
  assert.equal(two.lookup('lark'), null);
  assert.equal(two.state.walks, before + 2);

  const reset = harness();
  reset.state.catalog = catalog;
  reset.lookup('lark'); reset.lookup('lark');
  const walks = reset.state.walks;
  reset.state.cache = { metadata: { bundledChannelCatalogs: new Map() } };
  reset.state.catalog = [];
  assert.equal(reset.lookup('lark'), null);
  assert.equal(reset.state.walks, walks + 1);

  const off = harness({ env: { OPENCLAW_CHAT_CHANNEL_ID_MEMO: '0' } });
  off.state.catalog = catalog;
  for (let i = 0; i < 3; i += 1) assert.equal(off.lookup('lark'), 'feishu');
  assert.equal(off.state.walks, 3);
});
