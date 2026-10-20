import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-subagent-scoped-row-index.mjs';

// subagent-scoped-row-index: single session rows read only the subagent runs their answers depend on.
// See lab/subagent-scoped-row-index.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/subagent-scoped-row-index.plan.json'));

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target.replace('openclaw/dist/', '')), Object.keys(FILES));
  for (const file of plan.files) {
    const name = file.target.replace('openclaw/dist/', '');
    const release = read(file.source);
    const base = unpatchFile(name, release);
    assert.equal(sha256(base), file.before, `${name}: V bytes`);
    assert.equal(file.before, FILES[name].before);
    assert.equal(sha256(release), file.after, `${name}: release bytes`);
    assert.equal(patchFile(name, base), release, `${name}: release file is the patcher applied to V bytes`);
    assert.throws(() => patchFile(name, release), /already patched/u);
    assert(release.includes(MARKER));
  }
});

test('only the single-row index sites change; the switch keeps the whole-registry index', () => {
  const removed = {};
  for (const name of Object.keys(FILES)) {
    const release = read(`${RELEASE_DIR}/${name}`);
    const lines = new Set(release.split('\n'));
    removed[name] = unpatchFile(name, release).split('\n').filter((line) => !lines.has(line)).map((line) => line.trim().slice(0, 70));
  }
  assert.deepEqual(removed, {
    'subagent-registry.store.sqlite-hzGu4QSk.js': [],
    'session-utils-list-BUP03AzS.js': [
      'import { w as subagentRunRegistry } from "./subagent-registry.store.sq',
      'function buildSingleRowSubagentRunIndex(now) {',
      'const subagentIndex = rowContext?.subagentRuns ?? params.subagentRuns ',
      // loadGatewaySessionSnapshot and buildGatewaySessionInfo
      'const subagentRuns = buildSingleRowSubagentRunIndex(now);',
      'const subagentRuns = buildSingleRowSubagentRunIndex(now);',
    ],
  });
  const list = read(`${RELEASE_DIR}/session-utils-list-BUP03AzS.js`);
  assert.match(list, /process\.env\.OPENCLAW_V_SCOPED_ROW_SUBAGENT_RUNS !== "0"/u);
  // Without a scope, or on any error, the original whole-registry index is built.
  assert.match(list, /\} catch \{\}\n\treturn buildSubagentRunReadIndexFromRuns\(\{\n\t\truns: getSubagentRunsSnapshotForRead\(subagentRunRegistry\),/u);
  assert.match(read(`${RELEASE_DIR}/subagent-registry.store.sqlite-hzGu4QSk.js`), /export \{ loadSubagentRunTreeFromSqlite \};/u);
});
