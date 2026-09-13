import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const marker = 'versa-cron-shared-management-v1';
export const runtimeName = `${marker}.mjs`;
const runtimeSource = fileURLToPath(new URL('../patches/cron-shared-management/runtime.mjs', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function once(source, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`OpenClaw 9.4 Shared Cron anchor mismatch (${count}): ${before.slice(0, 120)}`);
  return source.replace(before, after);
}

function imported(source, names) {
  return `// ${marker}\nimport {${names.join(', ')}} from './${runtimeName}';\n${source}`;
}

function patchOnce(transform) {
  return source => source.includes(`// ${marker}\n`) ? source : transform(source);
}

export const patchCallerContext = patchOnce(source => {
  let output = once(source,
    '\t\tturnSourceChannel: params.turnSourceChannel,',
    '\t\tcronManagementPrincipal: params.cronManagementPrincipal,\n\t\tturnSourceChannel: params.turnSourceChannel,');
  output = once(output,
    '\tconst cronToolsAllowCapture = identity.cronToolsAllowCapture ?? inheritedOwner?.cronToolsAllowCapture;',
    '\tconst cronManagementPrincipal = inheritedOwner?.cronManagementPrincipal ?? identity.cronManagementPrincipal;\n\tconst cronToolsAllowCapture = identity.cronToolsAllowCapture ?? inheritedOwner?.cronToolsAllowCapture;');
  output = once(output,
    '\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},',
    '\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},');
  return `// ${marker}\n${output}`;
});

export const patchToolFactory = patchOnce(source => imported(once(source,
  '\t\t\tcreateCronTool({\n',
  '\t\t\tcreateCronTool({\n\t\t\t\tcronManagementPrincipal: cronManagementPrincipalFromTurn(options),\n'),
['cronManagementPrincipalFromTurn']));

export const patchCronTool = patchOnce(source => `// ${marker}\n${once(source,
  '\t\t\t\tturnSourceAccountId: opts.agentAccountId,',
  '\t\t\t\tcronManagementPrincipal: opts.cronManagementPrincipal,\n\t\t\t\tturnSourceAccountId: opts.agentAccountId,')}`);

export const patchHarnessHost = patchOnce(source => imported(once(source,
  '\tconst callerIdentity = createAdmittedGatewayToolCallerIdentity({\n',
  '\tconst callerIdentity = createAdmittedGatewayToolCallerIdentity({\n\t\tcronManagementPrincipal: cronManagementPrincipalFromTurn(attempt),\n'),
['cronManagementPrincipalFromTurn']));

export const patchIdentityToken = patchOnce(source => {
  let output = once(source,
    '\tcronToolsAllowCapture: literal("final-executable-surface").optional(),',
    `\tcronManagementPrincipal: object({
\t\tversion: literal(1),
\t\tchannel: normalizedRequiredStringSchema,
\t\taccountId: normalizedRequiredStringSchema,
\t\tsenderId: normalizedRequiredStringSchema
\t}).optional(),
\tcronToolsAllowCapture: literal("final-executable-surface").optional(),`);
  output = once(output,
    '\t\tconst cronToolsAllowCapture = raw.cronToolsAllowCapture;',
    '\t\tconst cronManagementPrincipal = normalizeCronManagementPrincipal(raw.cronManagementPrincipal);\n\t\tif (raw.cronManagementPrincipal && !cronManagementPrincipal) return;\n\t\tconst cronToolsAllowCapture = raw.cronToolsAllowCapture;');
  output = once(output,
    '\t\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},',
    '\t\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t\t...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},');
  output = once(output,
    'function prepareAgentRuntimeIdentityTokenPayload(params) {',
    'function prepareAgentRuntimeIdentityTokenPayload(params) {\n\tconst cronManagementPrincipal = normalizeCronManagementPrincipal(params.cronManagementPrincipal);\n\tif (params.cronManagementPrincipal && !cronManagementPrincipal) throw new TypeError("Invalid Cron management principal");');
  output = once(output,
    '\t\t...params.cronToolsAllowCapture === "final-executable-surface" ? { cronToolsAllowCapture: params.cronToolsAllowCapture } : {},',
    '\t\t...cronManagementPrincipal ? { cronManagementPrincipal } : {},\n\t\t...params.cronToolsAllowCapture === "final-executable-surface" ? { cronToolsAllowCapture: params.cronToolsAllowCapture } : {},');
  output = once(output,
    '\t\t...payload.cronToolsAllowCapture ? { cronToolsAllowCapture: payload.cronToolsAllowCapture } : {},',
    '\t\t...payload.cronManagementPrincipal ? { cronManagementPrincipal: payload.cronManagementPrincipal } : {},\n\t\t...payload.cronToolsAllowCapture ? { cronToolsAllowCapture: payload.cronToolsAllowCapture } : {},');
  return imported(output, ['normalizeCronManagementPrincipal']);
});

export const patchJobsPolicy = patchOnce(source => imported(once(source,
  'function reconcileScheduledToolPolicy(params) {\n\tconst { job } = params;',
  'function reconcileScheduledToolPolicy(params) {\n\tparams = prepareCronManagementPolicy(params);\n\tconst { job } = params;'),
['prepareCronManagementPolicy']));

export const patchCronHandlers = patchOnce(source => {
  let output = once(source,
    '\t\taccountId: normalizeAccountId(identity.turnSourceAccountId),',
    '\t\tcronManagementPrincipal: identity.cronManagementPrincipal,\n\t\tcronManagementChannel: sourceChannel,\n\t\taccountId: normalizeAccountId(identity.turnSourceAccountId),');
  output = once(output,
    '\tif (isOperatorCommandCronJob(params.job)) return false;',
    '\tif (isOperatorCommandCronJob(params.job)) return false;\n\tconst ownerDecision = cronManagementJobDecision(params);\n\tif (ownerDecision !== undefined) return ownerDecision;');
  output = once(output,
    'function cronCreateMatchesCallerScope(params) {\n\tif (!params.callerScope) return true;',
    'function cronCreateMatchesCallerScope(params) {\n\tif (!params.callerScope) return true;\n\tif (cronManagementNamespaceDecision(params.callerScope) === false) return false;');
  output = once(output,
    'function resolveCronSessionVisibility(client, cfg) {',
    'function resolveCronSessionVisibility(client, cfg) {\n\tif (cronManagementNamespaceDecision(readCronCallerScope(client)) === true) return;');
  output = once(output,
    '\t\tmanageAll?.();\n\t\tif (validatesAuthority) assertActiveAgentRuntimeAuthority(client, context);',
    '\t\tmanageAll?.();\n\t\tassertCronManagementCommit();\n\t\tif (validatesAuthority) assertActiveAgentRuntimeAuthority(client, context);');
  const wrapper = `
for (const [method, originalHandler] of Object.entries(cronHandlers)) {
\tif (!method.startsWith("cron.")) continue;
\tcronHandlers[method] = async (request) => {
\t\tconst callerScope = readCronCallerScope(request.client);
\t\tif (!cronManagementNamespaceIsProtected(callerScope)) return await originalHandler(request);
\t\tconst assertActive = () => {
\t\t\tif (typeof request.context.validateAgentRuntimeApprovalAuthority !== "function" || !request.context.validateAgentRuntimeApprovalAuthority(request.client.internal.agentRuntimeIdentity)) throw new TypeError("Shared Cron management requires active authenticated run authority");
\t\t};
\t\tassertActive();
\t\tconst jobId = request.params?.id ?? request.params?.jobId;
\t\treturn await withCronManagementRequest({
\t\t\tmethod,
\t\t\tcallerScope,
\t\t\tjobId,
\t\t\tprotectedAtAdmission: true,
\t\t\tassertActive,
\t\t\tdefaultAgentId: request.context.cron.getDefaultAgentId(),
\t\t\tgetJob: () => request.context.cron.getJob(jobId)
\t\t}, () => originalHandler(request));
\t};
}
`;
  output = once(output, 'export { cronHandlers as t };', `${wrapper}\nexport { cronHandlers as t };`);
  return imported(output, [
    'cronManagementNamespaceDecision',
    'cronManagementNamespaceIsProtected',
    'cronManagementJobDecision',
    'withCronManagementRequest',
    'assertCronManagementCommit',
  ]);
});

export const patchToolSurface = patchOnce(source => {
  const replacement = `\tconst sharedCronPrincipal = cronManagementPrincipalFromTurn({...options, sandboxed: Boolean(sandbox)});
\tconst sharedCronManagementToolAvailable = Boolean(sharedCronPrincipal && readCronManagementPolicy()?.agents[executionAgentId]?.enabled === true);
\tconst ownerOnlyCoreToolDenylist = options?.senderIsOwner === false ? GATEWAY_OWNER_ONLY_CORE_TOOLS.filter((toolName) => toolName !== "automations" || !(cronCreatorAuthorityResolver || cronManagementGrant || sharedCronManagementToolAvailable)) : [];`;
  return imported(once(source,
    '\tconst ownerOnlyCoreToolDenylist = options?.senderIsOwner === false ? GATEWAY_OWNER_ONLY_CORE_TOOLS.filter((toolName) => toolName !== "automations" || !(cronCreatorAuthorityResolver || cronManagementGrant)) : [];',
    replacement), ['cronManagementPrincipalFromTurn', 'readCronManagementPolicy']);
});

const specs = [
  [/^gateway-caller-context-[\w-]+\.mjs$/, 'function withGatewayToolCallerIdentity(', patchCallerContext],
  [/^openclaw-tools-[\w-]+\.mjs$/, 'createCronTool({', patchToolFactory],
  [/^cron-tool-[\w-]+\.mjs$/, 'function createCronTool(', patchCronTool],
  [/^selection-[\w-]+\.mjs$/, 'function createAgentHarnessHostCapabilities(', patchHarnessHost],
  [/^agent-runtime-identity-token-[\w-]+\.mjs$/, 'function prepareAgentRuntimeIdentityTokenPayload(', patchIdentityToken],
  [/^jobs-tool-policy-[\w-]+\.mjs$/, 'function reconcileScheduledToolPolicy(', patchJobsPolicy],
  [/^cron-[\w-]+\.mjs$/, 'const cronHandlers = {', patchCronHandlers],
  [/^agent-tools-[\w-]+\.mjs$/, 'ownerOnlyCoreToolDenylist', patchToolSurface],
];

async function unique(dist, names, pattern, anchor) {
  const matches = [];
  for (const name of names.filter(candidate => pattern.test(candidate))) {
    const before = await fs.readFile(path.join(dist, name), 'utf8');
    if (before.includes(anchor)) matches.push({name, before});
  }
  if (matches.length !== 1) throw new Error(`Expected one ${pattern} containing ${anchor}; got ${matches.length}`);
  return matches[0];
}

export async function buildPatch(core) {
  const pkg = JSON.parse(await fs.readFile(path.join(core, 'package.json'), 'utf8'));
  if (pkg.version !== '2026.9.4') throw new Error('Shared Cron patch requires exact OpenClaw 2026.9.4');
  const dist = path.join(core, 'dist');
  const names = await fs.readdir(dist);
  const changes = [];
  for (const [pattern, anchor, transform] of specs) {
    const {name, before} = await unique(dist, names, pattern, anchor);
    const after = transform(before);
    const check = spawnSync(process.execPath, ['--check', '--input-type=module'], {input: after, encoding: 'utf8'});
    if (check.status !== 0) throw new Error(`Patched ${name} syntax failed: ${check.stderr}`);
    changes.push({name, before, after});
  }
  const after = await fs.readFile(runtimeSource, 'utf8');
  const before = await fs.readFile(path.join(dist, runtimeName), 'utf8').catch(error => {
    if (error?.code !== 'ENOENT') throw error;
    return null;
  });
  if (before !== null && before !== after) throw new Error(`Existing ${runtimeName} differs from reviewed source`);
  changes.push({name: runtimeName, before, after});
  return changes;
}

async function atomicWrite(file, content, metadata) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, {mode: metadata.mode});
  await fs.chown(temporary, metadata.uid, metadata.gid);
  await fs.rename(temporary, file);
}

export async function applyPatch(core, apply = false) {
  const changes = await buildPatch(core);
  const manifest = {patch: marker, version: '2026.9.4', files: changes.map(({name, before, after}) => ({
    name,
    before: before === null ? null : sha256(before),
    after: sha256(after),
    changed: before !== after,
  }))};
  if (apply && changes.some(change => change.before !== change.after)) {
    const backup = path.join(core, `.${marker}.backup`);
    await fs.mkdir(backup);
    for (const change of changes) if (change.before !== null) await fs.writeFile(path.join(backup, change.name), change.before);
    await fs.writeFile(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const dist = path.join(core, 'dist');
    for (const change of changes) if (change.before !== change.after) {
      const target = path.join(dist, change.name);
      const metadata = change.before === null ? await fs.stat(path.join(dist, changes[0].name)) : await fs.stat(target);
      await atomicWrite(target, change.after, metadata);
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [core, mode] = process.argv.slice(2);
  if (!core || !path.isAbsolute(core) || !['--check', '--apply'].includes(mode)) {
    console.error('Usage: node patch-openclaw94-cron-shared-management.mjs /absolute/core --check|--apply');
    process.exitCode = 1;
  } else applyPatch(core, mode === '--apply').then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
