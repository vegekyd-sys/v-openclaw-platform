import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG_GUARD, CONFIG_GUARD_BEFORE_SHA, MARKER, patchConfigGuard, sha256, unpatchConfigGuard } from './patch-infer-latency.mjs';

// infer-latency: `openclaw infer` / `openclaw capability` skip the config guard's state migration
// preflight (whole-database backup + integrity check). See docs/infer-latency-20261117.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/infer-latency.plan.json'));
const released = read(`lab/release-files/infer-latency/${CONFIG_GUARD}`);

test('plan pins V bytes before and the release file after', () => {
  const [file] = plan.files;
  assert.equal(plan.files.length, 1);
  assert.equal(file.target, `openclaw/dist/${CONFIG_GUARD}`);
  assert.equal(file.before, CONFIG_GUARD_BEFORE_SHA);
  assert.equal(sha256(unpatchConfigGuard(released)), CONFIG_GUARD_BEFORE_SHA, 'V bytes');
  assert.equal(sha256(released), file.after);
  assert.equal(patchConfigGuard(unpatchConfigGuard(released)), released);
  assert.throws(() => patchConfigGuard(released), /already patched/);
});

const shouldConsider = () => {
  const line = released.split('\n').find((l) => l.includes('const shouldConsiderStateMigration ='));
  const expr = line.slice(line.indexOf('=') + 1).trim().replace(/;$/, '');
  return new Function('params', 'commandName', 'subcommandName', 'isRestartController', `return ${expr};`);
};

test('infer and its capability alias no longer consider state migration', () => {
  const consider = shouldConsider();
  const run = (name, sub) => consider({ validateConfigOnly: false }, name, sub, false);
  assert.equal(run('infer', 'model'), false);
  assert.equal(run('capability', 'model'), false);
  // Everything the npm guard migrated before still migrates.
  for (const [name, sub] of [['message', undefined], ['agent', undefined], ['gateway', 'run'], ['gateway', undefined], ['models', 'list'], ['plugins', 'list'], ['unknown-command', undefined], [undefined, undefined]]) {
    assert.equal(run(name, sub), true, `${name} ${sub}`);
  }
  for (const [name, sub] of [['config', 'get'], ['health', undefined], ['logs', undefined], ['sessions', undefined], ['gateway', 'call'], ['update', 'status']]) {
    assert.equal(run(name, sub), false, `${name} ${sub}`);
  }
  assert.equal(consider({ validateConfigOnly: false }, 'gateway', 'restart', true), false);
});

test('the patch only adds the two commands and a marker comment', () => {
  const before = unpatchConfigGuard(released).split('\n');
  const after = released.split('\n');
  assert.equal(after.length, before.length + 2);
  assert.ok(released.includes(`// ${MARKER}:`));
  const changed = after.filter((line) => !before.includes(line));
  assert.equal(changed.length, 3);
  const guard = changed.find((line) => line.includes('const shouldConsiderStateMigration ='));
  const original = before.find((line) => line.includes('const shouldConsiderStateMigration ='));
  assert.equal(guard.replace('commandName !== "infer" && commandName !== "capability" && ', ''), original);
});
