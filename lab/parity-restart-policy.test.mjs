import test from 'node:test';import assert from 'node:assert/strict';import {patchParityRestartController} from './parity-restart-policy.mjs';
test('only owned parity restart prepares native intent; other stop/restart semantics stay unchanged',()=>{
 const source="'--property=KillMode=control-group'\nelse if(command==='restart')lock(()=>{check(m);run('systemctl',['stop',m.unit]);start(m);});";
 const result=patchParityRestartController(source);
 assert(result.includes("m.name===parityName?'--property=KillMode=mixed':'--property=KillMode=control-group'"));
 assert(result.includes("if(m.name===parityName){parityResources(m,read(`${ROOT}/control/integration.json`));"));
 assert(result.includes("}run('systemctl',['stop',m.unit]);start(m);"));
 assert.throws(()=>patchParityRestartController(result));assert.throws(()=>patchParityRestartController('drift'));
});
