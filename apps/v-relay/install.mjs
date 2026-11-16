#!/usr/bin/env node
// Install the vrelay CLI (and, on V, the large-file-transfer skill) on the two
// ends of the cross-border link it is for: Tianyi's Shanghai home machines (the
// Mac, the MacBook Air) and V in Singapore. Same-side copies (V <-> other
// Singapore Tencent hosts such as mirror-v-portal, Mac <-> Air on the home LAN)
// use scp/rsync directly; V-Shanghai is out of scope (its own ~3 Mbit uplink is
// the limit, and it carries voice devices). Run on Tianyi's Mac, from a checkout of the reviewed
// commit: the only copy of the relay tokens is ~/.config/vrelay/relay-secrets.json
// there, and each machine gets only its own token, over ssh stdin. Nothing is
// printed that contains a token.
//
//   node apps/v-relay/install.mjs --dry-run            # what would change, everywhere
//   node apps/v-relay/install.mjs                      # install / update, everywhere
//   node apps/v-relay/install.mjs --only v,air         # some targets
//
// Idempotent: each file is compared by sha256 (and mode/owner) and rewritten
// only when it differs. Per target it then runs `vrelay --version`, `health`
// and an authenticated `ls` as the user that will use it.
//
// Targets (user = the account whose agent or node runs vrelay):
//   mac       local                         user tianyicai  /opt/homebrew/bin/vrelay
//   v         ssh v, sudo                    user openclaw   /usr/local/bin/vrelay  + skill, uploadLimit 45mbit
//   air       via V (openclaw's Air key)     user tianyicai  /opt/homebrew/bin/vrelay

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, 'cli', 'vrelay.mjs');
const SKILL = path.join(here, 'skill', 'large-file-transfer', 'SKILL.md');

// Hops through V use the keys V's openclaw user already has for its nodes; the
// tailnet address is looked up on V at run time, never stored here.
const viaV = (key, login, remote) =>
  ['ssh', '-o', 'BatchMode=yes', 'v', `P=$(tailscale ip -4 ${login.host}) && sudo -n -u openclaw ssh -i /home/openclaw/.ssh/${key} -o BatchMode=yes -o ConnectTimeout=15 ${login.user}@$P ${remote}`];

