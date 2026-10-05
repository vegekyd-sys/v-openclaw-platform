#!/usr/bin/env node
// One-time: move shared VLab's DingTalk connector and WeCom plugin into its
// runtime directory, so they become ordinary release components (stage, deploy,
// rollback, parity, promote) like core, the Worker and the Feishu plugin.
//
// Before: VLab loads both from
//   instances/db91-parity/capability-alignment-20260911/plugin-sources/home/openclaw/.openclaw/...
// (a 2026-09-11 copy of V, outside runtime/), so `vlab.mjs stage` cannot touch
// them (lab/shared/files.mjs only accepts runtime/ targets) and the parity check
// never looked at them.
// After, the same directory names V uses:
//   runtime/npm/projects/<V's dingtalk project>/node_modules/@dingtalk-real-ai/dingtalk-connector
//   runtime/extensions/wecom-openclaw-plugin
// and plugins.load.paths in the VLab Gateway (and Worker) config point there.
//
//   node scripts/vlab-channel-plugins-prep.mjs                              # plan only (read-only on V; on VLab only a temp dir, removed)
//   node scripts/vlab-channel-plugins-prep.mjs --owner <o> --apply          # do it (restarts the shared Gateway once)
//   node scripts/vlab-channel-plugins-prep.mjs --owner <o> --undo <dir>     # put everything back (restarts it once)
//
// --apply, in order:
//   1. Integration lease held by --owner, no pending deployment, VLab marked
//      aligned with V (this re-bases the runtime; it must not swallow a release
//      that is on its way to V), Workers idle.
//   2. Compare each VLab copy with V, file by file, the way vlab-v-parity.mjs
//      will (plugin directory, its own node_modules excluded, residue ignored).
//      Files that differ or exist only on V get V's bytes (read from V with
//      `sudo cat`, nothing is written on V); files only on VLab are set aside.
//      2026-10-05 the two copies were byte-identical.
//   3. On VLab, under the shared operation lock: stop the shared Gateway, back
//      up both configs, rename(2) the directories into runtime/ (same file
//      system, no copy), install the V bytes, rewrite the two load paths, start.
//      Backup + undo.json in shared-workflow/tmp/channel-plugins-prep-<ts>/.
//   4. Wait for Gateway health; if it never comes, undo automatically.
//
// Then, by hand (printed at the end): register the new runtime as the baseline,
// run parity (now with the dingtalk and wecom pairs) and align.
//
// Not touched: the stale DingTalk npm project VLab already has under
// runtime/npm/projects (g-d1053e…, not in any load path); the component table
// prefers the project named like V's. Channel accounts: the shared VLab config
// has no DingTalk/WeCom channel configured, so loading the plugins from a new
// path changes no behaviour.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isResidue } from './lib/runtime-residue.mjs';

export const VLAB_INSTANCE = '/srv/vlab-production-mirror/labs/instances/db91-parity';
export const VLAB_RUNTIME = `${VLAB_INSTANCE}/runtime`;
export const VLAB_CONFIG_DIR = `${VLAB_INSTANCE}/state/shared-vlab-20260909-v3`;
export const VLAB_CONFIGS = [`${VLAB_CONFIG_DIR}/openclaw.json`, `${VLAB_CONFIG_DIR}/worker-openclaw.json`];
export const VLAB_UNIT = 'openclaw-vlab-production-mirror-v8.service';
export const VLAB_NODE = '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
export const VLAB_TMP = '/srv/vlab-production-mirror/labs/shared-workflow/tmp';
export const VLAB_LOCK = '/srv/vlab-production-mirror/labs/control/operation.lock';
const V_HOME = '/home/openclaw/.openclaw';

// The plugin directory is what parity compares; `unit` is what gets moved.
export const CHANNEL_PLUGINS = [
  {
    id: 'dingtalk',
    vGlob: `${V_HOME}/npm/projects/dingtalk-real-ai-dingtalk-connector-*/node_modules/@dingtalk-real-ai/dingtalk-connector`,
    // VLab load path -> [whole match, project directory, project name]
    source: /^(.*\/npm\/projects\/(dingtalk-real-ai-dingtalk-connector-[^/]+))\/node_modules\/@dingtalk-real-ai\/dingtalk-connector\/?$/,
    pluginInUnit: 'node_modules/@dingtalk-real-ai/dingtalk-connector',
    destUnit: (vPluginDir) => `${VLAB_RUNTIME}/npm/projects/${/\/npm\/projects\/([^/]+)\//.exec(vPluginDir)[1]}`,
  },
  {
    id: 'wecom',
    vGlob: `${V_HOME}/extensions/wecom-openclaw-plugin`,
    source: /^((.*)\/extensions\/wecom-openclaw-plugin)\/?$/,
    pluginInUnit: '',
    destUnit: () => `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`,
  },
];

