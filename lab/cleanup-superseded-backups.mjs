import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {inspectTree,processReferences,unlinkTreeExact,diskUsage,assertMappings} from '/usr/local/lib/v-storage-governance/core.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes('superseded-backup-cleanup-20260911'));
const policy=JSON.parse(fs.readFileSync('/usr/local/lib/v-storage-governance/policy.json'));
const map=policy.mappings.find(m=>m.name==='backups');assertMappings(policy);
const base=map.destination;
const good=JSON.parse(fs.readFileSync(base+'/v2026.9.1-db91.1/state-final/manifest.json'));
assert.equal(good.complete,true);assert.equal(good.databases.length,9);
const retainedNightshift=base+'/nightshift-workboard/20260909T090034Z-d53861438c729fa2b66303c8247be14be5750df0/state.before/nightshift.sqlite';
assert(fs.statSync(retainedNightshift).size>300e6);
assert(fs.statSync(base+'/nightshift-workboard/20260911T080605Z-1a9291606d512fbf7f38280235e263ca0c2bcf99/state.before/nightshift.sqlite').size>300e6);
const targets=['v2026.9.1-db91.1/state-online','nightshift-workboard/20260909T083844Z-abf81a911682411f46ede669316c75b4a920141c','nightshift-workboard/20260909T085539Z-d538614985489fa4e96710696259903bdb2ff6f5'];
for(let index=0;index<targets.length;index++){
 const suffix=targets[index],root=base+'/'+suffix;
 if(index===0&&!fs.existsSync(root)){assert.equal(JSON.parse(fs.readFileSync('/var/lib/v-storage-governance/superseded-backup-cleanup-20260911-0.json')).root,root);console.log(JSON.stringify({event:'previously-removed',root}));continue;}
 const roots=[root,map.original+'/'+suffix,...map.aliases.map(p=>p+'/'+suffix),'/var/lib/v-storage-governance/underlays/backups/'+suffix];
 assert.equal(processReferences(roots).length,0);
 if(index===0){const old=JSON.parse(fs.readFileSync(root+'/manifest.json'));assert(old.startedAt<good.startedAt);}
 else assert(fs.statSync(root+'/state.before/nightshift.sqlite').size>300e6);
 const inventory=inspectTree(root);assert(inventory.length<30000);assert(inventory.filter(e=>e.type==='file').every(e=>e.nlink===1));
 assert(inventory.every(e=>e.mtime<Date.parse('2026-09-10T00:00:00Z')),'Target has newer contents');
 const bytes=inventory.reduce((n,e)=>n+e.blocks*512,0);
 const report={at:new Date().toISOString(),reason:'Superseded pre-failure or online backup; completed final snapshot and newer successful rollback points retained',root,bytes,retainedNightshift,inventory,before:diskUsage(policy.diskRoot)};
 fs.writeFileSync('/var/lib/v-storage-governance/superseded-backup-cleanup-20260911-'+index+'.json',JSON.stringify(report),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({event:'verified-delete-start',root,entries:inventory.length,bytes}));
 assert.equal(processReferences(roots).length,0);assertMappings(policy);unlinkTreeExact(root,inventory,{allowLinks:true});
 console.log(JSON.stringify({event:'deleted',root,after:diskUsage(policy.diskRoot)}));
}
