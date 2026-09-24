#!/usr/bin/env node
// Put shared VLab back on production V's bytes: step 1 (and step 4) of
// docs/vlab-v-sync-flow.md.
//
//   node scripts/vlab-rebase-to-v.mjs --owner <lease-owner>            # plan only
//   node scripts/vlab-rebase-to-v.mjs --owner <lease-owner> --apply    # do it
//   node scripts/vlab-rebase-to-v.mjs --undo <remote-dir> --owner <o>  # put it back
//
// What --apply does, in order:
//   1. vlab-v-parity.mjs --json decides the work: every file that differs gets
//      V's bytes, every VLab-only file and every VLab residue (.bak, .before-*,
//      ...) is moved out. V is only read, at nice 19 / idle IO.
//   2. V's bytes are fetched, checked against the parity hashes, and uploaded
//      to shared-workflow/tmp/rebase-to-v-<ts>/ on VLab with the action list.
//   3. Requires the integration lease. Stops the shared Gateway, re-checks that
//      every VLab file still has the bytes parity saw, moves each one into the
//      backup directory next to the upload and installs V's bytes as a new
//      inode (baseline archives may hardlink the old one), then starts the
//      Gateway and waits for `health`.
//   4. Runs parity again. Anything but ALIGNED is reported and exits 1; the
//      backup and undo.json stay on VLab for --undo.
//
// It does not register the new baseline: the shared-workflow tool refuses a
// baseline while current.json exists, and retiring that record is a decision
// worth making by hand. See the doc.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const args = parseArgs(process.argv.slice(2));
const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const VLAB = args.vlabHost ?? 'vlab91';
const V = args.vHost ?? 'v';
const UNIT = 'openclaw-vlab-production-mirror-v8.service';
const WORKFLOW = '/srv/vlab-production-mirror/labs/shared-workflow';
const VLAB_TOOL = args.vlabTool ?? '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const OWNER_UID = 'lab-db91-parity';
if (!args.owner) usage('--owner is required (the integration lease owner)');

// Runs as root on VLab. verify: every file still has the bytes parity saw, and
// every staged file has V's bytes. apply: move old aside, install new as a
// fresh inode, write undo.json. undo: reverse apply.
const REMOTE = String.raw`
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [mode,dir,owner]=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(path.join(dir,'actions.json')));
const sha=p=>{try{return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}catch(e){if(e.code==='ENOENT')return null;throw e}};
const target=a=>{const t=path.resolve(a.root,a.path);if(!t.startsWith(path.resolve(a.root)+'/'))throw Error('escape '+a.target);return t};
function verify(){
  const bad=[];
  for(const a of m.actions){
    if(sha(target(a))!==a.vlabSha)bad.push(a.target+' now '+sha(target(a))+' expected '+a.vlabSha);
    if(a.action==='install'&&sha(path.join(dir,a.stage))!==a.vSha)bad.push(a.target+' staged bytes wrong');
  }
  if(bad.length){console.error(bad.join('\n'));process.exit(1)}
  return 'verified '+m.actions.length+' actions';
}
function move(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});try{fs.renameSync(from,to)}catch(e){if(e.code!=='EXDEV')throw e;fs.copyFileSync(from,to);fs.unlinkSync(from)}}
if(mode==='verify'){console.log(verify());process.exit(0)}
if(mode==='apply'){
  verify();
  const id=f=>Number(require('child_process').execFileSync('id',[f,owner]).toString().trim());
  const uid=id('-u'),gid=id('-g');
  const undo=[];
  for(const [i,a] of m.actions.entries()){
    const t=target(a),backup=path.join(dir,'backup',String(i));let st=null;
    if(fs.existsSync(t)){st=fs.statSync(t);move(t,backup)}
    undo.push({i,target:t,backup:st?backup:null,installed:a.action==='install',mode:st?st.mode&0o7777:0o644,uid:st?st.uid:uid,gid:st?st.gid:gid});
    fs.writeFileSync(path.join(dir,'undo.json'),JSON.stringify(undo,null,1));
    if(a.action==='install'){
      fs.mkdirSync(path.dirname(t),{recursive:true});
      const tmp=t+'.rebase-tmp-'+process.pid;
      fs.copyFileSync(path.join(dir,a.stage),tmp);
      fs.chownSync(tmp,st?st.uid:uid,st?st.gid:gid);fs.chmodSync(tmp,st?st.mode&0o7777:0o644);
      fs.renameSync(tmp,t);
      if(sha(t)!==a.vSha)throw Error('installed bytes wrong '+a.target);
    }
  }
  console.log('applied '+m.actions.length+' actions; undo.json written');process.exit(0);
}
if(mode==='undo'){
  const undo=JSON.parse(fs.readFileSync(path.join(dir,'undo.json')));
  for(const u of undo.reverse()){
    if(u.installed&&fs.existsSync(u.target))fs.unlinkSync(u.target);
    if(u.backup)move(u.backup,u.target);
  }
  console.log('undone '+undo.length+' actions');process.exit(0);
}
console.error('mode?');process.exit(2);
`;

