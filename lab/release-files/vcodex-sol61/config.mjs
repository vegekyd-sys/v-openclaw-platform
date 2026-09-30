import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const target = 'openai/gpt-6.1-sol';
export function configureVcodex(input, {codexCommand} = {}) {
  const cfg = structuredClone(input);
  const defaults = cfg.agents?.defaults;
  assert(defaults?.models, 'agents.defaults.models required');
  const policy = defaults.modelPolicy?.allow ?? [];
  assert(policy.some(p => p === target || p === 'openai/*'), 'GPT-6.1 Sol is not admitted by modelPolicy');
  const nodes = [defaults, cfg.agents.entries?.makaron].filter(Boolean);
  for (const node of nodes) {
    const models = node.models ??= {};
    for (const [ref, row] of Object.entries(models)) {
      if (row?.alias?.toLowerCase() !== 'vcodex' || ref === target) continue;
      const fallback = {'openai/gpt-6-sol': 'vcodex60', 'openai/gpt-5.6-sol': 'vcodex56'}[ref];
      assert(fallback, `Refusing to replace unexpected /vcodex route ${ref}`);
      assert(!Object.entries(models).some(([key, value]) => key !== ref && value?.alias?.toLowerCase() === fallback), `Alias /${fallback} is already occupied`);
      row.alias = fallback;
    }
    const previous = models[target] ?? models['openai/gpt-6-sol'] ?? models['openai/gpt-5.6-sol'];
    assert(previous, 'No existing Sol configuration to inherit');
    models[target] = {...structuredClone(previous), alias: 'vcodex', params: {...previous.params, thinking: 'medium'}, agentRuntime: {id: 'codex'}};
  }
  for (const node of nodes) {
    const merged = {...defaults.models, ...node.models};
    const aliases = Object.entries(merged).filter(([, v]) => v?.alias?.toLowerCase() === 'vcodex');
    assert.deepEqual(aliases.map(([k]) => k), [target], 'Merged /vcodex alias must resolve uniquely');
  }
  if (codexCommand) {
    assert(path.isAbsolute(codexCommand), 'Codex command must be absolute');
    const plugin = cfg.plugins?.entries?.codex;
    if (plugin) {
      plugin.config ??= {};
      plugin.config.appServer ??= {};
      plugin.config.appServer.command = codexCommand;
    }
  }
  return cfg;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  let codexCommand;
  for (let i=0; i<flags.length; i++) {
    if (flags[i] === '--apply') continue;
    assert(flags[i] === '--codex-bin' && flags[i+1], 'usage: node config.mjs CONFIG [--codex-bin PATH] [--apply]');
    codexCommand = flags[++i];
  }
  assert(file && (!apply || codexCommand), '--apply requires --codex-bin for the tested 0.159.2 client');
  if (codexCommand) assert.equal(execFileSync(codexCommand,['--version'],{encoding:'utf8'}).trim(),'codex-cli 0.159.2','Codex version differs from tested release');
  const before = fs.readFileSync(file, 'utf8');
  const next = configureVcodex(JSON.parse(before),{codexCommand});
  console.log(JSON.stringify({apply,codexVersion:'0.159.2',routes: Object.fromEntries(Object.entries(next.agents.defaults.models).filter(([, v]) => v?.alias?.startsWith('vcodex')).map(([key,value])=>[key,{alias:value.alias,thinking:value.params?.thinking,runtime:value.agentRuntime?.id}]))}));
  if (apply && JSON.stringify(JSON.parse(before)) !== JSON.stringify(next)) {
    const backup = `${file}.before-sol61-${Date.now()}`;
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    const stat = fs.statSync(file), temp = `${file}.sol61.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', {flag: 'wx', mode: stat.mode & 0o777});
    fs.chownSync(temp, stat.uid, stat.gid);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'Configuration changed concurrently');
    fs.renameSync(temp, file);
    console.log(JSON.stringify({backup}));
  }
}
