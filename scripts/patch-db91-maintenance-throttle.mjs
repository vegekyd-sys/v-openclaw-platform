import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
export function patchAutomaticMaintenance(source) {
  const anchor='\twhile (isCurrent()) {\n\t\tconst generation = owner.generation;';
  assert.equal(source.split(anchor).length,2,'automatic maintenance anchor drift');
  assert(!source.includes('db91WaitAutomaticMaintenance'));
  return 'import { waitAutomaticMaintenanceWindow as db91WaitAutomaticMaintenance } from "./db91-maintenance-throttle.mjs";\n'+source.replace(anchor,'\twhile (isCurrent()) {\n\t\tif (process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE === "1") {\n\t\t\tawait db91WaitAutomaticMaintenance(owner.database);\n\t\t\tif (!isCurrent()) break;\n\t\t}\n\t\tconst generation = owner.generation;');
}
const sha=text=>createHash('sha256').update(text).digest('hex');
function write(file,content,template){const stat=fs.statSync(template??file),tmp=file+'.db91-maintenance-'+process.pid+'.tmp';fs.writeFileSync(tmp,content,{flag:'wx',mode:stat.mode&0o777});fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,file);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [action,core,backup]=process.argv.slice(2);assert(['check','apply','rollback','ensure'].includes(action));assert.equal(fs.realpathSync(core),core);
  if(action==='rollback'||action==='ensure'&&backup&&fs.existsSync(path.join(backup,'changes.json'))){
    const plan=JSON.parse(fs.readFileSync(path.join(backup,'changes.json')));assert.equal(plan.length,2);assert(plan.every(p=>path.dirname(p.filename)===path.join(core,'dist')));
    for(const p of plan){const value=fs.existsSync(p.filename)?fs.readFileSync(p.filename,'utf8'):null;assert(action==='ensure'?value===p.after:value===p.after||value===p.before,'concurrent native change');}
    if(action==='rollback')for(const p of plan){if(p.before===null){if(fs.existsSync(p.filename))fs.unlinkSync(p.filename);}else write(p.filename,p.before);}
    console.log(JSON.stringify({action,files:2}));
  }else{
    const files=fs.readdirSync(path.join(core,'dist')).filter(n=>n.startsWith('session-accessor.sqlite-entry-')&&n.endsWith('.js')&&fs.readFileSync(path.join(core,'dist',n),'utf8').includes('async function runPendingMaintenance('));assert.equal(files.length,1);
    const file=path.join(core,'dist',files[0]),before=fs.readFileSync(file,'utf8'),helper=path.join(core,'dist/db91-maintenance-throttle.mjs');assert(!fs.existsSync(helper));
    const plan=[{filename:file,before,after:patchAutomaticMaintenance(before)},{filename:helper,before:null,after:fs.readFileSync(fileURLToPath(new URL('../experiments/db91-memory-provenance/maintenance-throttle.mjs',import.meta.url)),'utf8')}];
    if(['apply','ensure'].includes(action)){assert(backup&&path.isAbsolute(backup)&&!fs.existsSync(backup));fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.writeFileSync(path.join(backup,'changes.json'),JSON.stringify(plan),{mode:0o600,flag:'wx'});for(const p of plan)write(p.filename,p.after,p.before===null?file:undefined);}
    console.log(JSON.stringify({action,enabled:false,files:plan.map(p=>({filename:p.filename,beforeSha:p.before===null?null:sha(p.before),afterSha:sha(p.after)}))}));
  }
}
