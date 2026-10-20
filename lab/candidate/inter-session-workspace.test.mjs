import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildRequest} from './client.mjs';
import {parseUnifiedDiff, applyFilePatch, applyDrafts, buildManifest, applyInterSessionWorkspace, prepareLarkShim, safeRelative,
  MANIFEST_NAME, RECEIPT_NAME, SHIM_RELATIVE, BOOTSTRAP_NAME, DEFAULT_FILES, DEFAULT_DRAFTS, sha256} from './inter-session-workspace.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const MODULE = fileURLToPath(new URL('./inter-session-workspace.mjs', import.meta.url));

function tmp(t, prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
function udiff(oldText, newText, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'udiff-'));
  try {
    const a = path.join(dir, 'a'), b = path.join(dir, 'b');
    if (oldText !== null) fs.writeFileSync(a, oldText);
    fs.writeFileSync(b, newText);
    const r = spawnSync('diff', ['-u', '--label', oldText === null ? '/dev/null' : `a/${label}`, '--label', `b/${label}`, oldText === null ? '/dev/null' : a, b], {encoding: 'utf8'});
    assert.ok(r.status === 0 || r.status === 1, r.stderr);
    return r.stdout;
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

// Synthetic stand-ins for V's private workspace: the real files never enter git or tests.
const BASE = {
  'AGENTS.md': '# AGENTS\n\n### Progress\n- 慢任务先播报。\n- **委派透明**：启动 subagent 前先说明。\n- 发过结果后 NO_REPLY。\n\n### Group Chat Rules\n- silence is the default\n',
  'REDLINES.md': '# REDLINES\n- private stays private\n',
  'SOUL.md': 'soul\n', 'IDENTITY.md': '# IDENTITY\n- Name: V\n', 'USER.md': 'user\n', 'TOOLS.md': 'tools uses cli_a9365919fc3a1bd6 and ou_cafe\n', 'MEMORY.md': 'memory\n',
  '.agents/skills/feishu-task-room-router/SKILL.md': '---\nname: router\n---\n3. Send a complete brief into the new group.\n',
  '.agents/skills/feishu-task-room-router/scripts/create_task_room.py': '#!/usr/bin/env python3\nprint("send brief as bot")\n',
  'skills/background-worker-contract/SKILL.md': 'Do not send user-visible chat messages directly unless explicitly told.\n',
  'skills/agent-to-agent-protocol-feishu-a2a-defaults/SKILL.md': '# A2A\nUse it to wake bots.',
};
const PATCHED = {
  ...BASE,
  'AGENTS.md': BASE['AGENTS.md'].replace('启动 subagent 前', '启动 subagent 或用 sessions_send 交给别的会话前')
    .replace('\n### Group Chat Rules', '\n### 跨会话协作（sessions_send）\n- 派活：timeoutSeconds=0，然后结束本轮。\n\n### Group Chat Rules'),
  '.agents/skills/feishu-task-room-router/SKILL.md': '---\nname: router\n---\n5. sessions_send the brief, timeoutSeconds=0.\n',
  '.agents/skills/feishu-task-room-router/scripts/create_task_room.py': '#!/usr/bin/env python3\nprint("pin model; brief not sent")\n',
  'skills/background-worker-contract/SKILL.md': BASE['skills/background-worker-contract/SKILL.md'] + '\nA target room may speak visibly in its own chat.\n',
  'skills/agent-to-agent-protocol-feishu-a2a-defaults/SKILL.md': '# A2A\nScope: sessions_send is not A2A.\nUse it to wake bots.',
};
const DRAFT_FILES = {
  'agents-md.diff': ['AGENTS.md'],
  'task-room-skill.diff': ['.agents/skills/feishu-task-room-router/SKILL.md', '.agents/skills/feishu-task-room-router/scripts/create_task_room.py'],
  'a2a-skill.diff': ['skills/agent-to-agent-protocol-feishu-a2a-defaults/SKILL.md'],
  'background-worker-contract.diff': ['skills/background-worker-contract/SKILL.md'],
};

function privateDir(t) {
  const dir = tmp(t, 'isc-private-');
  for (const [sub, files] of [['v-workspace', BASE], ['patched', PATCHED]])
    for (const [rel, text] of Object.entries(files)) {
      const p = path.join(dir, sub, rel);
      fs.mkdirSync(path.dirname(p), {recursive: true});
      fs.writeFileSync(p, text, {mode: rel.endsWith('.py') ? 0o700 : 0o600});
    }
  for (const [name, rels] of Object.entries(DRAFT_FILES))
    fs.writeFileSync(path.join(dir, name), rels.map(rel => udiff(BASE[rel], PATCHED[rel], rel)).join(''));
  return dir;
}

// Mirrors lab/candidate/client.mjs buildRequest + runner.mjs input placement (runner.mjs:175-179).
function placeInputs(t, support) {
  const run = tmp(t, 'isc-run-');
  const req = buildRequest(REPO, {command: ['true'], support}, 'wp9-test');
  for (const f of req.inputs) {
    const dest = path.join(run, 'inputs', f.source), bytes = Buffer.from(f.content, 'base64');
    assert.equal(sha256(bytes), f.sha256);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, bytes, {flag: 'wx', mode: 0o600});
  }
  fs.mkdirSync(path.join(run, 'data/workspace/makaron'), {recursive: true});
  return {run, inputs: path.join(run, 'inputs'), data: path.join(run, 'data'), req};
}

