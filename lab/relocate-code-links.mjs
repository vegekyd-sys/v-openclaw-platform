// Run only against a NEW, unsealed baseline or private instance. Never live/shared paths.
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
if(!root?.startsWith('/srv/vlab-production-mirror/labs/baselines/') || !root.endsWith('/runtime')) throw Error('Only a new labs baseline runtime is allowed');
if(fs.existsSync(path.dirname(root)+'/baseline.json')) throw Error('Baseline is already sealed');
const generation='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const mapping=[
  ['/opt/openclaw-2026.7.1/node_modules/openclaw',`${root}/openclaw`],
  ['/opt/openclaw-2026.9.1-v/openclaw',`${root}/openclaw`],
  [`${generation}/runtime/npm-global/lib/node_modules/openclaw`,`${root}/openclaw`],
  ['/home/openclaw/.openclaw/npm',`${root}/npm`],
  [`${generation}/state/npm`,`${root}/npm`],
];
let changed=0;
function visit(dir) {
  for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if(e.isDirectory())visit(p);
    else if(e.isSymbolicLink()) {
      const raw=fs.readlinkSync(p), target=path.resolve(path.dirname(p),raw);
      if(target.startsWith(root+'/'))continue;
      const match=mapping.find(([from])=>target===from||target.startsWith(from+'/'));
      if(!match)throw Error(`Unmapped external code link: ${p} -> ${target}`);
      const dest=match[1]+target.slice(match[0].length);
      if(!fs.existsSync(dest))throw Error(`Missing mapped code target: ${dest}`);
      fs.unlinkSync(p);fs.symlinkSync(path.relative(path.dirname(p),dest),p);changed++;
    }
  }
}
visit(root);console.log(JSON.stringify({relocatedCodeLinks:changed}));