const sha = (b) => createHash('sha256').update(b).digest('hex');
const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
const join2 = (a, b) => (b ? `${a}/${b}` : a);

// Where each plugin is now on VLab, where it goes, and which load path changes.
export function planMoves(loadPaths, vPluginDirs, runtime = VLAB_RUNTIME) {
  return CHANNEL_PLUGINS.map((p) => {
    const vPlugin = vPluginDirs[p.id];
    assert(vPlugin, `${p.id}: V plugin directory unknown`);
    const destUnit = p.destUnit(vPlugin);
    const destPlugin = join2(destUnit, p.pluginInUnit).replace(/\/$/, '');
    const hits = loadPaths.filter((lp) => p.source.test(lp));
    assert.equal(hits.length, 1, `${p.id}: expected exactly one load path, found ${hits.length}: ${hits.join(', ')}`);
    const from = hits[0].replace(/\/$/, '');
    if (from === destPlugin) return { id: p.id, done: true, vPlugin, plugin: destPlugin };
    assert(!from.startsWith(`${runtime}/`), `${p.id}: ${from} is inside runtime/ but not where V's name says (${destPlugin})`);
    const unit = p.source.exec(from)[1];
    return { id: p.id, done: false, vPlugin, fromUnit: unit, toUnit: destUnit, fromPlugin: from, plugin: destPlugin };
  });
}

// Replace exact entries of plugins.load.paths; nothing else in the config moves.
export function rewriteLoadPaths(config, rewrites) {
  const out = structuredClone(config);
  const paths = out.plugins?.load?.paths;
  if (!Array.isArray(paths)) return { config: out, changed: 0 };
  let changed = 0;
  for (const { from, to } of rewrites) {
    const at = paths.flatMap((p, i) => (p.replace(/\/$/, '') === from ? [i] : []));
    assert(at.length <= 1, `load path listed twice: ${from}`);
    assert(!paths.includes(to), `load path already present: ${to}`);
    if (at.length) { paths[at[0]] = to; changed += 1; }
  }
  return { config: out, changed };
}

// Same comparison as vlab-v-parity.mjs: residue ignored on both sides.
export function diffTrees(v, vlab) {
  const out = [];
  for (const path of [...new Set([...v.keys(), ...vlab.keys()])].sort()) {
    if (isResidue(path)) continue;
    const a = v.get(path) ?? null, b = vlab.get(path) ?? null;
    if (a === b) continue;
    out.push({ path, kind: a === null ? 'only-on-vlab' : b === null ? 'only-on-v' : 'differs', v: a, vlab: b });
  }
  return out;
}

export function parseSums(out) {
  const tree = new Map();
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\.\/(.+)$/.exec(line);
    if (m) tree.set(m[2], m[1]);
  }
  return tree;
}

