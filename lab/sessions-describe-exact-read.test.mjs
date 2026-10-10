import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER, patchSessionsRead } from './patch-sessions-describe-exact-read.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's sessions read handlers with #308 (sessions.get exact read) underneath
const base = read('./release-files/sessions-get-exact-read/sessions-read-C6mAMxyQ.js');
const released = read('./release-files/sessions-describe-exact-read/sessions-read-C6mAMxyQ.js');
const handler = (source, name) => {
  const start = source.indexOf(`\t"${name}": `);
  return source.slice(start, source.indexOf('\n\t},\n', start) + 4);
};

test('release file is #308 plus only this patch', () => {
  assert.equal(patchSessionsRead(base), released);
  assert.throws(() => patchSessionsRead(released), /already patched/);
  assert.throws(() => patchSessionsRead(read('./release-files/sessions-read-live-20261010/sessions-read-C6mAMxyQ.js')), /#308/);
  for (const name of ['sessions.search', 'sessions.list', 'sessions.cleanup', 'sessions.preview', 'sessions.resolve']) {
    assert.equal(handler(released, name), handler(base, name), `${name} unchanged`);
  }
  const get = (s) => s.slice(s.indexOf('\t"sessions.get": '), s.indexOf('\nconst sessionsListHandler'));
  assert.equal(get(released), get(base), 'sessions.get unchanged');
});

test('sessions.describe loads the session and its direct children, then builds the same row', () => {
  const describe = handler(released, 'sessions.describe');
  const open = describe.indexOf('resolveGatewaySessionStoreTargetWithStore({') + 'resolveGatewaySessionStoreTargetWithStore({'.length;
  const lookup = describe.slice(open, describe.indexOf('\n\t\t});', open)).replace(/\s+/g, ' ').trim();
  assert.equal(lookup, 'cfg, key, ...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {}, exactRead: true, readOnly: true, includeStoreChildEntries: true');
  assert.match(describe, /const entry = resolveCanonicalSessionEntryFromStoreKeys\(store, target\.storeKeys\);/);
  assert(!describe.includes('loadSessionEntriesForTarget'));
  // the row is built from the same fields as before
  const row = (s) => s.slice(s.indexOf('const row = buildGatewaySessionRow({'), s.indexOf('respond(true, { session: {'));
  assert.equal(row(describe), row(handler(base, 'sessions.describe')));
  assert.equal(released.split(MARKER).length - 1, 1);
});
