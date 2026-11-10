import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-codex-skill-usage.mjs';
import { OUTPUT_DIR, PLAN } from './build-codex-skill-usage.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const CHUNK = 'agent-tools.before-tool-call-g2OT63u5.js';

test('plan lists the three patched files with V before-bytes and built after-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
  for (const f of plan.files) {
    assert.equal(f.source, `${OUTPUT_DIR}/${path.basename(f.target)}`);
    assert.equal(sha(fs.readFileSync(path.join(repo, f.source))), f.after);
  }
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), file.name);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(sha(out), file.before);
  }
});

test('the SDK re-exports the chunk helper and the Codex projector calls it for completed commands', () => {
  assert.match(read(CHUNK), /recordNativeCommandSkillUsage as codexSkillUsageV1 \};/u);
  const sdk = read('agent-harness-runtime.js');
  assert.match(sdk, /codexSkillUsageV1 as recordNativeCommandSkillUsage \} from "\.\.\/agent-tools\.before-tool-call-g2OT63u5\.js";/u);
  assert.match(sdk, /export \{[^}]* recordNativeCommandSkillUsage, runBeforeToolCallHook,/u);
  const codex = read('run-attempt-D1hJO4fX.js');
  assert.match(codex, / recordNativeCommandSkillUsage, runAgentHarnessAfterCompactionHook,[^;]*from "openclaw\/plugin-sdk\/agent-harness-runtime";/u);
  const start = codex.indexOf('async handleItemCompleted(params) {');
  const handler = codex.slice(start, codex.indexOf('const itemId = item?.id ?? readStringField(params, "itemId");', start));
  assert.match(handler, /item\?\.type === "commandExecution" && itemStatus\(item\) === "completed"\) try \{/u);
  assert.match(handler, /skillsSnapshot: this\.params\.skillsSnapshot/u);
  assert.match(handler, /\} catch \{\}/u);
});

// Evaluate the compiled helper from the patched chunk with stand-ins for the chunk's own bindings.
function loadHelper() {
  const src = read(CHUNK);
  const start = src.indexOf('//#region src/agents/native-command-skill-usage.ts');
  const end = src.indexOf('//#endregion', start);
  const recorded = [];
  const emitted = [];
  const snapshotFiles = new Map();
  const findSkillUsageMatch = ({ toolName, toolParams }) => {
    assert.equal(toolName, 'read');
    const name = snapshotFiles.get(toolParams.path);
    return name ? { skillName: name, skillSource: 'workspace', activation: 'read', skillFile: toolParams.path } : undefined;
  };
  const factory = new Function('path', 'os', 'process', 'findSkillUsageMatch', 'recordRunSkillUsage', 'emitSkillUsedDiagnostic',
    `${src.slice(start, end)}\nreturn { extractSkillFileReads, recordNativeCommandSkillUsage };`);
  return (env = {}) => ({
    ...factory(path, { homedir: () => '/home/openclaw' }, { env }, findSkillUsageMatch, (r) => recorded.push(r), (e) => emitted.push(e)),
    recorded,
    emitted,
    snapshotFiles,
  });
}

const WS = '/home/openclaw/makaron-openclaw/.openclaw-local/workspace';

test('compiled helper recognizes the reads seen on V and nothing else', () => {
  const { extractSkillFileReads } = loadHelper()();
  const read1 = (command, cwd) => extractSkillFileReads({ command, cwd });
  assert.deepEqual(read1(`sed -n 1,120p ${WS}/skills/video-text-removal/SKILL.md`), [`${WS}/skills/video-text-removal/SKILL.md`]);
  assert.deepEqual(read1(`/bin/bash -lc 'cd ${WS} && ls skills/cdn-upload/scripts && sed -n 1,60p skills/cdn-upload/SKILL.md'`, '/'), [`${WS}/skills/cdn-upload/SKILL.md`]);
  assert.deepEqual(read1('wc -c skills/x/SKILL.md && head -40 skills/x/SKILL.md', WS), [`${WS}/skills/x/SKILL.md`]);
  assert.deepEqual(read1('cat ~/.agents/skills/lark-markdown/SKILL.md'), ['/home/openclaw/.agents/skills/lark-markdown/SKILL.md']);
  for (const command of [
    `echo ${WS}/skills/x/SKILL.md`,
    `grep -n foo ${WS}/skills/x/SKILL.md`,
    `sed -i 's/a/b/' ${WS}/skills/x/SKILL.md`,
    `python3 - <<'PY'\nprint(open('${WS}/skills/x/SKILL.md').read())\nPY`,
    `cat > ${WS}/skills/x/SKILL.md <<'EOF'\nnew\nEOF`,
    'for d in */; do f="$d/SKILL.md"; cat "$f"; done',
  ]) assert.deepEqual(read1(command, WS), [], command);
  assert.deepEqual(read1('cat skills/x/SKILL.md'), [], 'relative path needs a directory');
});

test('compiled helper records receipt + diagnostic only for snapshot skills, and honours the switch', () => {
  const ctx = { runId: 'run-1', agentId: 'makaron', workspaceDir: WS, skillsSnapshot: { resolvedSkills: [{}] } };
  const h = loadHelper()();
  h.snapshotFiles.set(`${WS}/skills/cdn-upload/SKILL.md`, 'cdn-upload');
  assert.equal(h.recordNativeCommandSkillUsage({ command: `cat ${WS}/skills/cdn-upload/SKILL.md ${WS}/skills/other/SKILL.md`, toolCallId: 'c1', ctx }), 1);
  assert.deepEqual(h.recorded, [{ runId: 'run-1', name: 'cdn-upload', source: 'workspace', activation: 'read', skillFile: `${WS}/skills/cdn-upload/SKILL.md` }]);
  assert.equal(h.emitted.length, 1);
  assert.equal(h.emitted[0].toolName, 'exec');
  assert.equal(h.emitted[0].toolCallId, 'c1');
  assert.equal(h.recordNativeCommandSkillUsage({ command: `cat ${WS}/skills/cdn-upload/SKILL.md`, ctx: { ...ctx, runId: undefined } }), 0);
  assert.equal(h.recordNativeCommandSkillUsage({ command: `cat ${WS}/skills/cdn-upload/SKILL.md`, ctx: { ...ctx, skillsSnapshot: undefined } }), 0);
  const off = loadHelper()({ OPENCLAW_NATIVE_SKILL_USAGE: '0' });
  off.snapshotFiles.set(`${WS}/skills/cdn-upload/SKILL.md`, 'cdn-upload');
  assert.equal(off.recordNativeCommandSkillUsage({ command: `cat ${WS}/skills/cdn-upload/SKILL.md`, ctx }), 0);
});
