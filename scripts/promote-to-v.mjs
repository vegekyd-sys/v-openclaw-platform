#!/usr/bin/env node
// Put the exact bytes VLab accepted onto production V: step 3 of
// docs/vlab-v-sync-flow.md, and the bookkeeping of step 4 that was forgotten
// by hand on 2026-09-24 (the release reached V, its commits and its capture
// did not reach git).
//
//   node scripts/promote-to-v.mjs --release <vlab-release-id> --name <v-release-name>           # plan
//   node scripts/promote-to-v.mjs --release <id> --name <name> --owner <o> --apply              # install
//   node scripts/promote-to-v.mjs --undo <V backup dir>                                         # put back
//
// --apply, in order:
//   1. The release must be VLab's current release and accepted there.
//   2. Its files come from VLab's own release record (the bytes VLab runs), are
//      checked against the recorded after-hash, and are mapped to V's paths
//      (core dist, worker plugin, Feishu plugin; anything else is refused).
//   3. Every target on V must still hold the release's `before` bytes, i.e. V
//      is exactly what VLab was before this release. Otherwise refuse.
//   4. Old files go to /opt/v-release-backups/<name>/ with undo.json; new bytes
//      are installed as fresh inodes with the old owner and mode.
//   5. Recapture V into release/captured/<name>{,.worker,.feishu}, install the
//      drift sentinel's expectations, and run `vlab.mjs align`.
//
// It never restarts V. Most dist changes only take effect at the next Gateway
// start; when to restart production is a human decision (cold start, worker
// pool). The plan says which files are affected so that decision is informed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const V = args.vHost ?? 'v';
const VLAB = args.vlabHost ?? 'vlab91';
const VLAB_TOOL = args.vlabTool ?? '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const RELEASES = '/srv/vlab-production-mirror/labs/shared-workflow/releases';
const V_UNIT = 'openclaw-gateway.service';
const V_FEISHU = args.vFeishu ?? '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu';
const BACKUPS = '/opt/v-release-backups';
const V_NODE = args.vNode ?? '/opt/node-v22.23.1/bin/node';

const ssh = (host, script, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, script], {
  input, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8',
});
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
const vlab = (...a) => execFileSync('node', [VLAB_TOOL, ...a], { encoding: 'utf8', cwd: dirname(dirname(VLAB_TOOL)), maxBuffer: 64 * 1024 * 1024 });

// Runs as root on V. install: check before-hashes, back up, install, undo.json.
// undo: reverse.
const REMOTE = String.raw`
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [mode,dir]=process.argv.slice(2);
const hash=p=>{try{return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}catch(e){if(e.code==='ENOENT')return null;throw e}};
if(mode==='check'||mode==='install'){
  const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
  if(plan.files.every(f=>hash(f.vPath)===f.after)){console.error('already on V: every file already has the release bytes');process.exit(3)}
  const bad=plan.files.filter(f=>hash(f.vPath)!==f.before).map(f=>f.vPath+' is '+hash(f.vPath)+', release expects '+f.before);
  if(bad.length){console.error('V is not where this release starts:\n'+bad.join('\n'));process.exit(1)}
  if(mode==='check'){console.log('V holds the before-bytes of all '+plan.files.length+' files');process.exit(0)}
  const undo=[];
  for(const [i,f] of plan.files.entries()){
    const st=f.before===null?null:fs.statSync(f.vPath),backup=path.join(dir,'backup',String(i));
    if(st){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(f.vPath,backup)}
    undo.push({vPath:f.vPath,backup:st?backup:null});
    fs.writeFileSync(path.join(dir,'undo.json'),JSON.stringify(undo,null,1));
    const tmp=f.vPath+'.promote-tmp-'+process.pid;
    fs.mkdirSync(path.dirname(f.vPath),{recursive:true});
    fs.copyFileSync(path.join(dir,'files',String(i)),tmp);
    if(st){fs.chownSync(tmp,st.uid,st.gid);fs.chmodSync(tmp,st.mode&0o7777)}else fs.chmodSync(tmp,0o644);
    fs.renameSync(tmp,f.vPath);
    if(hash(f.vPath)!==f.after)throw Error('installed bytes wrong: '+f.vPath);
  }
  console.log('installed '+plan.files.length+' files; backup and undo.json in '+dir);process.exit(0);
}
if(mode==='undo'){
  const undo=JSON.parse(fs.readFileSync(path.join(dir,'undo.json')));
  for(const u of undo.reverse()){
    if(u.backup){const tmp=u.vPath+'.undo-tmp-'+process.pid;fs.copyFileSync(u.backup,tmp);const st=fs.statSync(u.backup);fs.chownSync(tmp,st.uid,st.gid);fs.chmodSync(tmp,st.mode&0o7777);fs.renameSync(tmp,u.vPath)}
    else fs.rmSync(u.vPath,{force:true});
  }
  console.log('restored '+undo.length+' files');process.exit(0);
}
console.error('mode?');process.exit(2);
`;

