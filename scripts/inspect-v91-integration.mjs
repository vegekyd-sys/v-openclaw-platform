import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
for(const method of ['health','vlab.workers.status']){
 try {const r=await callGatewayFromCli(method,{timeout:'20000',json:true},{});
 const summary=method==='health'?{ok:r.ok,eventLoop:r.eventLoop,pluginErrors:r.plugins?.errors,channels:Object.fromEntries(Object.entries(r.channels??{}).map(([k,v])=>[k,{connected:v.connected,running:v.running,lastError:v.lastError}]))}:{pending:r.pending,maxActiveSessions:r.maxActiveSessions,version:r.integration?.workerIsolationVersion,workers:r.workers?.map(w=>({slot:w.slot,ready:w.ready,activeCount:w.activeCount,queued:w.queued,active:w.active?.map(a=>({kind:a.kind,sessionKey:a.sessionKey,lastProgressAgeMs:a.lastProgressAgeMs}))}))};
 console.log(JSON.stringify({method,result:summary}));}
 catch(e){console.log(JSON.stringify({method,error:e.message}));process.exitCode=1;}
}
