import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CANDIDATE_OPENAI_ACCESS_FIELDS} from './gpt-live-call-live-auth.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const audioPath=process.argv[2];
assert(audioPath,'Usage: node lab/build-gpt-live-call-live-plan.mjs /absolute/synthetic-question.wav');
const audio=fs.realpathSync(audioPath);
function mapInput(file) {
  const relative=path.relative(root,file);
  return relative.startsWith('../')||path.isAbsolute(relative)
    ? 'external/'+createHash('sha256').update(file).digest('hex').slice(0,16)+'/'+path.basename(file)
    : relative;
}
const accessFixture=process.argv[3]&&fs.realpathSync(process.argv[3]);
if(accessFixture){
  const profile=JSON.parse(fs.readFileSync(accessFixture,'utf8'));
  assert(Object.keys(profile).every(key=>CANDIDATE_OPENAI_ACCESS_FIELDS.includes(key)), 'Access fixture contains fields outside the access-only allowlist');
  assert(profile.type==='oauth'&&profile.provider==='openai'&&typeof profile.access==='string', 'OpenAI access-only fixture required');
}
const base=JSON.parse(fs.readFileSync(path.join(root,'lab/gpt-live-call-plan.json'),'utf8'));
const plan={
  baseRelease:base.baseRelease,
  files:base.files,
  support:['lab/gpt-live-call-live.mjs','lab/gpt-live-call-live-auth.mjs','lab/gpt-live-call-live-evidence.mjs','lab/gpt-live-h5/instructions.mjs',audio,...accessFixture?[accessFixture]:[]],
  command:['/opt/vlab/node-v22.23.1-linux-x64/bin/node','lab/gpt-live-call-live.mjs'],
  env:{
    GPT_LIVE_CALL_AUDIO_FIXTURE:mapInput(audio),
    ...accessFixture?{GPT_LIVE_CALL_ACCESS_FIXTURE:mapInput(accessFixture)}:{},
    GPT_LIVE_CALL_EVIDENCE_ROOT:'/srv/vlab-production-mirror/labs/candidate-tests/evidence/gpt-live-call-live',
  },
  timeoutSeconds:300,
};
const output=path.join(root,'tmp/gpt-live-call-live/plan.json');
fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({plan:output,overlays:plan.files.length,syntheticAudioBytes:fs.statSync(audio).size}));