const ssh = (host, script, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, script], {
  input, maxBuffer: 512 * 1024 * 1024, encoding: input === undefined ? 'utf8' : undefined,
});
const vlab = (...a) => JSON.parse(execFileSync('node', [VLAB_TOOL, ...a], { encoding: 'utf8', cwd: dirname(dirname(VLAB_TOOL)) }));

if (args.undo) {
  lease();
  stopGateway();
  try {
    console.log(ssh(VLAB, `sudo node - undo ${sq(args.undo)}`, Buffer.from(REMOTE)).toString());
  } finally {
    startGateway();
  }
  await waitHealthy();
  process.exit(0);
}

// ---- 1. what has to change -------------------------------------------------
const parity = runParity();
const pairByPrefix = new Map(parity.pairs.map((p) => [p.prefix, p]));
const locate = (target) => {
  for (const [prefix, pair] of pairByPrefix) {
    if (target.startsWith(`${prefix}/`)) return { pair, path: target.slice(prefix.length + 1) };
  }
  throw new Error(`no pair for ${target}`);
};

const actions = [];
for (const f of parity.findings) {
  const { pair, path } = locate(f.target);
  const action = f.kind === 'only-on-vlab' ? 'remove' : f.kind === 'differs' || f.kind === 'only-on-v' ? 'install' : null;
  if (!action) throw new Error(`unexpected parity finding ${f.kind} for ${f.target}; run without --pending`);
  actions.push({ target: f.target, root: pair.vlab, vRoot: pair.v, path, action, vSha: f.v, vlabSha: f.vlab });
}
for (const r of parity.residue.vlab) {
  const { pair, path } = locate(r.target);
  actions.push({ target: r.target, root: pair.vlab, path, action: 'remove', vSha: null, vlabSha: r.sha, residue: true });
}

const count = (a) => actions.filter((x) => x.action === a && !x.residue).length;
console.log(`parity ${parity.state}: install ${count('install')} V files, remove ${count('remove')} VLab-only files, ` +
  `remove ${actions.filter((x) => x.residue).length} VLab residue files`);
for (const a of actions.filter((x) => !x.residue)) console.log(`  ${a.action.padEnd(7)} ${a.target}`);
if (actions.length === 0) {
  console.log('already aligned; nothing to do');
  process.exit(0);
}
if (!args.apply) {
  console.log('\nplan only; add --apply to stop the shared Gateway and do it');
  process.exit(0);
}

