import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const marker = 'vlab91-runtime-footer-v1';
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one footer anchor: ${before.slice(0, 70)}`);
  return source.replace(before, after);
}
export function patchPrefix(source) {
  if (source.includes(marker)) return source;
  return replaceOnce(source, '\t\tprefixContext.provider = ctx.provider;',
    `\t\t// ${marker}\n\t\tprefixContext.agentRuntime = typeof ctx.agentRuntime === "string" ? ctx.agentRuntime : undefined;\n\t\tprefixContext.provider = ctx.provider;`);
}
export function patchCard(source) {
  if (source.includes(marker)) return source;
  return replaceOnce(source, '\tif (prefixCtx.provider) parts.push(`Provider: ${prefixCtx.provider}`);',
    '\tif (prefixCtx.provider) parts.push(`Provider: ${prefixCtx.provider}`);\n' +
    `\t// ${marker}\n` +
    '\tif (typeof prefixCtx.agentRuntime === "string" && prefixCtx.agentRuntime) parts.push(`Runtime: ${prefixCtx.agentRuntime}`);');
}
export function patchRunner(source, resolverFile) {
  if (source.includes(marker)) return source;
  const anchor = '\t\t\tturn.opts?.onModelSelected?.({\n\t\t\t\tprovider,\n\t\t\t\tmodel,\n\t\t\t\tthinkLevel: candidateThinkLevel\n\t\t\t});';
  const replacement = `\t\t\t// ${marker}\n\t\t\tturn.opts?.onModelSelected?.({
\t\t\t\tprovider,
\t\t\t\tmodel,
\t\t\t\tagentRuntime: runtime.useCliExecution ? runtime.cliExecutionProvider : resolveVlabCardRuntime({
\t\t\t\t\tcfg: params.runtimeConfig, provider, modelId: model,
\t\t\t\t\tagentId: turn.followupRun.run.agentId,
\t\t\t\t\tsessionKey: turn.followupRun.run.runtimePolicySessionKey ?? turn.sessionKey,
\t\t\t\t\tsessionEntry: params.liveModelSwitchRuntimeEntry ?? turn.getActiveSessionEntry()
\t\t\t\t}),
\t\t\t\tthinkLevel: candidateThinkLevel
\t\t\t});`;
  if (!/^thinking-runtime-[\w-]+\.js$/.test(resolverFile)) throw new Error('Unexpected runtime resolver filename');
  return `import { o as resolveVlabCardRuntime } from "./${resolverFile}";\n` + replaceOnce(source, anchor, replacement);
}
async function unique(dir, pattern, anchor) {
  let names = (await fs.readdir(dir)).filter(n => pattern.test(n));
  if (anchor) {
    const matches = await Promise.all(names.map(async n => (await fs.readFile(path.join(dir,n),'utf8')).includes(anchor)));
    names = names.filter((_, i) => matches[i]);
  }
  if (names.length !== 1) throw new Error(`Expected one ${pattern}, got ${names.length}`);
  return names[0];
}
async function main() {
  const [core, feishu, mode] = process.argv.slice(2);
  if (!core || !feishu || !['--check', '--apply'].includes(mode)) throw new Error('Usage: core-package feishu-package --check|--apply');
  const version = JSON.parse(await fs.readFile(path.join(core, 'package.json'))).version;
  if (version !== '2026.9.1') throw new Error(`Unaudited core ${version}`);
  const dist = path.join(core, 'dist'), channelDist = path.join(feishu, 'dist');
  const resolver = await unique(dist, /^thinking-runtime-[\w-]+\.js$/, 'resolveEffectiveAgentRuntime as o');
  const resolverSource = await fs.readFile(path.join(dist, resolver), 'utf8');
  if (!resolverSource.includes('resolveEffectiveAgentRuntime as o')) throw new Error('Runtime export changed');
  const specs = [
    [path.join(dist, await unique(dist, /^reply-prefix-[\w-]+\.js$/, 'function createReplyPrefixContext')), patchPrefix],
    [path.join(dist, await unique(dist, /^agent-runner\.runtime-[\w-]+\.js$/, 'turn.opts?.onModelSelected?.')), s => patchRunner(s, resolver)],
    [path.join(channelDist, await unique(channelDist, /^monitor\.account-[\w-]+\.js$/, 'function resolveCardNote')), patchCard],
  ];
  // Validate every anchor before changing any file.
  const changes = await Promise.all(specs.map(async ([file, patch]) => {
    const before = await fs.readFile(file, 'utf8');
    return {file, before, after: patch(before)};
  }));
  for (const c of changes) {
    if (mode === '--apply' && c.before !== c.after) {
      await fs.copyFile(c.file, c.file + '.' + marker + '.bak', fs.constants.COPYFILE_EXCL);
      const stat = await fs.stat(c.file), temp = c.file + `.tmp-${process.pid}`;
      await fs.writeFile(temp, c.after, {mode: stat.mode});
      await fs.chown(temp, stat.uid, stat.gid);
      await fs.rename(temp, c.file);
    }
    console.log(`${mode} ${c.before === c.after ? 'unchanged' : 'patched'} ${c.file}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => {console.error(e.message); process.exitCode = 1;});
