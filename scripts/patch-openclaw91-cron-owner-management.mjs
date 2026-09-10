import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const marker = 'versa-cron-owner-management-v1';
export const runtimeName = `${marker}.mjs`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const runtimeSource = fileURLToPath(new URL('../patches/cron-owner-management/runtime.mjs', import.meta.url));

function once(source, anchor, replacement) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Cron owner patch anchor mismatch (${count}): ${anchor.slice(0, 110)}`);
  return source.replace(anchor, replacement);
}
function imported(source, names) {
  return `// ${marker}\nimport { ${names.join(', ')} } from './${runtimeName}';\n${source}`;
}
function patchOnce(transform) {
  return (source) => source.includes(`// ${marker}\n`) ? source : transform(source);
}

export const patchCallerContext = patchOnce((source) => {
  let result = once(source, '\t\tturnSourceChannel: params.turnSourceChannel,',
    '\t\tcronManagementPrincipal: params.cronManagementPrincipal,\n\t\tturnSourceChannel: params.turnSourceChannel,');
  result = once(result, '\tconst cronToolsAllowCapture = identity.cronToolsAllowCapture ?? inheritedOwner?.cronToolsAllowCapture;',
    '\tconst cronManagementPrincipal = inheritedOwner?.cronManagementPrincipal ?? identity.cronManagementPrincipal;\n\tconst cronToolsAllowCapture = identity.cronToolsAllowCapture ?? inheritedOwner?.cronToolsAllowCapture;');
  result = once(result, '\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},',
    '\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},');
  return `// ${marker}\n${result}`;
});

export const patchToolFactory = patchOnce((source) => imported(once(source,
  '\t\t\tcreateCronTool({\n',
  '\t\t\tcreateCronTool({\n\t\t\t\tcronManagementPrincipal: cronManagementPrincipalFromTurn(options),\n'),
['cronManagementPrincipalFromTurn']));

export const patchCronTool = patchOnce((source) => `// ${marker}\n` + once(source,
  '\t\t\t\tturnSourceAccountId: opts.agentAccountId,',
  '\t\t\t\tcronManagementPrincipal: opts.cronManagementPrincipal,\n\t\t\t\tturnSourceAccountId: opts.agentAccountId,'));

export const patchHostCapability = patchOnce((source) => imported(once(source,
  'function createBoundCallerIdentity(params, receiptAuthority, signal) {\n\treturn createAdmittedGatewayToolCallerIdentity({',
  'function createBoundCallerIdentity(params, receiptAuthority, signal) {\n\treturn createAdmittedGatewayToolCallerIdentity({\n\t\tcronManagementPrincipal: cronManagementPrincipalFromTurn(params),'),
['cronManagementPrincipalFromTurn']));

export const patchIdentityToken = patchOnce((source) => {
  let result = once(source, '\tcronToolsAllowCapture: literal("final-executable-surface").optional(),',
    `\tcronManagementPrincipal: object({
\t\tversion: literal(1), channel: normalizedRequiredStringSchema,
\t\taccountId: normalizedRequiredStringSchema, senderId: normalizedRequiredStringSchema
\t}).optional(),
\tcronToolsAllowCapture: literal("final-executable-surface").optional(),`);
  result = once(result, '\t\tconst cronToolsAllowCapture = raw.cronToolsAllowCapture;',
    '\t\tconst cronManagementPrincipal = normalizeCronManagementPrincipal(raw.cronManagementPrincipal);\n\t\tif (raw.cronManagementPrincipal && !cronManagementPrincipal) return;\n\t\tconst cronToolsAllowCapture = raw.cronToolsAllowCapture;');
  result = once(result, '\t\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},',
    '\t\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},');
  result = once(result, 'function prepareAgentRuntimeIdentityTokenPayload(params) {',
    'function prepareAgentRuntimeIdentityTokenPayload(params) {\n\tconst cronManagementPrincipal = normalizeCronManagementPrincipal(params.cronManagementPrincipal);\n\tif (params.cronManagementPrincipal && !cronManagementPrincipal) throw new TypeError("Invalid Cron management principal");');
  result = once(result, '\t\t...params.cronToolsAllowCapture === "final-executable-surface" ? { cronToolsAllowCapture: params.cronToolsAllowCapture } : {},',
    '\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t...params.cronToolsAllowCapture === "final-executable-surface" ? { cronToolsAllowCapture: params.cronToolsAllowCapture } : {},');
  result = once(result, '\t\t...payload.cronToolsAllowCapture ? { cronToolsAllowCapture: payload.cronToolsAllowCapture } : {},',
    '\t\t...payload.cronManagementPrincipal ? { cronManagementPrincipal: payload.cronManagementPrincipal } : {},\n\t\t...payload.cronToolsAllowCapture ? { cronToolsAllowCapture: payload.cronToolsAllowCapture } : {},');
  return imported(result, ['normalizeCronManagementPrincipal']);
});

