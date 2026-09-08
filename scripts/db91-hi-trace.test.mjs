import test from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';import {once} from 'node:events';
import {createHiTrace} from './db91-hi-trace.mjs';
const message=i=>({runId:'DB91_HI_1788800000000_test_'+i,sessionKey:'agent:makaron:explicit:db91-hi-test-'+i});
test('non-test runs never log or get model observers',async()=>{
  const rows=[],trace=createHiTrace(r=>rows.push(r));
  try{await trace.run({runId:'real-business',sessionKey:'main'},()=>assert.equal(trace.beginModel({},{}),undefined));assert.equal(rows.length,0);}
  finally{trace.dispose();}
});
test('concurrent run attribution stays separate and does not record text',async()=>{
  const rows=[],trace=createHiTrace(r=>rows.push(r));
  try{
    await Promise.all([0,1].map(i=>trace.run(message(i),async()=>{
      const call=trace.beginModel({id:'deepseek-v4-pro'},{messages:[{secret:'PRIVATE_PROMPT'}]},{reasoningEffort:'low'});
      await new Promise(r=>setTimeout(r,10-i*5));
      call.event({type:'text_delta',delta:'PRIVATE_RESPONSE'});call.event({type:'text_delta',delta:'PRIVATE_RESPONSE'});
      call.error(new Error('timeout at https://private-host/?key=SECRET'));
    })));
    for(let i=0;i<2;i++){const a=rows.filter(r=>r.runId===message(i).runId);assert.equal(a.filter(r=>r.stage==='provider-first-text').length,1);assert.equal(a.find(r=>r.stage==='provider-enter').call,1);}
    assert(!/PRIVATE|private-host|SECRET/.test(JSON.stringify(rows)));
  }finally{trace.dispose();}
});
for(const mode of ['reader','iterator'])test('fetch '+mode+' preserves response bytes and records wire timing',async()=>{
  const rows=[],trace=createHiTrace(r=>rows.push(r));
  const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: alpha\n\n');setTimeout(()=>res.end('data: beta\n\n'),20);});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    await trace.run(message(mode),async()=>{
      const call=trace.beginModel({id:'deepseek-v4-pro'},{messages:[]},{reasoningEffort:'low'});
      const response=await call.wrapFetch(fetch)('http://127.0.0.1:'+server.address().port,{method:'POST',body:'DO_NOT_LOG_PAYLOAD'});
      assert(response instanceof Response);assert.equal(response.status,200);let text='';
      if(mode==='reader'){const reader=response.body.getReader();for(;;){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);}reader.releaseLock();}
      else for await(const chunk of response.body)text+=new TextDecoder().decode(chunk);
      assert.equal(text,'data: alpha\n\ndata: beta\n\n');
    });
    for(const stage of ['http-fetch-start','http-headers-sent','http-response-headers','http-first-body-consumed'])assert.equal(rows.filter(r=>r.stage===stage).length,1,stage);
    assert(!/DO_NOT_LOG|alpha|beta|127\.0\.0\.1/.test(JSON.stringify(rows)));
  }finally{trace.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('fetch cancellation is preserved',async()=>{
  const rows=[],trace=createHiTrace(r=>rows.push(r));
  try{await trace.run(message('abort'),async()=>{
    const call=trace.beginModel({},{},{}),controller=new AbortController();controller.abort();
    await assert.rejects(call.wrapFetch(fetch)('http://127.0.0.1:1',{signal:controller.signal}),{name:'AbortError'});
  });assert(rows.some(r=>r.stage==='http-fetch-error'&&r.errorCategory==='abort'));}
  finally{trace.dispose();}
});
