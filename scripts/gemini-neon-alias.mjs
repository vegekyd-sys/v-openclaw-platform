#!/usr/bin/env node
// Add /neon: Gemini 4 Neon on Tianyi's Google AI Pro account, served to the
// PI harness (vlab-worker) through apps/gemini-account-bridge on loopback.
//
// OpenClaw sees an ordinary Gemini API provider (`google-generative-ai`), so
// tools, images, streaming and thinking go through the built-in Google
// transport; only the base URL points at the bridge. There is no shared
// secret: the bridge admits callers by the local Unix user that owns the
// loopback connection (openclaw on V). The apiKey below is a fixed, non-secret
// marker because the Google transport always sends one. (A store/file
// SecretRef cannot be used here: in 2026.9.1 provider keys from those sources
// are sentinels that only the egress proxy swaps, and loopback calls bypass it.)
//
// Works on either config shape (Gateway openclaw.json or the Worker's
// worker-openclaw.json): the new alias copies agentRuntime from the scope's
// /deepseek entry (deepseek/deepseek-flash), so the Gateway gets `vlab-worker`
// and the Worker `openclaw`.
//
//   node gemini-neon-alias.mjs plan   <config.json> [--base-url URL]
//   node gemini-neon-alias.mjs verify <config.json> [--base-url URL]
//   node gemini-neon-alias.mjs revert <config.json>
//   node gemini-neon-alias.mjs apply  <config.json> --cli <openclaw.mjs> [--base-url URL]
//
// `plan` sets are applied with `openclaw config set <path> '<value>' --strict-json --merge`
// (OPENCLAW_CONFIG_PATH selects the file); `revert` emits `config unset` paths
// plus sets. No secret values are read or printed.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const PROVIDER = 'gemini-account';
export const API_KEY_MARKER = 'loopback-uid-auth';
export const ALIAS = 'neon';
export const THINKING = 'medium';
export const DEFAULT_BASE_URL = 'http://127.0.0.1:25990/v1beta';
export const REF = `${PROVIDER}/gemini-4-neon`;
// Scopes that get the alias, and the entry whose runtime it copies.
export const SCOPES = ['agents.defaults.models', 'agents.entries.makaron.models'];
export const RUNTIME_SOURCE = 'deepseek/deepseek-flash';

export const ROW = {
  id: 'gemini-4-neon', name: 'Gemini 4 Neon (account)', api: 'google-generative-ai', reasoning: true,
  input: ['text', 'image'],
  // Subscription allowance, not metered API spend.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1048576, maxTokens: 65536,
};

export function providerBlock({ baseUrl = DEFAULT_BASE_URL } = {}) {
  return {
    baseUrl, api: 'google-generative-ai',
    apiKey: API_KEY_MARKER,
    models: [ROW],
  };
}

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => o?.[k], obj);
const lower = (s) => String(s ?? '').toLowerCase();

function scopeMaps(config) {
  return SCOPES.map((where) => [where, get(config, where)]).filter(([, map]) => map && typeof map === 'object');
}

export function plan(config, opts = {}) {
  const sets = [];
  const provider = providerBlock(opts);
  if (JSON.stringify(config.models?.providers?.[PROVIDER]) !== JSON.stringify(provider)) {
    sets.push({ path: `models.providers.${PROVIDER}`, value: provider });
  }
  const allow = config.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(`${PROVIDER}/*`)) {
    sets.push({ path: 'agents.defaults.modelPolicy.allow', value: [...allow, `${PROVIDER}/*`] });
  }
  for (const [where, map] of scopeMaps(config)) {
    const owner = Object.entries(map).find(([, v]) => lower(v?.alias) === ALIAS);
    if (owner && owner[0] !== REF) throw new Error(`${where}: /${ALIAS} already points at ${owner[0]}`);
    const runtime = map[RUNTIME_SOURCE]?.agentRuntime?.id;
    if (!runtime) throw new Error(`${where}: no ${RUNTIME_SOURCE} entry to copy the runtime from`);
    const want = { alias: ALIAS, agentRuntime: { id: runtime }, params: { thinking: THINKING } };
    if (JSON.stringify(map[REF]) !== JSON.stringify(want)) sets.push({ path: where, value: { [REF]: want } });
  }
  return { sets };
}

export function revert(config) {
  const unset = [];
  const sets = [];
  for (const [where, map] of scopeMaps(config)) if (map[REF]) unset.push(`${where}["${REF}"]`);
  const allow = config.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(allow) && allow.includes(`${PROVIDER}/*`)) {
    sets.push({ path: 'agents.defaults.modelPolicy.allow', value: allow.filter((a) => a !== `${PROVIDER}/*`) });
  }
  if (config.models?.providers?.[PROVIDER]) unset.push(`models.providers.${PROVIDER}`);
  return { unset, sets };
}

export function verify(config, opts = {}) {
  const problems = [];
  if (JSON.stringify(config.models?.providers?.[PROVIDER]) !== JSON.stringify(providerBlock(opts))) problems.push('model provider differs');
  if (!config.agents?.defaults?.modelPolicy?.allow?.includes(`${PROVIDER}/*`)) problems.push('modelPolicy.allow lacks the provider');
  const aliases = {};
  for (const [where, map] of scopeMaps(config)) {
    const owners = Object.entries(map).filter(([, v]) => lower(v?.alias) === ALIAS).map(([k]) => k);
    aliases[`${where}:/${ALIAS}`] = { ref: owners.join(','), runtime: map[REF]?.agentRuntime?.id, thinking: map[REF]?.params?.thinking };
    if (owners.length !== 1 || owners[0] !== REF) problems.push(`${where}: /${ALIAS} -> ${owners}`);
    if (map[REF]?.agentRuntime?.id !== map[RUNTIME_SOURCE]?.agentRuntime?.id) problems.push(`${where}: runtime differs from ${RUNTIME_SOURCE}`);
  }
  return { ok: problems.length === 0, problems, aliases };
}

function cliRun(cli, file, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split('\n').at(-1)?.slice(0, 160);
}

// Run the planned sets through the real CLI, then verify. Prints paths and
// CLI status lines only, never values from the file.
export function apply(file, { cli, ...opts }) {
  const { sets } = plan(JSON.parse(fs.readFileSync(file, 'utf8')), opts);
  for (const s of sets) {
    const t = Date.now();
    const out = cliRun(cli, file, ['config', 'set', s.path, JSON.stringify(s.value), '--strict-json', '--merge']);
    console.log('SET', s.path, `${Date.now() - t}ms`, out);
  }
  return verify(JSON.parse(fs.readFileSync(file, 'utf8')), opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const opts = { baseUrl: opt('--base-url') ?? DEFAULT_BASE_URL };
  const cli = opt('--cli');
  if (!['plan', 'verify', 'revert', 'apply'].includes(mode) || !file || (mode === 'apply' && !cli)) {
    console.error('usage: gemini-neon-alias.mjs plan|verify|revert <config.json> [--base-url URL]\n       gemini-neon-alias.mjs apply <config.json> --cli <openclaw.mjs> [--base-url URL]');
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = mode === 'plan' ? plan(config, opts)
    : mode === 'revert' ? revert(config)
    : mode === 'apply' ? apply(file, { cli, ...opts })
    : verify(config, opts);
  console.log(JSON.stringify(out, null, 1));
  if ((mode === 'verify' || mode === 'apply') && !out.ok) process.exit(1);
}
