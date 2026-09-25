#!/usr/bin/env node
// Move leftover backup copies (.bak, .predeploy-*, ...) out of V's runtime roots.
//
//   node scripts/clean-v-residue.mjs                 # list what would move
//   node scripts/clean-v-residue.mjs --apply         # move them
//   node scripts/clean-v-residue.mjs --undo <dir>    # put them back
//
// They are never loaded, but they sit inside the release directories, blur what
// "the release" is, and have blocked deploy fingerprints before. Nothing is
// deleted: files move to /opt/v-release-backups/residue-<ts>/<root-label>/<path>
// with a moved.json for --undo. The Gateway is not touched.
//
// Checked before first use (2026-09-25): V's ExecStartPre patchers only create
// their .bak when they apply a patch the file does not carry yet, and both look
// for Feishu under npm/projects, which V does not use. None reads an existing
// .bak.

import { execFileSync } from 'node:child_process';
import { isResidue } from './lib/runtime-residue.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const V = args.vHost ?? 'v';
const V_NODE = '/opt/node-v22.23.1/bin/node';
const ssh = (script, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', V, script], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

const REMOTE = String.raw`
const fs=require('fs'),path=require('path');
const [mode,arg]=process.argv.slice(process.argv[1]==='-'?2:1);
if(mode==='move'){
  const plan=JSON.parse(fs.readFileSync(0,'utf8'));
  fs.mkdirSync(plan.dir,{recursive:true,mode:0o700});
  const moved=[];
  for(const f of plan.files){
    const to=path.join(plan.dir,f.label,f.rel);
    fs.mkdirSync(path.dirname(to),{recursive:true});
    try{fs.renameSync(f.from,to)}catch(e){if(e.code!=='EXDEV')throw e;fs.copyFileSync(f.from,to);fs.unlinkSync(f.from)}
    moved.push({from:f.from,to});
    fs.writeFileSync(path.join(plan.dir,'moved.json'),JSON.stringify(moved,null,1));
  }
  console.log('moved '+moved.length+' files to '+plan.dir);
} else if(mode==='undo'){
  const moved=JSON.parse(fs.readFileSync(path.join(arg,'moved.json')));
  for(const m of moved.reverse()){if(fs.existsSync(m.from))throw Error('refusing to overwrite '+m.from);fs.renameSync(m.to,m.from)}
  console.log('restored '+moved.length+' files');
}
`;

if (args.undo) {
  console.log(ssh(`sudo ${V_NODE} - undo ${sq(args.undo)}`, REMOTE).trim());
  process.exit(0);
}

const core = /(\/\S+)\/dist\/index\.js/.exec(ssh('systemctl show openclaw-gateway.service -p ExecStart --value'))?.[1];
if (!core) throw new Error('cannot find V core from ExecStart');
const roots = [
  ['core', `${core}/dist`],
  ['worker', core.replace(/\/core$/, '/worker')],
  ['feishu', args.vFeishu ?? '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu'],
];
const files = [];
for (const [label, root] of roots) {
  const list = ssh(`cd ${sq(root)} && nice -n 19 find . -path ./node_modules -prune -o -type f -print`).split('\n').filter(Boolean);
  for (const p of list) {
    const rel = p.replace(/^\.\//, '');
    if (isResidue(rel)) files.push({ label, rel, from: `${root}/${rel}` });
  }
}
for (const f of files) console.log(`  ${f.label.padEnd(6)} ${f.rel}`);
console.log(`${files.length} residue files`);
if (!args.apply || files.length === 0) process.exit(0);

const dir = `/opt/v-release-backups/residue-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}`;
console.log(ssh(`sudo ${V_NODE} -e ${sq(REMOTE)} move`, JSON.stringify({ dir, files })).trim());
console.log(`undo with: node scripts/clean-v-residue.mjs --undo ${dir}`);