test('strict unified diff application reproduces diff(1) output for edge cases', () => {
  const cases = [
    ['a\nb\nc\n', 'a\nB\nc\n'], ['a\nb\nc', 'a\nb\nc\nd\n'], ['a\nb\nc\n', 'a\nb\nc'], ['a\nb', 'a\nB'],
    ['x\n'.repeat(30) + 'mid\n' + 'y\n'.repeat(30), 'x\n'.repeat(30) + 'MID\n' + 'y\n'.repeat(29) + 'z\n'],
    ['- a dash\n+ a plus\n--- three\n\nblank above\n', '- a dash\n+ a plus\n--- three\n\nblank changed\n'],
    ['first\n', 'zero\nfirst\n'], ['只有中文\n第二行\n', '只有中文\n新加的\n第二行\n'],
  ];
  for (const [oldText, newText] of cases) {
    const [patch] = parseUnifiedDiff(udiff(oldText, newText, 'f.md'));
    assert.equal(applyFilePatch(oldText, patch), newText, JSON.stringify([oldText, newText]));
  }
  const [created] = parseUnifiedDiff(udiff(null, 'new\nfile\n', 'n.md'));
  assert.equal(created.oldPath, null); assert.equal(applyFilePatch(null, created), 'new\nfile\n');
  const [patch] = parseUnifiedDiff(udiff('a\nb\nc\n', 'a\nB\nc\n', 'f.md'));
  assert.throws(() => applyFilePatch('a\nb2\nc\n', patch), /does not apply at line 2/);
  assert.throws(() => applyFilePatch('z\na\nb\nc\n', patch), /does not apply/, 'no fuzz or offset');
  assert.throws(() => parseUnifiedDiff('--- a/../etc/passwd\n+++ b/../etc/passwd\n@@ -1 +1 @@\n-a\n+b\n'), /Invalid workspace path/);
  assert.throws(() => parseUnifiedDiff('nothing here\n'), /no file patches/);
  for (const bad of ['/abs', '../x', 'a/../b', 'a\\b', 'a//b', '']) assert.throws(() => safeRelative(bad));
});

