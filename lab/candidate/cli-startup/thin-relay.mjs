// Lower bound for a hook relay: same work as the real path (stdin, locator read, POST) with no OpenClaw modules.
import {DatabaseSync} from 'node:sqlite'; import {request} from 'node:http';
const a=process.argv; const g=k=>a[a.indexOf(k)+1];
let raw='';for await(const c of process.stdin)raw+=c;
const db=new DatabaseSync(g('--state-db'),{readOnly:true});const r=db.prepare('SELECT * FROM native_hook_relay_bridges WHERE relay_id=?').get(g('--relay-id'));db.close();
const body=JSON.stringify({provider:g('--provider'),relayId:g('--relay-id'),event:g('--event'),rawPayload:raw?JSON.parse(raw):null});
const q=request({hostname:r.hostname,port:r.port,path:'/invoke',method:'POST',headers:{authorization:'Bearer '+r.token,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let t='';res.on('data',c=>t+=c);res.on('end',()=>{const p=JSON.parse(t);process.stdout.write(p.result.stdout);process.exit(p.result.exitCode)})});q.end(body);
