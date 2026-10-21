// card-memory-read-only: load the release chunk from the candidate runtime and drive the real
// withMemoryWriteProvenance / createMemoryWriteProvenanceObserver over a temporary workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, 'candidate runtime is required');
const chunk = path.join(runtime, 'openclaw', 'dist', 'tool-loop-detection-config-Dftl-DTD.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'card-memory-'));
const mod = await import(pathToFileURL(chunk));
const withMemoryWriteProvenance = mod.m, createObserver = mod.p;
assert.equal(typeof withMemoryWriteProvenance, 'function');
assert.equal(typeof createObserver, 'function');
const workspace = path.join(work, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'MEMORY.md'), '# index\n');
fs.writeFileSync(path.join(workspace, 'memory', '2026-10-22.md'), '# 2026-10-22\n');
const operations = {
  readFile: (p) => fs.promises.readFile(p),
  writeFile: (p, c) => fs.promises.mkdir(path.dirname(p), { recursive: true }).then(() => fs.promises.writeFile(p, c)),
  remove: (p) => fs.promises.rm(p),
};
const tools = (sessionKey) => withMemoryWriteProvenance(operations, createObserver({
  mutationRoot: workspace, workspaceDir: workspace, resolveOriginClass: () => 'agent', sessionId: 's1', sessionKey,
}));
const result = {};
const card = tools('agent:makaron:subagent:workboard-nightshift-test-card');
await assert.rejects(card.writeFile(path.join(workspace, 'memory', '2026-10-22.md'), 'card log\n'), /may read memory but not write it/);
await assert.rejects(card.writeFile(path.join(workspace, 'MEMORY.md'), 'x'), /may read memory but not write it/);
await assert.rejects(card.remove(path.join(workspace, 'MEMORY.md')), /may read memory but not write it/);
assert.equal(fs.readFileSync(path.join(workspace, 'memory', '2026-10-22.md'), 'utf8'), '# 2026-10-22\n');
assert.ok(fs.existsSync(path.join(workspace, 'MEMORY.md')));
assert.equal(String(await card.readFile(path.join(workspace, 'MEMORY.md'))), '# index\n', 'cards still read memory');
await card.writeFile(path.join(workspace, 'work', 'card-output.json'), '{}');
assert.equal(fs.readFileSync(path.join(workspace, 'work', 'card-output.json'), 'utf8'), '{}', 'non-memory writes are untouched');
result.card = 'memory write, MEMORY.md write and delete refused; memory read and non-memory write work';
const chat = tools('agent:makaron:feishu:group:oc_test');
await chat.writeFile(path.join(workspace, 'memory', '2026-10-22.md'), '# 2026-10-22\nchat note\n');
assert.match(fs.readFileSync(path.join(workspace, 'memory', '2026-10-22.md'), 'utf8'), /chat note/);
result.chat = 'chat session memory write committed';
fs.rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, ...result }));
