// Only the pre-existing strictly allowlisted timing row uses the direct sink.
// Business logs, errors and their native secret redaction are unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'lab/sqlite-begin-retry-plan.json')));
const beforeLine = "    console.error('[firsttext-worker-phases] ' + JSON.stringify(row));";
const afterLine = "    // row contains only validated timing/identity fields; no prompt, tool args or credentials.\n    process.stderr.write('[firsttext-worker-phases] ' + JSON.stringify(row) + '\\n');";
for (const name of ['index.mjs', 'worker-pool.mjs', 'worker.mjs']) {
  const target = 'production-worker/' + name;
  const result = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2, timeout: 120000}));
  assert.equal(result.current.release, plan.baseRelease);
  const source = Buffer.from(result.content, 'base64').toString();
  assert.equal(createHash('sha256').update(source).digest('hex'), result.sha256); assert.equal(source.split(beforeLine).length, 2);
  const updated = source.replace(beforeLine, afterLine), dest = 'lab/release-files/production-worker-' + name;
  fs.writeFileSync(path.join(root, 'lab/fixtures/concurrency-native-baseline/production-worker-' + name), source);
  fs.writeFileSync(path.join(root, dest), updated);
  plan.files.push({source: dest, target, before: result.sha256});
  console.log(JSON.stringify({target, before: result.sha256, after: createHash('sha256').update(updated).digest('hex')}));
}
fs.writeFileSync(path.join(root, 'lab/concurrency-fix-v2-plan.json'), JSON.stringify(plan, null, 2) + '\n');
