#!/usr/bin/env node
// Point /vcodex at GPT-6.2 Sol and /astra at GPT-6.2 Astra on OpenClaw 2026.9.1,
// and run /terra (GPT-6.1 Terra) on the Codex harness. All three run at
// thinking=high (Tianyi 2026-11-18); the fallback aliases keep their old level.
//
// Works on either config shape (Gateway openclaw.json or the Worker's
// worker-openclaw.json): every change copies the runtime/params of the entry
// that currently owns the alias, so the Gateway keeps `vlab-worker` where the
// Worker keeps `openclaw`. The old models stay reachable as /vcodex61, /astra60.
//
//   node gpt62-aliases.mjs plan   <config.json> [--codex-command ABS]  -> {sets:[{path,value}]}
//   node gpt62-aliases.mjs verify <config.json> [--codex-command ABS]  -> exit 1 on mismatch
//   node gpt62-aliases.mjs revert <config.json>                         -> {sets} that undo the aliases
//   node gpt62-aliases.mjs apply  <config.json> --cli <openclaw.mjs> [--codex-command ABS]
//
// `plan` output is applied with `openclaw config set <path> '<value>' --strict-json --merge`
// (OPENCLAW_CONFIG_PATH selects the file). No secrets are read or printed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROWS = {
  'gpt-6.2-sol': {
    id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol', api: 'openai-chatgpt-responses', reasoning: true,
    input: ['text', 'image'],
    // OpenAI: Sol 6.2 keeps the GPT-6.1 Sol price.
    cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    contextWindow: 500000, contextTokens: 272000, maxTokens: 128000,
    compat: { supportsReasoningEffort: true, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  },
  'gpt-6.2-astra': {
    id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra', api: 'openai-chatgpt-responses', reasoning: true,
    input: ['text', 'image'],
    // Same zero cost the running GPT-6 Astra entry reports (subscription only).
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272000, contextTokens: 272000, maxTokens: 128000,
    compat: { supportsReasoningEffort: true, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  },
};

// alias -> [old ref, new ref, fallback alias for the old ref]
export const MOVES = [
  ['vcodex', 'openai/gpt-6.1-sol', 'openai/gpt-6.2-sol', 'vcodex61'],
  ['astra', 'openai/gpt-6-astra', 'openai/gpt-6.2-astra', 'astra60'],
];

// alias -> [ref, runtime id]: same model, moved onto another harness in every
// scope that defines the alias (Tianyi 2026-11-18: /terra runs on Codex).
// `revert` does not undo this; roll back from the config backups instead.
export const THINKING = 'high';

export const RUNTIMES = [
  ['terra', 'openai/gpt-6.1-terra', 'codex'],
];

const lower = (s) => String(s ?? '').toLowerCase();

function modelScopes(config) {
  const scopes = [];
  const d = config.agents?.defaults?.models;
  if (d) scopes.push(['agents.defaults.models', d]);
  for (const [id, entry] of Object.entries(config.agents?.entries ?? {})) {
    if (entry?.models) scopes.push([`agents.entries.${id}.models`, entry.models]);
  }
  return scopes;
}

function assertAliasFree(map, alias, where, except) {
  for (const [ref, v] of Object.entries(map)) {
    if (ref !== except && lower(v?.alias) === lower(alias)) throw new Error(`${where}: alias ${alias} already used by ${ref}`);
  }
}

export function plan(config, { codexCommand } = {}) {
  const sets = [];
  const existing = config.models?.providers?.openai?.models ?? [];
  const ids = new Set(existing.map((m) => m.id));
  const missing = Object.values(ROWS).filter((r) => !ids.has(r.id));
  if (missing.length) sets.push({ path: 'models.providers.openai.models', value: [...existing, ...missing] });

  for (const [where, map] of modelScopes(config)) {
    const patch = {};
    for (const [alias, oldRef, newRef, fallback] of MOVES) {
      const owner = map[oldRef];
      if (lower(owner?.alias) !== alias) {
        if (lower(map[newRef]?.alias) === alias) { // already migrated; only the thinking level may lag
          if (map[newRef].params?.thinking !== THINKING) patch[newRef] = { params: { thinking: THINKING } };
          continue;
        }
        const other = Object.entries(map).find(([, v]) => lower(v?.alias) === alias);
        if (other) throw new Error(`${where}: /${alias} points at ${other[0]}, expected ${oldRef}`);
        continue; // this scope does not define the alias
      }
      assertAliasFree(map, fallback, where, oldRef);
      const { alias: _drop, ...rest } = owner;
      const moved = structuredClone(rest);
      patch[newRef] = { ...moved, params: { ...moved.params, thinking: THINKING }, alias };
      patch[oldRef] = { ...structuredClone(rest), alias: fallback };
    }
    for (const [alias, ref, runtime] of RUNTIMES) {
      const owner = Object.entries(map).find(([, v]) => lower(v?.alias) === alias);
      if (!owner) continue;
      if (owner[0] !== ref) throw new Error(`${where}: /${alias} points at ${owner[0]}, expected ${ref}`);
      const want = {};
      if (owner[1].agentRuntime?.id !== runtime) want.agentRuntime = { id: runtime };
      if (owner[1].params?.thinking !== THINKING) want.params = { thinking: THINKING };
      if (Object.keys(want).length) patch[ref] = want;
    }
    if (Object.keys(patch).length) sets.push({ path: where, value: patch });
  }

  if (codexCommand) {
    if (!path.isAbsolute(codexCommand)) throw new Error('--codex-command must be absolute');
    const app = config.plugins?.entries?.codex?.config?.appServer;
    // `config set --merge` refuses scalars; merge the object so mode/sandbox/homeScope stay.
    if (app && app.command !== codexCommand) sets.push({ path: 'plugins.entries.codex.config.appServer', value: { command: codexCommand } });
  }
  return { sets };
}

export function revert(config) {
  const sets = [];
  for (const [where, map] of modelScopes(config)) {
    const patch = {};
    for (const [alias, oldRef, newRef, fallback] of MOVES) {
      if (lower(map[newRef]?.alias) !== alias || lower(map[oldRef]?.alias) !== fallback) continue;
      patch[newRef] = { ...map[newRef], alias: `${alias}62` };
      patch[oldRef] = { ...map[oldRef], alias };
    }
    if (Object.keys(patch).length) sets.push({ path: where, value: patch });
  }
  return { sets };
}

export function verify(config, { codexCommand } = {}) {
  const problems = [];
  const rows = config.models?.providers?.openai?.models ?? [];
  for (const row of Object.values(ROWS)) {
    const got = rows.find((m) => m.id === row.id);
    if (JSON.stringify(got) !== JSON.stringify(row)) problems.push(`provider row ${row.id} differs`);
  }
  const report = {};
  for (const [where, map] of modelScopes(config)) {
    for (const [alias, oldRef, newRef, fallback] of MOVES) {
      const owners = Object.entries(map).filter(([, v]) => lower(v?.alias) === alias).map(([k]) => k);
      if (!owners.length) continue;
      report[`${where}:/${alias}`] = { ref: owners.join(','), runtime: map[newRef]?.agentRuntime?.id, thinking: map[newRef]?.params?.thinking };
      if (owners.length !== 1 || owners[0] !== newRef) problems.push(`${where}: /${alias} -> ${owners}`);
      if (lower(map[oldRef]?.alias) !== fallback) problems.push(`${where}: ${oldRef} alias is ${map[oldRef]?.alias}, expected ${fallback}`);
      const strip = ({ alias: _a, params: { thinking: _t, ...p } = {}, ...r }) => JSON.stringify({ ...r, params: p });
      if (map[newRef]?.params?.thinking !== THINKING) problems.push(`${where}: ${newRef} thinking is ${map[newRef]?.params?.thinking}`);
      if (map[oldRef] && map[newRef] && strip(map[oldRef]) !== strip(map[newRef])) problems.push(`${where}: ${newRef} params/runtime differ from ${oldRef}`);
    }
    for (const [alias, ref, runtime] of RUNTIMES) {
      const owners = Object.entries(map).filter(([, v]) => lower(v?.alias) === alias).map(([k]) => k);
      if (!owners.length) continue;
      report[`${where}:/${alias}`] = { ref: owners.join(','), runtime: map[ref]?.agentRuntime?.id, thinking: map[ref]?.params?.thinking };
      if (owners.length !== 1 || owners[0] !== ref) problems.push(`${where}: /${alias} -> ${owners}`);
      if (map[ref]?.params?.thinking !== THINKING) problems.push(`${where}: ${ref} thinking is ${map[ref]?.params?.thinking}`);
      if (map[ref]?.agentRuntime?.id !== runtime) problems.push(`${where}: ${ref} runtime is ${map[ref]?.agentRuntime?.id}, expected ${runtime}`);
    }
  }
  const app = config.plugins?.entries?.codex?.config?.appServer;
  if (codexCommand && app && app.command !== codexCommand) problems.push(`codex appServer.command is ${app.command}`);
  return { ok: problems.length === 0, problems, aliases: report, codexCommand: app?.command ?? null };
}

// Run the planned sets through the real CLI, then verify. Prints paths and CLI
// status lines only, never values from the file.
export function apply(file, { cli, codexCommand }) {
  const { sets } = plan(JSON.parse(fs.readFileSync(file, 'utf8')), { codexCommand });
  for (const s of sets) {
    const t = Date.now();
    const out = execFileSync(process.execPath, [cli, 'config', 'set', s.path, JSON.stringify(s.value), '--strict-json', '--merge'], {
      env: { ...process.env, OPENCLAW_CONFIG_PATH: file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log('SET', s.path, `${Date.now() - t}ms`, out.trim().split('\n').at(-1)?.slice(0, 160));
  }
  return verify(JSON.parse(fs.readFileSync(file, 'utf8')), { codexCommand });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const codexCommand = opt('--codex-command');
  const cli = opt('--cli');
  if (!['plan', 'verify', 'revert', 'apply'].includes(mode) || !file || (mode === 'apply' && !cli)) {
    console.error('usage: gpt62-aliases.mjs plan|verify|revert <config.json> [--codex-command ABS]\n       gpt62-aliases.mjs apply <config.json> --cli <openclaw.mjs> [--codex-command ABS]');
    process.exit(2);
  }
  if (codexCommand && mode !== 'revert' && !fs.existsSync(codexCommand)) {
    console.error(`--codex-command does not exist: ${codexCommand}`);
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = mode === 'plan' ? plan(config, { codexCommand })
    : mode === 'revert' ? revert(config)
    : mode === 'apply' ? apply(file, { cli, codexCommand })
    : verify(config, { codexCommand });
  console.log(JSON.stringify(mode === 'apply' ? { ok: out.ok, problems: out.problems, codexCommand: out.codexCommand } : out, null, 1));
  if ((mode === 'verify' || mode === 'apply') && !out.ok) process.exit(1);
}
