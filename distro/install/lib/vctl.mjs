#!/usr/bin/env node
// The installer's working parts, called by install.sh / update.sh / rollback.sh
// (run as root, with the distro's own Node). Each subcommand does one step and
// prints one JSON line, so the shell scripts stay a readable sequence.
//
//   vctl.mjs verify <pkgDir>
//   vctl.mjs install-release <pkgDir> [--registry URL]      copy to releases/<version>, npm ci, overlays, tools
//   vctl.mjs split-env <input.env>                          -> /etc/v/install.env + /etc/v/secrets.env
//   vctl.mjs switch <version>                               current -> releases/<version>, previous -> old current
//   vctl.mjs configure                                      openclaw.json + codex home from /opt/v/current
//   vctl.mjs seed-workspace                                 first install only
//   vctl.mjs units                                          systemd units from /opt/v/current
//   vctl.mjs health [--deadline-ms N]
//   vctl.mjs probe [--check-history] [--model ID]
//   vctl.mjs snapshot <dir> | restore <dir>                 state copy (Gateway must be stopped)
//   vctl.mjs overlay-plugins [--restart]                  V's bytes over OpenClaw-installed official plugins
//   vctl.mjs status
//   vctl.mjs fingerprint <out.json> | fingerprint --compare <before.json>   workspace + databases kept?

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyPackage, installRelease, installTools, readJson, copyTree, overlayStatePlugins } from './release.mjs';

export const PATHS = {
  prefix: process.env.V_PREFIX || '/opt/v',
  etc: process.env.V_ETC || '/etc/v',
  user: process.env.V_USER || 'openclaw',
  home: process.env.V_HOME || '/home/openclaw',
  units: process.env.V_SYSTEMD_DIR || '/etc/systemd/system',
  evidence: process.env.V_EVIDENCE_DIR || '/var/lib/v-distro/probes',
  backups: process.env.V_BACKUP_DIR || '/var/backups/v',
};
const P = {
  ...PATHS,
  releases: path.join(PATHS.prefix, 'releases'),
  current: path.join(PATHS.prefix, 'current'),
  previous: path.join(PATHS.prefix, 'previous'),
  tools: path.join(PATHS.prefix, 'tools'),
  bin: path.join(PATHS.prefix, 'bin'),
  state: path.join(PATHS.home, '.openclaw'),
  workspace: path.join(PATHS.home, '.openclaw', 'workspace'),
};

const log = (msg) => process.stderr.write(`[vctl] ${msg}\n`);
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`);
  return r.stdout;
}

const SECRET_KEY = /(_KEY|_SECRET|_TOKEN|_PASSWORD)$/;

// A tool that wants env the installer has under another name (lark-cli reads LARKSUITE_CLI_*,
// the install has FEISHU_*) gets a shim instead of a symlink; values the caller set win.
export function toolShim(bin, env) {
  const lines = Object.entries(env).map(([k, v]) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) throw new Error(`bad env name ${k}`);
    return `export ${k}="\${${k}:-${v}}"`;
  });
  return `#!/bin/sh\n# v-distro shim: fills the tool's own env names from the install's, then runs it.\n${lines.join('\n')}\nexec '${bin}' "$@"\n`;
}

export function openclawShim(prefix) {
  return `#!/bin/sh\n# v-distro: the current release's OpenClaw CLI, for the service user and its agent.\nexec '${prefix}/node/current/bin/node' '${prefix}/current/core/dist/index.js' "$@"\n`;
}

export function splitEnv(text) {
  const install = [];
  const secrets = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) throw new Error(`not KEY=VALUE: ${line.slice(0, 40)}`);
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`bad variable name ${key}`);
    const value = line.slice(eq + 1).trim();
    if (!value) continue;
    (SECRET_KEY.test(key) ? secrets : install).push(`${key}=${value}`);
  }
  return { install, secrets };
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const installEnvFile = () => path.join(P.etc, 'install.env');
const secretsEnvFile = () => path.join(P.etc, 'secrets.env');
const allEnv = () => ({ ...readEnv(installEnvFile()), ...readEnv(secretsEnvFile()) });
const gatewayPort = () => Number(allEnv().V_GATEWAY_PORT || 18789);

