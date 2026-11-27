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
//   vctl.mjs desktop-pair [--deadline-ms N]                 approve the host cua node (V_DESKTOP=1)
//   vctl.mjs desktop-services                               (re)start the desktop units on the current release, then pair
//   vctl.mjs memory-check                                   rebuild a memory index built for another embedding provider
//   vctl.mjs workspace-update [--target <releaseDir>] [--dry-run]   the workspace's system files to that release (three-way)
//   vctl.mjs backup [--out-dir DIR] [--keep N]            online backup archive (state, lark-cli, /etc/v), 0600
//   vctl.mjs restore-backup <archive> --root DIR | --live   unpack and verify; --live replaces this machine's state
//   vctl.mjs install-skills                                 global skills (runtime/skills.json, skill CLIs) -> ~/.openclaw/skills
//   vctl.mjs vsync-env <issued.env>                         -> /etc/v/vsync.env (the Portal-issued VSync identity)

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
  varLib: process.env.V_VAR_LIB || '/var/lib/v-distro',
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

// A tool that needs env of its own (lark-cli's config dir) gets a shim instead of a
// symlink; values the caller set win.
// Shell guards a shim can run before the tool (tools.json "guards").
// owner-voice: lark-cli runs with the owner's user login; a comment, reply, message or reaction sent
// that way shows as the owner writing. Those must go as the bot (or as V's final reply, which the
// Feishu plugin posts as the bot). Reading, and editing documents as the owner, stay allowed.
export const SHIM_GUARDS = {
  // Owner-voice: lark-cli runs with the owner's user login, and a comment, reply, message or reaction
  // sent that way shows as the owner writing.
  //  - Document comments and replies to them: only --as bot (the Feishu plugin posts V's final reply
  //    in a comment session as the bot); never as the owner, not even when asked.
  //  - Messages and reactions: --as bot, or --owner-approved "<summary of the owner's request in this
  //    conversation>" for "send this as me". The flag is removed before lark-cli runs, and each use
  //    leaves one audit line (time, operation, recipient, summary; never the text sent).
  // Reading, editing documents as the owner, creating a chat and reading messages are not touched.
  'owner-voice': String.raw`v_owner_approved=""; v_skip=0
for v_a do
  shift
  if [ "$v_skip" = 1 ]; then v_owner_approved="$v_a"; v_skip=0; continue; fi
  case "$v_a" in
    --owner-approved) v_skip=1; continue ;;
    --owner-approved=*) v_owner_approved="@@APPROVED_VALUE@@"; continue ;;
  esac
  set -- "$@" "$v_a"
done
v_guard_owner_voice() {
  area=""; speak=""; kind=""; as=""; method=""; prev=""; to=""
  for a in "$@"; do
    case "$a" in drive|im|api) [ -z "$area" ] && area="$a" ;; esac
    if [ "$area" = "api" ]; then
      case "$a" in POST|PUT|PATCH|post|put|patch) method="$a" ;; esac
      case "$a" in
        */comments*|*/replies*) [ -n "$method" ] && { speak="$a"; kind=comment; } ;;
        /open-apis/im/v1/messages*) [ -n "$method" ] && { speak="$a"; kind=message; } ;;
      esac
    fi
    case "$a" in
      +add-comment|+add-reply|+reply-comment|+comment-*) speak="$a"; kind=comment ;;
      +messages-send|+messages-reply|+message-send|+reply|+send|+messages-forward|+messages-update|+reactions-*|+reaction-*) speak="$a"; kind=message ;;
    esac
    case "$prev" in --as) as="$a" ;; --chat-id|--user-id|--receive-id|--open-id|--email|--message-id) to="$prev=$a" ;; esac
    case "$a" in --as=*) as="@@AS_VALUE@@" ;; esac
    prev="$a"
  done
  [ -n "$area" ] && [ -n "$speak" ] && [ "$as" != "bot" ] || return 0
  if [ "$kind" = message ] && [ -n "$v_owner_approved" ]; then
    v_log="\${V_OWNER_VOICE_AUDIT:-$HOME/.openclaw/audit/lark-owner-voice.log}"
    mkdir -p "\$(dirname "$v_log")" 2>/dev/null
    printf '%s\t%s %s\t%s\t%s\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$area" "$speak" "\${to:-?}" "\$(printf '%s' "$v_owner_approved" | tr '\t\n' '  ' | cut -c1-200)" >> "$v_log"
    return 0
  fi
  if [ "$kind" = comment ]; then
    echo "{\"ok\":false,\"error\":{\"type\":\"policy\",\"code\":\"V_OWNER_VOICE_BLOCKED\",\"message\":\"文档评论只能用机器人身份（--as bot）。在文档评论会话里不要自己发评论，把回复直接写成最终回复，飞书插件会用机器人身份贴回原评论。\"}}"
  else
    echo "{\"ok\":false,\"error\":{\"type\":\"policy\",\"code\":\"V_OWNER_VOICE_BLOCKED\",\"message\":\"不以主人名义发言：$area $speak 请改用 --as bot。只有主人在当前对话里明确要求代他发时，才加 --owner-approved '<主人原话摘要>'；发完在单聊里告诉主人发了什么。\"}}"
  fi
  exit 3
}
v_guard_owner_voice "$@"`
    // String.raw keeps \$ as written (needed so JS does not read ${...}); the shell wants a bare $.
    .replace(/\\\$/g, '$').replace('@@AS_VALUE@@', '${a#--as=}').replace('@@APPROVED_VALUE@@', '${v_a#--owner-approved=}'),
};

