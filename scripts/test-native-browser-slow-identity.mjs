import assert from 'node:assert/strict';import fs from 'node:fs';
const core=process.argv[2];assert(core.includes('/labs/instances/'));
const files=fs.readdirSync(core+'/dist').filter(x=>/^pw-session-.*\.js$/.test(x)).filter(x=>fs.readFileSync(core+'/dist/'+x,'utf8').includes('async function readPageTargetInfo(page) {'));assert.equal(files.length,1);
const {E:read}=await import(core+'/dist/'+files[0]);let detached=0;
const page={context:()=>({newCDPSession:async()=>({send:async()=>{await new Promise(r=>setTimeout(r,2800));return {targetInfo:{targetId:'slow-remote-fixture',title:'fixture'}};},detach:async()=>{detached++;}})})};
const start=Date.now(),r=await read(page);if(process.argv[3]==='fixed')assert.equal(r?.targetId,'slow-remote-fixture');else assert.equal(r,null);
console.log(JSON.stringify({nativeFunction:true,expected:process.argv[3]??'baseline',elapsedMs:Date.now()-start,resolved:!!r,detached}));
