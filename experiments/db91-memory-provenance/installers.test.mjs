import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const variants = [
  ['memory-provenance', process.env.DB91_NATIVE_MEMORY_SCHEMA ?? '/private/tmp/db91-memory-schema-BSs9MQgq.js', 'memory-schema-BSs9MQgq.js'],
  ['maintenance-throttle', process.env.DB91_NATIVE_SESSION_ENTRY ?? '/private/tmp/db91-session-accessor.sqlite-entry-BlklNPKQ.js', 'session-accessor.sqlite-entry-BlklNPKQ.js'],
];
for (const [name, fixture, filename] of variants) {
  function setup(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'db91-installer-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const core = path.join(root, 'core'), backup = path.join(root, 'backup');
    fs.mkdirSync(path.join(core, 'dist'), {recursive: true});
    fs.copyFileSync(fixture, path.join(core, 'dist', filename));
    const installer = fileURLToPath(new URL('../../scripts/patch-db91-' + name + '.mjs', import.meta.url));
    const run = action => execFileSync(process.execPath, [installer, action, core, backup], {encoding: 'utf8', stdio: 'pipe'});
    run('ensure');
    return {run, plan: JSON.parse(fs.readFileSync(path.join(backup, 'changes.json')))};
  }
  test(name + ': idempotent install and partial-install rollback preserve native bytes', t => {
    const {run, plan} = setup(t);
    assert.equal(JSON.parse(run('ensure')).files, 2);
    for (const p of plan) execFileSync(process.execPath, ['--check', '--input-type=module'], {input: p.after, stdio: 'pipe'});
    fs.writeFileSync(plan[0].filename, plan[0].before);
    assert.throws(() => run('ensure'));
    assert.equal(JSON.parse(run('rollback')).files, 2);
    assert.equal(fs.readFileSync(plan[0].filename, 'utf8'), plan[0].before);
    assert(!fs.existsSync(plan[1].filename));
    assert.equal(JSON.parse(run('rollback')).files, 2);
  });
  test(name + ': rollback checks the entire file set before changing any file', t => {
    const {run, plan} = setup(t);
    fs.appendFileSync(plan[1].filename, '\n// unrelated concurrent edit\n');
    assert.throws(() => run('rollback'));
    assert.equal(fs.readFileSync(plan[0].filename, 'utf8'), plan[0].after);
    assert(fs.readFileSync(plan[1].filename, 'utf8').endsWith('// unrelated concurrent edit\n'));
  });
}
