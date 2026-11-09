// Real copied runtime import; no Gateway is started and no provider is called.
import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;if(!runtime)throw Error('Private Candidate required');
const sdk=await import(pathToFileURL(runtime+'/openclaw/dist/plugin-sdk/realtime-voice.js'));
test('patched real SDK exports isolated device context and Talk provides admission-owned call ID',()=>{
 assert.equal(typeof sdk.registerRealtimeVoiceDeviceContext,'function');
 const source=readFileSync(runtime+'/openclaw/dist/talk-DkFuKRod.js','utf8');assert(source.includes('// voice-device-context-v1: admission-owned call ID'));
 const methods=new Map(),reservations=new Map(),feature=sdk.registerRealtimeVoiceDeviceContext({registerGatewayMethod:(name,fn)=>methods.set(name,fn)},{reservations});
 const request={voiceSessionId:'candidate-call',ownerConnId:'candidate-owner',runAgentConsult:params=>params},hook=feature.create(request);reservations.set('candidate-secret',{ownerConnId:request.ownerConnId});hook.activate('candidate-secret');
 const terminal={version:1,voiceSessionId:request.voiceSessionId,terminal:{kind:'web'},actor:{verified:true},session:{scope:'bound'},device:{owner:request.voiceSessionId},capabilities:{'location.current':{status:'prompt'}}};
 const bridge={version:1,voiceSessionId:request.voiceSessionId,lease:'l'.repeat(43),endpoint:'https://candidate.invalid/internal/device-request',cli:'/candidate/scripts/device-call.mjs',skill:'/candidate/skills/device-use/SKILL.md',node:'node',bundleSha256:'a'.repeat(64)};
 let accepted;methods.get('voice.product.device-context')({params:{clientSecret:'candidate-secret',voiceSessionId:request.voiceSessionId,revision:1,terminal,bridge},client:{connId:request.ownerConnId},respond:(...args)=>{accepted=args;}});
 assert.equal(accepted[0],true);assert.match(hook.wrapConsult(request.runAgentConsult)({prompt:'只查询当前位置'}).prompt,/当前通话设备状态/);hook.close();
});