if (args.undo) {
  console.log(ssh(V, `sudo ${V_NODE} - undo ${sq(args.undo)}`, REMOTE).trim());
  console.log('V files restored. Recapture and reinstall the sentinel expectations for the release V is back on.');
  process.exit(0);
}
if (!args.release || !args.name) usage('--release and --name are required');
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(args.name)) usage('--name must be a plain release name');

// ---- 1. the release VLab accepted ----------------------------------------------
const status = JSON.parse(vlab('status'));
if (status.current?.release !== args.release) fail(`VLab's current release is ${status.current?.release}, not ${args.release}`);
if (status.current.accepted !== true) fail(`${args.release} is not accepted on VLab; accept it there first`);

// ---- 2. its bytes, mapped onto V -----------------------------------------------
const artifact = JSON.parse(ssh(VLAB, `sudo cat ${sq(`${RELEASES}/${args.release}/artifact.json`)}`));
const vCore = /(\/\S+)\/dist\/index\.js/.exec(ssh(V, `systemctl show ${V_UNIT} -p ExecStart --value`))?.[1];
if (!vCore) fail('cannot find V core from ExecStart');
const vWorker = vCore.replace(/\/core$/, '/worker');
const mapTarget = (t) => {
  if (t.startsWith('openclaw/')) return `${vCore}/${t.slice('openclaw/'.length)}`;
  if (t.startsWith('production-worker/')) return `${vWorker}/${t.slice('production-worker/'.length)}`;
  const m = /^npm\/projects\/openclaw-feishu-[^/]+\/node_modules\/@openclaw\/feishu\/(.+)$/.exec(t);
  if (m) return `${V_FEISHU}/${m[1]}`;
  return null;
};
const files = artifact.files.map((f) => {
  const bytes = Buffer.from(f.content, 'base64');
  const after = sha(bytes);
  if (f.after && f.after !== after) fail(`${f.target}: artifact content does not match its after-hash`);
  const vPath = mapTarget(f.target);
  if (!vPath) fail(`${f.target}: no known place on V for this target; promote it by hand and extend this map`);
  return { target: f.target, vPath, before: f.before ?? null, after, bytes };
});

console.log(`release ${args.release} (dev ${artifact.sourceCommit.slice(0, 12)}) -> V as ${args.name}`);
for (const f of files) console.log(`  ${f.before ? 'replace' : 'add    '} ${f.vPath}`);
console.log('\nThese are loaded at Gateway start: they take effect on the next V restart, which this script does not do.');

// ---- 3. is V where the release starts? ------------------------------------------
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const dir = `${BACKUPS}/${args.name}-${stamp}`;
const plan = { release: args.release, name: args.name, sourceCommit: artifact.sourceCommit, files: files.map(({ bytes, ...f }) => f) };
const tar = packFiles(plan, files);
ssh(V, `sudo mkdir -p -m 700 ${sq(dir)} && sudo tar -xf - -C ${sq(dir)}`, tar);
try {
  console.log(ssh(V, `sudo ${V_NODE} - check ${sq(dir)}`, REMOTE).trim());
} catch (e) {
  ssh(V, `sudo rm -rf ${sq(dir)}`);
  fail(e.stderr?.toString() || e.message);
}
if (!args.apply) {
  ssh(V, `sudo rm -rf ${sq(dir)}`);
  console.log('\nplan only; add --owner <o> --apply to install on V');
  process.exit(0);
}
if (!args.owner) usage('--owner is required with --apply');

