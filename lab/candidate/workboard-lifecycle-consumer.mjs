import assert from 'node:assert/strict';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

// A separate process supplies real socket requests even when the tested main
// thread is blocked. Twelve other processes do fixed native SQLite CAS work.
const config=JSON.parse(process.env.LIFECYCLE_CONSUMER_CONFIG);
if(config.mode==='probe') {
  const times=[];let running=true;
  process.on('message',message=>{if(message==='stop')running=false;});
  process.send({type:'ready'});
  await new Promise(resolve=>process.once('message',resolve));
  while(running) {
    const t=performance.now();
    await new Promise((resolve,reject)=>http.get(config.url,response=>{
      let body='';response.on('data',chunk=>body+=chunk);
      response.on('end',()=>{try{assert.equal(response.statusCode,200);assert.equal(JSON.parse(body).cards,141);resolve();}catch(error){reject(error);}});response.on('error',reject);
    }).on('error',reject));
    times.push(performance.now()-t);
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  process.send({type:'result',times});process.disconnect();
} else {
  const native=await import(pathToFileURL(config.module));
  const stores=native.t({dbPath:config.file});
  const latencies=[];let writes=0;
  process.send({type:'ready'});
  await new Promise(resolve=>process.once('message',resolve));
  const started=performance.now();
  try {
    for(let i=0;i<config.operations;i++) {
      const t=performance.now();
      const entry=await stores.cards.lookup(config.cardId);
      assert(entry?.card,'consumer card exists');
      const previous=entry.card.updatedAt;
      entry.card.updatedAt=previous+1;
      assert.equal(await stores.cards.registerIfUpdatedAt(config.cardId,entry,previous),true,'native CAS writer lost ownership');
      writes++;latencies.push(performance.now()-t);
      await new Promise(resolve=>setImmediate(resolve));
    }
    process.send({type:'result',writes,elapsedMs:performance.now()-started,latencies});
  } finally {stores.close();process.disconnect();}
}
