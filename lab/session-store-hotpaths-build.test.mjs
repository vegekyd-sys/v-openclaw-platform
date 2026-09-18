import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchSessionAccessorCleanup, patchDreamingSessionCleanup} from './patch-session-store-hotpaths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'lab/fixtures/session-store-hotpaths-baseline');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
// Production V (db91-release-v2026.9.1-db91.6) and shared VLab db91-parity bytes, verified 2026-09-19.
const BASELINE = {
  'session-accessor-K0XuW6ln.js': '21f2a5695f1caa2f3c18784f' ,
  'dreaming-session-cleanup-CILX8EJS.js': '66a46632af01abe7f744b471',
};

test('fixtures are the bytes running on production V and shared VLab', () => {
  for (const [name, prefix] of Object.entries(BASELINE)) assert.ok(sha(read(fixtures, name)).startsWith(prefix), name);
});

test('release files equal the build output and the plan matches', () => {
  const plan = JSON.parse(read(root, 'lab/session-store-hotpaths-plan.json'));
  const patched = {
    'session-accessor-K0XuW6ln.js': patchSessionAccessorCleanup(read(fixtures, 'session-accessor-K0XuW6ln.js')),
    'dreaming-session-cleanup-CILX8EJS.js': patchDreamingSessionCleanup(read(fixtures, 'dreaming-session-cleanup-CILX8EJS.js')),
  };
  for (const [name, after] of Object.entries(patched)) {
    assert.equal(read(path.join(root, 'lab/release-files'), name), after, `${name} release file drifted`);
    const entry = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
    assert.ok(entry.before.startsWith(BASELINE[name]));
    assert.equal(entry.after, sha(after));
  }
});

test('patches refuse to apply twice and refuse drifted sources', () => {
  const accessor = read(fixtures, 'session-accessor-K0XuW6ln.js');
  const cleanup = read(fixtures, 'dreaming-session-cleanup-CILX8EJS.js');
  assert.throws(() => patchSessionAccessorCleanup(patchSessionAccessorCleanup(accessor)), /already applied/);
  assert.throws(() => patchDreamingSessionCleanup(patchDreamingSessionCleanup(cleanup)), /already applied/);
  assert.throws(() => patchSessionAccessorCleanup(accessor.replace('storePath: params.storePath\n\t})) {', 'storePath: params.storePath, x: 1\n\t})) {')), /anchor drift/);
  assert.throws(() => patchDreamingSessionCleanup(cleanup.replace('const result = await cleanupSessionLifecycleArtifacts({', 'const result = await other({')), /anchor drift/);
});

test('cleanup scan is the only listSessionEntriesCore call that changes, and it only adds the projection', () => {
  const before = read(fixtures, 'session-accessor-K0XuW6ln.js');
  const after = patchSessionAccessorCleanup(before);
  assert.equal(after.length - before.length, '\t\tprojection: "list",\n'.length);
  assert.equal((before.match(/listSessionEntriesCore\(/g) ?? []).length, (after.match(/listSessionEntriesCore\(/g) ?? []).length);
  assert.ok(after.includes('for (const { entry, sessionKey } of listSessionEntriesCore({\n\t\tagentId: params.agentId,\n\t\tprojection: "list",\n\t\tstorePath: params.storePath\n\t})) {'));
});

test('scrub throttle: 10 minutes per agent, explicit nowMs callers unaffected, first call runs', async () => {
  const cleanup = patchDreamingSessionCleanup(read(fixtures, 'dreaming-session-cleanup-CILX8EJS.js'));
  // Execute the patched module against a stub of cleanupSessionLifecycleArtifacts.
  const calls = [];
  const stubbed = cleanup
    .replace('import { t as cleanupSessionLifecycleArtifacts } from "./session-store-runtime-Di9N1AZ9.js";', 'const cleanupSessionLifecycleArtifacts = globalThis.__scrubStub;')
    .replace(/export \{[^}]*\};?\s*$/, 'export { scrubDreamingNarrativeArtifacts };');
  globalThis.__scrubStub = async (p) => { calls.push(p); return {removedEntries: 0, archivedTranscriptArtifacts: 0}; };
  const dir = fs.mkdtempSync(path.join(root, 'tmp', 'scrub-test-'));
  const file = path.join(dir, 'scrub.mjs');
  fs.writeFileSync(file, stubbed);
  const mod = await import(`${file}?t=${Date.now()}`);
  const logger = {info() {}, warn() {}};
  const config = {session: {}};
  await mod.scrubDreamingNarrativeArtifacts({agentId: 'makaron', config, logger});
  await mod.scrubDreamingNarrativeArtifacts({agentId: 'makaron', config, logger});
  await mod.scrubDreamingNarrativeArtifacts({agentId: 'makaron', config, logger});
  assert.equal(calls.length, 1, 'repeat scrubs for the same agent within 10 minutes are skipped');
  await mod.scrubDreamingNarrativeArtifacts({agentId: 'short-v', config, logger});
  assert.equal(calls.length, 2, 'another agent scrubs independently');
  await mod.scrubDreamingNarrativeArtifacts({agentId: 'makaron', config, logger, nowMs: 5});
  assert.equal(calls.length, 3, 'explicit nowMs callers always run');
  assert.equal(calls[2].nowMs, 5);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['agentId', 'archiveRemovedEntryTranscripts', 'orphanTranscriptMinAgeMs', 'pluginOwnerId', 'sessionKeySegmentPrefix', 'sessionStore', 'transcriptContentMarker'].sort(), 'cleanup parameters unchanged');
  fs.rmSync(dir, {recursive: true, force: true});
});
