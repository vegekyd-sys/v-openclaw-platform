import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

export function captureOwnedBrowserDirectory(directory,{parent,prefix}={}) {
  assert(path.isAbsolute(directory)&&path.isAbsolute(parent)&&typeof prefix==='string'&&prefix.length>0,
    'Exact owned browser directory identity required');
  const resolved=path.resolve(directory),stat=fs.lstatSync(resolved);
  assert(path.dirname(resolved)===fs.realpathSync(parent)&&path.basename(resolved).startsWith(prefix)&&
    stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(resolved)===resolved&&stat.uid===process.getuid(),
    'Browser cleanup directory escaped its newly allocated private scope');
  return Object.freeze({path:resolved,dev:stat.dev,ino:stat.ino,uid:stat.uid});
}

export function observeOwnedChromeProcesses({profile,rootPid,knownProcesses=[]}={}) {
  assert(path.isAbsolute(profile)&&(!rootPid||Number.isSafeInteger(rootPid)&&rootPid>0),
    'Exact owned Chrome profile and process identity required');
  const known=new Map(knownProcesses.map(row=>[row.pid,row])),alive=new Map(),visited=new Set();
  const readProcess=pid=>{
    try {
      const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/u);
      assert(/^\d+$/u.test(fields[19]??''),'Owned Chrome start ticks unavailable');
      return {pid:Number(pid),startTicks:fields[19],state:fields[0]};
    } catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error;}
  };
  const add=row=>{if(row){known.set(row.pid,row);if(!['Z','X'].includes(row.state))alive.set(row.pid,row);}};
  const visit=pid=>{
    if(visited.has(pid))return;visited.add(pid);
    const row=readProcess(pid);if(!row)return;
    const previous=known.get(row.pid);if(previous&&previous.startTicks!==row.startTicks)return;
    add(row);
    let children;try{children=fs.readFileSync('/proc/'+pid+'/task/'+pid+'/children','utf8').trim();}
    catch(error){if(['ENOENT','ESRCH'].includes(error.code))return;throw error;}
    for(const child of children.split(/\s+/u).filter(Boolean))visit(Number(child));
  };
  if(rootPid) {
    const row=readProcess(rootPid);
    if(row&&(!known.has(rootPid)||known.get(rootPid).startTicks===row.startTicks)) {
      let args;try{args=fs.readFileSync('/proc/'+rootPid+'/cmdline','utf8').split('\0');}
      catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
      if(args?.includes('--user-data-dir='+profile))visit(rootPid);
      else if(!['Z','X'].includes(row.state))assert(known.has(rootPid),'Owned Chrome main PID/profile mismatch');
    }
  }
  // Main exit can reparent a renderer. Retain its original PID/start ticks and
  // also inspect only processes declaring this exact unique profile, never kill.
  for(const prior of [...known.values()]) {
    const row=readProcess(prior.pid);if(row?.startTicks===prior.startTicks)add(row);
  }
  for(const entry of fs.readdirSync('/proc'))if(/^\d+$/u.test(entry)) {
    let args;try{args=fs.readFileSync('/proc/'+entry+'/cmdline','utf8').split('\0');}
    catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
    if(args.includes('--user-data-dir='+profile))add(readProcess(Number(entry)));
  }
  return {observedAt:Date.now(),profile,rootPid:rootPid??null,knownProcesses:[...known.values()],
    aliveProcesses:[...alive.values()],source:'exact-private-profile-and-captured-descendant-start-ticks'};
}

export async function removeOwnedBrowserDirectory(directory,{identity,chromeExited,inspectChrome,maxAttempts=10,retryDelayMs=100}={},
  {remove=(target,options)=>fs.promises.rm(target,options),wait=sleep}={}) {
  assert(identity?.path===path.resolve(directory)&&path.isAbsolute(directory)&&chromeExited===true&&typeof inspectChrome==='function',
    'Browser directory removal requires its exact allocation and confirmed Chrome exit');
  assert(Number.isSafeInteger(maxAttempts)&&maxAttempts>=1&&maxAttempts<=10&&
    Number.isSafeInteger(retryDelayMs)&&retryDelayMs>=1&&retryDelayMs<=100,'Bounded browser directory cleanup required');
  let attempts=0;
  while(attempts<maxAttempts) {
    const observation=inspectChrome();assert(observation.aliveProcesses.length===0,'Owned Chrome process remains alive; keep its directory');
    let stat;try{stat=fs.lstatSync(directory);}catch(error){if(error.code==='ENOENT')return {removed:true,attempts};throw error;}
    assert(stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(directory)===identity.path&&
      stat.dev===identity.dev&&stat.ino===identity.ino&&stat.uid===identity.uid,'Owned browser directory identity changed; refuse removal');
    attempts++;
    try{await remove(directory,{recursive:true,force:true,maxRetries:0});return {removed:!fs.existsSync(directory),attempts};}
    catch(error){if(error.code!=='ENOTEMPTY'||attempts===maxAttempts)throw error;}
    // Only ENOTEMPTY gets another event-loop turn. Permission, scope and all
    // other filesystem/process errors are preserved without retrying.
    await wait(retryDelayMs);
  }
}

