import assert from 'node:assert/strict';
export function originalRecoveryUserIndex(messages,runId){
 const original=messages.map((m,i)=>({m,i})).filter(({m})=>m.role==='user'&&m.idempotencyKey===runId+':user');
 assert.equal(original.length,1,'Exactly one original user request is required');
 for(const message of messages.filter(m=>m.role==='user'&&m!==original[0].m)){
  assert.equal(message.provenance?.kind,'internal_system','User resend is not allowed');
  assert.equal(message.provenance?.sourceTool,'main_session_restart_recovery','Only native recovery continuation is allowed');
 }
 return original[0].i;
}