export const patchJobsPolicy = patchOnce((source) => imported(once(source,
  'function reconcileScheduledToolPolicy(params) {\n\tconst { job } = params;',
  'function reconcileScheduledToolPolicy(params) {\n\tparams = prepareCronManagementPolicy(params);\n\tconst { job } = params;'),
['prepareCronManagementPolicy']));

export const patchCronHandlers = patchOnce((source) => {
  let result = once(source, '\t\taccountId: normalizeAccountId(identity.turnSourceAccountId),',
    '\t\tcronManagementPrincipal: identity.cronManagementPrincipal,\n\t\tcronManagementChannel: sourceChannel,\n\t\taccountId: normalizeAccountId(identity.turnSourceAccountId),');
  result = once(result, '\tif (!cronJobScheduledAuthorityMatchesCaller(params.job, params.callerScope)) return false;',
    '\tconst ownerDecision = cronManagementJobDecision(params);\n\tif (ownerDecision !== undefined) return ownerDecision;\n\tif (!cronJobScheduledAuthorityMatchesCaller(params.job, params.callerScope)) return false;');
  result = once(result, 'function cronCreateMatchesCallerScope(params) {\n\tif (!params.callerScope) return true;',
    'function cronCreateMatchesCallerScope(params) {\n\tif (!params.callerScope) return true;\n\tif (cronManagementNamespaceDecision(params.callerScope) === false) return false;');
  result = once(result, 'function resolveCronSessionVisibility(client, cfg) {',
    'function resolveCronSessionVisibility(client, cfg) {\n\tif (cronManagementNamespaceDecision(readCronCallerScope(client)) === true) return;');
  result = once(result, '\t\tif (validatesAuthority) assertActiveAgentRuntimeAuthority(client, context);',
    '\t\tassertCronManagementCommit();\n\t\tif (validatesAuthority) assertActiveAgentRuntimeAuthority(client, context);');
  // The mutation context is process-private. Neither the request schema nor the
  // public owner field can establish it. Native lifecycle fences are mandatory.
  const wrapper = `
for (const [method, originalHandler] of Object.entries(cronHandlers)) {
  if (!method.startsWith('cron.')) continue;
  cronHandlers[method] = async (request) => {
    const callerScope = readCronCallerScope(request.client);
    if (!cronManagementNamespaceIsProtected(callerScope)) return await originalHandler(request);
    const assertActive = () => {
      if (typeof request.context.validateAgentRuntimeApprovalAuthority !== 'function' ||
          !request.context.validateAgentRuntimeApprovalAuthority(request.client.internal.agentRuntimeIdentity)) {
        throw new TypeError('Cron owner management requires active authenticated run authority');
      }
    };
    assertActive();
    const jobId = request.params?.id ?? request.params?.jobId;
    return await withCronManagementRequest({ method, callerScope, jobId,
      protectedAtAdmission: true, assertActive,
      defaultAgentId: request.context.cron.getDefaultAgentId(),
      getJob: () => request.context.cron.getJob(jobId)
    }, () => originalHandler(request));
  };
}
`;
  result = once(result, 'export { cronHandlers as t };', `${wrapper}\nexport { cronHandlers as t };`);
  return imported(result, ['cronManagementNamespaceDecision', 'cronManagementNamespaceIsProtected',
    'cronManagementJobDecision', 'withCronManagementRequest', 'assertCronManagementCommit']);
});

