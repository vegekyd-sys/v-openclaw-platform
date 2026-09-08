// Isolated stdio MCP fixture; never connects to production or an external service.
import readline from 'node:readline';import os from 'node:os';
if(os.hostname()!=='VM-0-4-ubuntu')throw Error('VLab only');
const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 let m;try{m=JSON.parse(line);}catch{continue;}if(m.id===undefined)continue;
 if(m.method==='initialize'){await new Promise(r=>setTimeout(r,1400));send(m.id,{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'affinity-fixture.1',version:'1.0.0'}});}
 else if(m.method==='tools/list'){await new Promise(r=>setTimeout(r,1100));send(m.id,{tools:[{name:'affinity_probe',description:'Read-only isolated VLab verification. Echoes a test marker; does not read private data or modify anything.',inputSchema:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}}]});}
 else if(m.method==='tools/call'&&m.params?.name==='affinity_probe')send(m.id,{content:[{type:'text',text:JSON.stringify({marker:m.params.arguments?.marker,pid:process.pid,readOnly:true})}],isError:false});
 else if(m.method==='ping')send(m.id,{});
 else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'unsupported fixture method'}})+'\n');
}