// Runs as root on VLab. check: validate; apply: stop, back up, move, install,
// rewrite, start; undo: reverse. Writes undo.json before every step it takes.
export const REMOTE = String.raw`
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [mode,dir]=process.argv.slice(2);
const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
const hash=p=>{try{return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}catch(e){if(e.code==='ENOENT')return null;throw e}};
const run=(c,a,t=60000)=>execFileSync(c,a,{encoding:'utf8',timeout:t}).trim();
const active=()=>run('systemctl',['show',plan.unit,'-p','ActiveState','--value']);
const lock=plan.lock;
const writeExact=(file,text,st)=>{const tmp=file+'.channel-prep-'+process.pid;fs.writeFileSync(tmp,text,{flag:'wx',mode:st.mode&0o777});fs.chownSync(tmp,st.uid,st.gid);fs.renameSync(tmp,file)};
function precheck(){
  for(const m of plan.moves){
    if(!fs.statSync(m.fromUnit).isDirectory())throw Error('missing '+m.fromUnit);
    if(fs.existsSync(m.toUnit))throw Error('already exists: '+m.toUnit);
    if(fs.statSync(m.fromUnit).dev!==fs.statSync(plan.runtime).dev)throw Error('not on the runtime file system: '+m.fromUnit);
  }
  for(const f of plan.files)if(hash(f.preMove)!==f.before)throw Error(f.preMove+' changed since the plan: '+hash(f.preMove)+' != '+f.before);
  for(const c of plan.configs)if(fs.existsSync(c.file)&&hash(c.file)!==c.before)throw Error(c.file+' changed since the plan');
}
if(mode==='check'){precheck();console.log('VLab matches the plan: '+plan.moves.length+' moves, '+plan.files.length+' file changes, '+plan.configs.length+' configs');process.exit(0)}
fs.mkdirSync(lock,{mode:0o700});
const undo=fs.existsSync(path.join(dir,'undo.json'))?JSON.parse(fs.readFileSync(path.join(dir,'undo.json'))):{steps:[]};
const save=()=>fs.writeFileSync(path.join(dir,'undo.json'),JSON.stringify(undo,null,1));
try{
  if(mode==='apply'){
    if(undo.steps.length)throw Error('undo.json already has steps; this backup was used');
    precheck();
    run('systemctl',['stop',plan.unit],300000);
    if(!['inactive','failed'].includes(active()))throw Error('shared Gateway did not stop: '+active());
    undo.steps.push({kind:'stopped'});save();
    for(const [i,c] of plan.configs.entries()){
      const st=fs.statSync(c.file),b=path.join(dir,'config-'+i+'.json');
      fs.copyFileSync(c.file,b);fs.chownSync(b,st.uid,st.gid);fs.chmodSync(b,st.mode&0o777);
    }
    for(const m of plan.moves){
      const parent=path.dirname(m.toUnit);
      if(!fs.existsSync(parent)){
        const ref=fs.statSync(plan.runtime);fs.mkdirSync(parent,{recursive:true,mode:0o700});fs.chownSync(parent,ref.uid,ref.gid);
        undo.steps.push({kind:'mkdir',dir:parent});save();
      }
      fs.renameSync(m.fromUnit,m.toUnit);undo.steps.push({kind:'move',from:m.fromUnit,to:m.toUnit});save();
    }
    for(const [i,f] of plan.files.entries()){
      if(f.before===null)fs.mkdirSync(path.dirname(f.dest),{recursive:true});
      const st=f.before===null?fs.statSync(path.dirname(f.dest)):fs.statSync(f.dest),b=path.join(dir,'backup',String(i));
      if(f.before!==null){fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(f.dest,b)}
      undo.steps.push({kind:'file',dest:f.dest,backup:f.before===null?null:b,uid:st.uid,gid:st.gid,mode:f.before===null?0o644:st.mode&0o7777});save();
      if(f.after===null){fs.rmSync(f.dest);continue}
      const tmp=f.dest+'.channel-prep-'+process.pid;fs.copyFileSync(path.join(dir,'files',String(i)),tmp);
      fs.chownSync(tmp,st.uid,st.gid);fs.chmodSync(tmp,f.before===null?0o644:st.mode&0o7777);fs.renameSync(tmp,f.dest);
      if(hash(f.dest)!==f.after)throw Error('installed bytes wrong: '+f.dest);
    }
    for(const [i,c] of plan.configs.entries()){
      const st=fs.statSync(c.file);writeExact(c.file,fs.readFileSync(path.join(dir,'files','config-'+i),'utf8'),st);
      if(hash(c.file)!==c.after)throw Error('config bytes wrong: '+c.file);
      undo.steps.push({kind:'config',file:c.file,backup:path.join(dir,'config-'+i+'.json'),after:c.after});save();
    }
    run('systemctl',['start',plan.unit]);undo.steps.push({kind:'started'});save();
    console.log('moved '+plan.moves.length+', installed '+plan.files.length+', rewrote '+plan.configs.length+' configs; Gateway started; undo: '+dir);
  }else if(mode==='undo'&&!undo.steps.length){
    console.log('nothing to undo: no step was taken from this backup');
  }else if(mode==='undo'){
    run('systemctl',['stop',plan.unit],300000);
    if(!['inactive','failed'].includes(active()))throw Error('shared Gateway did not stop: '+active());
    for(const s of [...undo.steps].reverse()){
      if(s.kind==='config'){
        const now=hash(s.file);
        if(now!==s.after)throw Error(s.file+' changed after the prep ('+now+'); refusing to overwrite it, restore '+s.backup+' by hand');
        writeExact(s.file,fs.readFileSync(s.backup,'utf8'),fs.statSync(s.backup));
      }else if(s.kind==='file'){
        if(s.backup){const tmp=s.dest+'.channel-undo-'+process.pid;fs.copyFileSync(s.backup,tmp);fs.chownSync(tmp,s.uid,s.gid);fs.chmodSync(tmp,s.mode);fs.renameSync(tmp,s.dest)}
        else fs.rmSync(s.dest,{force:true});
      }else if(s.kind==='move'){if(fs.existsSync(s.from))throw Error('both exist: '+s.from);fs.renameSync(s.to,s.from)}
      else if(s.kind==='mkdir'){try{fs.rmdirSync(s.dir)}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTEMPTY')throw e}}
    }
    undo.steps=[];undo.undoneAt=new Date().toISOString();save();
    run('systemctl',['start',plan.unit]);
    console.log('restored; Gateway started');
  }else throw Error('mode?');
}finally{fs.rmdirSync(lock)}
`;

