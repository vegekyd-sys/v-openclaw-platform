import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const marker = 'vlab-openclaw94-sqlite-begin-contention-v1';
const helperName = 'sqlite-begin-contention-retry.mjs';

function once(source, before, after) {
  if (source.split(before).length !== 2) {
    throw new Error(`OpenClaw 9.4 SQLite commit anchor mismatch: ${before.slice(0, 120)}`);
  }
  return source.replace(before, after);
}

export function patchSessionAccessor(source) {
  if (source.includes(marker)) return source;
  let result = once(
    source,
    'import { y as uniqueStrings } from "./string-normalization-_gRhJUDw.mjs";\n',
    `import {withSqliteBeginContentionRetry} from "./${helperName}"; // ${marker}\n` +
      'import { y as uniqueStrings } from "./string-normalization-_gRhJUDw.mjs";\n',
  );
  result = once(
    result,
    '\t\t\tconst publish = runOpenClawAgentWriteTransaction((writeDatabase) => {\n',
    '\t\t\tconst publish = await withSqliteBeginContentionRetry({\n' +
      '\t\t\t\tdatabase: database.db,\n' +
      '\t\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, databaseOptions),\n' +
      '\t\t\t\toperation: (writeDatabase) => {\n',
  );
  result = once(
    result,
    '\t\t\t\treturn prepareSessionIdentityPublication(writeDatabase, resolved.agentId, previousIdentity, currentIdentity);\n' +
      '\t\t\t}, databaseOptions);\n',
    '\t\t\t\treturn prepareSessionIdentityPublication(writeDatabase, resolved.agentId, previousIdentity, currentIdentity);\n' +
      '\t\t\t\t}\n' +
      '\t\t\t});\n',
  );
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function atomicWrite(file, content, metadata) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, {mode: metadata.mode});
  await fs.chown(temporary, metadata.uid, metadata.gid);
  await fs.rename(temporary, file);
}

async function main() {
  const [core, mode, expectedSha256] = process.argv.slice(2);
  if (!core || !['--check', '--apply'].includes(mode)) {
    throw new Error('Usage: patch-openclaw94-sqlite-begin-contention.mjs CORE --check|--apply [EXPECTED_SHA256]');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(core, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '2026.9.4', 'Requires reviewed OpenClaw 2026.9.4');
  const dist = path.join(core, 'dist');
  const candidates = [];
  for (const name of (await fs.readdir(dist)).filter(name => /^session-accessor\.sqlite-entry-[\w-]+\.mjs$/.test(name))) {
    const source = await fs.readFile(path.join(dist, name), 'utf8');
    if (source.includes('async function patchSqliteSessionEntrySnapshot(params)')) candidates.push({name, source});
  }
  assert.equal(candidates.length, 1, `Expected one OpenClaw 9.4 SQLite session accessor, got ${candidates.length}`);
  const candidate = candidates[0];
  const file = path.join(dist, candidate.name);
  const beforeHash = sha256(candidate.source);
  if (expectedSha256) assert.equal(beforeHash, expectedSha256, 'OpenClaw 9.4 SQLite accessor preimage changed');
  const after = patchSessionAccessor(candidate.source);
  const helperSource = await fs.readFile(new URL('../lab/release-files/sqlite-begin-contention-retry.mjs', import.meta.url), 'utf8');
  const helperFile = path.join(dist, helperName);
  let helperState = 'missing';
  try {
    helperState = await fs.readFile(helperFile, 'utf8') === helperSource ? 'matching' : 'different';
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (helperState === 'different') throw new Error('Existing SQLite contention helper differs from reviewed source');
  if (mode === '--apply') {
    if (after !== candidate.source) {
      await fs.copyFile(file, `${file}.${marker}.bak`, fs.constants.COPYFILE_EXCL);
      await atomicWrite(file, after, await fs.stat(file));
    }
    if (helperState === 'missing') await atomicWrite(helperFile, helperSource, await fs.stat(file));
  }
  console.log(JSON.stringify({
    mode,
    accessor: candidate.name,
    state: after === candidate.source ? 'unchanged' : 'patched',
    beforeSha256: beforeHash,
    afterSha256: sha256(after),
    helper: helperState,
    helperSha256: sha256(helperSource),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
