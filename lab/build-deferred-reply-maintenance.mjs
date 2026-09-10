// Mechanical patch of exact, read-code-verified native artifacts. No live runtime writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replaceOnce = (source, before, after) => {assert.equal(source.split(before).length, 2, 'Native patch anchor changed: ' + before.slice(0, 90)); return source.replace(before, after);};
const changes = [
  ['get-reply-CqW1y05D.js', source => replaceOnce(source,
    '\t\tmaintenanceConfig,\n\t\tonArchiveError:',
    '\t\tmaintenanceConfig,\n\t\t// Ordinary reply setup is not an explicit global cleanup command.\n\t\tdeferMaintenance: true,\n\t\tonArchiveError:')],
  ['session-accessor.sqlite-entry-BlklNPKQ.js', source => replaceOnce(source, 'export { ensureSessionEntrySync as C,', 'export { kickSessionEntryMaintenanceAfterWrite, ensureSessionEntrySync as C,')],
  ['session-accessor-K0XuW6ln.js', source => {
    source = 'import {kickSessionEntryMaintenanceAfterWrite} from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n' + source;
    source = replaceOnce(source,
      '\t\t\tmaintenanceOverride: params.maintenanceConfig,\n\t\t\tstorePath,\n\t\t\tupserts,',
      '\t\t\tmaintenanceOverride: params.maintenanceConfig,\n\t\t\t...params.deferMaintenance === true ? { skipMaintenance: true } : {},\n\t\t\tstorePath,\n\t\t\tupserts,');
    source = replaceOnce(source,
      '\tif (staleCommit !== void 0) return createStaleReplySessionInitializationResult(staleCommit ?? void 0);\n\tstore[resolved.normalizedKey] = committedSessionEntry;',
      '\tif (staleCommit !== void 0) return createStaleReplySessionInitializationResult(staleCommit ?? void 0);\n' +
      '\t// COMMIT and stale-snapshot checks have succeeded. Reuse native bounded,\n' +
      '\t// coalesced maintenance; do not repeat a global sweep inside every reply write.\n' +
      '\tif (params.deferMaintenance === true) {\n' +
      '\t\tconst maintenanceScope = resolveSqliteScope({ agentId: params.agentId, env: params.env, sessionKey: resolved.normalizedKey, storePath });\n' +
      '\t\tkickSessionEntryMaintenanceAfterWrite({\n' +
      '\t\t\tscope: maintenanceScope,\n' +
      '\t\t\tstorePath,\n' +
      '\t\t\tactiveSessionKey: params.activeSessionKey ?? resolved.normalizedKey,\n' +
      '\t\t\tarchiveDirectory: resolveSqliteTranscriptArchiveDirectory(maintenanceScope),\n' +
      '\t\t\tmaintenanceConfig: params.maintenanceConfig\n' +
      '\t\t});\n\t}\n' +
      '\tstore[resolved.normalizedKey] = committedSessionEntry;');
    return source;
  }]
];
const plan = {baseRelease: null, files: []};
const fixture = path.join(root, 'lab/fixtures/concurrency-native-baseline'); fs.mkdirSync(fixture, {recursive: true});
for (const [file, patch] of changes) {
  const target = 'openclaw/dist/' + file;
  const result = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2, timeout: 120000}));
  const source = Buffer.from(result.content, 'base64').toString(); assert.equal(createHash('sha256').update(source).digest('hex'), result.sha256);
  plan.baseRelease ??= result.current.release; assert.equal(plan.baseRelease, result.current.release, 'Release changed during build');
  const updated = patch(source), dest = 'lab/release-files/' + file;
  // Generated exact code fixtures / release files; never a copy of runtime dependencies or state.
  fs.writeFileSync(path.join(fixture, file), source);
  fs.writeFileSync(path.join(root, dest), updated);
  plan.files.push({source: dest, target, before: result.sha256});
  console.log(JSON.stringify({target, before: result.sha256, after: createHash('sha256').update(updated).digest('hex'), bytes: updated.length}));
}
fs.writeFileSync(path.join(root, 'lab/deferred-reply-maintenance-plan.json'), JSON.stringify(plan, null, 2) + '\n');
