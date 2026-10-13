import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createVoiceTranscriptLog} from '../realtime-direct-tools/transcript-log.mjs';
import {createAvatarTelemetryLog} from '../gpt-live-h5/avatar-telemetry-log.mjs';
if(process.argv[2]==='writer') {
  const root=process.env.STATE_DIRECTORY;assert(/^\/var\/lib\/voice-log-candidate-[a-f0-9-]+$/u.test(root));
  const transcript=createVoiceTranscriptLog({directory:path.join(root,'transcripts')});
  transcript.audit({type:'call.created',voiceSessionId:'candidate-only',sessionKey:'candidate-only',provider:'seeduplex',model:'fixture'});
  transcript.audit({type:'transcript',voiceSessionId:'candidate-only',role:'user',text:'candidate fixture',final:true});
  assert.equal((await transcript.close()).failed,0);
  const avatar=createAvatarTelemetryLog({directory:path.join(root,'avatar-events')});
  await avatar.write({owner:{voiceSessionId:'candidate-only',sessionKey:'candidate-only',provider:'seeduplex',model:'fixture',avatarSequences:new Map()},
    clientCaptureId:randomUUID(),events:[{type:'avatar.displayed',sequence:1,clientAt:Date.now(),elapsedMs:1,picture:'listen-3',source:'state',visible:true,turns:[]}]});
  await avatar.close();
  for(const name of ['transcripts','avatar-events']) {
    assert.equal(fs.statSync(path.join(root,name)).mode&0o777,0o700);
    const files=fs.readdirSync(path.join(root,name));assert.equal(files.length,1);
    assert.equal(fs.statSync(path.join(root,name,files[0])).mode&0o777,0o600);
  }
  console.log(JSON.stringify({privateTranscriptAndAvatarWrites:true,homeReadOnly:true}));
} else {
  assert.equal(process.getuid(),0);
  const name='voice-log-candidate-'+randomUUID(),root='/var/lib/'+name;
  assert(!fs.existsSync(root));
  try {
    // Candidate inputs are private to root. Copy only fixture source into this
    // unit's own state root so the unprivileged service can read its modules.
    const uid=Number(execFileSync('id',['-u','lab-db91-parity'],{encoding:'utf8'}));
    const gid=Number(execFileSync('id',['-g','lab-db91-parity'],{encoding:'utf8'}));
    fs.mkdirSync(root,{mode:0o700});fs.chownSync(root,uid,gid);
    for(const file of ['lab/candidate/voice-private-log-directory.mjs','lab/realtime-direct-tools/transcript-log.mjs',
      'lab/gpt-live-h5/avatar-telemetry-log.mjs','lab/gpt-live-h5/avatar-telemetry.mjs',
      'lab/gpt-live-h5/avatar-catalog.mjs','lab/gpt-live-h5/avatar-approved-reactions.mjs']) {
      const target=path.join(root,'inputs',file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});
      fs.copyFileSync(file,target);fs.chmodSync(target,0o644);
      for(let directory=path.dirname(target);directory!==root;directory=path.dirname(directory))fs.chmodSync(directory,0o755);
    }
    const out=execFileSync('systemd-run',['--unit='+name,'--wait','--pipe','--collect','--property=User=lab-db91-parity',
      '--property=ProtectHome=read-only','--property=StateDirectory='+name,'--property=StateDirectoryMode=0700',
      process.execPath,path.join(root,'inputs/lab/candidate/voice-private-log-directory.mjs'),'writer'],{encoding:'utf8',timeout:30000});
    assert.equal(fs.statSync(root).mode&0o777,0o700);
    console.log(out.trim());
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
