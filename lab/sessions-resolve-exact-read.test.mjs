import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BEFORE_SHA, MARKER, NAME, patchSessionsResolve, sha256, unpatchSessionsResolve } from './patch-sessions-resolve-exact-read.mjs';

// sessions-resolve-exact-read: sessions.resolve by key reads only the key's store rows.
// See lab/sessions-resolve-exact-read.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/sessions-resolve-exact-read.plan.json'));
const released = read(`lab/release-files/sessions-resolve-exact-read/${NAME}`);
const original = unpatchSessionsResolve(released);
const branch = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

test('plan pins V bytes before and the release file after', () => {
  assert.equal(plan.files.length, 1);
  const [file] = plan.files;
  assert.equal(file.target, `openclaw/dist/${NAME}`);
  assert.equal(file.source, `lab/release-files/sessions-resolve-exact-read/${NAME}`);
  assert.equal(file.before, BEFORE_SHA);
  assert.equal(sha256(original), BEFORE_SHA, 'V bytes');
  assert.equal(sha256(released), file.after, 'release bytes');
  assert.equal(patchSessionsResolve(original), released);
  assert.throws(() => patchSessionsResolve(released), /already patched/);
});

test('only the key lookup changes; the original read stays behind the switch', () => {
  const releaseLines = new Set(released.split('\n'));
  const removed = original.split('\n').filter((line) => !releaseLines.has(line)).map((line) => line.trim());
  assert.deepEqual(removed, ['const entry = store[target.canonicalKey];']);
  assert.equal(released.split(MARKER).length - 1, 1);
  const key = branch(released, '\tif (hasKey) {', '\tif (hasSessionId) {');
  assert.match(key, /process\.env\.OPENCLAW_V_SESSIONS_RESOLVE_EXACT !== "0"/);
  assert.match(key, /\.\.\.exactRead \? \{\n\t\t\t\texactRead: true,\n\t\t\t\treadOnly: true\n\t\t\t\} : \{\}/);
  // whole-store reads never returned internal-session-effects rows
  assert.match(key, /const entry = exactRead && isInternalSessionEffectsKey\(target\.canonicalKey\) \? void 0 : store\[target\.canonicalKey\];/);
  assert.match(released, /import \{ O as isInternalSessionEffectsKey \} from "\.\/session-accessor\.sqlite-entry-BlklNPKQ\.js";/);
  // everything after the lookup is V's code: visibility, deleted-agent check, result
  const after = (source) => branch(source, '\t\tif (entry) {', '\tif (hasSessionId) {');
  assert.equal(after(released), after(original));
  // searching branches keep their store reads
  for (const [from, to] of [['\tif (hasSessionId) {', '\tif (hasShortId) {'], ['\tif (hasShortId) {', '\tconst parsedLabel']]) {
    assert.equal(branch(released, from, to), branch(original, from, to));
  }
  assert.equal(released.slice(released.indexOf('\tconst parsedLabel')), original.slice(original.indexOf('\tconst parsedLabel')));
});

test('the visibility filter only asks about the resolved key', () => {
  // A store holding just the scan targets answers the same as the whole store because the
  // spawnedBy check tests one key and filterSessionEntries decides each entry on its own.
  const visible = branch(released, 'function isResolvedSessionKeyVisible', 'function findVisibleSessionIdMatches');
  assert.match(visible, /\.some\(\(\[key\]\) => key === params\.key\)/);
  assert.doesNotMatch(visible, /limit/);
});