export async function createPrivatePulseMicrophone(scratch,{validationTarget='candidate',privateScratchRoot,executables={},moduleDirectory,libraryPath}={}) {
  if(validationTarget==='candidate')assert(process.env.VLAB_CANDIDATE_ID&&path.resolve(scratch).startsWith(path.resolve(process.env.OPENCLAW_STATE_DIR)+'/'),'Private Candidate pulse directory required');
  else {
    assert(['shared','v'].includes(validationTarget)&&process.env.GPT_LIVE_H5_VALIDATION_TARGET===validationTarget&&
      path.isAbsolute(privateScratchRoot??'')&&path.isAbsolute(scratch)&&!fs.existsSync(scratch),
      'Live target PulseAudio must use a fresh validation-owned scratch directory');
    const root=fs.realpathSync(privateScratchRoot),parent=fs.realpathSync(path.dirname(scratch));
    assert(parent===root||parent.startsWith(root+'/'),'Live target PulseAudio escaped the unique validation evidence scratch');
  }
  fs.mkdirSync(scratch,{recursive:true,mode:0o700});
  // Linux AF_UNIX limits socket paths to 107 bytes; Candidate roots are longer.
  const socketRoot=fs.mkdtempSync('/tmp/gpt-live-pulse-');fs.chmodSync(socketRoot,0o700);
  const runtime=path.join(socketRoot,'runtime');fs.mkdirSync(runtime,{mode:0o700});
  const socket=path.join(socketRoot,'native.sock'),name='gpt_live_candidate_capture',outputName='gpt_live_candidate_output',sourceName='gpt_live_candidate_input',cookie=path.join(socketRoot,'cookie');
  fs.writeFileSync(cookie,randomBytes(256),{mode:0o600});
  const config=path.join(scratch,'pulse.pa');
  fs.writeFileSync(config,`.fail\nload-module module-native-protocol-unix socket=${socket} auth-cookie=${cookie} auth-anonymous=true\nload-module module-null-sink sink_name=${name} rate=48000 channels=1\nload-module module-remap-source master=${name}.monitor source_name=${sourceName}\nload-module module-null-sink sink_name=${outputName} rate=48000 channels=1\nset-default-sink ${outputName}\nset-default-source ${sourceName}\n`,{mode:0o600});
  const configHome=path.join(scratch,'config'),dataHome=path.join(scratch,'data'),pulseState=path.join(scratch,'state');
  for(const directory of [configHome,dataHome,pulseState])fs.mkdirSync(directory,{mode:0o700});
  const environment={...process.env,XDG_RUNTIME_DIR:runtime,XDG_CONFIG_HOME:configHome,XDG_DATA_HOME:dataHome,
    PULSE_RUNTIME_PATH:runtime,PULSE_STATE_PATH:pulseState,PULSE_CONFIG_PATH:configHome,PULSE_COOKIE:cookie,
    PULSE_SERVER:'unix:'+socket,PULSE_SOURCE:sourceName,PULSE_SINK:outputName};
  // Only these private media children need the extracted apt libraries. The
  // returned Chrome environment and parent Node process are left unchanged.
  const mediaEnvironment=libraryPath?{...environment,LD_LIBRARY_PATH:libraryPath}:environment;
  let stderr='',daemonError;
  const daemon=spawn(executables.pulseaudio??'/usr/bin/pulseaudio',['--system=false','--daemonize=no','--use-pid-file=no','--exit-idle-time=-1','--log-target=stderr',
    ...(moduleDirectory?['--dl-search-path='+moduleDirectory]:[]),'-n','--file='+config],{env:mediaEnvironment,stdio:['ignore','ignore','pipe']});
  daemon.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000)});
  daemon.once('error',error=>{daemonError=error});
  for(const deadline=Date.now()+10000;Date.now()<deadline&&!fs.existsSync(socket)&&daemon.exitCode===null&&!daemonError;)await sleep(50);
  if(!fs.existsSync(socket)) {
    if(daemon.pid&&daemon.exitCode===null&&daemon.signalCode===null){daemon.kill('SIGTERM');await sleep(100);if(daemon.exitCode===null&&daemon.signalCode===null)daemon.kill('SIGKILL');}
    fs.rmSync(socketRoot,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});
    throw Error('Private PulseAudio startup failed: '+String(daemonError?.message??stderr).slice(-1200));
  }
  const plays=[],children=[];
  function play(file,label) {
    assert(fs.existsSync(file)&&path.isAbsolute(file),'Actual synthetic WAV path required');
    // The verified executable can resolve paplay's symlink to pacat. Select
    // WAV decoding explicitly so argv[0] cannot turn the input into raw PCM.
    const child=spawn(executables.paplay??'/usr/bin/paplay',['--file-format','--server=unix:'+socket,'--device='+name,'--latency-msec=20',file],{env:mediaEnvironment,stdio:['ignore','ignore','pipe']});
    children.push(child);
    const row={label,startedAt:Date.now(),completedAt:null,exitCode:null};plays.push(row);
    let error='';child.stderr.on('data',chunk=>{error+=String(chunk)});
    const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{row.completedAt=Date.now();row.exitCode=code;code===0?resolve(row):reject(Error('Private PCM feed failed: '+error.slice(0,500)))});});
    return {child,row,done};
  }
  async function dispose() {
    for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    for(const row of plays)if(row.exitCode===null)row.cancelledAt=Date.now();
    if(daemon.exitCode===null&&daemon.signalCode===null) {
      const exited=new Promise(resolve=>daemon.once('exit',resolve));daemon.kill('SIGTERM');await Promise.race([exited,sleep(2000)]);
      if(daemon.exitCode===null&&daemon.signalCode===null)daemon.kill('SIGKILL');
    }
    fs.rmSync(scratch,{recursive:true,force:true});
    fs.rmSync(socketRoot,{recursive:true,force:true});
    return {daemonExited:daemon.exitCode!==null||daemon.signalCode!==null,socketRemoved:!fs.existsSync(socket),privateSocket:true};
  }
  return {environment,play,dispose,plays,daemonPid:daemon.pid,source:sourceName,inputSink:name,outputSink:outputName,privateSocket:true};
}