const specs = [
  [/^gateway-caller-context-[\w-]+\.js$/, 'function withGatewayToolCallerIdentity(', patchCallerContext],
  [/^openclaw-tools-[\w-]+\.js$/, 'createCronTool({', patchToolFactory],
  [/^cron-tool-[\w-]+\.js$/, 'function createCronTool(', patchCronTool],
  [/^host-capability-[\w-]+\.js$/, 'function createBoundCallerIdentity(', patchHostCapability],
  [/^agent-runtime-identity-token-[\w-]+\.js$/, 'function prepareAgentRuntimeIdentityTokenPayload(', patchIdentityToken],
  [/^list-snapshot-revision-[\w-]+\.js$/, 'function reconcileScheduledToolPolicy(', patchJobsPolicy],
  [/^cron-[\w-]+\.js$/, 'const cronHandlers = {', patchCronHandlers],
];

export async function buildPatch(core) {
  if (JSON.parse(await fs.readFile(path.join(core, 'package.json'), 'utf8')).version !== '2026.9.1') {
    throw new Error('Cron owner patch requires exact OpenClaw 2026.9.1');
  }
  const dist = path.join(core, 'dist'), names = await fs.readdir(dist), changes = [];
  for (const [pattern, anchor, transform] of specs) {
    const matches = [];
    for (const name of names.filter((n) => pattern.test(n))) {
      const before = await fs.readFile(path.join(dist, name), 'utf8');
      if (before.includes(anchor)) matches.push({ name, before });
    }
    if (matches.length !== 1) throw new Error(`Expected one ${pattern}; found ${matches.length}`);
    const { name, before } = matches[0], after = transform(before);
    const check = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: after, encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`Patched ${name} syntax failed: ${check.stderr}`);
    changes.push({ name, before, after });
  }
  const runtime = await fs.readFile(runtimeSource, 'utf8');
  const prior = await fs.readFile(path.join(dist, runtimeName), 'utf8').catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return null;
  });
  if (prior !== null && prior !== runtime) throw new Error('Different Cron owner runtime already installed');
  changes.push({ name: runtimeName, before: prior, after: runtime });
  return changes;
}

export async function applyPatch(core, apply = false) {
  const changes = await buildPatch(core);
  const manifest = { patch: marker, version: '2026.9.1', files: changes.map(({ name, before, after }) =>
    ({ name, before: before === null ? null : hash(before), after: hash(after) })) };
  if (apply && changes.some((c) => c.before !== c.after)) {
    const backup = path.join(core, `.${marker}.backup`);
    await fs.mkdir(backup); // A prior/incomplete installation must be inspected, never overwritten.
    for (const c of changes) if (c.before !== null) await fs.writeFile(path.join(backup, c.name), c.before);
    await fs.writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const c of changes) if (c.before !== c.after) {
      const target = path.join(core, 'dist', c.name), temporary = `${target}.${process.pid}.tmp`;
      await fs.writeFile(temporary, c.after);
      await fs.rename(temporary, target);
    }
  }
  return manifest;
}

export async function rollbackPatch(core) {
  const backup = path.join(core, `.${marker}.backup`);
  const manifest = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
  // Validate all files before restoring any. Preserve later tasks' edits.
  for (const entry of manifest.files) {
    if (hash(await fs.readFile(path.join(core, 'dist', entry.name))) !== entry.after) {
      throw new Error(`Rollback refused: ${entry.name} changed after this patch`);
    }
    if (entry.before && hash(await fs.readFile(path.join(backup, entry.name))) !== entry.before) {
      throw new Error(`Rollback backup checksum mismatch: ${entry.name}`);
    }
  }
  for (const entry of manifest.files) {
    const target = path.join(core, 'dist', entry.name);
    if (entry.before === null) await fs.unlink(target);
    else await fs.copyFile(path.join(backup, entry.name), target);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [core, mode] = process.argv.slice(2);
  if (!core || !path.isAbsolute(core) || !['--check', '--apply', '--rollback'].includes(mode)) {
    console.error('Usage: node patch-openclaw91-cron-owner-management.mjs /absolute/core --check|--apply|--rollback');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(mode === '--rollback' ? await rollbackPatch(core) : await applyPatch(core, mode === '--apply'), null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