test('drafts made from the base bytes land exactly; patched copies are taken as they are', t => {
  const dir = privateDir(t);
  const fromDiffs = buildManifest({privateDir: dir});
  assert.deepEqual(fromDiffs.manifest.files.map(f => f.path), [...DEFAULT_FILES]);
  assert.deepEqual(fromDiffs.manifest.drafts.map(d => d.name), [...DEFAULT_DRAFTS]);
  assert.deepEqual(fromDiffs.manifest.drafts[1].paths, DRAFT_FILES['task-room-skill.diff']);
  for (const e of fromDiffs.manifest.expect) assert.equal(e.sha256, sha256(Buffer.from(PATCHED[e.path])), e.path);
  assert.equal(fromDiffs.manifest.files.find(f => f.path.endsWith('.py')).mode, 0o700);
  assert.ok(fs.existsSync(path.join(dir, MANIFEST_NAME)));
  assert.deepEqual(fromDiffs.support.slice(0, 3), ['lab/candidate/inter-session-workspace.mjs', SHIM_RELATIVE, path.join(dir, MANIFEST_NAME)]);
  assert.equal(fromDiffs.support.length, 3 + DEFAULT_FILES.length + DEFAULT_DRAFTS.length);
  const manifestText = fs.readFileSync(path.join(dir, MANIFEST_NAME), 'utf8');
  for (const marker of ['委派透明', 'private stays private', 'send brief as bot', 'Use it to wake bots'])
    assert.ok(!manifestText.includes(marker), 'manifest carries hashes, not file contents');

  const copies = buildManifest({privateDir: dir, filesFrom: 'patched', drafts: [], write: false}).manifest;
  assert.deepEqual(copies.expect, fromDiffs.manifest.expect);
  assert.deepEqual(copies.drafts, []);
});

test('candidate inputs placed by the real client land in the private workspace with drafts applied', async t => {
  const dir = privateDir(t);
  const {support} = buildManifest({privateDir: dir});
  const {inputs, data} = placeInputs(t, support);
  assert.ok(fs.readdirSync(path.join(inputs, 'external')).length >= DEFAULT_FILES.length, 'private files arrive under external/');
  // Use the copy that the runner placed, exactly as a candidate script would import it.
  const placed = await import(pathToFileURL(path.join(inputs, 'lab/candidate/inter-session-workspace.mjs')).href);
  const summary = placed.applyInterSessionWorkspace({dataDir: data});
  const ws = path.join(data, 'workspace/makaron');
  assert.equal(summary.workspaceDir, ws);
  for (const [rel, text] of Object.entries(PATCHED)) assert.equal(fs.readFileSync(path.join(ws, rel), 'utf8'), text, rel);
  assert.equal(fs.statSync(path.join(ws, '.agents/skills/feishu-task-room-router/scripts/create_task_room.py')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(ws, 'AGENTS.md')).mode & 0o777, 0o600);
  assert.deepEqual(summary.files.filter(f => f.drafted).map(f => f.path).sort(), Object.values(DRAFT_FILES).flat().sort());
  assert.ok(fs.existsSync(path.join(data, RECEIPT_NAME)));
  assert.ok(!fs.readdirSync(ws).some(n => n.includes('manifest') || n.includes('receipt')), 'bookkeeping stays out of the workspace');
  assert.ok(!JSON.stringify(summary).includes('委派透明'), 'the summary carries hashes, never file text');
  // Re-applying over an existing workspace is idempotent.
  placed.applyInterSessionWorkspace({dataDir: data});
  assert.equal(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), PATCHED['AGENTS.md']);
});

