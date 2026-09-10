// Patch exact code artifacts only. Never modify a running Gateway or its state.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const original = "new Error('上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。')";
// Native overflow recovery consumes errorMessage across Worker IPC, not code.
// Keep its established context-overflow marker as well as our structured code.
const replacement = "new Error('Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] 上下文剩余空间不足，需要压缩上下文后继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。')";
const plan = {baseRelease: null, files: []};
for (const file of ['transports.mjs', 'openai-completions-D0QZ0AyB.mjs']) {
  const target = 'openclaw/node_modules/@openclaw/ai/dist/' + file;
  const result = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--repo', '/Users/tianyicai/vlab-dev', '--target', target], {encoding: 'utf8', maxBuffer: 16 * 1024 ** 2}));
  const source = Buffer.from(result.content, 'base64').toString();
  assert.equal(sha(source), result.sha256);
  assert.equal(source.split(original).length, 2, 'Budget contract changed; review before patching');
  plan.baseRelease ??= result.current.release;
  assert.equal(result.current.release, plan.baseRelease, 'Release changed during build');
  const updated = source.replace(original, replacement);
  const dest = 'lab/release-files/deepseek-compaction-' + file;
  fs.writeFileSync(path.join(root, dest), updated);
  plan.files.push({source: dest, target, before: result.sha256});
  console.log(JSON.stringify({target, before: result.sha256, after: sha(updated)}));
}
fs.writeFileSync(path.join(root, 'lab/deepseek-compaction-plan.json'), JSON.stringify(plan, null, 2) + '\n');
const native = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--repo', '/Users/tianyicai/vlab-dev', '--target', 'openclaw/dist/embedded-agent-DaSvA-Yk.js'], {encoding: 'utf8', maxBuffer: 16 * 1024 ** 2}));
const nativeText = Buffer.from(native.content, 'base64').toString();
assert.equal(sha(nativeText), native.sha256);
const start = nativeText.indexOf('async function recoverEmbeddedRunOverflow(input) {');
const end = nativeText.indexOf('\n//#endregion', start);
assert(start > 0 && end > start);
fs.writeFileSync(path.join(root, 'lab/fixtures/deepseek-native-overflow.js'), '// Native overflow recovery fixture, artifact SHA256: ' + native.sha256 + '\n' + nativeText.slice(start, end) + '\n');
