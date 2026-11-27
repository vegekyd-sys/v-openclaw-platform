// Global skills: pinned files only, owner's own skills untouched, lark-* written from the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { verifySkillDir, larkSkillFiles, installSkills } from './skills.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tmpdir = (t, p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const write = (f, s, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); if (mode) fs.chmodSync(f, mode); };

test('runtime/skills.json pins every GitHub skill to a full commit with per-file hashes, and leaves pptx out', () => {
  const spec = JSON.parse(fs.readFileSync(new URL('../../runtime/skills.json', import.meta.url), 'utf8'));
  const names = spec.github.map((s) => s.name);
  for (const n of ['frontend-design', 'frontend-slides', 'remotion-best-practices', 'hyperframes', 'media-use', 'reverse-any-video', 'style-sampling']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('pptx'));
  for (const s of spec.github) {
    assert.match(s.commit, /^[0-9a-f]{40}$/, s.name);
    assert.ok(Object.keys(s.files).includes('SKILL.md'), `${s.name} has SKILL.md`);
    for (const h of Object.values(s.files)) assert.match(h, /^[0-9a-f]{64}$/);
  }
  const tools = JSON.parse(fs.readFileSync(new URL('../../runtime/tools.json', import.meta.url), 'utf8')).npm;
  for (const [name, t] of Object.entries(tools)) if (t.skills || t.skillCommand) assert.ok(fs.existsSync(new URL(`../../runtime/locks/${t.lock}/package-lock.json`, import.meta.url)), `${name} lock`);
});

test('a fetched skill must have exactly the pinned bytes', (t) => {
  const d = tmpdir(t, 'v-skill-');
  write(path.join(d, 'SKILL.md'), 'a');
  write(path.join(d, 'ref/x.md'), 'b');
  assert.equal(verifySkillDir(d, { 'SKILL.md': sha('a'), 'ref/x.md': sha('b') }).ok, true);
  assert.deepEqual(verifySkillDir(d, { 'SKILL.md': sha('a') }).extra, ['ref/x.md']);
  assert.deepEqual(verifySkillDir(d, { 'SKILL.md': sha('A'), 'ref/x.md': sha('b') }).changed, ['SKILL.md']);
  assert.deepEqual(verifySkillDir(d, { 'SKILL.md': sha('a'), 'ref/x.md': sha('b'), 'gone.md': sha('c') }).missing, ['gone.md']);
});

test('lark-* skills are listed recursively from the CLI', () => {
  const tree = { 'lark-doc': [{ path: 'lark-doc/SKILL.md', is_dir: false }, { path: 'lark-doc/references', is_dir: true }], 'lark-doc/references': [{ path: 'lark-doc/references/api.md', is_dir: false }] };
  const lark = (args) => (args.length === 2 ? JSON.stringify({ skills: [{ name: 'lark-doc' }] }) : JSON.stringify({ entries: tree[args[2]] }));
  assert.deepEqual(larkSkillFiles(lark), [{ skill: 'lark-doc', file: 'SKILL.md' }, { skill: 'lark-doc', file: 'references/api.md' }]);
});

test('install: npm, lark and GitHub skills land in ~/.openclaw/skills; a tampered download and the owner\'s own skill are left out', (t) => {
  const root = tmpdir(t, 'v-skills-e2e-');
  const release = path.join(root, 'release');
  const toolsRoot = path.join(root, 'tools');
  const home = path.join(root, 'home');
  const upstream = path.join(root, 'upstream');
  write(path.join(upstream, 'skills/good/SKILL.md'), 'good');
  write(path.join(upstream, 'skills/bad/SKILL.md'), 'tampered');
  write(path.join(release, 'runtime/skills.json'), JSON.stringify({ target: '.openclaw/skills', lark: { tool: 'lark' }, github: [
    { name: 'good', repo: 'o/r', commit: 'a'.repeat(40), path: 'skills/good', files: { 'SKILL.md': sha('good') } },
    { name: 'bad', repo: 'o/r', commit: 'a'.repeat(40), path: 'skills/bad', files: { 'SKILL.md': sha('bad') } },
  ] }));
  write(path.join(release, 'runtime/tools.json'), JSON.stringify({ npm: {
    mk: { package: 'mk', version: '1.0.0', bin: 'mk', skills: { makaron: 'skills/makaron' } },
    lark: { package: 'lark', version: '1.0.0', bin: 'lark' },
  } }));
  write(path.join(toolsRoot, 'mk-1.0.0/node_modules/mk/skills/makaron/SKILL.md'), 'mk skill');
  write(path.join(toolsRoot, 'lark-1.0.0/node_modules/.bin/lark'), '#!/bin/sh\ncase "$*" in\n  "skills list") echo \'{"skills":[{"name":"lark-im"}]}\' ;;\n  "skills list lark-im") echo \'{"entries":[{"path":"lark-im/SKILL.md","is_dir":false}]}\' ;;\n  "skills read lark-im/SKILL.md") echo "# lark im" ;;\nesac\n', 0o755);
  write(path.join(home, '.openclaw/skills/makaron/SKILL.md'), 'the owner wrote this');
  const run = (cmd, args) => {
    if (cmd === 'chown') return '';
    if (cmd === 'curl') {
      const r = spawnSync('tar', ['-czf', args[args.indexOf('-o') + 1], '-C', root, 'upstream']);
      if (r.status !== 0) throw new Error('fake curl');
      return '';
    }
    if (cmd === 'runuser') { const rest = args.slice(args.indexOf('--') + 1); const r = spawnSync(rest[0], rest.slice(1), { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout; }
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr}`);
    return r.stdout;
  };
  const r = installSkills({ releaseDir: release, toolsRoot, home, user: 'nobody', uid: process.getuid(), gid: process.getgid(), nodeBin: path.dirname(process.execPath), run });
  const skills = path.join(home, '.openclaw/skills');
  assert.deepEqual(r.installed, ['good', 'lark-im']);
  assert.equal(fs.readFileSync(path.join(skills, 'lark-im/SKILL.md'), 'utf8'), '# lark im\n');
  assert.equal(fs.readFileSync(path.join(skills, 'good/SKILL.md'), 'utf8'), 'good');
  assert.match(r.failed.bad, /does not match the pinned files/);
  assert.ok(!fs.existsSync(path.join(skills, 'bad')));
  assert.match(r.failed.makaron, /not installed by v-distro/);
  assert.equal(fs.readFileSync(path.join(skills, 'makaron/SKILL.md'), 'utf8'), 'the owner wrote this');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(skills, '.v-distro-skills.json'), 'utf8'))).sort(), ['good', 'lark-im']);
});