test('missing, tampered or unexpected inputs and unsafe destinations are refused', t => {
  const dir = privateDir(t);
  const {support, manifest} = buildManifest({privateDir: dir});
  const {inputs, data, run} = placeInputs(t, support);
  const placedAgents = fs.readdirSync(path.join(inputs, 'external'), {recursive: true}).map(String).find(p => p.endsWith('/AGENTS.md'));
  const agentsInput = path.join(inputs, 'external', placedAgents);
  const original = fs.readFileSync(agentsInput);
  fs.writeFileSync(agentsInput, original.toString() + 'tampered\n');
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data}), /Input AGENTS\.md .* not found .* plan\.support/);
  fs.rmSync(agentsInput);
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data}), /Input AGENTS\.md/);
  fs.writeFileSync(agentsInput, original);

  const wrongExpect = structuredClone(manifest);
  wrongExpect.expect[0].sha256 = '0'.repeat(64);
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data, manifest: wrongExpect}), /after drafts has sha256/);
  const traversal = structuredClone(manifest);
  traversal.files[0].path = '../escape.md';
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data, manifest: traversal}), /Invalid workspace path/);
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: ''}), /dataDir/);
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data, workspaceDir: path.join(run, 'elsewhere')}), /outside the private candidate data dir/);
  const shared = path.join(run, 'shared-workspace');
  fs.mkdirSync(shared);
  fs.symlinkSync(shared, path.join(data, 'workspace/linked'));
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data, agent: 'linked'}), /resolves outside/);
  assert.deepEqual(fs.readdirSync(shared), [], 'nothing was written through the symlink');
  // A draft that does not match the bytes it is applied to fails loudly.
  const files = new Map([['AGENTS.md', Buffer.from('other bytes\n')]]);
  assert.throws(() => applyDrafts(files, [{name: 'agents-md.diff', text: fs.readFileSync(path.join(dir, 'agents-md.diff'), 'utf8')}]), /draft does not apply/);
});

test('every profile file OpenClaw would otherwise seed from a template travels with the workspace', () => {
  // OpenClaw 9.1 ensureAgentWorkspace writes templates for missing AGENTS/SOUL/IDENTITY/USER
  // (IDENTITY's says "Who Am I? Fill this in"). Shipping all four keeps the candidate V's identity.
  for (const name of ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md']) assert.ok(DEFAULT_FILES.includes(name), name);
  // Never V's heartbeat checklist, never a first-run script.
  for (const name of ['HEARTBEAT.md', BOOTSTRAP_NAME]) assert.ok(!DEFAULT_FILES.includes(name), name);
});

test('a workspace the Gateway already seeded as brand new is refused before anything is written', t => {
  const dir = privateDir(t);
  const {support} = buildManifest({privateDir: dir});
  const {inputs, data} = placeInputs(t, support);
  const ws = path.join(data, 'workspace/makaron');
  // What a 9.1 Gateway leaves in an empty workspace on first start: templates plus BOOTSTRAP.md.
  fs.writeFileSync(path.join(ws, 'IDENTITY.md'), '# IDENTITY.md - Who Am I?\n');
  fs.writeFileSync(path.join(ws, BOOTSTRAP_NAME), '# BOOTSTRAP.md - Hello, World\n');
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data}), /BOOTSTRAP\.md exists: the Gateway already seeded/);
  assert.deepEqual(fs.readdirSync(ws).sort(), [BOOTSTRAP_NAME, 'IDENTITY.md'], 'no draft landed next to the first-run script');
  assert.equal(fs.readFileSync(path.join(ws, 'IDENTITY.md'), 'utf8'), '# IDENTITY.md - Who Am I?\n');
  assert.ok(!fs.existsSync(path.join(data, RECEIPT_NAME)));
  // Applied first, the real identity is in place before any Gateway looks.
  fs.rmSync(path.join(ws, BOOTSTRAP_NAME)); fs.rmSync(path.join(ws, 'IDENTITY.md'));
  applyInterSessionWorkspace({inputsDir: inputs, dataDir: data});
  assert.equal(fs.readFileSync(path.join(ws, 'IDENTITY.md'), 'utf8'), BASE['IDENTITY.md']);
});

