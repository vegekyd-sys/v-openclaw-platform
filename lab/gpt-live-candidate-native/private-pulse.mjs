import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

export async function createPrivatePulseMicrophone(scratch) {
  assert(process.env.VLAB_CANDIDATE_ID&&path.resolve(scratch).startsWith(path.resolve(process.env.OPENCLAW_STATE_DIR)+'/'),'Private Candidate pulse directory required');
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
  let stderr='';
  const daemon=spawn('/usr/bin/pulseaudio',['--system=false','--daemonize=no','--use-pid-file=no','--exit-idle-time=-1','--log-target=stderr','-n','--file='+config],{env:environment,stdio:['ignore','ignore','pipe']});
  daemon.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000)});
  for(const deadline=Date.now()+10000;Date.now()<deadline&&!fs.existsSync(socket)&&daemon.exitCode===null;)await sleep(50);
  assert(fs.existsSync(socket),'Private PulseAudio startup failed: '+stderr.slice(-1200));
  const plays=[],children=[];
  function play(file,label) {
    assert(fs.existsSync(file)&&path.isAbsolute(file),'Actual synthetic WAV path required');
    const child=spawn('/usr/bin/paplay',['--server=unix:'+socket,'--device='+name,'--latency-msec=20',file],{env:environment,stdio:['ignore','ignore','pipe']});
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
