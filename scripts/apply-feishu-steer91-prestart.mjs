// Reapply only the reviewed 9.1 transport adapter to installed Feishu generations.
// Future, unreviewed plugin versions are not guessed or silently patched.
import fs from 'node:fs';
import path from 'node:path';
import {patchPackage} from './patch-feishu-active-run-steering.mjs';
const state=process.argv[2];
if(!state||!path.isAbsolute(state))throw Error('Explicit absolute state directory required');
const projects=path.join(state,'npm/projects');
let count=0;
for(const entry of fs.readdirSync(projects,{withFileTypes:true})){
 if(!entry.isDirectory()||!entry.name.startsWith('openclaw-feishu-'))continue;
 const root=path.join(projects,entry.name,'node_modules/@openclaw/feishu');
 if(!fs.existsSync(root+'/package.json'))continue;
 const p=JSON.parse(fs.readFileSync(root+'/package.json'));
 if(p.name!=='@openclaw/feishu'||p.version!=='2026.9.1')continue;
 const result=await patchPackage(root);count++;
 console.log(JSON.stringify({steer91:true,packageVersion:p.version,changed:result.changed}));
}
if(!count)throw Error('No reviewed Feishu 9.1 generation found; Steer requires migration review');
