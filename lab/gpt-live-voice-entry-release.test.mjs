import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertLegacyDrainSource, waitForCleanVoiceExit, assertVoiceWorkDrained, assertEntrySnapshot, entryLaunchOverride, remoteSource, validateReviewedPresentation,validateVoiceArtifact,validateVoiceArtifactProof } from "./gpt-live-voice-entry-release.mjs";
import { H5_PATHS, digest } from './gpt-live-h5-release.mjs';

const snapshot = { pointer: "/opt/voice/old", unitSha: "unit", environmentSha: "env", gatewayPid: 12,
  gatewayStart: "13", gatewayInvocation: "invocation", configSha: "config", openVoices: 0 };
test("voice cutover rejects a busy call or any concurrent entry/Gateway change", () => {
  assertEntrySnapshot(snapshot, snapshot);
  for (const key of Object.keys(snapshot)) assert.throws(() => assertEntrySnapshot(snapshot, { ...snapshot, [key]: key === "openVoices" ? 1 : "changed" }));
});
test('H5-only cutover also refuses a live direct-provider relay or an unknown connection count', () => {
  const idle={...snapshot,relayConnections:0};
  assertEntrySnapshot(idle,idle);
  assert.throws(()=>assertEntrySnapshot(idle,{...idle,relayConnections:1}));
  assert.throws(()=>assertEntrySnapshot(idle,snapshot));
});
test('explicit presentation review binds bytes, source, owner and waiver; cannot authorize Gateway changes', () => {
  const files=H5_PATHS.map(name=>({name,sha:digest(name)}));
  const req={h5Only:true,commit:'a'.repeat(40),owner:'avatar-owner',files};
  const proof={schema:'user-reviewed-h5-presentation-v1',sourceCommit:req.commit,owner:req.owner,h5FilesSha:digest(JSON.stringify(files)),authorization:'skip-shared-h5-validation-and-publish',artifactSha:'b'.repeat(64),runtimeFiles:[{target:'openclaw/dist/example.js',after:'c'.repeat(64)}]};
  validateReviewedPresentation(proof,req);
  validateReviewedPresentation({...proof,runtimeFiles:[{target:'npm/projects/frozen/node_modules/@openclaw/codex/dist/tool.js',after:'c'.repeat(64)}]},req);
  for(const patch of [{authorization:'assumed'},{owner:'other'},{sourceCommit:'f'.repeat(40)},{h5FilesSha:'f'.repeat(64)},{runtimeFiles:[{target:'openclaw/../secret',after:'c'.repeat(64)}]}, {runtimeFiles:[{target:'npm/projects/../secret',after:'c'.repeat(64)}]}])assert.throws(()=>validateReviewedPresentation({...proof,...patch},req));
  assert.throws(()=>validateReviewedPresentation(proof,{...req,h5Only:false}));
});
test("serialized production controller parses without loading credentials or touching V", () => {
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: remoteSource() });
});
test("symlink launcher uses the frozen real entrypoint and retains existing Node flags", () => {
  const definition = "{ path=/opt/node/bin/node ; argv[]=/opt/node/bin/node --max-old-space-size=512 /opt/openclaw-voice-h5/current/server.mjs ; ignore_errors=no ; }";
  const real = "/opt/openclaw-voice-h5/releases/gpt-live-abc/lab/gpt-live-h5/server.mjs";
  assert(entryLaunchOverride(definition, real).startsWith("[Service]\nExecStart=\nExecStart=/opt/node/bin/node --max-old-space-size=512 " + real + "\n"));
  assert.throws(() => entryLaunchOverride(definition, "/tmp/foreign/server.mjs"));
  assert.throws(() => entryLaunchOverride(definition.replace("/opt/openclaw-voice-h5/current/", "/tmp/foreign/"), real));
  assert.throws(() => entryLaunchOverride(definition.replace(" ; ignore_errors", "\n ; ignore_errors"), real));
});

test("native provider environment stays in the owned private release and rejects foreign paths", () => {
  const definition = "{ path=/opt/node/bin/node ; argv[]=/opt/node/bin/node /opt/openclaw-voice-h5/current/server.mjs ; ignore_errors=no ; }";
  const server = "/opt/openclaw-voice-h5/releases/gpt-live-abc/lab/gpt-live-h5/server.mjs";
  const env = "/opt/openclaw-voice-h5/releases/gpt-live-abc/native-voice.env";
  const override=entryLaunchOverride(definition, server, env);
  assert(override.includes("EnvironmentFile=" + env + "\n"));
  assert(override.includes('StateDirectory=openclaw-voice-h5\nStateDirectoryMode=0700\n'));
  assert(override.includes('Environment=RTC_H5_TRANSCRIPT_DIR=/var/lib/openclaw-voice-h5/transcripts\n'));
  assert(override.includes('Environment=RTC_H5_AVATAR_LOG_DIR=/var/lib/openclaw-voice-h5/avatar-events\n'));
  assert(!override.includes('ProtectHome=')&&!override.includes('ReadWritePaths=/home'));
  assert.throws(() => entryLaunchOverride(definition, server, "/tmp/foreign.env"));
  assert.throws(() => entryLaunchOverride(definition, server, env + "\nUser=root"));
});