export function main(argv) {
  const args = parseArgs(argv);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const V = args.vHost ?? 'v';
  const VLAB = args.vlabHost ?? 'vlab91';
  const VLAB_TOOL = args.vlabTool ?? '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
  const ssh = (host, script, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, script],
    { input, maxBuffer: 512 * 1024 * 1024 });
  const sshText = (host, script, input) => ssh(host, script, input).toString('utf8');
  const vlab = (...a) => JSON.parse(execFileSync('node', [VLAB_TOOL, ...a], { encoding: 'utf8', cwd: dirname(dirname(VLAB_TOOL)), maxBuffer: 64 * 1024 * 1024 }));
  const remote = (mode, dir) => sshText(VLAB, `sudo ${VLAB_NODE} - ${mode} ${sq(dir)}`, REMOTE).trim();
  const hashTree = (host, root, gentle) => {
    const p = gentle ? 'nice -n 19 ionice -c3 ' : '';
    const script = `cd ${sq(root)} && ${p}find . -path ./node_modules -prune -o -type f -print0 | ${p}xargs -0 -r sha256sum`;
    const tree = parseSums(sshText(host, `sudo sh -c ${sq(script)}`));
    assert(tree.size > 0, `${host}:${root} hashed to nothing`);
    return tree;
  };

  if (args.undo) {
    assert(typeof args.owner === 'string', '--owner is required with --undo');
    assertLease(vlab('status'), args.owner, { aligned: false });
    console.log(remote('undo', args.undo));
    console.log(waitHealthy(vlab) ? 'shared Gateway healthy' : 'shared Gateway NOT healthy: check the unit before anything else');
    console.log('Runtime is back to the registered baseline; nothing else to do (no baseline/align needed if none was taken).');
    return;
  }

  // ---- 1. where things are --------------------------------------------------------
  const vPluginDirs = {};
  for (const p of CHANNEL_PLUGINS) {
    const dirs = sshText(V, `sudo sh -c ${sq(`ls -d ${p.vGlob}`)}`).split('\n').filter(Boolean);
    assert.equal(dirs.length, 1, `${p.id}: expected one directory on V for ${p.vGlob}, found ${dirs.length}`);
    vPluginDirs[p.id] = dirs[0];
  }
  const configs = VLAB_CONFIGS.map((file) => {
    const text = sshText(VLAB, `sudo cat ${sq(file)}`);
    return { file, text, json: JSON.parse(text) };
  });
  const moves = planMoves(configs[0].json.plugins?.load?.paths ?? [], vPluginDirs);

  // ---- 2. are VLab's bytes V's bytes? -----------------------------------------------
  const files = [];
  const fetched = [];
  for (const m of moves) {
    const preMovePlugin = m.done ? m.plugin : m.fromPlugin;
    const diff = diffTrees(hashTree(V, m.vPlugin, true), hashTree(VLAB, preMovePlugin, false));
    console.log(`${m.id}: V ${m.vPlugin}`);
    console.log(`  VLab ${m.done ? 'already at ' + m.plugin : m.fromPlugin + '\n    -> ' + m.plugin}`);
    console.log(`  ${diff.length ? diff.length + ' files differ from V:' : 'byte-identical to V (plugin dir, own node_modules excluded)'}`);
    for (const d of diff) {
      console.log(`    ${d.kind} ${d.path}`);
      const bytes = d.v ? ssh(V, `sudo cat ${sq(`${m.vPlugin}/${d.path}`)}`) : null;
      if (bytes) assert.equal(sha(bytes), d.v, `${m.id}/${d.path} changed on V while reading`);
      fetched.push(bytes);
      files.push({ id: m.id, preMove: `${preMovePlugin}/${d.path}`, dest: `${m.plugin}/${d.path}`, before: d.vlab, after: d.v });
    }
  }
  const todo = moves.filter((m) => !m.done);
  const rewrites = todo.map((m) => ({ from: m.fromPlugin, to: m.plugin }));
  const newConfigs = configs.map((c) => {
    const { config, changed } = rewriteLoadPaths(c.json, rewrites);
    return { ...c, changed, after: JSON.stringify(config, null, 2) + '\n' };
  }).filter((c) => c.changed > 0);
  if (!todo.length && !files.length) {
    console.log('\nNothing to do: both plugins already load from runtime/ with V\'s bytes.');
    printNext(args.owner);
    return;
  }
  for (const c of newConfigs) console.log(`config ${c.file}: ${c.changed} load path(s) repointed`);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const dir = `${VLAB_TMP}/channel-plugins-prep-${stamp}`;
  const plan = {
    unit: VLAB_UNIT, runtime: VLAB_RUNTIME, lock: VLAB_LOCK,
    moves: todo.map(({ id, fromUnit, toUnit }) => ({ id, fromUnit, toUnit })),
    files: files.map(({ id, preMove, dest, before, after }) => ({ id, preMove, dest, before, after })),
    configs: newConfigs.map((c) => ({ file: c.file, before: sha(c.text), after: sha(c.after) })),
  };
  const tar = pack(plan, fetched, newConfigs.map((c) => c.after));
  sshText(VLAB, `sudo mkdir -p -m 700 ${sq(dir)} && sudo tar -xf - -C ${sq(dir)}`, tar);
  try {
    console.log(remote('check', dir));
  } catch (e) {
    sshText(VLAB, `sudo rm -rf ${sq(dir)}`);
    throw Error(e.stderr?.toString() || e.message);
  }
  if (!args.apply) {
    sshText(VLAB, `sudo rm -rf ${sq(dir)}`);
    console.log('\nplan only; add --owner <o> --apply (stops and starts the shared Gateway once)');
    return;
  }

  // ---- 3. apply -----------------------------------------------------------------
  assert(typeof args.owner === 'string', '--owner is required with --apply');
  assertLease(vlab('status'), args.owner, { aligned: true });
  const workers = vlab('rpc', '--method', 'vlab.workers.status');
  assert.equal(workers.pending, 0, 'Worker requests pending; retry in a quiet window');
  assert(workers.workers.every((w) => !w.activeCount && !w.queued), 'Workers active; retry in a quiet window');
  try {
    console.log(remote('apply', dir));
  } catch (e) {
    console.error(`apply failed: ${e.stderr?.toString() || e.message}\nundoing`);
    console.error(remote('undo', dir));
    console.error(waitHealthy(vlab) ? 'undone, Gateway healthy again' : 'undone but Gateway still not healthy: check the unit now');
    process.exit(1);
  }
  if (!waitHealthy(vlab)) {
    console.error('Gateway did not become healthy; undoing');
    console.error(remote('undo', dir));
    console.error(waitHealthy(vlab) ? 'undone, Gateway healthy again' : 'undone but Gateway still not healthy: check the unit now');
    process.exit(1);
  }
  console.log(`\nDone. Backup and undo: ${dir}`);
  printNext(args.owner, repo);
}

