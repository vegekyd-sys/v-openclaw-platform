// Stand-in for the Gateway's native hook bridge: a tiny state DB plus an HTTP responder.
import {DatabaseSync} from 'node:sqlite'; import http from 'node:http'; import fs from 'node:fs';
const dbp=process.argv[2]; fs.rmSync(dbp,{force:true});
const s=http.createServer((q,r)=>{q.resume();q.on('end',()=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({ok:true,result:{stdout:'{"mock":1}\n',stderr:'',exitCode:0}}))})});
s.listen(0,'127.0.0.1',()=>{const db=new DatabaseSync(dbp);db.exec('PRAGMA user_version=15;CREATE TABLE native_hook_relay_bridges(relay_id TEXT PRIMARY KEY,pid INT,hostname TEXT,port INT,token TEXT,expires_at_ms INT)');db.prepare('INSERT INTO native_hook_relay_bridges VALUES(?,?,?,?,?,?)').run('mock',process.pid,'127.0.0.1',s.address().port,'mock',Date.now()+6*3600e3);db.close();console.log('ready')});