function requireKeys(env) {
  const preset = env.V_MODEL_PRESET || 'deepseek';
  const missing = [];
  if (!env.V_OWNER_NAME) missing.push('V_OWNER_NAME');
  if (preset === 'deepseek' && !env.DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (preset === 'vercel' && !env.AI_GATEWAY_API_KEY) missing.push('AI_GATEWAY_API_KEY');
  if (!!env.FEISHU_APP_ID !== !!env.FEISHU_APP_SECRET) missing.push('FEISHU_APP_ID and FEISHU_APP_SECRET together');
  if (missing.length) throw new Error(`missing in the env file: ${missing.join(', ')}`);
}

function cmdSplitEnv(input) {
  const { install, secrets } = splitEnv(fs.readFileSync(input, 'utf8'));
  const prior = readEnv(secretsEnvFile());
  if (!secrets.some((l) => l.startsWith('OPENCLAW_GATEWAY_TOKEN='))) {
    secrets.push(`OPENCLAW_GATEWAY_TOKEN=${prior.OPENCLAW_GATEWAY_TOKEN || crypto.randomBytes(24).toString('hex')}`);
  }
  const merged = { ...Object.fromEntries(install.map((l) => l.split(/=(.*)/s).slice(0, 2))), ...Object.fromEntries(secrets.map((l) => l.split(/=(.*)/s).slice(0, 2))) };
  requireKeys(merged);
  fs.mkdirSync(P.etc, { recursive: true, mode: 0o755 });
  const header = '# Written by v-distro install/update from the operator\'s env file. Edit, then: vctl configure && systemctl restart openclaw-gateway\n';
  fs.writeFileSync(installEnvFile(), header + install.join('\n') + '\n', { mode: 0o644 });
  fs.writeFileSync(secretsEnvFile(), header + secrets.join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(secretsEnvFile(), 0o600);
  out({ step: 'split-env', install: install.map((l) => l.split('=')[0]), secrets: secrets.map((l) => l.split('=')[0]) });
}

function npmPath() {
  const nodeDir = path.dirname(process.execPath);
  return path.join(nodeDir, 'npm');
}

function cmdInstallRelease(pkgDir, opts) {
  const manifest = verifyPackage(pkgDir);
  const dest = path.join(P.releases, manifest.version);
  fs.mkdirSync(P.releases, { recursive: true });
  if (path.resolve(pkgDir) !== path.resolve(dest)) {
    if (fs.existsSync(path.join(dest, '.installed.json'))) {
      log(`release ${manifest.version} already installed at ${dest}; re-verifying`);
    } else {
      fs.rmSync(dest, { recursive: true, force: true });
      copyTree(pkgDir, dest);
    }
  }
  const env = { registry: opts.registry, npm: npmPath(), log };
  // npm ci runs package install scripts; give them the distro's node first on PATH.
  process.env.PATH = `${path.dirname(process.execPath)}:${process.env.PATH}`;
  const record = fs.existsSync(path.join(dest, '.installed.json')) && !opts.force
    ? (verifyPackage(dest), readJson(path.join(dest, '.installed.json')))
    : installRelease(dest, env);
  const tools = opts.skipTools ? {} : installTools(dest, P.tools, env);
  fs.mkdirSync(P.bin, { recursive: true });
  for (const [name, bin] of Object.entries(tools)) {
    const t = readJson(path.join(dest, 'runtime/tools.json')).npm[name];
    const link = path.join(P.bin, t.bin);
    fs.rmSync(link, { force: true });
    if (t.env) fs.writeFileSync(link, toolShim(bin, t.env), { mode: 0o755 });
    else fs.symlinkSync(bin, link);
  }
  // The agent's exec needs the OpenClaw CLI too (line B's v-schedule.py registers cron jobs with it).
  fs.rmSync(path.join(P.bin, 'openclaw'), { force: true });
  fs.writeFileSync(path.join(P.bin, 'openclaw'), openclawShim(P.prefix), { mode: 0o755 });
  fs.writeFileSync(path.join(dest, '.tools.json'), `${JSON.stringify(tools, null, 2)}\n`);
  run('chmod', ['-R', 'go-w', dest]);
  out({ step: 'install-release', version: manifest.version, release: manifest.release, dir: dest, components: Object.keys(record.components), tools: Object.keys(tools) });
}

function readLink(link) {
  try { return fs.readlinkSync(link); } catch { return null; }
}

function setLink(link, target) {
  const tmp = `${link}.tmp-${process.pid}`;
  fs.rmSync(tmp, { force: true });
  fs.symlinkSync(target, tmp);
  fs.renameSync(tmp, link);
}

function cmdSwitch(version) {
  const target = path.join(P.releases, version);
  if (!fs.existsSync(path.join(target, '.installed.json'))) throw new Error(`release ${version} is not installed`);
  const cur = readLink(P.current);
  if (cur && path.basename(cur) !== version) setLink(P.previous, cur);
  setLink(P.current, path.join('releases', version));
  out({ step: 'switch', current: version, previous: readLink(P.previous) ? path.basename(readLink(P.previous)) : null });
}

function chownState(target = P.state) {
  run('chown', ['-R', `${P.user}:${P.user}`, target]);
}

async function cmdConfigure(opts) {
  const releaseDir = P.current;
  const env = allEnv();
  requireKeys(env);
  const profile = opts.profile || env.V_PROFILE || 'standalone';
  const tools = fs.existsSync(path.join(releaseDir, '.tools.json')) ? readJson(path.join(releaseDir, '.tools.json')) : {};
  // The stable /opt/v/tools path, not the versioned release path, so an update that keeps the tool keeps the config.
  const { createConfig, codexHomeToml } = await import(path.join(fs.realpathSync(releaseDir), 'config/openclaw-config.mjs'));
  const cfg = createConfig({ profile, releaseDir, stateDir: P.state, workspace: P.workspace, env, codexCommand: tools.codex ?? null, agentId: readJson(path.join(releaseDir, 'manifest.json')).agentId });
  fs.mkdirSync(P.state, { recursive: true });
  const file = path.join(P.state, 'openclaw.json');
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.before-vctl`);
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  const agentId = Object.keys(cfg.agents.entries)[0];
  if (cfg.plugins.allow.includes('codex')) {
    const home = path.join(P.state, 'agents', agentId, 'agent', 'codex-home');
    fs.mkdirSync(home, { recursive: true });
    const toml = path.join(home, 'config.toml');
    if (!fs.existsSync(toml)) fs.writeFileSync(toml, codexHomeToml(P.workspace), { mode: 0o600 });
  }
  // A distro-owned npm prefix so `npm i -g` from the agent never needs root.
  fs.mkdirSync(path.join(P.home, '.npm-global'), { recursive: true });
  fs.writeFileSync(path.join(P.home, '.npmrc'), `prefix=${path.join(P.home, '.npm-global')}\n${env.V_NPM_REGISTRY ? `registry=${env.V_NPM_REGISTRY}\n` : ''}`);
  chownState();
  run('chown', [`${P.user}:${P.user}`, path.join(P.home, '.npmrc')]);
  run('chown', ['-R', `${P.user}:${P.user}`, path.join(P.home, '.npm-global')]);
  out({ step: 'configure', profile, file, agentId, plugins: cfg.plugins.allow, feishu: !!cfg.channels?.feishu, primary: cfg.agents.defaults.model.primary });
}

async function cmdSeedWorkspace() {
  const src = path.join(P.current, 'workspace');
  const exists = fs.existsSync(P.workspace) && fs.readdirSync(P.workspace).length > 0;
  if (exists) { out({ step: 'seed-workspace', seeded: false, reason: 'workspace already has files; never overwritten' }); return; }
  fs.mkdirSync(P.workspace, { recursive: true });
  let files = 0;
  if (fs.existsSync(src)) {
    for (const ent of fs.readdirSync(src)) {
      if (ent === '.empty') continue;
      fs.cpSync(path.join(src, ent), path.join(P.workspace, ent), { recursive: true });
      files += 1;
    }
  }
  const env = allEnv();
  const manifest = readJson(path.join(P.current, 'manifest.json'));
  // Line B's placeholders, filled before the first commit; render() fails if any is left.
  const renderer = path.join(P.current, 'runtime', 'workspace-render.mjs');
  let rendered = 0;
  if (fs.existsSync(renderer)) {
    const { render } = await import(pathToFileURL(renderer).href);
    rendered = render(P.workspace, { WORKSPACE: P.workspace, AGENT_ID: manifest.agentId || 'makaron', STATE_DIR: P.state, TIMEZONE: env.TZ || 'Asia/Shanghai' }).length;
  }
  const install = { ownerName: env.V_OWNER_NAME, timezone: env.TZ || 'Asia/Shanghai', release: manifest.release, distro: manifest.version, installedAt: new Date().toISOString() };
  fs.mkdirSync(path.join(P.workspace, '.v'), { recursive: true });
  fs.writeFileSync(path.join(P.workspace, '.v', 'install.json'), `${JSON.stringify(install, null, 2)}\n`);
  chownState();
  // V's workspace is a git repository; the agent commits its own changes.
  const asUser = (args) => run('runuser', ['-u', P.user, '--', 'git', '-C', P.workspace, ...args]);
  if (!fs.existsSync(path.join(P.workspace, '.git'))) {
    asUser(['init', '-q', '-b', 'main']);
    asUser(['config', 'user.name', 'V']);
    asUser(['config', 'user.email', 'v@localhost']);
    asUser(['config', 'core.quotepath', 'off']);
    asUser(['add', '-A']);
    asUser(['commit', '-qm', `seed: v-distro ${install.distro} (${install.release})`, '--allow-empty']);
  }
  out({ step: 'seed-workspace', seeded: true, entries: files, rendered });
}

function heapMb() {
  const mb = Math.floor(os.totalmem() / 1048576);
  return Math.max(2048, Math.min(12288, Math.floor(mb * 0.35)));
}

function cmdUnits() {
  const tpl = path.join(P.current, 'install', 'systemd');
  const vars = {
    '@PREFIX@': P.prefix, '@USER@': P.user, '@HOME@': P.home, '@ETC@': P.etc,
    '@PORT@': String(gatewayPort()), '@HEAP_MB@': String(heapMb()), '@TZ@': allEnv().TZ || 'Asia/Shanghai',
  };
  const written = [];
  for (const name of fs.readdirSync(tpl).filter((f) => f.endsWith('.service'))) {
    let text = fs.readFileSync(path.join(tpl, name), 'utf8');
    for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
    if (/@[A-Z_]+@/.test(text)) throw new Error(`unfilled placeholder in ${name}`);
    fs.writeFileSync(path.join(P.units, name), text, { mode: 0o644 });
    written.push(name);
  }
  if (!process.env.V_NO_SYSTEMCTL) run('systemctl', ['daemon-reload']);
  out({ step: 'units', written, heapMb: vars['@HEAP_MB@'] });
}

function gatewayOpts() {
  return { releaseDir: fs.realpathSync(P.current), port: gatewayPort(), token: readEnv(secretsEnvFile()).OPENCLAW_GATEWAY_TOKEN };
}

async function cmdHealth(opts) {
  const { waitHealthy } = await import('./gateway.mjs');
  const r = await waitHealthy(gatewayOpts(), { deadlineMs: Number(opts['deadline-ms'] || 300000), log });
  const w = r.workers ?? {};
  out({ step: 'health', ok: true, elapsedMs: r.elapsedMs, healthOk: r.health?.ok ?? null, workers: w.error ? { error: w.error } : { version: w.integration?.workerIsolationVersion ?? null, live: w.workers?.length ?? w.live ?? null } });
}

async function cmdProbe(opts) {
  const { connect, probe, checkHistory } = await import('./gateway.mjs');
  const manifest = readJson(path.join(P.current, 'manifest.json'));
  const agentId = manifest.agentId || 'makaron';
  const gw = await connect(gatewayOpts());
  try {
    let history = null;
    if (opts['check-history']) {
      history = await checkHistory(gw, agentId, P.evidence);
      if (history.some((h) => !h.toolOk || !h.finalOk)) { out({ step: 'probe', ok: false, history }); process.exitCode = 1; return; }
    }
    if (opts['history-only']) { out({ step: 'probe', ok: true, history }); return; }
    const record = await probe(gw, { agentId, version: manifest.version, evidenceDir: P.evidence, model: opts.model });
    out({ step: 'probe', ok: record.passed, history, ...record });
    if (!record.passed) process.exitCode = 1;
  } finally { gw.stop(); }
}

// Disposable or rebuilt-from-package parts of the state directory.
const SNAPSHOT_EXCLUDE = ['npm', 'cache', 'logs', 'browser/*/user-data/*/Cache', 'browser/*/user-data/*/Code Cache'];

function cmdSnapshot(dest) {
  if (fs.existsSync(dest)) throw new Error(`${dest} exists`);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  const tmp = `${dest}.partial`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const args = ['-C', P.home, '--numeric-owner', ...SNAPSHOT_EXCLUDE.map((x) => `--exclude=.openclaw/${x}`), '-cf', path.join(tmp, 'state.tar'), '.openclaw'];
  run('tar', args);
  for (const f of ['install.env', 'secrets.env']) if (fs.existsSync(path.join(P.etc, f))) fs.copyFileSync(path.join(P.etc, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'snapshot.json'), `${JSON.stringify({ takenAt: new Date().toISOString(), release: readLink(P.current) ? path.basename(readLink(P.current)) : null, bytes: fs.statSync(path.join(tmp, 'state.tar')).size }, null, 2)}\n`);
  fs.renameSync(tmp, dest);
  out({ step: 'snapshot', dir: dest, bytes: fs.statSync(path.join(dest, 'state.tar')).size });
}

function cmdRestore(src) {
  if (!fs.existsSync(path.join(src, 'state.tar'))) throw new Error(`${src} is not a snapshot`);
  const aside = `${P.state}.replaced-${Date.now()}`;
  if (fs.existsSync(P.state)) fs.renameSync(P.state, aside);
  run('tar', ['-C', P.home, '--numeric-owner', '-xf', path.join(src, 'state.tar')]);
  // Disposable parts (npm-installed external plugins) come back from the old tree when present.
  for (const x of ['npm', 'cache']) {
    if (fs.existsSync(path.join(aside, x)) && !fs.existsSync(path.join(P.state, x))) fs.renameSync(path.join(aside, x), path.join(P.state, x));
  }
  for (const f of ['install.env', 'secrets.env']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(P.etc, f));
  fs.chmodSync(secretsEnvFile(), 0o600);
  out({ step: 'restore', from: src, replacedStateKeptAt: aside });
}

/** Workspace files (memory/ included) and agent databases, so update/rollback can prove nothing was lost. */
export function fingerprint(workspace, stateDir) {
  const files = {};
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.git') continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), rel);
      else if (ent.isFile()) files[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, ent.name))).digest('hex');
    }
  };
  walk(workspace, '');
  const head = fs.existsSync(path.join(workspace, '.git')) ? spawnSync('git', ['-c', `safe.directory=${workspace}`, '-C', workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() : null;
  const dbs = [];
  const agents = path.join(stateDir, 'agents');
  if (fs.existsSync(agents)) for (const a of fs.readdirSync(agents)) if (fs.existsSync(path.join(agents, a, 'agent', 'openclaw-agent.sqlite'))) dbs.push(a);
  return { workspaceHead: head, workspaceFiles: files, agentDatabases: dbs.sort(), stateDatabase: fs.existsSync(path.join(stateDir, 'state', 'openclaw.sqlite')) };
}

/** What `after` lost relative to `before` (new files and new databases are fine). */
export function fingerprintLoss(before, after) {
  const lost = [];
  for (const [rel, hash] of Object.entries(before.workspaceFiles)) {
    if (!(rel in after.workspaceFiles)) lost.push(`workspace file missing: ${rel}`);
    else if (after.workspaceFiles[rel] !== hash && !rel.startsWith('.v/')) lost.push(`workspace file changed: ${rel}`);
  }
  for (const a of before.agentDatabases) if (!after.agentDatabases.includes(a)) lost.push(`agent database missing: ${a}`);
  if (before.stateDatabase && !after.stateDatabase) lost.push('state database missing');
  return lost;
}

function cmdFingerprint(file, opts) {
  const now = fingerprint(P.workspace, P.state);
  if (opts.compare) {
    const before = readJson(opts.compare);
    const lost = fingerprintLoss(before, now);
    out({ step: 'fingerprint-compare', ok: lost.length === 0, files: Object.keys(now.workspaceFiles).length, agentDatabases: now.agentDatabases, lost });
    if (lost.length) process.exitCode = 1;
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(now, null, 2)}\n`, { mode: 0o600 });
  out({ step: 'fingerprint', file, files: Object.keys(now.workspaceFiles).length, agentDatabases: now.agentDatabases, workspaceHead: now.workspaceHead });
}

/**
 * After the Gateway is up (it installs missing official plugins on its first start):
 * lay V's bytes over them; restart and wait for health again when anything changed.
 */
async function cmdOverlayPlugins(opts) {
  const results = overlayStatePlugins(fs.realpathSync(P.current), P.state);
  chownState(path.join(P.state, 'npm'));
  const changed = results.some((r) => r.written || r.removed);
  let restarted = false;
  if (changed && opts.restart) {
    run('systemctl', ['restart', 'openclaw-gateway.service']);
    const { waitHealthy } = await import('./gateway.mjs');
    await waitHealthy(gatewayOpts(), { deadlineMs: 600000, log });
    restarted = true;
  }
  out({ step: 'overlay-plugins', results, changed, restarted });
}

function cmdStatus() {
  const rel = (l) => (readLink(l) ? path.basename(readLink(l)) : null);
  const cur = rel(P.current);
  const info = cur ? readJson(path.join(P.releases, cur, '.installed.json')) : null;
  out({ step: 'status', current: cur, previous: rel(P.previous), release: info?.release ?? null, upstream: info?.upstream ?? null, installed: fs.existsSync(P.releases) ? fs.readdirSync(P.releases) : [] });
}

/** Can rollback swap code alone? Only when both releases use the same OpenClaw schema. */
export function schemaCompatible(a, b) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

function cmdRollbackCheck() {
  const cur = readLink(P.current);
  const prev = readLink(P.previous);
  if (!prev) throw new Error('no previous release to roll back to');
  const a = readJson(path.join(P.prefix, cur, '.installed.json')).openclawSchema;
  const b = readJson(path.join(P.prefix, prev, '.installed.json')).openclawSchema;
  out({ step: 'rollback-check', current: path.basename(cur), previous: path.basename(prev), codeOnly: schemaCompatible(a, b) });
}

function parseOpts(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check-history' || a === '--history-only' || a === '--skip-tools' || a === '--force' || a === '--restart') opts[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    else if (a.startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; }
    else opts._.push(a);
  }
  opts['check-history'] = opts.checkHistory;
  opts['history-only'] = opts.historyOnly;
  return opts;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parseOpts(rest);
  switch (cmd) {
    case 'verify': { const m = verifyPackage(opts._[0]); out({ step: 'verify', version: m.version, release: m.release, files: m.files.length }); break; }
    case 'install-release': cmdInstallRelease(opts._[0], opts); break;
    case 'split-env': cmdSplitEnv(opts._[0]); break;
    case 'switch': cmdSwitch(opts._[0]); break;
    case 'configure': await cmdConfigure(opts); break;
    case 'seed-workspace': await cmdSeedWorkspace(); break;
    case 'units': cmdUnits(); break;
    case 'health': await cmdHealth(opts); break;
    case 'probe': await cmdProbe(opts); break;
    case 'snapshot': cmdSnapshot(opts._[0]); break;
    case 'restore': cmdRestore(opts._[0]); break;
    case 'status': cmdStatus(); break;
    case 'overlay-plugins': await cmdOverlayPlugins(opts); break;
    case 'fingerprint': cmdFingerprint(opts._[0], opts); break;
    case 'rollback-check': cmdRollbackCheck(); break;
    default: throw new Error(`unknown command ${cmd ?? ''}; see the header of ${path.relative(process.cwd(), fileURLToPath(import.meta.url))}`);
  }
}

// Compare real paths: installed scripts run through the /opt/v/current symlink.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => { console.error(`vctl ${process.argv[2] ?? ''}: ${err.message}`); process.exit(1); });
}
