#!/usr/bin/env node
// /neon = Gemini 4 Neon on the Antigravity CLI (Tianyi 2026-11-28), run as an
// OpenClaw CLI harness the way /vcc runs Claude Code: plugin
// apps/v-antigravity (backend `antigravity-cli`), agy's own login of
// Tianyi's Google AI Pro account in `agyHome`.
//
// Changes (Gateway openclaw.json; the Worker config is derived from it and
// keeps `antigravity-cli`, which only the Gateway runs):
//   plugins.load.paths += <pluginDir>, plugins.allow += v-antigravity,
//   plugins.entries.v-antigravity = {enabled, config:{agyBin, agyHome, runRoot}}
//   models.providers.antigravity = catalog row for gemini-4-neon (never called directly)
//   agents.defaults.modelPolicy.allow += antigravity/*
//   agents.defaults.models + agents.entries.makaron.models:
//     antigravity/gemini-4-neon = {alias: neon, agentRuntime: antigravity-cli, thinking: high}
//   channels.feishu.visibleProgressRuntimes += antigravity-cli (from the plugin's
//     default codex/vlab-worker/claude-cli when unset), so the Feishu reply card
//     shows /neon's process (commentary, tool lines) the way it does for /vcc
//
//   node gemini-neon-alias.mjs plan   <config.json> [--plugin-dir D] [--agy-bin B] [--agy-home H]
//   node gemini-neon-alias.mjs verify <config.json> [same options]
//   node gemini-neon-alias.mjs revert <config.json>
//   node gemini-neon-alias.mjs apply  <config.json> --cli <openclaw.mjs> [same options]
//
// plugins.load.paths, plugins.entries and the Feishu list (read when the channel
// starts) need a Gateway restart on V (run apply
// inside v-self-restart --while-stopped). No secrets are read or printed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PLUGIN_ID = 'v-antigravity';
export const PROVIDER = 'antigravity';
export const RUNTIME = 'antigravity-cli';
export const ALIAS = 'neon';
export const THINKING = 'high';
export const REF = `${PROVIDER}/gemini-4-neon`;
export const SCOPES = ['agents.defaults.models', 'agents.entries.makaron.models'];
export const DEFAULTS = Object.freeze({
  pluginDir: '/home/openclaw/.openclaw/extensions/v-antigravity',
  agyBin: '/opt/agy/current/agy',
  agyHome: '/home/openclaw/.agy-home',
});

// V's Feishu plugin (worker-visible-progress-v4) when the key is unset.
export const FEISHU_PROGRESS_DEFAULTS = Object.freeze(['codex', 'vlab-worker', 'claude-cli']);
const FEISHU_PROGRESS_PATH = 'channels.feishu.visibleProgressRuntimes';
const feishuProgress = (config) => {
  const cur = config.channels?.feishu?.visibleProgressRuntimes;
  return Array.isArray(cur) && cur.length ? cur : [...FEISHU_PROGRESS_DEFAULTS];
};

export const ROW = {
  id: 'gemini-4-neon', name: 'Gemini 4 Neon (Antigravity)', api: 'google-generative-ai', reasoning: true,
  input: ['text', 'image'],
  // Subscription allowance, not metered API spend.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1048576, maxTokens: 65536,
};

export function providerBlock() {
  // The catalog row the alias resolves to. Turns run on the CLI harness; this
  // URL is the public Gemini API and has no key, so nothing is ever sent here.
  return { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai', models: [ROW] };
}

export function pluginEntry(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  for (const k of ['agyBin', 'agyHome']) if (!path.isAbsolute(o[k])) throw new Error(`${k} must be absolute`);
  return { enabled: true, config: { agyBin: o.agyBin, agyHome: o.agyHome, runRoot: path.join(o.agyHome, 'openclaw-runs'), defaultEffort: THINKING, modelProvider: PROVIDER } };
}

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => o?.[k], obj);
const lower = (s) => String(s ?? '').toLowerCase();
const scopeMaps = (config) => SCOPES.map((w) => [w, get(config, w)]).filter(([, m]) => m && typeof m === 'object');
const norm = (p) => String(p).replace(/\/+$/u, '');

export function plan(config, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!path.isAbsolute(o.pluginDir)) throw new Error('pluginDir must be absolute');
  const sets = [];
  const paths = config.plugins?.load?.paths ?? [];
  if (!paths.some((p) => norm(p) === norm(o.pluginDir))) sets.push({ path: 'plugins.load.paths', value: [...paths, o.pluginDir] });
  const allowPlugins = config.plugins?.allow;
  if (Array.isArray(allowPlugins) && allowPlugins.length && !allowPlugins.includes(PLUGIN_ID)) sets.push({ path: 'plugins.allow', value: [...allowPlugins, PLUGIN_ID] });
  const entry = pluginEntry(o);
  if (JSON.stringify(config.plugins?.entries?.[PLUGIN_ID]) !== JSON.stringify(entry)) sets.push({ path: `plugins.entries.${PLUGIN_ID}`, value: entry });
  if (JSON.stringify(config.models?.providers?.[PROVIDER]) !== JSON.stringify(providerBlock())) sets.push({ path: `models.providers.${PROVIDER}`, value: providerBlock() });
  const allow = config.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(`${PROVIDER}/*`)) sets.push({ path: 'agents.defaults.modelPolicy.allow', value: [...allow, `${PROVIDER}/*`] });
  for (const [where, map] of scopeMaps(config)) {
    const owner = Object.entries(map).find(([, v]) => lower(v?.alias) === ALIAS);
    if (owner && owner[0] !== REF) throw new Error(`${where}: /${ALIAS} already points at ${owner[0]}`);
    const want = { alias: ALIAS, agentRuntime: { id: RUNTIME }, params: { thinking: THINKING } };
    if (JSON.stringify(map[REF]) !== JSON.stringify(want)) sets.push({ path: where, value: { [REF]: want } });
  }
  if (config.channels?.feishu && !feishuProgress(config).includes(RUNTIME)) sets.push({ path: FEISHU_PROGRESS_PATH, value: [...feishuProgress(config), RUNTIME] });
  return { sets };
}