export const TARGETS = {
  mac: {label: 'mac', mode: 'user', cmd: ['bash', '-s'], bin: '/opt/homebrew/bin/vrelay', lib: '$HOME/.local/share/vrelay/vrelay.mjs'},
  v: {label: 'v', mode: 'root', runUser: 'openclaw', cmd: ['ssh', '-o', 'BatchMode=yes', 'v', 'sudo -n bash -s'], bin: '/usr/local/bin/vrelay', lib: '/usr/local/lib/vrelay/vrelay.mjs',
    config: {uploadLimit: '45mbit'}, skillDir: '/home/openclaw/.openclaw/skills/large-file-transfer'},
  air: {label: 'air', mode: 'user', cmd: viaV('v_air_ed25519', {host: 'macbook-air-4', user: 'tianyicai'}, 'bash -s'), bin: '/opt/homebrew/bin/vrelay', lib: '$HOME/.local/share/vrelay/vrelay.mjs'},
};

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const b64 = data => Buffer.from(data).toString('base64');
const q = s => `'${String(s).replaceAll("'", `'\\''`)}'`;

export function configFor(target, secrets) {
  const token = secrets.tokens?.[target.label];
  if (!token) throw new Error(`no token for "${target.label}" in the secrets file`);
  if (!secrets.endpoint) throw new Error('the secrets file has no "endpoint"');
  return `${JSON.stringify({endpoint: secrets.endpoint, token, ...(target.config ?? {})}, null, 2)}\n`;
}

// The bash program sent on stdin. In dry-run it carries only hashes; otherwise
// it carries the file bytes (the config, with the token, only in this stream).
export function buildScript(target, {cli, skill, config, dryRun}) {
  const files = [
    {key: 'lib', dest: target.lib, mode: '644', owner: target.mode === 'root' ? 'root' : '', data: cli},
    {key: 'config', dest: '$RUN_HOME/.config/vrelay/config.json', mode: '600', owner: 'RUN', data: config, dirMode: '700'},
  ];
  if (target.skillDir) files.push({key: 'skill', dest: `${target.skillDir}/SKILL.md`, mode: '600', owner: 'RUN', data: skill, dirMode: '700'});
  const lines = [
    'set -euo pipefail',
    'umask 077',
    `DRY=${dryRun ? 1 : 0}`,
    `MODE=${target.mode}`,
    target.mode === 'root' ? `RUN_USER=${q(target.runUser)}` : 'RUN_USER=$(id -un)',
    target.mode === 'root' ? 'RUN_HOME=$(eval echo "~$RUN_USER")' : 'RUN_HOME=$HOME',
    'RUN_GROUP=$(id -gn "$RUN_USER")',
    'hash() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -c1-64; else shasum -a 256 "$1" | cut -c1-64; fi; }',
    'fmode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }',
    'fowner() { stat -c %U "$1" 2>/dev/null || stat -f %Su "$1"; }',
    'as_run() { if [ "$MODE" = root ]; then sudo -n -u "$RUN_USER" env HOME="$RUN_HOME" "$@"; else "$@"; fi; }',
    'say() { printf "%-8s %s\\n" "$1" "$2"; }',
    // Pick a node >= 18 the run user can execute: PATH first, then known spots.
    'NODE=""',
    'for c in "$(as_run bash -lc "command -v node" 2>/dev/null || true)" "$RUN_HOME/.local/node22/bin/node" /opt/node-v22*/bin/node /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do',
    '  [ -n "$c" ] && [ -x "$c" ] || continue',
    '  major=$(as_run "$c" -p "process.versions.node.split(\'.\')[0]" 2>/dev/null || echo 0)',
    '  if [ "$major" -ge 18 ]; then NODE=$c; break; fi',
    'done',
    '[ -n "$NODE" ] || { say node "no node >= 18 usable by $RUN_USER"; exit 3; }',
    'say node "$NODE ($(as_run "$NODE" --version))"',
    'CHANGED=0',
    // put <key> <dest> <mode> <owner> <want-sha> [dir-mode]; content on fd 3 when not dry-run
    'put() {',
    '  local key=$1 dest=$2 mode=$3 owner=$4 want=$5 dmode=${6:-755}',
    '  [ "$owner" = RUN ] && owner=$RUN_USER',
    '  [ -n "$owner" ] || owner=$(id -un)',
    '  if [ -f "$dest" ] && [ "$(hash "$dest")" = "$want" ] && [ "$(fmode "$dest")" = "$mode" ] && [ "$(fowner "$dest")" = "$owner" ]; then say "$key" "up to date $dest"; cat >/dev/null; return; fi',
    '  if [ "$DRY" = 1 ]; then say "$key" "would write $dest (mode $mode, owner $owner)"; cat >/dev/null; return; fi',
    '  local dir; dir=$(dirname "$dest")',
    // Directories for the run user are created as that user, so ~/.config etc. end up theirs.
    '  if [ ! -d "$dir" ]; then if [ "$MODE" = root ] && [ "$owner" != root ]; then as_run mkdir -p "$dir"; as_run chmod "$dmode" "$dir"; else mkdir -p "$dir"; chmod "$dmode" "$dir"; fi; fi',
    '  local tmp="$dest.vrelay-install.$$"',
    '  base64 --decode > "$tmp"',
    '  [ "$(hash "$tmp")" = "$want" ] || { rm -f "$tmp"; say "$key" "transfer corrupted"; exit 4; }',
    '  chmod "$mode" "$tmp"',
    '  if [ "$MODE" = root ]; then chown "$owner:$(id -gn "$owner")" "$tmp"; fi',
    '  mv -f "$tmp" "$dest"',
    '  say "$key" "wrote $dest"; CHANGED=1',
    '}',
  ];
  for (const f of files) {
    const dest = f.dest.startsWith('$HOME') ? f.dest.replace('$HOME', '$RUN_HOME') : f.dest;
    const payload = dryRun ? '' : b64(f.data);
    lines.push(`put ${f.key} "${dest}" ${f.mode} ${q(f.owner)} ${sha(f.data)} ${f.dirMode ?? 755} <<'VRELAY_${f.key.toUpperCase()}'`, ...(payload ? payload.match(/.{1,76}/g) : []), `VRELAY_${f.key.toUpperCase()}`);
  }
  const lib = target.lib.startsWith('$HOME') ? target.lib.replace('$HOME', '$RUN_HOME') : target.lib;
  // The wrapper pins the node chosen above, so it works even where the agent's
  // PATH has no node (an app-launched node agent), and falls back to PATH if it moves.
  lines.push(
    `LIB="${lib}"`,
    'WRAPPER=$(printf \'#!/bin/sh\\n# installed by apps/v-relay/install.mjs\\nNODE=%s\\n[ -x "$NODE" ] || NODE=$(command -v node)\\nexec "$NODE" %s "$@"\\n\' "$NODE" "$LIB")',
    `BIN=${q(target.bin)}`,
    'WSHA=$(printf %s "$WRAPPER" | { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; } | cut -c1-64)',
    `put bin "$BIN" 755 ${q(target.mode === 'root' ? 'root' : '')} "$WSHA" <<< "$(printf %s "$WRAPPER" | base64)"`,
    'if [ "$DRY" = 1 ]; then',
    '  if [ -x "$BIN" ]; then say check "installed: $(as_run "$BIN" --version 2>&1 | head -1)"; else say check "not installed yet"; fi',
    '  exit 0',
    'fi',
    'say version "$(as_run "$BIN" --version)"',
    'say health "$(as_run "$BIN" health 2>&1 | tail -1)"',
    'if as_run "$BIN" ls --json >/dev/null 2>/tmp/vrelay-install-ls.$$; then say auth ok; else say auth "FAILED: $(tail -1 /tmp/vrelay-install-ls.$$)"; rm -f /tmp/vrelay-install-ls.$$; exit 5; fi',
    'rm -f /tmp/vrelay-install-ls.$$',
    'say done "$([ $CHANGED = 1 ] && echo updated || echo no changes)"',
  );
  return `${lines.join('\n')}\n`;
}

export function readSecrets(file) {
  const st = fs.statSync(file);
  if ((st.mode & 0o077) !== 0) throw new Error(`${file} must be mode 600`);
  const secrets = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!secrets.endpoint) {
    // Older secrets files: take the endpoint from this Mac's own vrelay login.
    try { secrets.endpoint = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'vrelay', 'config.json'), 'utf8')).endpoint; } catch {}
  }
  return secrets;
}

export function main(argv) {
  const args = {dryRun: argv.includes('--dry-run'), only: null, secrets: path.join(os.homedir(), '.config', 'vrelay', 'relay-secrets.json')};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') args.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--secrets') args.secrets = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') { process.stdout.write(`${fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')}\n`); return 0; }
    else if (argv[i] !== '--dry-run') throw new Error(`unknown argument ${argv[i]}`);
  }
  const names = args.only ?? Object.keys(TARGETS);
  for (const n of names) {
    if (['portal', 'shanghai'].includes(n)) throw new Error(`${n} is not a vrelay target: vrelay is only for Shanghai home (mac, air) <-> Singapore (v); use scp/rsync on the same side`);
    if (!TARGETS[n]) throw new Error(`unknown target ${n} (known: ${Object.keys(TARGETS).join(', ')})`);
  }
  const secrets = readSecrets(args.secrets);
  const cli = fs.readFileSync(CLI);
  const skill = fs.readFileSync(SKILL);
  let failed = 0;
  for (const name of names) {
    const target = TARGETS[name];
    process.stdout.write(`\n== ${name}${args.dryRun ? ' (dry run)' : ''}\n`);
    const script = buildScript(target, {cli, skill, config: configFor(target, secrets), dryRun: args.dryRun});
    const r = spawnSync(target.cmd[0], target.cmd.slice(1), {input: script, encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 20});
    process.stdout.write(r.stdout ?? '');
    if (r.status !== 0) { failed++; process.stdout.write(`FAILED (exit ${r.status ?? r.signal}): ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}\n`); }
  }
  return failed ? 1 : 0;
}

const invokedDirectly = (() => { try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invokedDirectly) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { process.stderr.write(`install: ${error.message}\n`); process.exitCode = 2; }
}
