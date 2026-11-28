// A workspace follows the release's payload without losing what the owner or the agent changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { globToRegex, managedPaths, mergeFile, mergeSections, updateWorkspace } from './workspace-update.mjs';

const B = (s) => (s == null ? null : Buffer.from(s));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v-ws-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const put = (dir, files) => { for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); } };
const policy = { system: ['skills/**', 'scripts/**', 'schedules.json'], sections: ['AGENTS.md'], owner: ['memory/**', 'USER.md', 'skills/mine/**'] };

test('globs: ** spans directories, * stays in one; owner beats system', () => {
  assert.ok(globToRegex('skills/**').test('skills/a/b/SKILL.md'));
  assert.ok(!globToRegex('scripts/*.py').test('scripts/x/y.py'));
  assert.deepEqual(managedPaths(policy, ['skills/a/SKILL.md', 'skills/mine/SKILL.md', 'memory/x.md', 'USER.md', 'AGENTS.md', 'notes.md']), ['AGENTS.md', 'skills/a/SKILL.md']);
});

test('three-way per file', () => {
  assert.deepEqual(mergeFile(B('a'), B('a'), B('b')), { action: 'update', content: B('b') });
  assert.deepEqual(mergeFile(B('a'), B('x'), B('b')), { action: 'conflict', content: B('b') });
  assert.deepEqual(mergeFile(B('a'), B('b'), B('b')), { action: 'unchanged' });
  assert.deepEqual(mergeFile(B('a'), null, B('b')), { action: 'kept-deleted' });
  assert.deepEqual(mergeFile(null, null, B('b')), { action: 'add', content: B('b') });
  assert.deepEqual(mergeFile(B('a'), B('a'), null), { action: 'delete' });
  assert.deepEqual(mergeFile(B('a'), B('x'), null), { action: 'kept-modified' });
  assert.deepEqual(mergeFile(null, B('x'), B('b')), { action: 'conflict', content: B('b') });
});

test('sections: system blocks follow the release, the owner\'s text around them stays', () => {
  const sec = (id, body) => `<!-- v-distro:begin ${id} -->\n${body}\n<!-- v-distro:end ${id} -->`;
  const base = `# Rules\n${sec('core', 'v1')}\n`;
  const cur = `# Rules\nmy own line\n${sec('core', 'v1')}\nanother of mine\n`;
  const next = `# Rules\n${sec('core', 'v2')}\n${sec('room', 'task rooms')}\n`;
  const r = mergeSections(B(base), B(cur), B(next));
  assert.equal(r.action, 'update');
  const text = r.content.toString();
  assert.match(text, /my own line/);
  assert.match(text, /another of mine/);
  assert.match(text, /v2/);
  assert.match(text, /task rooms/);
  assert.doesNotMatch(text, /v1/);
  // they edited the core section: kept, next goes to .new
  const edited = cur.replace('v1', 'v1 + mine');
  const c = mergeSections(B(base), B(edited), B(next));
  assert.equal(c.action, 'update-partial');
  assert.deepEqual(c.sections, ['core']);
  assert.match(c.content.toString(), /v1 \+ mine/);
  assert.match(c.content.toString(), /task rooms/);
  // no markers yet (seeded before sections existed): whole-file three-way
  assert.equal(mergeSections(B('# old'), B('# old'), B(next)).action, 'update');
  assert.equal(mergeSections(B('# old'), B('# old, edited'), B(next)).action, 'conflict');
});

test('workspace: system files move to the release, the owner\'s and edited ones do not', (t) => {
  const root = tmp(t);
  const [base, ws, next] = ['base', 'ws', 'next'].map((d) => path.join(root, d));
  put(base, { 'skills/a/SKILL.md': 'a1', 'skills/b/SKILL.md': 'b1', 'scripts/old.py': 'old', 'schedules.json': '[1]', 'USER.md': 'template' });
  put(ws, { 'skills/a/SKILL.md': 'a1', 'skills/b/SKILL.md': 'b1 edited by the agent', 'scripts/old.py': 'old', 'schedules.json': '[1]', 'USER.md': 'the owner, filled in', 'memory/2026-11-27.md': 'what happened', 'skills/mine/SKILL.md': 'owner skill' });
  put(next, { 'skills/a/SKILL.md': 'a2', 'skills/b/SKILL.md': 'b2', 'scripts/temp-preview.py': 'new script', 'schedules.json': '[1,2]', 'USER.md': 'template v2' });
  const r = updateWorkspace({ workspace: ws, baseDir: base, nextDir: next, policy });
  const read = (p) => fs.readFileSync(path.join(ws, p), 'utf8');
  assert.equal(read('skills/a/SKILL.md'), 'a2');
  assert.equal(read('skills/b/SKILL.md'), 'b1 edited by the agent');
  assert.equal(read('skills/b/SKILL.md.new'), 'b2');
  assert.equal(read('scripts/temp-preview.py'), 'new script');
  assert.ok(!fs.existsSync(path.join(ws, 'scripts/old.py')), 'dropped by the release and untouched here');
  assert.equal(read('schedules.json'), '[1,2]');
  assert.equal(read('USER.md'), 'the owner, filled in');
  assert.equal(read('memory/2026-11-27.md'), 'what happened');
  assert.equal(read('skills/mine/SKILL.md'), 'owner skill');
  assert.deepEqual(r.updated.sort(), ['schedules.json', 'skills/a/SKILL.md']);
  assert.deepEqual(r.added, ['scripts/temp-preview.py']);
  assert.deepEqual(r.deleted, ['scripts/old.py']);
  assert.deepEqual(r.conflicts, [{ path: 'skills/b/SKILL.md', newFile: 'skills/b/SKILL.md.new' }]);
  // rollback is the same move the other way: base = what we just applied, next = the old payload
  const back = updateWorkspace({ workspace: ws, baseDir: next, nextDir: base, policy });
  assert.equal(read('skills/a/SKILL.md'), 'a1');
  assert.equal(read('scripts/old.py'), 'old');
  assert.ok(!fs.existsSync(path.join(ws, 'scripts/temp-preview.py')));
  assert.equal(read('USER.md'), 'the owner, filled in');
  assert.ok(back.updated.includes('schedules.json'));
});

test('dry run writes nothing', (t) => {
  const root = tmp(t);
  const [base, ws, next] = ['base', 'ws', 'next'].map((d) => path.join(root, d));
  put(base, { 'skills/a/SKILL.md': 'a1' }); put(ws, { 'skills/a/SKILL.md': 'a1' }); put(next, { 'skills/a/SKILL.md': 'a2' });
  assert.deepEqual(updateWorkspace({ workspace: ws, baseDir: base, nextDir: next, policy, dryRun: true }).updated, ['skills/a/SKILL.md']);
  assert.equal(fs.readFileSync(path.join(ws, 'skills/a/SKILL.md'), 'utf8'), 'a1');
});
