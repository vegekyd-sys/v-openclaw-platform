import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'openclaw/dist/openclaw-database-verify-a3Yme38Y.js';
const result = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 4 * 1024 ** 2, timeout: 120000}));
assert.equal(result.current.release, 'concurrency-exact-sharing-v3');
const source = Buffer.from(result.content, 'base64').toString();
assert.equal(createHash('sha256').update(source).digest('hex'), result.sha256);
let output = 'import {prepareVerifyResourceGroup} from "./database-verify-resource-group.mjs";\n' + source;
for (const [before, after] of [
  ['\tlet worker;\n\ttry {\n\t\tworker = fork(', '\tlet worker;\n\ttry {\n\t\tconst resourceGroup = prepareVerifyResourceGroup();\n\t\tworker = fork('],
  ['\t\t});\n\t} catch (error) {\n\t\treturn Promise.reject(toStructuredErrorObject(error));', '\t\t});\n\t\tresourceGroup?.attach(worker.pid);\n\t} catch (error) {\n\t\tworker?.once("error", () => {});\n\t\tworker?.kill();\n\t\treturn Promise.reject(toStructuredErrorObject(error));'],
]) { assert.equal(output.split(before).length, 2); output = output.replace(before, after); }
const dest = 'lab/release-files/openclaw-database-verify-a3Yme38Y.js';
fs.writeFileSync(path.join(root, dest), output);
fs.writeFileSync(path.join(root, 'lab/verifier-resource-group-plan.json'), JSON.stringify({baseRelease: result.current.release, files: [
  {source: dest, target, before: result.sha256},
  {source: 'lab/release-files/database-verify-resource-group.mjs', target: 'openclaw/dist/database-verify-resource-group.mjs', before: null},
]}, null, 2) + '\n');
console.log(JSON.stringify({baseRelease: result.current.release, before: result.sha256, after: createHash('sha256').update(output).digest('hex')}));
