import {createServer} from 'node:http';
import {monitorEventLoopDelay} from 'node:perf_hooks';
if(process.argv[1]?.endsWith('/openclaw/dist/index.js')){
 const loop=monitorEventLoopDelay({resolution:10});loop.enable();let cpu;
 const server=createServer((req,res)=>{
 if(req.url==='/start'){loop.reset();cpu=process.cpuUsage();res.end('{}');}
 else res.end(JSON.stringify({cpu:process.cpuUsage(cpu),eventLoop:{p50:loop.percentile(50)/1e6,p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6},memory:process.memoryUsage()}));
 });server.listen(0,'127.0.0.1',()=>console.error('[nightshift-profile-ready] '+JSON.stringify({port:server.address().port})));server.unref();
}
