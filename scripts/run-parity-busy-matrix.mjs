// One coordinator gives every comparison arm the same foreground launch rule.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const [arm,tag]=process.argv.slice(2);assert(['A','B','A2'].includes(arm));assert(/^[A-Za-z0-9-]{1,40}$/.test(tag??''));
const directory=root+'/tmp/parity-results';fs.mkdirSync(directory,{recursive:true,mode:0o700});
const reportFile=directory+'/coordinator-'+tag+'.json',backgroundFile=directory+'/background-'+tag+'.json';assert(!fs.existsSync(reportFile)&&!fs.existsSync(backgroundFile));
const pid=execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
const env=fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0');
const flag=key=>env.find(x=>x.startsWith(key+'='))?.split('=').at(-1);
const flags={readAhead:flag('OPENCLAW_DB91_READ_AHEAD_ENABLE'),state:flag('OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE'),trajectory:flag('OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE')};
assert.equal(flags.readAhead,'1');assert.equal(flags.state,arm==='B'?'1':'0');assert.equal(flags.trajectory,arm==='B'?'1':'0');
const report={arm,tag,startedAt:Date.now(),gatewayPid:Number(pid),flags,sourceCommit:execFileSync('git',['-C',root+'/source','rev-parse','HEAD'],{encoding:'utf8'}).trim(),completed:false};
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600});save();
const launch=(script,args)=>{const child=spawn(process.execPath,[root+'/source/scripts/'+script,...args],{env:process.env,stdio:['ignore','inherit','inherit']});const result={child,closed:false};result.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{result.closed=true;result.code=code;resolve({code,signal});});});return result;};
const background=launch('parity-background-load.mjs',[tag,'3600']);let foreground;
try{
 const start=Date.now();
 while(Date.now()-start<180000){
  if(fs.existsSync(backgroundFile)){
   const b=JSON.parse(fs.readFileSync(backgroundFile));assert.equal(b.errors.length,0,'Background failed before readiness');assert(!b.finishedAt,'Background ended before readiness');
   if(b.ready){
    report.readinessObservedAt=Date.now();report.firstActual16At=b.samples.find(s=>s.totalActive>=16&&s.backgroundSubmitted===16)?.at;assert(report.firstActual16At);
    foreground=launch('trace-production-parity.mjs',[arm,'full',tag]);report.foregroundLaunchedAt=Date.now();report.launchDelayMs=report.foregroundLaunchedAt-report.firstActual16At;save();
    console.log(JSON.stringify({phase:'coordinated-foreground-launch',arm,tag,launchDelayMs:report.launchDelayMs}));break;
   }
  }
  assert(!background.closed,'Background process ended before readiness');await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(foreground,'Did not observe sixteen actually active background requests');
 report.foreground=await foreground.done;assert.equal(report.foreground.code,0,'Foreground matrix did not pass');
 report.background=await background.done;const b=JSON.parse(fs.readFileSync(backgroundFile));assert.equal(report.background.code,0);assert.equal(b.errors.length,0);assert(b.completed&&b.ready);
 report.completed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 const stop=directory+'/background-'+tag+'.stop';if(!fs.existsSync(stop))fs.writeFileSync(stop,'coordinator ended\n',{mode:0o600,flag:'wx'});
 if(!background.closed)report.background=await background.done;
 report.finishedAt=Date.now();save();
}
console.log(JSON.stringify({phase:'coordinated-matrix-completed',arm,tag,completed:report.completed,launchDelayMs:report.launchDelayMs}));