export function toolShim(bin, env, { unset = [], unsetPrefixes = [], guards = [] } = {}) {
  const name = (k) => { if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) throw new Error(`bad env name ${k}`); return k; };
  const lines = [];
  for (const g of guards) {
    if (!SHIM_GUARDS[g]) throw new Error(`unknown shim guard ${g}`);
    lines.push(SHIM_GUARDS[g]);
  }
  if (unset.length) lines.push(`unset ${unset.map(name).join(' ')}`);
  for (const pre of unsetPrefixes) {
    name(pre.replace(/_$/, ''));
    lines.push(`for v in $(env | sed -n 's/^\\(${pre}[A-Za-z0-9_]*\\)=.*/\\1/p'); do unset "$v"; done`);
  }
  for (const [k, v] of Object.entries(env)) lines.push(`export ${name(k)}="\${${k}:-${v}}"`);
  return `#!/bin/sh\n# v-distro shim: sets the tool's own env, then runs it.\n${lines.join('\n')}\nexec '${bin}' "$@"\n`;
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
  if (missing.length) throw new Error(`missing ${missing.join(', ')}: put it in the env file (or /etc/v/secrets.env for keys), then run configure again${preset === 'deepseek' && missing.includes('DEEPSEEK_API_KEY') ? ' (the default model is DeepSeek through /vds, as on V; V_MODEL_PRESET=vercel uses AI_GATEWAY_API_KEY instead)' : ''}`);
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
    if (t.env) fs.writeFileSync(link, toolShim(bin, t.env, { unset: t.unsetEnv, unsetPrefixes: t.unsetEnvPrefixes, guards: t.guards }), { mode: 0o755 });
    else fs.symlinkSync(bin, link);
  }
  placeDesktopPlugin(dest);
  placeVPlugins(dest);
  // The agent's exec needs the OpenClaw CLI too (line B's v-schedule.py registers cron jobs with it).
  fs.rmSync(path.join(P.bin, 'openclaw'), { force: true });
  fs.writeFileSync(path.join(P.bin, 'openclaw'), openclawShim(P.prefix), { mode: 0o755 });
  fs.writeFileSync(path.join(dest, '.tools.json'), `${JSON.stringify(tools, null, 2)}\n`);
  run('chmod', ['-R', 'go-w', dest]);
  out({ step: 'install-release', version: manifest.version, release: manifest.release, dir: dest, components: Object.keys(record.components), tools: Object.keys(tools) });
}

// The desktop plugin loads by path from the release (like the Worker plugin) and imports
// typebox from the runtime it runs in, as on V; nothing is vendored.
function placeDesktopPlugin(dest) {
  const src = path.join(dest, 'optional', 'desktop', 'plugin');
  if (!fs.existsSync(src)) return;
  const target = path.join(dest, 'plugins', 'desktop-handoff');
  fs.rmSync(target, { recursive: true, force: true });
  copyTree(src, target);
  const typebox = path.join(dest, 'core', 'node_modules', 'typebox');
  if (!fs.existsSync(typebox)) throw new Error(`desktop plugin: ${typebox} missing in the runtime`);
  fs.mkdirSync(path.join(target, 'node_modules'), { recursive: true });
  fs.symlinkSync(typebox, path.join(target, 'node_modules', 'typebox'));
}

// V's own plugins shipped as source (vplugins/<name>) load by path from <release>/plugins/<name>.
function placeVPlugins(dest) {
  const root = path.join(dest, 'vplugins');
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    const target = path.join(dest, 'plugins', name);
    fs.rmSync(target, { recursive: true, force: true });
    copyTree(path.join(root, name), target);
  }
}

export const cloudflareEnabled = (env) => typeof env.CLOUDFLARE_TUNNEL_TOKEN === 'string' && env.CLOUDFLARE_TUNNEL_TOKEN.length > 0;

