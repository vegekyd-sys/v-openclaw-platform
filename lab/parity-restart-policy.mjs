import assert from 'node:assert/strict';
export function patchParityRestartController(source){
 const edits=[
  ["'--property=KillMode=control-group'","m.name===parityName?'--property=KillMode=mixed':'--property=KillMode=control-group'"],
  ["else if(command==='restart')lock(()=>{check(m);run('systemctl',['stop',m.unit]);start(m);});",
   "else if(command==='restart')lock(()=>{check(m);if(m.name===parityName){parityResources(m,read(`${ROOT}/control/integration.json`));run('runuser',['-u',m.user,'--','env',`OPENCLAW_STATE_DIR=${m.root}/state`,`OPENCLAW_CONFIG_PATH=${m.root}/state/openclaw.json`,NODE,`${m.root}/source/scripts/prepare-parity-native-restart.mjs`]);}run('systemctl',['stop',m.unit]);start(m);});"]
 ];
 assert(!source.includes('prepare-parity-native-restart.mjs'),'already patched');
 for(const [before,after] of edits){assert.equal(source.split(before).length,2,'Restart controller anchor drift');source=source.replace(before,after);}
 return source;
}
