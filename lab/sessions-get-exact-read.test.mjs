import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER, patchSessionsRead } from './patch-sessions-get-exact-read.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's sessions read handlers as live since batch-20261010 (read from VLab, same sha as V)
const original = read('./release-files/sessions-read-live-20261010/sessions-read-C6mAMxyQ.js');
const released = read('./release-files/sessions-get-exact-read/sessions-read-C6mAMxyQ.js');
const handler = (source, name) => {
  const start = source.indexOf(`\t"${name}": `);
  return source.slice(start, source.indexOf('\n\t},\n', start) + 4);
};

test('release file is V\'s sessions read handlers plus only this patch', () => {
  assert.equal(patchSessionsRead(original), released);
  assert.throws(() => patchSessionsRead(released), /already patched/);
  for (const name of ['sessions.search', 'sessions.list', 'sessions.cleanup', 'sessions.preview', 'sessions.describe', 'sessions.resolve']) {
    assert.equal(handler(released, name), handler(original, name), `${name} unchanged`);
  }
});

test('sessions.get looks its session up the way sessions.preview does and never reads the store', () => {
  const get = released.slice(released.indexOf('\t"sessions.get": '), released.indexOf('\nconst sessionsListHandler'));
  const preview = handler(released, 'sessions.preview');
  const lookup = (body) => body.match(/resolveGatewaySessionStoreTargetWithStore\(\{([^}]*)\}\)/)[1].replace(/\s+/g, ' ').trim();
  assert.equal(lookup(get), 'cfg, key, agentId: requestedAgent.agentId, exactRead: true, readOnly: true');
  assert.equal(lookup(preview), 'cfg, key, agentId: requestedAgent.agentId, exactRead: true, readOnly: true');
  assert.match(get, /const entry = resolveCanonicalSessionEntryFromStoreKeys\(target\.store, target\.storeKeys\);/);
  assert(!get.includes('loadSessionEntriesForTarget'));
  // after the lookup only storePath and entry are used, as before
  const after = get.slice(get.indexOf('const entry ='));
  assert(!/\bstore\b(?!Path|Keys)/.test(after.replace('target.store, target.storeKeys', '')), 'the handler must not use the (now partial) store');
  assert.match(get, /maxMessages: limit,\n\t\t\tmaxLines: limit \* 20 \+ 20,\n\t\t\tallowResetArchiveFallback: true/);
  assert.equal(released.split(MARKER).length - 1, 1);
  // sessions.describe passes the store on, so it keeps the full read
  assert.match(handler(released, 'sessions.describe'), /loadSessionEntriesForTarget\(/);
});
