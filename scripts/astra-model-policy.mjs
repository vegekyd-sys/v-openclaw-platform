import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

// Additive model policy only. Does not change provider credentials or defaults.
const [action, main, overlay, backup] = process.argv.slice(2);
assert(['apply', 'rollback'].includes(action));
assert(main && overlay && backup);
const model = 'openai/gpt-6-astra';
function changes(config, inner) {
  assert(config.agents?.entries?.['v-codex'], 'v-codex must already exist');
  return [
    {path:['agents','defaults','models',model], value:{alias:'astra',params:{thinking:'low'},agentRuntime:{id:inner?'openclaw':'vlab-worker'}}},
    {path:['agents','entries','v-codex','models',model], value:{alias:'astra',params:{thinking:'low'},agentRuntime:{id:'codex'}}},
  ];
}
function parent(config, keys) {
  return keys.slice(0,-1).reduce((o,k)=>o[k]??=(Object.create(null)),config);
}
function write(file,config) {
  const stat=fs.statSync(file), tmp=`${file}.astra-${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:stat.mode&0o777});
  fs.chownSync(tmp,stat.uid,stat.gid); fs.renameSync(tmp,file);
}
if(action==='apply') {
  assert(!fs.existsSync(backup),'Use a fresh backup directory');
  const plan=[main,overlay].map((file,i)=>{
    const config=JSON.parse(fs.readFileSync(file));
    const edits=changes(config,i===1).map(edit=>{
      const o=parent(config,edit.path),key=edit.path.at(-1);
      assert(!Object.hasOwn(o,key),'Existing Astra policy must be reviewed, not overwritten');
      return {...edit,existed:false};
    });
    return {file,config,edits};
  });
  fs.mkdirSync(backup,{recursive:true,mode:0o700});
  for(const [i,item] of plan.entries()) {
    fs.copyFileSync(item.file,path.join(backup,`${i}.before.json`));
    fs.chmodSync(path.join(backup,`${i}.before.json`),0o600);
  }
  fs.writeFileSync(path.join(backup,'policy.json'),JSON.stringify(plan.map(({file,edits})=>({file,edits})),null,2),{mode:0o600});
  for(const item of plan) {
    for(const e of item.edits) parent(item.config,e.path)[e.path.at(-1)]=e.value;
    write(item.file,item.config);
  }
} else {
  const plan=JSON.parse(fs.readFileSync(path.join(backup,'policy.json')));
  assert.deepEqual(plan.map(x=>x.file),[main,overlay]);
  const prepared=plan.map(item=>{
    const config=JSON.parse(fs.readFileSync(item.file));
    for(const e of item.edits) {
      const o=parent(config,e.path),key=e.path.at(-1);
      assert(isDeepStrictEqual(o[key],e.value),'Concurrent Astra edit: do not overwrite');
      delete o[key];
    }
    return {file:item.file,config};
  });
  for(const item of prepared) write(item.file,item.config);
}
console.log(JSON.stringify({action,model,backup,defaultModelsChanged:false,credentialsChanged:false}));
