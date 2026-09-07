import test from 'node:test';
import assert from 'node:assert/strict';
import { publishWorkerPublicStream } from './gateway-public-stream.mjs';
test('child stream is published using Gateway identity and generation, never child owners',()=>{
 const parent={runId:'parent',sessionKey:'agent:a:test',agentId:'a',lifecycleGeneration:'gateway-current'};
 const received=[];
 const child={runId:'other',sessionKey:'other-session',seq:99,contextClaimId:'child-claim',lifecycleGeneration:'child',stream:'assistant',data:{text:'visible'}};
 assert.equal(publishWorkerPublicStream(parent,'onAgentEvent',[child],e=>received.push(e)),1);
 assert.deepEqual(received,[{...parent,stream:'assistant',data:{text:'visible'}}]);
 assert.equal(child.runId,'other');
});
test('terminal, cancellation and partial reply remain under their native owners',()=>{
 const ctrl=new AbortController(),parent={runId:'p',abortSignal:ctrl.signal};let calls=0;
 const emit=()=>calls++;
 for(const phase of ['start','finishing','end','error']) publishWorkerPublicStream(parent,'onAgentEvent',[{stream:'lifecycle',data:{phase}}],emit);
 publishWorkerPublicStream(parent,'onPartialReply',[{text:'callback-only'}],emit);
 ctrl.abort();publishWorkerPublicStream(parent,'onAgentEvent',[{stream:'assistant',data:{text:'late'}}],emit);
 assert.equal(calls,0);
});
test('isolated simultaneous sessions never share public event routing',()=>{
 const received=[];
 for(const id of ['a','b']) for(const stream of ['assistant','tool','reasoning']) publishWorkerPublicStream({runId:id,sessionKey:id},'onAgentEvent',[{stream,data:{text:id}}],e=>received.push(e));
 for(const event of received){assert.equal(event.data.text,event.runId);assert.equal(event.sessionKey,event.runId);}
 assert.equal(received.length,6);
});