test('candidate-only replacements swap production identifiers and report only counts and hashes', t => {
  const dir = privateDir(t);
  const {support} = buildManifest({privateDir: dir});
  const {inputs, data} = placeInputs(t, support);
  const summary = applyInterSessionWorkspace({inputsDir: inputs, dataDir: data,
    replacements: [{from: 'cli_a9365919fc3a1bd6', to: 'cli_aae2c999c7789bd9'}, {from: 'ou_cafe', to: 'ou_beef'}]});
  assert.equal(fs.readFileSync(path.join(data, 'workspace/makaron/TOOLS.md'), 'utf8'), 'tools uses cli_aae2c999c7789bd9 and ou_beef\n');
  assert.deepEqual(summary.replacements.map(r => r.count), [1, 1]);
  assert.ok(!JSON.stringify(summary).includes('cli_a9365919fc3a1bd6'));
  assert.throws(() => applyInterSessionWorkspace({inputsDir: inputs, dataDir: data, replacements: [{from: '', to: 'x'}]}), /replacements/);
});

test('prepareLarkShim puts the shim first on PATH with a private HOME and a baked-in pool', t => {
  const dir = privateDir(t);
  const {support} = buildManifest({privateDir: dir});
  const {inputs, data} = placeInputs(t, support);
  const pool = ['oc_0000000000000000000000000000000a', 'oc_0000000000000000000000000000000b'];
  assert.throws(() => prepareLarkShim({inputsDir: inputs, dataDir: data, pool: ['chat-1']}), /pool/);
  const shim = prepareLarkShim({inputsDir: inputs, dataDir: data, pool, pathEnv: '/usr/bin:/bin'});
  assert.equal(shim.env.PATH.split(':')[0], path.join(data, 'bin'));
  assert.equal(shim.env.HOME, path.join(data, 'home'));
  assert.equal(fs.statSync(shim.wrapper).mode & 0o777, 0o700);
  const run = env => spawnSync('lark-cli', ['im', '+chat-create', '--name', 'V｜房间｜1020', '--users', 'ou_0abc'], {env, encoding: 'utf8'});
  // The agent's exec env may carry only PATH and HOME: the wrapper supplies pool and log location.
  const r = run({PATH: shim.env.PATH, HOME: shim.env.HOME});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).data.chat_id, pool[0]);
  assert.equal(JSON.parse(fs.readFileSync(shim.log, 'utf8').trim()).network, 'none');
  // The shim checks the HOME it actually runs under: production config there is refused.
  const prodHome = path.join(data, 'prod-home');
  fs.mkdirSync(path.join(prodHome, '.lark-cli'), {recursive: true});
  fs.writeFileSync(path.join(prodHome, '.lark-cli/config.json'), '{"appId":"cli_a9365919fc3a1bd6"}');
  assert.equal(run({PATH: shim.env.PATH, HOME: prodHome}).status, 4);
  assert.throws(() => prepareLarkShim({inputsDir: inputs, dataDir: data, pool, home: prodHome}), /\.lark-cli exists/);
  assert.throws(() => prepareLarkShim({inputsDir: tmp(t, 'no-shim-'), dataDir: data, pool}), /not among the inputs/);
});

test('the CLI prints the plan support stanza and applies a manifest', t => {
  const dir = privateDir(t);
  const out = JSON.parse(execFileSync(process.execPath, [MODULE, 'manifest', '--private-dir', dir], {encoding: 'utf8'}));
  assert.equal(out.manifest, path.join(dir, MANIFEST_NAME));
  assert.equal(out.files, DEFAULT_FILES.length); assert.equal(out.drafts, DEFAULT_DRAFTS.length);
  const {inputs, data} = placeInputs(t, out.support);
  const applied = JSON.parse(execFileSync(process.execPath, [path.join(inputs, 'lab/candidate/inter-session-workspace.mjs'), 'apply', '--data-dir', data], {encoding: 'utf8'}));
  assert.equal(applied.files.length, DEFAULT_FILES.length);
  const none = JSON.parse(execFileSync(process.execPath, [MODULE, 'manifest', '--private-dir', dir, '--files-from', 'patched', '--drafts', 'none'], {encoding: 'utf8'}));
  assert.equal(none.drafts, 0);
  assert.equal(spawnSync(process.execPath, [MODULE, 'bogus']).status, 2);
});