function standalone(){const paths=['package.json','package-lock.json','lab/gpt-live-h5/server.mjs','lib/gateway-client.mjs','plugins/v-voice-gpt-live/index.mjs','plugins/v-voice-gpt-live/tasks.mjs'];const files=paths.map(name=>({name,sha:digest(name),content:Buffer.from(name).toString('base64')})),record=files.map(f=>({path:f.name,sha256:f.sha,bytes:Buffer.byteLength(f.name)})),manifest={schema:'v-voice-release-v1',commit:'a'.repeat(40),files:record,filesSha256:digest(JSON.stringify(record))};const req={voiceManifest:manifest,files,filesSha:digest(JSON.stringify(files.map(({name,sha})=>({name,sha})))),commit:manifest.commit,owner:'test-owner',release:'shared-approved'},proof={schema:'v-voice-artifact-accepted-v1',release:req.release,owner:req.owner,sourceCommit:req.commit,filesSha256:manifest.filesSha256,manifestSha:digest(JSON.stringify(manifest)),accepted:true,artifactSha:'b'.repeat(64),acceptanceSha:'c'.repeat(64),runtimeFiles:[{target:'openclaw/dist/talk.js',after:'d'.repeat(64)}]};return{files,manifest,req,proof};}
test('standalone publication rejects changed content, missing dependencies, traversal and forged aggregate identities',()=>{const{manifest,files}=standalone();validateVoiceArtifact(manifest,files);assert.throws(()=>validateVoiceArtifact(manifest,files.slice(1)));assert.throws(()=>validateVoiceArtifact(manifest,files.map((f,i)=>i?f:{...f,content:Buffer.from('foreign').toString('base64')})));for(const name of ['lab/../../private','/root/private','lab/../package.json']){const x=standalone();x.files[0].name=name;x.manifest.files[0].path=name;x.manifest.filesSha256=digest(JSON.stringify(x.manifest.files));assert.throws(()=>validateVoiceArtifact(x.manifest,x.files));}assert.throws(()=>validateVoiceArtifact({...manifest,filesSha256:'f'.repeat(64)},files));});
test('standalone shared acceptance binds the complete manifest, source commit, release, owner and actual core artifact',()=>{const{req,proof}=standalone();validateVoiceArtifactProof(proof,req);for(const patch of [{accepted:false},{owner:'foreign'},{release:'old'},{sourceCommit:'e'.repeat(40)},{manifestSha:'e'.repeat(64)},{filesSha256:'e'.repeat(64)},{artifactSha:''},{runtimeFiles:[{target:'openclaw/../secret',after:'a'.repeat(64)}]}])assert.throws(()=>validateVoiceArtifactProof({...proof,...patch},req));assert.throws(()=>validateVoiceArtifactProof(proof,{...req,filesSha:'f'.repeat(64)}));});

test('hangup with an unfinished task or delivery cannot authorize an H5 service stop',()=>{
 const idle={known:true,activeCalls:0,creatingSessions:0,backgroundTasks:0};
 assertVoiceWorkDrained(idle);
 for(const field of ['activeCalls','creatingSessions','backgroundTasks'])assert.throws(()=>assertVoiceWorkDrained({...idle,[field]:1}));
 for(const missing of [undefined,{}, {known:false}, {...idle,backgroundTasks:undefined}, {...idle,backgroundTasks:'0'}])assert.throws(()=>assertVoiceWorkDrained(missing));

});

test('legacy bootstrap is pinned to the verified draining source, never an arbitrary missing API',()=>{
 const pointer='/opt/openclaw-voice-h5/releases/gpt-live-bcb82987c7cc6c61e87ecc9f28c320df6bfb470b/lab/gpt-live-h5',sha='93be3afde30cccea2b6b45d4f2359429cf6c54a8880fa2f4eebffd8ff2434311';
 assertLegacyDrainSource(pointer,sha);assert.throws(()=>assertLegacyDrainSource(pointer,'a'.repeat(64)));assert.throws(()=>assertLegacyDrainSource('/opt/unknown',sha));
});
test('legacy drain waits for normal exit before stopping the unit and never kills on timeout',async()=>{
 let tick=0,stops=0;const proof={MainPID:0,ExecMainCode:1,ExecMainStatus:0};
 const f={pid:42,alive:()=>tick<3,readExit:()=>proof,pause:async()=>tick++,now:()=>tick,timeoutMs:10,stopUnit:()=>stops++};
 assert.equal((await waitForCleanVoiceExit(f)).cleanExit,true);assert.equal(stops,1);
 for(const exit of [{...proof,ExecMainCode:2},{...proof,ExecMainStatus:9},{...proof,MainPID:43}])await assert.rejects(waitForCleanVoiceExit({...f,alive:()=>false,readExit:()=>exit}));
 let cancelled=0;await assert.rejects(waitForCleanVoiceExit({...f,alive:()=>true,pause:async()=>tick++,timeoutMs:2,stopUnit:()=>cancelled++}),/still draining/);assert.equal(cancelled,0);
});
