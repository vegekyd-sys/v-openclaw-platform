import test from 'node:test';import assert from 'node:assert/strict';import {originalRecoveryUserIndex} from './recovery-proof.mjs';
test('native internal continuation is distinct from a user resend',()=>{
 const user={role:'user',idempotencyKey:'one:user'};
 assert.equal(originalRecoveryUserIndex([user,{role:'assistant'},{role:'user',provenance:{kind:'internal_system',sourceTool:'main_session_restart_recovery'}}],'one'),0);
 assert.throws(()=>originalRecoveryUserIndex([user,user],'one'));
 assert.throws(()=>originalRecoveryUserIndex([user,{role:'user',idempotencyKey:'two:user'}],'one'));
 assert.throws(()=>originalRecoveryUserIndex([user,{role:'user',provenance:{kind:'internal_system',sourceTool:'other'}}],'one'));
});