export function revert(config, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const unset = [];
  const sets = [];
  for (const [where, map] of scopeMaps(config)) if (map[REF]) unset.push(`${where}["${REF}"]`);
  const allow = config.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(allow) && allow.includes(`${PROVIDER}/*`)) sets.push({ path: 'agents.defaults.modelPolicy.allow', value: allow.filter((a) => a !== `${PROVIDER}/*`) });
  if (config.models?.providers?.[PROVIDER]) unset.push(`models.providers.${PROVIDER}`);
  // The plugin is switched off, not deleted: a load path to a missing directory breaks the config.
  if (config.plugins?.entries?.[PLUGIN_ID]) sets.push({ path: `plugins.entries.${PLUGIN_ID}`, value: { enabled: false } });
  const paths = config.plugins?.load?.paths;
  if (Array.isArray(paths) && paths.some((p) => norm(p) === norm(o.pluginDir))) sets.push({ path: 'plugins.load.paths', value: paths.filter((p) => norm(p) !== norm(o.pluginDir)) });
  const progress = config.channels?.feishu?.visibleProgressRuntimes;
  if (Array.isArray(progress) && progress.includes(RUNTIME)) {
    const rest = progress.filter((r) => r !== RUNTIME);
    if (JSON.stringify(rest) === JSON.stringify(FEISHU_PROGRESS_DEFAULTS)) unset.push(FEISHU_PROGRESS_PATH);
    else sets.push({ path: FEISHU_PROGRESS_PATH, value: rest });
  }
  return { unset, sets };
}

export function verify(config, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const problems = [];
  if (!(config.plugins?.load?.paths ?? []).some((p) => norm(p) === norm(o.pluginDir))) problems.push('plugin load path missing');
  if (JSON.stringify(config.plugins?.entries?.[PLUGIN_ID]) !== JSON.stringify(pluginEntry(o))) problems.push('plugin entry differs');
  const allowPlugins = config.plugins?.allow;
  if (Array.isArray(allowPlugins) && allowPlugins.length && !allowPlugins.includes(PLUGIN_ID)) problems.push('plugins.allow lacks the plugin');
  if (JSON.stringify(config.models?.providers?.[PROVIDER]) !== JSON.stringify(providerBlock())) problems.push('model provider differs');
  if (!config.agents?.defaults?.modelPolicy?.allow?.includes(`${PROVIDER}/*`)) problems.push('modelPolicy.allow lacks the provider');
  if (config.channels?.feishu && !feishuProgress(config).includes(RUNTIME)) problems.push('Feishu visibleProgressRuntimes lacks the runtime');
  const aliases = {};
  for (const [where, map] of scopeMaps(config)) {
    const owners = Object.entries(map).filter(([, v]) => lower(v?.alias) === ALIAS).map(([k]) => k);
    aliases[`${where}:/${ALIAS}`] = { ref: owners.join(','), runtime: map[REF]?.agentRuntime?.id, thinking: map[REF]?.params?.thinking };
    if (owners.length !== 1 || owners[0] !== REF) problems.push(`${where}: /${ALIAS} -> ${owners}`);
    if (map[REF]?.agentRuntime?.id !== RUNTIME) problems.push(`${where}: runtime is ${map[REF]?.agentRuntime?.id}`);
  }
  return { ok: problems.length === 0, problems, aliases };
}

export function apply(file, { cli, ...opts }) {
  const { sets } = plan(JSON.parse(fs.readFileSync(file, 'utf8')), opts);
  for (const s of sets) {
    const t = Date.now();
    const out = execFileSync(process.execPath, [cli, 'config', 'set', s.path, JSON.stringify(s.value), '--strict-json', '--merge'], {
      env: { ...process.env, OPENCLAW_CONFIG_PATH: file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().split('\n').at(-1)?.slice(0, 160);
    console.log('SET', s.path, `${Date.now() - t}ms`, out);
  }
  return verify(JSON.parse(fs.readFileSync(file, 'utf8')), opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const opts = Object.fromEntries([['pluginDir', opt('--plugin-dir')], ['agyBin', opt('--agy-bin')], ['agyHome', opt('--agy-home')]].filter(([, v]) => v));
  const cli = opt('--cli');
  if (!['plan', 'verify', 'revert', 'apply'].includes(mode) || !file || (mode === 'apply' && !cli)) {
    console.error('usage: gemini-neon-alias.mjs plan|verify|revert <config.json> [--plugin-dir D] [--agy-bin B] [--agy-home H]\n       gemini-neon-alias.mjs apply <config.json> --cli <openclaw.mjs> [...]');
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = mode === 'plan' ? plan(config, opts) : mode === 'revert' ? revert(config, opts) : mode === 'apply' ? apply(file, { cli, ...opts }) : verify(config, opts);
  console.log(JSON.stringify(out, null, 1));
  if ((mode === 'verify' || mode === 'apply') && !out.ok) process.exit(1);
}
