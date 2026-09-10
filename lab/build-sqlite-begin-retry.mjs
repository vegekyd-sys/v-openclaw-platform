import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js';
const result = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2, timeout: 120000}));
const source = Buffer.from(result.content, 'base64').toString();
assert.equal(createHash('sha256').update(source).digest('hex'), result.sha256);
const replace = (s, a, b) => {assert.equal(s.split(a).length, 2, 'Native patch anchor changed'); return s.replace(a, b);};
let output = 'import {withSqliteBeginContentionRetry} from "./sqlite-begin-contention-retry.mjs";\n' + source;
output = replace(output, '\t\trunOpenClawAgentWriteTransaction((writeDatabase) => {\n\t\t\tconst fresh = params.readSnapshot(writeDatabase);',
  '\t\tawait withSqliteBeginContentionRetry({\n\t\t\tdatabase: database.db,\n\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(resolved)),\n\t\t\toperation: (writeDatabase) => {\n\t\t\tconst fresh = params.readSnapshot(writeDatabase);');
output = replace(output, '\t\t\tresult = cloneSessionEntry(persisted);\n\t\t}, toDatabaseOptions(resolved));', '\t\t\tresult = cloneSessionEntry(persisted);\n\t\t\t}\n\t\t});');
// Mechanical generation from an exact code-only artifact; never runtime writes.
fs.writeFileSync(path.join(root, 'lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js'), output);
const plan = {baseRelease: result.current.release, files: [{source: 'lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js', target, before: result.sha256}, {source: 'lab/release-files/sqlite-begin-contention-retry.mjs', target: 'openclaw/dist/sqlite-begin-contention-retry.mjs', before: null}]};
fs.writeFileSync(path.join(root, 'lab/sqlite-begin-retry-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({baseRelease: plan.baseRelease, before: result.sha256, after: createHash('sha256').update(output).digest('hex')}));
