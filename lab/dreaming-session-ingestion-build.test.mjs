import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchHostEngineSessions, patchDreamingPhases} from './patch-dreaming-session-ingestion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'lab/fixtures/dreaming-session-ingestion-baseline');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
// Production V (db91-release-v2026.9.1-db91.6) and shared VLab db91-parity bytes, verified 2026-09-18.
const BASELINE = {
  'memory-core-host-engine-sessions-CAnvQ_5o.js': '0b117c22162dc42db57ea50d6e940ce6a73f759cab05440f101573e722a51de4',
  'dreaming-phases-C5ItPb99.js': 'c6dca1a88c2a32eb22b00d55aff978810b6b0f51c30b48c4f1a0e390ddd70dbb',
};

test('fixtures are the bytes running on production V and shared VLab', () => {
  for (const [name, expected] of Object.entries(BASELINE)) assert.equal(sha(read(fixtures, name)), expected, name);
});

test('release files are exactly the patched fixtures and the plan matches', () => {
  const plan = JSON.parse(read(root, 'lab/dreaming-session-ingestion-plan.json'));
  const patched = {
    'memory-core-host-engine-sessions-CAnvQ_5o.js': patchHostEngineSessions(read(fixtures, 'memory-core-host-engine-sessions-CAnvQ_5o.js')),
    'dreaming-phases-C5ItPb99.js': patchDreamingPhases(read(fixtures, 'dreaming-phases-C5ItPb99.js')),
  };
  for (const [name, after] of Object.entries(patched)) {
    assert.equal(read(path.join(root, 'lab/release-files'), name), after, `${name} release file drifted from build output`);
    const entry = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
    assert.equal(entry.before, BASELINE[name]);
    assert.equal(entry.after, sha(after));
  }
});

test('patches refuse to apply twice and refuse drifted sources', () => {
  const engine = read(fixtures, 'memory-core-host-engine-sessions-CAnvQ_5o.js');
  const phases = read(fixtures, 'dreaming-phases-C5ItPb99.js');
  assert.throws(() => patchHostEngineSessions(patchHostEngineSessions(engine)), /already applied/);
  assert.throws(() => patchDreamingPhases(patchDreamingPhases(phases)), /already applied/);
  assert.throws(() => patchHostEngineSessions(engine.replace('readConsistency: "latest"', 'readConsistency: "x"')), /anchor drift/);
  assert.throws(() => patchDreamingPhases(phases.replace('const totalCap = 240;', 'const totalCap = 241;')), /anchor drift/);
});

test('patched listing keeps the original call for non-dreaming callers', () => {
  const engine = read(fixtures, 'memory-core-host-engine-sessions-CAnvQ_5o.js');
  const after = patchHostEngineSessions(engine);
  const original = 'listSessionEntries({\n\t\tagentId: normalizedAgentId,\n\t\thydrateSkillPromptRefs: false,\n\t\treadOnly: options.readOnly === true,\n\t\tstorePath\n\t});';
  assert.ok(engine.includes(original), 'baseline call shape');
  assert.ok(after.includes(original), 'original listSessionEntries call survives behind the projection switch');
  assert.equal((after.match(/listSessionEntriesReadOnly/g) ?? []).length, 2, 'import + one call site');
  assert.ok(after.includes('const listProjection = options.entryProjection === "list";'));
});

test('dreaming phases: one listing per sweep per agent, revision skipped, scan loop yields', () => {
  const phases = patchDreamingPhases(read(fixtures, 'dreaming-phases-C5ItPb99.js'));
  assert.ok(!phases.includes('listSessionTranscriptCorpusEntriesForAgent(agentId, { includeRetainedSqlite: true })'));
  assert.ok(phases.includes('includeContentRevision: false'));
  assert.ok(phases.includes('entryProjection: "list"'));
  assert.ok(phases.includes('resolveDreamingSessionCorpusEntries(agentId, params.nowMs)'));
  assert.ok(phases.includes('if (scannedSources++ % DREAMING_SESSION_SCAN_YIELD_EVERY === 0) await yieldDreamingEventLoop();'));
});
