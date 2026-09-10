// Mechanical one-call-site optimization; reuse native canonical exact reads.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = target => JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 4 * 1024 ** 2, timeout: 120000}));
const target = 'openclaw/dist/session-sharing-BlMqwMBH.js', result = read(target);
assert.equal(result.current.release, 'concurrency-shorttx-gateway-diag');
const source = Buffer.from(result.content, 'base64').toString();
assert.equal(createHash('sha256').update(source).digest('hex'), result.sha256);
const anchor = 'function resolveSessionSharingTarget(params) {\n\tconst target = resolveGatewaySessionStoreTargetWithStore({\n\t\tcfg: params.cfg,\n\t\tkey: params.sessionKey,\n\t\tagentId: params.agentId,\n\t\tclone: false,\n\t\tprojection: "list",';
assert.equal(source.split(anchor).length, 2);
// The new private "warm" mode preserves the original full-list behavior for
// missing/closed writers and while the owner is inside a write transaction.
let output = source.replace(anchor, anchor + '\n\t\t...params.exactRead ? { exactRead: "warm" } : {},');
// Only point-target mutation authorization opts in. Bulk session-list/event
// projections keep their existing shared full-store cache and batching.
for (const point of [
  'return { target: resolveSessionSharingTarget({\n\t\t\t\tcfg: getCfg(),',
  'const current = resolveSessionSharingTarget({\n\t\t\t\t\tcfg: currentCfg,',
]) {
  assert.equal(output.split(point).length, 2);
  output = output.replace(point, point + '\n\t\t\t\texactRead: true,');
}
const dest = 'lab/release-files/session-sharing-BlMqwMBH.js';
fs.writeFileSync(path.join(root, dest), output);
const utilsTarget = 'openclaw/dist/session-utils-store-Dlphca2N.js', utils = read(utilsTarget);
assert.equal(utils.current.release, result.current.release);
const utilsSource = Buffer.from(utils.content, 'base64').toString();
assert.equal(createHash('sha256').update(utilsSource).digest('hex'), utils.sha256);
const ownerImport = 'import "./openclaw-agent-db-CUTe8BX6.js";';
assert.equal(utilsSource.split(ownerImport).length, 2);
let utilsOutput = utilsSource.replace(ownerImport, 'import { u as getOpenClawAgentDatabaseIfOpen } from "./openclaw-agent-db-CUTe8BX6.js";\nimport { c as resolveSqliteScope, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";');
const helper = `function mayUseWarmExactSessionLookup(storePath, agentId, sessionKey) {
\ttry {
\t\tconst database = getOpenClawAgentDatabaseIfOpen(toDatabaseOptions(resolveSqliteScope({storePath, agentId, sessionKey})));
\t\treturn database?.db.isOpen === true && database.db.isTransaction !== true;
\t} catch { return false; }
}
`;
const loader = 'function loadGatewaySessionLookupStore(storePath, clone, agentId, options = {}) {\n';
assert.equal(utilsOutput.split(loader).length, 2);
utilsOutput = utilsOutput.replace(loader, helper + loader + '\tif (options.warmExact && options.exactKeys && !mayUseWarmExactSessionLookup(storePath, agentId, options.exactKeys[0] ?? "")) options = {...options, exactKeys: void 0};\n');
for (const keys of ['scanTargets', 'lookupSeeds', '[canonicalKey]']) {
  const old = `{ exactKeys: ${keys} }`;
  assert.equal(utilsOutput.split(old).length, 2);
  utilsOutput = utilsOutput.replace(old, `{ exactKeys: ${keys}, warmExact: params.exactRead === "warm" }`);
}
const utilsDest = 'lab/release-files/session-utils-store-Dlphca2N.js';
fs.writeFileSync(path.join(root, utilsDest), utilsOutput);
const handlerTarget = 'openclaw/dist/chat-send-handler-DBjXcn_1.js', handler = read(handlerTarget);
assert.equal(handler.current.release, result.current.release);
const handlerSource = Buffer.from(handler.content, 'base64').toString();
const hook = 'import {withConcurrencyProfile} from "./gateway-concurrency-profiler.mjs";\n';
const wrapped = '\treturn await withConcurrencyProfile(options.params, () => handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission));';
assert(handlerSource.startsWith(hook)); assert.equal(handlerSource.split(wrapped).length, 2);
const clean = handlerSource.slice(hook.length).replace(wrapped, '\tawait handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission);');
assert.equal(createHash('sha256').update(clean).digest('hex'), '99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311');
const handlerDest = 'lab/release-files/chat-send-handler-DBjXcn_1.js';
fs.writeFileSync(path.join(root, handlerDest), clean);
fs.writeFileSync(path.join(root, 'lab/exact-sharing-lookup-plan.json'), JSON.stringify({baseRelease: result.current.release, files: [{source: dest, target, before: result.sha256}, {source: utilsDest, target: utilsTarget, before: utils.sha256}, {source: handlerDest, target: handlerTarget, before: handler.sha256}]}, null, 2) + '\n');
console.log(JSON.stringify({baseRelease: result.current.release, before: result.sha256, after: createHash('sha256').update(output).digest('hex'), profilerRemoved: true}));