export function assertLease(status, owner, { aligned }) {
  assert.equal(status.lease?.owner, owner, 'Integration lease belongs to another task (or none is held)');
  assert.equal(status.pending ?? null, null, 'Unresolved shared deployment');
  if (aligned) assert.equal(status.current?.v?.aligned, true, 'VLab is not marked aligned with V; finish or roll back the pending release first');
}

function waitHealthy(vlab) {
  const deadline = Date.now() + 900000;
  while (Date.now() < deadline) {
    try { if (vlab('rpc', '--method', 'health').ok === true) return true; } catch {}
    execFileSync('sleep', ['5']);
  }
  return false;
}

function printNext(owner = '<o>', repo = '.') {
  console.log(`
Next (the runtime fingerprint and config hash changed, so stage refuses until re-based):
  node lab/vlab.mjs baseline --id channel-plugins-in-runtime-<yyyymmdd> --owner ${owner} --sourceCommit <dev sha> --replaceCurrent true
  node scripts/vlab-v-parity.mjs        # must print ALIGNED, with dingtalk and wecom among the pairs
  node lab/vlab.mjs align --owner ${owner}
  node lab/vlab.mjs lease --owner ${owner} --release true
(baseline archives the whole runtime, ~1.4 GB, and needs 3 GB free on VLab.)`);
}

function pack(plan, fetched, configTexts) {
  const tmp = mkdtempSync(join(tmpdir(), 'channel-prep-'));
  try {
    mkdirSync(join(tmp, 'files'));
    writeFileSync(join(tmp, 'plan.json'), JSON.stringify(plan, null, 2));
    fetched.forEach((b, i) => { if (b) writeFileSync(join(tmp, 'files', String(i)), b); });
    configTexts.forEach((t, i) => writeFileSync(join(tmp, 'files', `config-${i}`), t));
    return execFileSync('tar', ['-cf', '-', '-C', tmp, '.'], { maxBuffer: 512 * 1024 * 1024 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