// ---- 2. fetch V's bytes and stage them on VLab -------------------------------
const local = mkdtempSync(join(tmpdir(), 'vlab-rebase-'));
mkdirSync(join(local, 'stage'));
const byRoot = Map.groupBy(actions.filter((a) => a.action === 'install'), (a) => a.vRoot);
for (const [vRoot, list] of byRoot) {
  const tar = ssh(V, `cd ${sq(vRoot)} && nice -n 19 ionice -c3 tar -cf - -T -`, Buffer.from(list.map((a) => a.path).join('\n')));
  const into = join(local, 'fetch', createHash('sha1').update(vRoot).digest('hex'));
  mkdirSync(into, { recursive: true });
  execFileSync('tar', ['-xf', '-', '-C', into], { input: tar, maxBuffer: 64 * 1024 * 1024 });
  for (const a of list) {
    const bytes = readFileSync(join(into, a.path));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== a.vSha) throw new Error(`${a.target}: V changed between parity and fetch (${sha} != ${a.vSha})`);
    a.stage = `stage/${actions.indexOf(a)}`;
    writeFileSync(join(local, a.stage), bytes);
  }
}
rmSync(join(local, 'fetch'), { recursive: true, force: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const remoteDir = `${WORKFLOW}/tmp/rebase-to-v-${stamp}`;
writeFileSync(join(local, 'actions.json'), JSON.stringify({ at: new Date().toISOString(), owner: args.owner, vCore: parity.vCore, actions }, null, 2));
ssh(VLAB, `sudo mkdir -m 700 ${sq(remoteDir)} && sudo tar -xf - -C ${sq(remoteDir)}`, execFileSync('tar', ['-cf', '-', '-C', local, '.'], { maxBuffer: 512 * 1024 * 1024 }));
rmSync(local, { recursive: true, force: true });
console.log(`staged on ${VLAB}:${remoteDir}`);

// ---- 3. swap under a stopped Gateway ------------------------------------------
lease();
console.log(ssh(VLAB, `sudo node - verify ${sq(remoteDir)}`, Buffer.from(REMOTE)).toString().trim());
stopGateway();
try {
  console.log(ssh(VLAB, `sudo node - apply ${sq(remoteDir)} ${OWNER_UID}`, Buffer.from(REMOTE)).toString().trim());
} finally {
  startGateway();
}
await waitHealthy();

// ---- 4. prove it ---------------------------------------------------------------
const after = runParity(true);
console.log(`parity after: ${after.state}`);
if (after.state !== 'ALIGNED') {
  console.log(JSON.stringify(after.findings, null, 2));
  console.log(`undo with: node scripts/vlab-rebase-to-v.mjs --owner ${args.owner} --undo ${remoteDir}`);
  process.exit(1);
}
console.log(`done. backup + undo.json kept in ${VLAB}:${remoteDir}`);

// ---------------------------------------------------------------------------------

function runParity(allowDiverged = false) {
  try {
    return JSON.parse(execFileSync('node', [join(repo, 'scripts/vlab-v-parity.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    if (e.status === 1 && e.stdout) return JSON.parse(e.stdout);
    if (allowDiverged) throw e;
    throw e;
  }
}

function lease() {
  const r = execFileSync('node', [VLAB_TOOL, 'lease', '--owner', args.owner], { encoding: 'utf8', cwd: dirname(dirname(VLAB_TOOL)) });
  console.log(`integration lease: ${r.trim().slice(0, 200)}`);
}

function stopGateway() {
  ssh(VLAB, `sudo systemctl stop ${UNIT} && test "$(systemctl show ${UNIT} -p MainPID --value)" = 0`);
  console.log('shared Gateway stopped');
}

function startGateway() {
  ssh(VLAB, `sudo systemctl start ${UNIT}`);
  console.log('shared Gateway starting');
}

async function waitHealthy() {
  // A cold start has taken over three minutes here; give it fifteen, but stop
  // waiting the moment systemd has no main process left.
  const deadline = Date.now() + 15 * 60_000;
  let seenPid = false;
  while (Date.now() < deadline) {
    const pid = Number(ssh(VLAB, `systemctl show ${UNIT} -p MainPID --value`).trim());
    if (pid > 0) seenPid = true;
    if (pid === 0 && seenPid) throw new Error('shared Gateway exited while starting; check journalctl -u ' + UNIT);
    try {
      const h = vlab('rpc', '--method', 'health');
      if (h.ok === true) {
        console.log('shared Gateway healthy');
        return;
      }
    } catch {}
    await delay(5000);
  }
  throw new Error('shared Gateway not healthy after 15 minutes');
}

function sq(s) {
  return `'${String(s).replaceAll("'", `'\\''`)}'`;
}

function usage(msg) {
  console.error(`${msg}\nusage: vlab-rebase-to-v.mjs --owner <o> [--apply] | --undo <remote-dir> --owner <o>`);
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
