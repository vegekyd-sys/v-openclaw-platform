import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-gateway-fullread-hotpaths.mjs';

// gateway-fullread-hotpaths: cron session resolution, the cron run reaper, the task maintenance sweep
// and workboard lifecycle matching stop materializing every row. See lab/gateway-fullread-hotpaths.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/gateway-fullread-hotpaths.plan.json'));

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target.replace('openclaw/dist/', '')), Object.keys(FILES));
  for (const file of plan.files) {
    const name = file.target.replace('openclaw/dist/', '');
    assert.equal(file.source, `${RELEASE_DIR}/${name}`);
    const release = read(file.source);
    const base = unpatchFile(name, release);
    assert.equal(sha256(base), file.before, `${name}: V bytes`);
    assert.equal(file.before, FILES[name].before);
    assert.equal(sha256(release), file.after, `${name}: release bytes`);
    assert.equal(patchFile(name, base), release, `${name}: release file is the patcher applied to V bytes`);
    assert.throws(() => patchFile(name, release), /already patched/u);
  }
});

test('only the named read sites change, each keeps the original read behind the switch', () => {
  const removedLines = {};
  for (const name of Object.keys(FILES)) {
    const release = read(`${RELEASE_DIR}/${name}`);
    const base = unpatchFile(name, release);
    const releaseLines = new Set(release.split('\n'));
    removedLines[name] = base.split('\n').filter((line) => !releaseLines.has(line)).map((line) => line.trim().slice(0, 70));
    assert(release.includes(MARKER), `${name} carries the marker`);
  }
  assert.deepEqual(removedLines, {
    'session-D4AJhdUK.js': [
      'import { d as loadSessionEntry } from "./session-accessor.sqlite-entry',
      'const store = params.store ?? Object.fromEntries(listSessionEntriesCor',
      '}).map(({ sessionKey, entry }) => [sessionKey, entry]));',
    ],
    'service-CzmmKrEg.js': [
      'import { f as loadSessionEntryReadOnly, u as loadExactSessionEntryRead',
      'for (const { sessionKey, entry } of listSessionEntriesCore({',
    ],
    'task-registry.maintenance-C4nMaDY9.js': [
      // (the replaced `const tasks = ...listTaskRecords()` line also occurs in other functions)
      'import { j as ensureTaskRegistryReady } from "./task-registry-activity',
    ],
    'sqlite-store-CH-caj1l.js': [],
    'runtime-api-1CCazqtv.js': [
      'const links = await this.cardStore.listLifecycleLinks();',
    ],
  });
  for (const name of ['session-D4AJhdUK.js', 'service-CzmmKrEg.js', 'task-registry.maintenance-C4nMaDY9.js', 'runtime-api-1CCazqtv.js']) {
    assert.match(read(`${RELEASE_DIR}/${name}`), /process\.env\.OPENCLAW_V_FULLREAD_HOTPATHS === "0"/u, `${name}: switch`);
  }
  // The task sweep only takes the live records with the default runtime (tests may inject one).
  assert.match(read(`${RELEASE_DIR}/task-registry.maintenance-C4nMaDY9.js`), /taskRegistryMaintenanceRuntime !== defaultTaskRegistryMaintenanceRuntime/u);
});
