import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER, patchSessionAccessor } from './patch-mirror-facts-identity.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's session accessor (byte-identical to V on 2026-10-10)
const base = read('./release-files/placement-evidence-absence/session-accessor-K0XuW6ln.js');
const released = read('./release-files/mirror-facts-identity/session-accessor-K0XuW6ln.js');
const fn = (source, name) => {
  const start = source.indexOf(`\nfunction ${name}(`);
  assert(start >= 0, `${name} present`);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
};

test('release file is V plus only this patch', () => {
  assert.equal(patchSessionAccessor(base), released);
  assert.throws(() => patchSessionAccessor(released), /already carries/);
  const outside = (s) => s.replace(fn(s, 'readTranscriptMirrorFactsInSnapshot'), '').replace(/\/\/ v-mirror-facts-identity-v1:[^\n]*\nfunction readTranscriptMirrorProjectionState\([\s\S]*?\n}\n/, '');
  assert.equal(outside(released), outside(base), 'nothing else changes');
  assert.equal(fn(released, 'readTranscriptMirrorFacts'), fn(base, 'readTranscriptMirrorFacts'), 'same snapshot transaction and operation label');
  assert.equal(fn(released, 'readMirrorFactsFromEvents'), fn(base, 'readMirrorFactsFromEvents'));
});

test('a lagging projection reads identity rows, never the whole transcript; only an unindexed one does', () => {
  const facts = fn(released, 'readTranscriptMirrorFactsInSnapshot');
  assert(!facts.includes('loadTranscriptEventsForMirrorFallback'), 'the full-read fallback is no longer called');
  assert.equal(facts.split('loadTranscriptEventsFromDatabase(').length - 1, 1, 'one full read, behind the unindexed state');
  assert.match(facts, /if \(projectionState === "unindexed"\) return readMirrorFactsFromEvents\(loadTranscriptEventsFromDatabase\(database, resolved\.sessionId\), new Set\(idempotencyKeys\)\);/);
  assert.match(facts, /if \(projectionState === "empty"\) return readMirrorFactsFromEvents\(\[\], new Set\(idempotencyKeys\)\);/);
  assert.match(facts, /const anchor = projectionState === "current" \? readActiveTranscriptEntryAnchorInTransaction\(\{/);
  const query = (s) => s.slice(s.indexOf('const rows = executeSqliteQuerySync('), s.indexOf('.rows;') + 6);
  assert.equal(query(facts), query(fn(base, 'readTranscriptMirrorFactsInSnapshot')), 'the identity query itself is unchanged');
  const state = fn(released, 'readTranscriptMirrorProjectionState');
  assert(released.includes(`// ${MARKER}: identity rows are written with their events`));
  assert.match(state, /needs_rebuild === 0 && state\.indexed_seq === latest\.seq\) return "current";/, 'the same currency test as the old fallback');
  assert.match(state, /selectFrom\("transcript_event_identities"\)\.select\("seq"\)\.where\("session_id", "=", sessionId\)\.limit\(1\)\) \? "lagging" : "unindexed"/);
});

test('identity rows are written with their events (what the patch relies on)', () => {
  // V's transcript store (0592e1cd), unchanged by this patch
  const store = read('./fixtures/mirror-facts-identity/session-accessor.sqlite-transcript-store-DV0WFe1a.js');
  const append = store.slice(store.indexOf('function appendTranscriptEvent(database, scope, event, options, cursor = {})'), store.indexOf('function scheduleTranscriptProjectionReconcile'));
  assert(append.indexOf('cursor.insertEvent({') < append.indexOf('cursor.insertIdentity({'), 'event, then its identity, in one call');
  assert.match(store, /messageIdempotencyKey: readMessageIdempotencyKey\(event\.message\)/, 'the key comes from event.message, as the fallback read it');
});