/** cloudflared reads its token from TUNNEL_TOKEN; it never goes on a command line. */
function configureCloudflare(env) {
  const file = path.join(P.etc, 'cloudflared.env');
  if (!cloudflareEnabled(env)) { fs.rmSync(file, { force: true }); return false; }
  if (/\s/.test(env.CLOUDFLARE_TUNNEL_TOKEN)) throw new Error('CLOUDFLARE_TUNNEL_TOKEN must be the token alone (the long string after --token)');
  fs.writeFileSync(file, `# v-distro configure: the Cloudflare tunnel token for v-cloudflared.service\nTUNNEL_TOKEN=${env.CLOUDFLARE_TUNNEL_TOKEN}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return true;
}

// Keys that tools read under different names: when only one name is set, the Gateway (and the
// agent's exec through it) also gets the other, from /etc/v/aliases.env (0600). Line B's skills
// read both APIFY_API_KEY and APIFY_TOKEN.
export const KEY_ALIASES = [['APIFY_API_KEY', 'APIFY_TOKEN']];
export function keyAliases(env) {
  const out = {};
  for (const names of KEY_ALIASES) {
    const have = names.find((n) => typeof env[n] === 'string' && env[n].length > 0);
    if (!have) continue;
    for (const n of names) if (!env[n]) out[n] = env[have];
  }
  return out;
}

function configureAliases(env) {
  const file = path.join(P.etc, 'aliases.env');
  const a = keyAliases(env);
  if (!Object.keys(a).length) { fs.rmSync(file, { force: true }); return []; }
  fs.writeFileSync(file, `# v-distro configure: the same keys under the other names some tools read\n${Object.entries(a).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return Object.keys(a);
}

export const DESKTOP_UNITS = ['openclaw-desktop.service', 'v-desktop-handoff.service', 'openclaw-cua-node.service'];
export const desktopEnabled = (env) => env.V_DESKTOP === '1';

/** The share-link service's config (V's /etc/v-desktop-handoff/config.json for one owner's machine). */
export function desktopHandoffConfig({ etc, home, origin }) {
  if (origin && !/^https?:\/\/[^\s/]+$/.test(origin)) throw new Error('V_PUBLIC_ORIGIN must be an origin like https://v.example.com (no path)');
  return {
    // Public and admin ports share this bind, so it stays loopback; a reverse proxy or tunnel
    // that forwards /desktop-handoff to 127.0.0.1:23950 makes links reachable at V_PUBLIC_ORIGIN.
    bind: '127.0.0.1', publicPort: 23950, adminPort: 23951,
    publicBaseUrl: origin || 'http://127.0.0.1:23950',
    pathPrefix: '/desktop-handoff', novncDir: '/usr/share/novnc', stateDir: '/var/lib/v-desktop-handoff',
    adminTokenFile: path.join(etc, 'desktop-handoff', 'admin-token'),
    title: 'V 的桌面', serverSideCursor: true,
    vnc: { host: '::1', port: 5900, passwordFile: path.join(home, '.openclaw', 'desktop', 'vnc-password.txt') },
    limits: { claimTtlMs: 600000, sessionTtlMs: 1800000, idleControlMs: 300000, maxViewers: 3, maxClaims: 5 },
  };
}

/** The host node's own config: a remote-mode client of the local Gateway with cua-computer on. */
export function cuaNodeConfig(port) {
  return {
    gateway: { mode: 'remote', remote: { transport: 'direct', url: `ws://127.0.0.1:${port}`, token: '${OPENCLAW_GATEWAY_TOKEN}' } },
    browser: { enabled: false },
    nodeHost: { browserProxy: { enabled: false } },
    plugins: { entries: { 'cua-computer': { enabled: true } } },
  };
}

function configureDesktop(env) {
  if (!desktopEnabled(env)) return false;
  const etc = path.join(P.etc, 'desktop-handoff');
  fs.mkdirSync(etc, { recursive: true });
  run('chown', [`root:${P.user}`, etc]);
  fs.chmodSync(etc, 0o750);
  const token = path.join(etc, 'admin-token');
  if (!fs.existsSync(token) || !fs.readFileSync(token, 'utf8').trim()) fs.writeFileSync(token, `${crypto.randomBytes(32).toString('base64url')}\n`);
  const cfgFile = path.join(etc, 'config.json');
  fs.writeFileSync(cfgFile, `${JSON.stringify(desktopHandoffConfig({ etc: P.etc, home: P.home, origin: env.V_PUBLIC_ORIGIN }), null, 2)}\n`);
  for (const f of [token, cfgFile]) { run('chown', [`root:${P.user}`, f]); fs.chmodSync(f, 0o640); }
  for (const d of ['/var/lib/v-desktop-handoff', path.join(P.state, 'desktop'), path.join(P.state, 'node-cua', 'state')]) {
    fs.mkdirSync(d, { recursive: true });
    run('chown', ['-R', `${P.user}:${P.user}`, d]);
    fs.chmodSync(d, 0o700);
  }
  const nodeCfg = path.join(P.state, 'node-cua', 'openclaw.json');
  fs.writeFileSync(nodeCfg, `${JSON.stringify(cuaNodeConfig(gatewayPort()), null, 2)}\n`, { mode: 0o600 });
  run('chown', [`${P.user}:${P.user}`, nodeCfg, path.join(P.state, 'node-cua')]);
  // A non-root X server cannot create the socket directory itself.
  fs.writeFileSync('/etc/tmpfiles.d/v-x11-unix.conf', 'd /tmp/.X11-unix 1777 root root 10d\n');
  if (!process.env.V_NO_SYSTEMCTL) run('systemd-tmpfiles', ['--create', '/etc/tmpfiles.d/v-x11-unix.conf']);
  return true;
}

// The OpenClaw CLI as the service user with the service environment (same path as `v-ctl openclaw`).
function openclawCli(args, { timeoutMs = 60000 } = {}) {
  const r = spawnSync('python3', [path.join(P.current, 'runtime', 'ops', 'v-memory-indexer-run.py'), '--cli', ...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`openclaw ${args.slice(0, 2).join(' ')} failed (${r.status}): ${(r.stderr || r.stdout || '').trim().slice(-300)}`);
  return parseCliJson(r.stdout);
}

/** The JSON a CLI printed, skipping log lines before it (some start with "[tag]"). */
export function parseCliJson(stdout) {
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*[[{]/.test(lines[i])) continue;
    try { return JSON.parse(lines.slice(i).join('\n')); } catch { /* a log line; keep looking */ }
  }
  throw new Error(`no JSON in CLI output: ${stdout.slice(0, 200)}`);
}

export const CUA_NODE_NAME = 'V host desktop';
const isCuaNode = (e) => [e.displayName, e.clientDisplayName, e.name, e.label].some((v) => v === CUA_NODE_NAME);
const requestIdOf = (e) => e.requestId ?? e.id ?? e.request?.id;

/** Pick the pending requests that belong to this host's cua node and nothing else. */
export function cuaPendingRequests(list) {
  const pending = Array.isArray(list) ? list : (list?.pending ?? []);
  return pending.filter(isCuaNode).map(requestIdOf).filter(Boolean);
}

// The host node pairs twice: as a device, then as a node. Approve only requests that carry
// its display name, until the Gateway lists it connected.
async function cmdDesktopPair(opts) {
  if (!desktopEnabled(allEnv())) { out({ step: 'desktop-pair', skipped: 'V_DESKTOP is not 1' }); return; }
  const deadline = Date.now() + Number(opts['deadline-ms'] || 120000);
  const approved = [];
  for (;;) {
    for (const id of cuaPendingRequests(openclawCli(['devices', 'list', '--json']))) { openclawCli(['devices', 'approve', id, '--json']); approved.push(`device:${id}`); }
    for (const id of cuaPendingRequests(openclawCli(['nodes', 'pending', '--json']))) { openclawCli(['nodes', 'approve', id, '--json']); approved.push(`node:${id}`); }
    const nodes = openclawCli(['nodes', 'status', '--json']);
    const list = Array.isArray(nodes) ? nodes : (nodes.nodes ?? nodes.paired ?? []);
    const mine = list.find(isCuaNode);
    if (mine && (mine.connected ?? mine.online ?? mine.status === 'connected')) { out({ step: 'desktop-pair', ok: true, approved, node: mine.nodeId ?? mine.id ?? null }); return; }
    if (Date.now() > deadline) throw new Error(`desktop-pair: the "${CUA_NODE_NAME}" node is not connected after approving [${approved.join(', ')}]; see journalctl -u openclaw-cua-node`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// After a switch the share-link service and the host node must run the new release's code;
// the display itself keeps running (it holds no release code beyond its start script).
async function cmdDesktopServices(opts) {
  if (!desktopEnabled(allEnv())) { out({ step: 'desktop-services', skipped: 'V_DESKTOP is not 1' }); return; }
  run('systemctl', ['enable', '--now', 'openclaw-desktop.service']);
  run('systemctl', ['enable', 'v-desktop-handoff.service', 'openclaw-cua-node.service']);
  run('systemctl', ['restart', 'v-desktop-handoff.service', 'openclaw-cua-node.service']);
  await cmdDesktopPair(opts);
}

async function cmdInstallSkills() {
  if (!fs.existsSync(path.join(P.current, 'runtime', 'skills.json'))) { out({ step: 'install-skills', skipped: 'no runtime/skills.json in this release' }); return; }
  const { installSkills } = await import('./skills.mjs');
  const uid = Number(run('id', ['-u', P.user]).trim());
  const gid = Number(run('id', ['-g', P.user]).trim());
  const r = installSkills({ releaseDir: fs.realpathSync(P.current), toolsRoot: P.tools, home: P.home, user: P.user, uid, gid,
    nodeBin: path.dirname(process.execPath), run: (cmd, args, o = {}) => run(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...o }), log });
  out({ step: 'install-skills', ...r });
}

// VSync identity issued by the Portal (scripts/vsync-token.ts): exactly these three keys,
// delivered out of band. Values are checked for shape and never printed.
export const VSYNC_KEYS = ['NEXUS_VSYNC_URL', 'NEXUS_VSYNC_AGENT', 'NEXUS_VSYNC_TOKEN'];
export function parseVsyncEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : line;
    if (!VSYNC_KEYS.includes(key)) throw new Error(`vsync env: unexpected key ${key.slice(0, 40)}`);
    env[key] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  const missing = VSYNC_KEYS.filter((k) => !env[k]);
  if (missing.length) throw new Error(`vsync env: missing ${missing.join(', ')}`);
  if (!/^https:\/\/[^\s]+$/.test(env.NEXUS_VSYNC_URL)) throw new Error('vsync env: NEXUS_VSYNC_URL must be https');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(env.NEXUS_VSYNC_AGENT)) throw new Error('vsync env: NEXUS_VSYNC_AGENT must be lowercase letters, digits and dashes');
  if (/\s/.test(env.NEXUS_VSYNC_TOKEN) || env.NEXUS_VSYNC_TOKEN.length < 16) throw new Error('vsync env: NEXUS_VSYNC_TOKEN looks wrong');
  return env;
}

function cmdVsyncEnv(input) {
  const env = parseVsyncEnv(fs.readFileSync(input, 'utf8'));
  fs.mkdirSync(P.etc, { recursive: true, mode: 0o755 });
  const file = path.join(P.etc, 'vsync.env');
  fs.writeFileSync(file, `# VSync identity issued by the Portal for this machine (v-distro). Revoke it on the Portal.\n${VSYNC_KEYS.map((k) => `${k}=${env[k]}`).join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  out({ step: 'vsync-env', file, agent: env.NEXUS_VSYNC_AGENT, url: env.NEXUS_VSYNC_URL });
}

/**
 * Which agents' memory index needs a rebuild: built for another embedding model (a key was added
 * or removed: fts-only <-> gemini), vector index incomplete, or dirty. OpenClaw then pauses vector
 * search and has the agent ask the owner to run a command; the installer does it instead.
 */
export function memoryNeedsRebuild(statusJson) {
  const list = Array.isArray(statusJson) ? statusJson : [statusJson];
  return list.filter((a) => {
    const s = a?.status ?? {};
    const identity = s.custom?.indexIdentity?.status;
    const vector = s.vector?.enabled ? s.vector?.index?.state : 'complete';
    return (identity && identity !== 'valid') || (vector && vector !== 'complete') || s.dirty === true;
  }).map((a) => ({ agentId: a.agentId, identity: a?.status?.custom?.indexIdentity?.status ?? null, vector: a?.status?.vector?.index?.state ?? null, dirty: a?.status?.dirty ?? null }));
}

function cmdMemoryCheck() {
  const stale = memoryNeedsRebuild(openclawCli(['memory', 'status', '--json']));
  const rebuilt = [];
  for (const a of stale) {
    log(`memory index of ${a.agentId} needs a rebuild (identity ${a.identity}, vector ${a.vector}, dirty ${a.dirty}); rebuilding`);
    // Embeds every memory chunk again; a large memory takes minutes.
    openclawCli(['memory', 'status', '--index', '--json', '--agent', a.agentId], { timeoutMs: 30 * 60 * 1000 });
    rebuilt.push(a.agentId);
  }
  const still = memoryNeedsRebuild(openclawCli(['memory', 'status', '--json']));
  out({ step: 'memory-check', rebuilt, ok: still.length === 0, still });
  if (still.length) throw new Error(`memory index still not current for ${still.map((a) => a.agentId).join(', ')}`);
}

// ---- the workspace follows the release (line B's update-policy.json, workspace-update.mjs) ----
const WS_STATE = () => path.join(P.varLib, 'workspace-state.json');
const wsBaseDir = (version) => path.join(P.varLib, 'workspace-base', version);
const wsRenderValues = (manifest) => ({ WORKSPACE: P.workspace, AGENT_ID: manifest.agentId || 'makaron', STATE_DIR: P.state, TIMEZONE: allEnv().TZ || 'Asia/Shanghai' });

/** The release's payload, rendered exactly as it would be seeded, into dir. */
async function renderPayload(releaseDir, dir) {
  const manifest = readJson(path.join(releaseDir, 'manifest.json'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(releaseDir, 'workspace');
  if (fs.existsSync(src)) for (const ent of fs.readdirSync(src)) if (ent !== '.empty') fs.cpSync(path.join(src, ent), path.join(dir, ent), { recursive: true });
  const renderer = path.join(releaseDir, 'runtime', 'workspace-render.mjs');
  if (fs.existsSync(renderer)) {
    const { render } = await import(pathToFileURL(renderer).href);
    render(dir, wsRenderValues(manifest));
  }
  return manifest;
}

/** Remember what the workspace was seeded or updated from: the base of the next three-way. */
function recordWorkspaceBase(releaseDir, version) {
  return renderPayload(releaseDir, wsBaseDir(version)).then(() => {
    fs.writeFileSync(WS_STATE(), `${JSON.stringify({ version, at: new Date().toISOString() }, null, 2)}\n`);
  });
}

const wsGit = (args, opts = {}) => run('runuser', ['-u', P.user, '--', 'git', '-c', `safe.directory=${P.workspace}`, '-C', P.workspace, ...args], opts);

/** The base for a workspace seeded before bases were recorded: its own "seed: v-distro" commit. */
function legacyBase(dir) {
  const log = wsGit(['log', '--format=%H %s']).split('\n').map((l) => l.split(' ')).filter((p) => p[0]);
  const seed = log.find((p) => p.slice(1).join(' ').startsWith('seed: v-distro'));
  if (!seed) return null;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tar = spawnSync('runuser', ['-u', P.user, '--', 'git', '-c', `safe.directory=${P.workspace}`, '-C', P.workspace, 'archive', seed[0]], { maxBuffer: 1024 * 1024 * 1024 });
  if (tar.status !== 0) throw new Error(`git archive ${seed[0]} failed`);
  const x = spawnSync('tar', ['-x', '-C', dir], { input: tar.stdout });
  if (x.status !== 0) throw new Error('could not unpack the seed commit');
  return seed[0];
}

/** The service environment the agent's exec sees (the running Gateway's), for scripts run on its behalf. */
function agentEnv() {
  const pid = run('systemctl', ['show', '-p', 'MainPID', '--value', 'openclaw-gateway']).trim();
  if (!pid || pid === '0') throw new Error('openclaw-gateway is not running');
  return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString('utf8').split('\0').filter((kv) => kv.includes('=')).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
}

async function cmdWorkspaceUpdate(opts) {
  const { updateWorkspace } = await import('./workspace-update.mjs');
  const target = fs.realpathSync(opts.target || P.current);
  const targetManifest = readJson(path.join(target, 'manifest.json'));
  const state = fs.existsSync(WS_STATE()) ? readJson(WS_STATE()) : null;
  if (state?.version === targetManifest.version) { out({ step: 'workspace-update', skipped: `already at ${targetManifest.version}` }); return; }
  // The policy of the release we go to; on a rollback to a release without one, the policy we leave.
  const policyFile = [path.join(target, 'runtime', 'workspace-policy.json'), state && path.join(P.releases, state.version, 'runtime', 'workspace-policy.json')].find((f) => f && fs.existsSync(f));
  if (!policyFile) { out({ step: 'workspace-update', skipped: 'no runtime/workspace-policy.json in this release' }); return; }
  const policy = readJson(policyFile);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v-ws-update-'));
  try {
    let baseDir = state && fs.existsSync(wsBaseDir(state.version)) ? wsBaseDir(state.version) : null;
    let baseFrom = baseDir ? `recorded ${state.version}` : null;
    if (!baseDir) {
      const seed = legacyBase(path.join(tmp, 'base'));
      if (!seed) throw new Error('workspace has no recorded base and no "seed: v-distro" commit; nothing to compare against');
      baseDir = path.join(tmp, 'base');
      baseFrom = `seed commit ${seed.slice(0, 12)}`;
    }
    const nextDir = path.join(tmp, 'next');
    await renderPayload(target, nextDir);
    const report = updateWorkspace({ workspace: P.workspace, baseDir, nextDir, policy, dryRun: !!opts['dry-run'] });
    const touched = [...report.updated, ...report.added, ...report.deleted, ...report.conflicts.map((c) => c.newFile)];
    report.from = state?.version ?? null; report.to = targetManifest.version; report.base = baseFrom;
    if (!opts['dry-run']) {
      chownState(P.workspace);
      if (touched.length) {
        wsGit(['add', '-A', '--', ...touched]);
        wsGit(['commit', '-qm', `v-distro update ${report.from ?? '(seed)'} -> ${report.to}`, '--', ...touched]);
      }
      await recordWorkspaceBase(target, targetManifest.version);
      // Scheduled tasks (line B's update-policy.json "schedules"): v-schedule.py install --base <old file>
      // adds missing system jobs, updates or removes the ones still exactly as the old file had them,
      // and reports the ones the owner changed. Without a recorded owner it exits 1: skipped, reported.
      if (fs.existsSync(path.join(P.workspace, 'scripts', 'v-schedule.py'))) {
        const baseSchedules = path.join(baseDir, 'schedules.json');
        const args = ['scripts/v-schedule.py', 'install'];
        let tmpBase = null;
        if (fs.existsSync(baseSchedules)) {
          tmpBase = path.join(os.tmpdir(), `v-distro-schedules-base-${process.pid}.json`);
          fs.copyFileSync(baseSchedules, tmpBase);
          fs.chmodSync(tmpBase, 0o644);
          args.push('--base', tmpBase);
        }
        // The Gateway's PATH (agentEnv) has no /usr/sbin: name runuser by its path, or nothing starts.
        const runuser = fs.existsSync('/usr/sbin/runuser') ? '/usr/sbin/runuser' : 'runuser';
        const r = spawnSync(runuser, ['-u', P.user, '--', 'python3', ...args], { cwd: P.workspace, env: agentEnv(), encoding: 'utf8', timeout: 180000 });
        if (tmpBase) fs.rmSync(tmpBase, { force: true });
        const said = (r.stdout || '').trim();
        let parsed = null;
        try { parsed = JSON.parse(said.slice(said.indexOf('{'))); } catch { /* plain text */ }
        report.schedules = r.status === 0 ? (parsed ?? 'installed') : { skipped: true, exit: r.status, ...(r.error ? { error: String(r.error.message ?? r.error) } : {}), said: (said || r.stderr || '').slice(-400) };
      }
      fs.mkdirSync(path.join(P.varLib, 'workspace-updates'), { recursive: true });
      fs.writeFileSync(path.join(P.varLib, 'workspace-updates', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), `${JSON.stringify(report, null, 2)}\n`);
    }
    delete report.nextSha;
    out({ step: 'workspace-update', dryRun: !!opts['dry-run'], ...report });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- backups (backup.mjs) ----
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const VAR_LIB = () => process.env.V_VAR_LIB || '/var/lib/v-distro';
const rel = (abs) => abs.replace(/^\/+/, '');
function backupTrees() {
  const { BACKUP_EXCLUDE } = BACKUP;
  return [
    { from: P.state, to: rel(P.state), exclude: BACKUP_EXCLUDE },
    { from: path.join(P.home, '.lark-cli'), to: rel(path.join(P.home, '.lark-cli')) },
    { from: path.join(P.home, '.local', 'share', 'lark-cli'), to: rel(path.join(P.home, '.local', 'share', 'lark-cli')) },
    { from: P.etc, to: rel(P.etc) },
    { from: VAR_LIB(), to: rel(VAR_LIB()), exclude: ['restore-*'] },
  ];
}
let BACKUP;

async function cmdBackup(opts) {
  BACKUP = await import('./backup.mjs');
  const outDir = opts['out-dir'] || path.join(P.backups, 'archives');
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);
  const manifest = fs.existsSync(path.join(P.current, 'manifest.json')) ? readJson(path.join(P.current, 'manifest.json')) : {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stage = fs.mkdtempSync(path.join(outDir, '.stage-'));
  try {
    const image = await BACKUP.buildBackupImage({ trees: backupTrees(), stage });
    const meta = { schema: 'v-distro-backup/1', takenAt: new Date().toISOString(), host: os.hostname(), version: manifest.version ?? null, release: manifest.release ?? null, ...image };
    fs.writeFileSync(path.join(stage, 'v-backup-manifest.json'), `${JSON.stringify(meta, null, 1)}\n`, { mode: 0o600 });
    const archive = path.join(outDir, `v-backup-${manifest.version ?? 'unknown'}-${stamp}.tar.gz`);
    BACKUP.tarCreate(stage, archive);
    const sum = sha256File(archive);
    fs.writeFileSync(`${archive}.sha256`, `${sum}  ${path.basename(archive)}\n`, { mode: 0o600 });
    const pruned = BACKUP.prunable(outDir, Number(opts.keep || 0));
    for (const f of pruned) { fs.rmSync(path.join(outDir, f), { force: true }); fs.rmSync(path.join(outDir, `${f}.sha256`), { force: true }); }
    out({ step: 'backup', archive, bytes: fs.statSync(archive).size, sha256: sum, files: Object.keys(image.files).length, databases: Object.keys(image.databases), pruned });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function cmdRestoreBackup(archive, opts) {
  BACKUP = await import('./backup.mjs');
  if (!archive || !fs.existsSync(archive)) throw new Error('restore-backup <archive> --root DIR | --live');
  if (fs.existsSync(`${archive}.sha256`)) {
    const want = fs.readFileSync(`${archive}.sha256`, 'utf8').split(/\s+/)[0];
    if (sha256File(archive) !== want) throw new Error(`${archive} does not match its .sha256`);
  }
  if (!opts.root && !opts.live) throw new Error('say where: --root DIR (a copy to inspect) or --live (replace this machine\'s state)');
  const root = opts.root || fs.mkdtempSync(path.join(P.backups, 'restore-'));
  BACKUP.tarExtract(archive, root);
  const manifest = readJson(path.join(root, 'v-backup-manifest.json'));
  const check = await BACKUP.verifyImage(root, manifest);
  if (!check.ok) throw new Error(`backup does not verify: ${check.problems.slice(0, 10).join('; ')}`);
  if (!opts.live) { out({ step: 'restore-backup', root, live: false, version: manifest.version, takenAt: manifest.takenAt, ...check }); return; }
  for (const u of ['openclaw-gateway.service', 'v-memory-indexer.service']) {
    if (spawnSync('systemctl', ['is-active', '--quiet', u]).status === 0) throw new Error(`stop ${u} first (systemctl stop openclaw-gateway v-memory-indexer)`);
  }
  // The current state is moved aside, never deleted; npm-installed plugins come back from it.
  const aside = `${P.state}.replaced-${Date.now()}`;
  if (fs.existsSync(P.state)) fs.renameSync(P.state, aside);
  for (const t of backupTrees()) {
    const src = path.join(root, t.to);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(t.from, { recursive: true });
    run('cp', ['-a', `${src}/.`, `${t.from}/`]);
  }
  for (const x of ['npm', 'cache']) if (fs.existsSync(path.join(aside, x)) && !fs.existsSync(path.join(P.state, x))) fs.renameSync(path.join(aside, x), path.join(P.state, x));
  for (const d of [P.state, path.join(P.home, '.lark-cli'), path.join(P.home, '.local')]) if (fs.existsSync(d)) run('chown', ['-R', `${P.user}:${P.user}`, d]);
  if (fs.existsSync(secretsEnvFile())) fs.chmodSync(secretsEnvFile(), 0o600);
  fs.rmSync(root, { recursive: true, force: true });
  out({ step: 'restore-backup', live: true, version: manifest.version, takenAt: manifest.takenAt, replacedStateKeptAt: aside, next: 'v-ctl reconfigure' });
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
  const lark = configureLarkCli(env, tools['lark-cli']);
  const desktop = configureDesktop(env);
  const tunnel = configureCloudflare(env);
  const aliases = configureAliases(env);
  out({ step: 'configure', profile, file, agentId, plugins: cfg.plugins.allow, feishu: !!cfg.channels?.feishu, larkCli: lark, desktop, tunnel, aliases, audio: !!cfg.tools.media, nightshift: !!cfg.plugins.entries['nightshift-feishu'], primary: cfg.agents.defaults.model.primary });
}

// lark-cli talks to Feishu as the same app as the channel (line B's skills and scripts use it).
// It runs as a standalone tool on ~/.lark-cli/config.json, written here with the secret on
// stdin. Outside any agent context on purpose: with OPENCLAW_* set it files the config under a
// profile directory that line B's feishu-docs.py does not read, and then demands `config bind`.
// The Gateway also gets LARKSUITE_CLI_APP_ID/SECRET/CONFIG_DIR (/etc/v/lark.env): the
// interface line B's workspace reads to know the bound app (distro/workspace/README.md).
export function larkCliInitArgs(appId, domain) {
  if (!/^cli_[A-Za-z0-9]+$/.test(appId)) throw new Error(`FEISHU_APP_ID ${appId} is not a cli_ app id`);
  return ['config', 'init', '--app-id', appId, '--app-secret-stdin', '--brand', domain === 'lark' ? 'lark' : 'feishu', '--force-init'];
}

export function larkEnvFile({ appId, secret, configDir }) {
  return `# lark-cli's view of the Feishu app (v-distro configure; line B's interface). Root only.\nLARKSUITE_CLI_APP_ID=${appId}\nLARKSUITE_CLI_APP_SECRET=${secret}\nLARKSUITE_CLI_CONFIG_DIR=${configDir}\n`;
}

/**
 * Whether lark-cli's config must be (re)written. `config init` rewrites config.json and drops
 * apps[].users, i.e. the owner's Feishu login; so it runs only when there is no config yet or it
 * names another app (whose login could not be used for this one anyway).
 */
export function larkInitNeeded(configText, appId) {
  if (configText == null) return { init: true, reason: 'no config yet' };
  let data;
  try { data = JSON.parse(configText); } catch { return { init: true, reason: 'config unreadable' }; }
  const apps = Array.isArray(data?.apps) ? data.apps : [data];
  const configured = apps.map((a) => a?.appId).filter(Boolean);
  if (configured.includes(appId)) {
    const users = apps.find((a) => a?.appId === appId)?.users;
    return { init: false, reason: 'same app already configured', users: Array.isArray(users) ? users.length : null };
  }
  return { init: true, reason: configured.length ? `configured for ${configured.join(', ')}` : 'no app in config' };
}

function configureLarkCli(env, bin) {
  const envFile = path.join(P.etc, 'lark.env');
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) { fs.rmSync(envFile, { force: true }); return 'no-feishu'; }
  const dir = path.join(P.home, '.lark-cli');
  fs.writeFileSync(envFile, larkEnvFile({ appId: env.FEISHU_APP_ID, secret: env.FEISHU_APP_SECRET, configDir: dir }), { mode: 0o600 });
  fs.chmodSync(envFile, 0o600);
  if (!bin || !fs.existsSync(bin)) return 'not-installed';
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  run('chown', [`${P.user}:${P.user}`, dir]);
  const cfgFile = path.join(dir, 'config.json');
  const need = larkInitNeeded(fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf8') : null, env.FEISHU_APP_ID);
  // Same app: leave the config (and the owner's login in it) alone. A rotated App Secret is not
  // picked up this way; lark-cli then reports an auth error and `rm ~/.lark-cli/config.json; v-ctl configure` rewrites it.
  if (!need.init) return { configured: 'kept', reason: need.reason, users: need.users };
  if (fs.existsSync(cfgFile)) {
    const backup = `${cfgFile}.before-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(cfgFile, backup);
    run('chown', [`${P.user}:${P.user}`, backup]);
    fs.chmodSync(backup, 0o600);
  }
  run('runuser', ['-u', P.user, '--', 'env', '-i', `HOME=${P.home}`, `PATH=${path.dirname(process.execPath)}:/usr/bin:/bin`, `LARKSUITE_CLI_CONFIG_DIR=${dir}`,
    'LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1', 'LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1', bin, ...larkCliInitArgs(env.FEISHU_APP_ID, env.FEISHU_DOMAIN)], { input: env.FEISHU_APP_SECRET, stdio: ['pipe', 'pipe', 'pipe'] });
  if (!fs.existsSync(cfgFile)) throw new Error(`lark-cli config init did not write ${cfgFile}`);
  return { configured: 'written', reason: need.reason };
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
  await recordWorkspaceBase(P.current, manifest.version);
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
    // The release's real path: some of V's services decide they are the main module by comparing
    // argv[1] with their own resolved path, and do nothing (exit 0) when started through current/.
    // units is rerun on every switch, update and rollback, so this follows the active release.
    '@RELEASE@': fs.realpathSync(P.current),
  };
  const written = [];
  for (const name of fs.readdirSync(tpl).filter((f) => f.endsWith('.service'))) {
    let text = fs.readFileSync(path.join(tpl, name), 'utf8');
    for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
    if (/@[A-Z_]+@/.test(text)) throw new Error(`unfilled placeholder in ${name}`);
    fs.writeFileSync(path.join(P.units, name), text, { mode: 0o644 });
    written.push(name);
  }
  // Desktop units and the Gateway's DISPLAY drop-in exist only while V_DESKTOP=1.
  const dropIn = path.join(P.units, 'openclaw-gateway.service.d', 'v-desktop.conf');
  const desktop = desktopEnabled(allEnv());
  const desktopTpl = path.join(tpl, 'desktop');
  if (desktop && fs.existsSync(desktopTpl)) {
    for (const name of DESKTOP_UNITS) {
      let text = fs.readFileSync(path.join(desktopTpl, name), 'utf8');
      for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
      if (/@[A-Z_]+@/.test(text)) throw new Error(`unfilled placeholder in ${name}`);
      fs.writeFileSync(path.join(P.units, name), text, { mode: 0o644 });
      written.push(name);
    }
    fs.mkdirSync(path.dirname(dropIn), { recursive: true });
    fs.copyFileSync(path.join(desktopTpl, 'gateway-desktop.conf'), dropIn);
    written.push('openclaw-gateway.service.d/v-desktop.conf');
  } else {
    fs.rmSync(dropIn, { force: true });
    if (!process.env.V_NO_SYSTEMCTL) for (const name of DESKTOP_UNITS) spawnSync('systemctl', ['disable', '--now', name], { stdio: 'ignore' });
  }
  // The Cloudflare tunnel exists only while CLOUDFLARE_TUNNEL_TOKEN is set.
  const tunnel = cloudflareEnabled(allEnv());
  const tunnelTpl = path.join(tpl, 'cloudflare', 'v-cloudflared.service');
  if (tunnel && fs.existsSync(tunnelTpl)) {
    let text = fs.readFileSync(tunnelTpl, 'utf8');
    for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
    fs.writeFileSync(path.join(P.units, 'v-cloudflared.service'), text, { mode: 0o644 });
    written.push('v-cloudflared.service');
  } else if (fs.existsSync(path.join(P.units, 'v-cloudflared.service'))) {
    if (!process.env.V_NO_SYSTEMCTL) spawnSync('systemctl', ['disable', '--now', 'v-cloudflared.service'], { stdio: 'ignore' });
    fs.rmSync(path.join(P.units, 'v-cloudflared.service'), { force: true });
  }
  if (!process.env.V_NO_SYSTEMCTL) run('systemctl', ['daemon-reload']);
  out({ step: 'units', written, desktop, tunnel, heapMb: vars['@HEAP_MB@'] });
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
    else if (a === '--live' || a === '--dry-run') opts[a.slice(2)] = true;
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
    case 'desktop-pair': await cmdDesktopPair(opts); break;
    case 'vsync-env': cmdVsyncEnv(opts._[0]); break;
    case 'install-skills': await cmdInstallSkills(); break;
    case 'memory-check': cmdMemoryCheck(); break;
    case 'workspace-update': await cmdWorkspaceUpdate(opts); break;
    case 'backup': await cmdBackup(opts); break;
    case 'restore-backup': await cmdRestoreBackup(opts._[0], opts); break;
    case 'desktop-services': await cmdDesktopServices(opts); break;
    default: throw new Error(`unknown command ${cmd ?? ''}; see the header of ${path.relative(process.cwd(), fileURLToPath(import.meta.url))}`);
  }
}

// Compare real paths: installed scripts run through the /opt/v/current symlink.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => { console.error(`vctl ${process.argv[2] ?? ''}: ${err.message}`); process.exit(1); });
}
