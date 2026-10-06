import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GAP_MARKER, patchAgentCommandChunk, patchBuiltinChunk, patchCoordinator, patchEmbeddedAgentChunk } from './patch-firsttext-gap-marks.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const capture = path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist');
const release = path.join(repo, 'lab/release-files/firsttext-gap-marks');
const read = (file) => fs.readFileSync(file, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

for (const [name, patch, marks] of [
  ['agent-command-DPfawBbr.js', patchAgentCommandChunk, 26],
  ['embedded-agent-DaSvA-Yk.js', patchEmbeddedAgentChunk, 7],
  ['builtin-openclaw-zQV8Wwjr.js', patchBuiltinChunk, 5],
]) {
  test(`${name}: release file is the patched V capture and only adds marks`, () => {
    const base = read(path.join(capture, name));
    const patched = read(path.join(release, name));
    assert.equal(sha(patch(base)), sha(patched));
    assert.throws(() => patch(patched), /already patched/);
    assert.equal(patched.split('firsttextGapMark(').length - 1, marks);
    assert.ok(patched.includes(GAP_MARKER));
    // Removing every added line except the try/finally wrapper restores the original.
    const stripped = patched
      .replace(/^import \{ firsttextGapMark \}.*\n/m, '')
      .replace(/^import \{ firsttextGapMark, firsttextSkillDetail, firsttextWatchSkillsBumps \}.*\nimport \{ i as firsttextRegisterSkillsChange \} from "\.\/refresh-state-DHnXO3IV\.js";\nfirsttextWatchSkillsBumps\(firsttextRegisterSkillsChange\);\n/m, '')
      .replace(/\t\t\tprepare: async \(preparedOpts\) => \{\n\t\t\t\tfirsttextGapMark\("cmd-prepare-enter", opts\.runId\);\n\t\t\t\ttry \{\n\t\t\t\t\treturn await (prepareAgentCommandExecution\(preparedOpts, runtime, runtimeContext\));\n\t\t\t\t\} finally \{\n\t\t\t\t\tfirsttextGapMark\("cmd-prepare-end", opts\.runId\);\n\t\t\t\t\}\n\t\t\t\},\n/, '\t\t\tprepare: async (preparedOpts) => await $1,\n')
      .replace(/\t\t\t\{\n\t\t\t\tconst markStartupStage = startupStages\.mark;\n[\s\S]*?\n\t\t\t\}\n/, '')
      .replace(/\t\t\{\n\t\t\tconst markCorePluginToolStage = corePluginToolStages\.mark;\n[\s\S]*?\n\t\t\}\n/, '')
      .replace('\t\ttry {\n\t\t\treturn await measureEmbeddedAgentPreparation(stage, run, { config: options.config });\n\t\t} finally {\n\t\t\tfirsttextGapMark(`att-end:${stage}`, options.runId);\n\t\t}\n', '\t\treturn measureEmbeddedAgentPreparation(stage, run, { config: options.config });\n')
      .replace('\t\trunId: params.runId,\n\t\tconfig: params.config,\n', '\t\tconfig: params.config,\n')
      .replace(/^\t*firsttextGapMark\(.*\);\n/gm, '');
    assert.equal(stripped, base);
  });
}

test('marks are silent unless enabled and only carry validated timing fields', () => {
  const script = `
    const { firsttextGapMark } = await import(${JSON.stringify(path.join(release, 'firsttext-gap-marks.mjs'))});
    const id = '4efda310-0000-4000-8000-000000000000';
    firsttextGapMark('off', id);
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '1';
    firsttextGapMark('cmd-ingress-enter', id);
    firsttextGapMark('emb-stage:attempt-dispatch', id);
    firsttextGapMark('bad stage!', id);
    firsttextGapMark('ok', 'not-a-run-id');
    process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS = '0';
    firsttextGapMark('disabled', id);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stderr.trim().split('\n').map((line) => JSON.parse(line.replace('[firsttext-gap.1] ', '')));
  assert.deepEqual(rows.map((row) => row.stage), ['cmd-ingress-enter', 'emb-stage:attempt-dispatch']);
  assert.deepEqual(Object.keys(rows[1]).sort(), ['atMs', 'loopBusyPct', 'monoMs', 'pid', 'runId', 'sincePrevMs', 'stage', 'v']);
});

test('agent-db-process-coordinator.mjs: lease log is additive and reports long waits and holds', async () => {
  const name = 'agent-db-process-coordinator.mjs';
  const base = read(path.join(capture, name));
  const patched = read(path.join(release, name));
  assert.equal(sha(patchCoordinator(base)), sha(patched));
  assert.throws(() => patchCoordinator(patched), /already patched/);
  const script = `
    const m = await import(${JSON.stringify(path.join(release, name))});
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '1';
    const lease = () => ({ release() {} });
    let n = 0;
    const busyAcquire = () => (++n > 3 ? lease() : null);
    const syncResult = m.withAgentDatabaseProcessLeaseSync({ databasePath: '/tmp/x.sqlite', acquire: busyAcquire, fn: () => { const end = Date.now() + 30; while (Date.now() < end) {} return 7; } });
    const quick = m.withAgentDatabaseProcessLeaseSync({ databasePath: '/tmp/y.sqlite', acquire: lease, fn: () => 1 });
    const asyncResult = await m.withAgentDatabaseProcessLease({ databasePath: '/tmp/z.sqlite', acquire: lease, fn: async () => { await new Promise(r => setTimeout(r, 40)); return 9; } });
    console.log(JSON.stringify([syncResult, quick, asyncResult]));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '[7,1,9]');
  const rows = result.stderr.trim().split('\n').map((line) => JSON.parse(line.replace('[firsttext-lease.1] ', '')));
  assert.deepEqual(rows.map((row) => row.mode), ['sync', 'async']);
  assert.ok(rows[0].holdMs >= 20 && rows[0].attempts === 4);
  assert.ok(rows[1].holdMs >= 20);
});

test('round 3: skill detail and skills bump lines carry only validated fields', () => {
  const script = `
    const m = await import(${JSON.stringify(path.join(release, 'firsttext-gap-marks.mjs'))});
    const listeners = [];
    m.firsttextWatchSkillsBumps((l) => listeners.push(l));
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '1';
    m.firsttextWatchSkillsBumps((l) => listeners.push(l));
    m.firsttextWatchSkillsBumps((l) => listeners.push(l));
    listeners[0]({ workspaceDir: '/w', reason: 'watch', changedPath: '/w/skills/a/SKILL.md' });
    const id = '4efda310-0000-4000-8000-000000000000';
    const detail = m.firsttextSkillDetail(false, { version: 1, promptFormatVersion: 4 }, { snapshotVersion: Date.now(), shouldRefresh: true });
    m.firsttextGapMark('cmd-session-state:skills-snapshot', id, detail);
    m.firsttextGapMark('cmd-session-state:skills-snapshot', id, 'bad detail {}');
    console.error('LISTENERS ' + listeners.length);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.at(-1), 'LISTENERS 1');
  const bump = JSON.parse(lines[0].replace('[firsttext-skills-bump.1] ', ''));
  assert.deepEqual([bump.reason, bump.workspace, bump.changedPath], ['watch', true, '/w/skills/a/SKILL.md']);
  const marks = lines.filter((l) => l.startsWith('[firsttext-gap.1] ')).map((l) => JSON.parse(l.slice(18)));
  assert.match(marks[0].detail, /^new=0,existing=1,refresh=1,older=1,prompt=0,hydrate=1,verSinceStartS=\d+$/);
  assert.equal(marks[1].detail, undefined);
});