// ---- 4. install ------------------------------------------------------------------
console.log(ssh(V, `sudo ${V_NODE} - install ${sq(dir)}`, REMOTE).trim());

// ---- 5. bookkeeping: capture, sentinel, align --------------------------------------
const capture = (suffix, runtime, extra) => execFileSync('node', [join(repo, 'scripts/capture-production-runtime.mjs'),
  '--host', V, '--release', args.name + suffix, '--runtime', runtime, ...extra, '--out', `release/captured/${args.name}${suffix}`],
  { cwd: repo, stdio: 'inherit' });
capture('', `${vCore}/dist`, ['--base', 'npm:openclaw@2026.9.1', '--upstream', '2026.9.1', '--sourceCheckout', `${vCore.replace(/\/core$/, '')}/source`]);
capture('.worker', vWorker, ['--base', 'none', '--exclude', 'node_modules']);
capture('.feishu', V_FEISHU, ['--base', 'none', '--exclude', 'node_modules', '--upstream', '@openclaw/feishu 2026.9.1']);
execFileSync(join(repo, 'scripts/install-v-release-drift.sh'), [V,
  `release/captured/${args.name}/manifest.json`, `release/captured/${args.name}.worker/manifest.json`, `release/captured/${args.name}.feishu/manifest.json`],
  { cwd: repo, stdio: 'inherit' });
try {
  console.log(vlab('align', '--owner', args.owner).trim().slice(0, 400));
} catch (e) {
  // Two different reasons, two different remedies. If this release's own files
  // differ, V did not get the same bytes: undo. If only other files differ, V
  // changed itself earlier and VLab has not caught up: this promotion is fine,
  // VLab needs sync-vlab-from-v (it could not run while this release was
  // pending, because it would have reverted it on VLab).
  const mine = new Set(files.map((f) => f.target));
  let parity;
  try {
    parity = JSON.parse(execFileSync('node', [join(repo, 'scripts/vlab-v-parity.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (err) {
    parity = err.stdout ? JSON.parse(err.stdout) : null;
  }
  const ours = parity?.findings.filter((f) => mine.has(f.target)) ?? [];
  const others = parity?.findings.filter((f) => !mine.has(f.target)) ?? [];
  if (parity && ours.length === 0 && others.every((f) => f.kind === 'differs' || f.kind === 'only-on-v')) {
    console.log(`\n${args.name} is on V. VLab still lags V on files this release did not touch (V changed itself earlier):`);
    for (const f of others) console.log(`  ${f.kind} ${f.target}`);
    console.log(`Commit release/captured/${args.name}*, merge it, then: node scripts/sync-vlab-from-v.mjs --name ${args.name} --owner ${args.owner} --apply`);
    process.exit(0);
  }
  console.error(`align refused -- V does not match VLab for this release's own files:\n${e.stdout || e.message}`);
  console.error(`undo with: node scripts/promote-to-v.mjs --undo ${dir}`);
  process.exit(1);
}
console.log(`\nDone. Commit release/captured/${args.name}*, add its CHANGELOG.md section\n(node scripts/release-notes.mjs --from <previous V release> --to ${args.name}, then write the summary),\nand open the release PR (dev -> main, tag ${args.name}).`);

function packFiles(p, list) {
  // A tiny tar of plan.json + files/<i>, built with the system tar from a temp dir.
  const tmp = mkdtempSync(join(tmpdir(), 'promote-'));
  try {
    mkdirSync(join(tmp, 'files'));
    writeFileSync(join(tmp, 'plan.json'), JSON.stringify(p, null, 2));
    list.forEach((f, i) => writeFileSync(join(tmp, 'files', String(i)), f.bytes));
    return execFileSync('tar', ['-cf', '-', '-C', tmp, '.'], { maxBuffer: 512 * 1024 * 1024 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function usage(msg) {
  console.error(`${msg}\nusage: promote-to-v.mjs --release <vlab-id> --name <v-release> [--owner <o> --apply] | --undo <dir>`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? true : (i += 1, next);
  }
  return out;
}
