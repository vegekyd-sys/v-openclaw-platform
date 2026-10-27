import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {registerRealtimeVoiceDeviceContext} from './voice-device-context.mjs';import {patchVoiceDeviceContextSdk,patchVoiceDeviceContextTalk} from './patch-voice-device-context.mjs';
function fixture(){
 const methods=new Map(),reservations=new Map(),api={registerGatewayMethod:(name,handler,options)=>methods.set(name,{handler,options})};let now=100;
 const module=registerRealtimeVoiceDeviceContext(api,{reservations,now:()=>now}),calls=[],request={voiceSessionId:'call-one',ownerConnId:'connection-one',runAgentConsult:params=>{calls.push(params);return 'result';}},hook=module.create(request);
 reservations.set('secret-one',{ownerConnId:'connection-one'});hook.activate('secret-one');
 const terminal={version:1,voiceSessionId:'call-one',terminal:{kind:'ios'},actor:{verified:true},session:{scope:'bound'},device:{owner:'call-one'},capabilities:{'location.current':{status:'prompt'}}};
 const bridge={version:1,voiceSessionId:'call-one',lease:'l'.repeat(43),endpoint:'http://127.0.0.1:28473/internal/device-request',cli:'/candidate/scripts/device-call.mjs',skill:'/candidate/skills/device-use/SKILL.md',node:'node',bundleSha256:'a'.repeat(64)};
 const params={clientSecret:'secret-one',voiceSessionId:'call-one',revision:1,terminal,bridge};
 const bind=(extra={},owner='connection-one')=>{let result;methods.get('voice.product.device-context').handler({params:{...params,...extra},client:{connId:owner},respond:(...values)=>{result=values;}});return result;};
 return {module,methods,request,hook,calls,params,bind,advance:()=>{now+=3*60*60*1000;}};
}
test('only the live matching transport and call can bind metadata; it grants no client-selected identity',()=>{
 const f=fixture();assert.equal(f.methods.get('voice.product.device-context').options.scope,'operator.write');
 for(const [extra,owner]of [[{},'foreign'],[{voiceSessionId:'foreign'},undefined],[{clientSecret:'unknown'},undefined],[{actor:'tianyi'},undefined],[{terminal:{...f.params.terminal,session:{scope:'guest'}}},undefined],[{bridge:{...f.params.bridge,endpoint:'http://untrusted.invalid/internal/device-request'}},undefined]])assert.equal(f.bind(extra,owner)[0],false);
 assert.equal(f.bind({mode:'check'})[0],true);assert.equal(f.bind()[0],true);assert.equal(f.bind()[0],false);
});
test('the current bound snapshot augments the existing runner and preserves its authority and callbacks',()=>{
 const f=fixture(),run=f.hook.wrapConsult(f.request.runAgentConsult),signal=new AbortController().signal,onRunStarted=()=>{};
 assert.equal(run({prompt:'before binding',signal,onRunStarted}),'result');assert.equal(f.calls[0].prompt,'before binding');
 assert.equal(f.bind()[0],true);run({prompt:'从这里打车，只查报价',signal,onRunStarted,context:'model cannot replace the trusted binding'});
 const actual=f.calls.at(-1);assert.match(actual.prompt,/location.current.*prompt/);assert(actual.prompt.includes(f.params.bridge.lease));assert.equal(actual.signal,signal);assert.equal(actual.onRunStarted,onRunStarted);assert.equal(actual.toolsAllow,undefined);
 const updated={...f.params.terminal,capabilities:{'location.current':{status:'denied'}}};assert.equal(f.bind({revision:2,terminal:updated})[0],true);run({prompt:'再次询问'});assert.match(f.calls.at(-1).prompt,/location.current.*denied/);
 assert.equal(f.bind({revision:3,terminal:{...updated,capabilities:{...updated.capabilities,'robot.move':{status:'available'}}}})[0],false);
});
test('close, expiry and missing admission-owned call ID cannot revive device metadata',()=>{
 const f=fixture();assert.equal(f.module.create({...f.request,voiceSessionId:undefined}),null);assert.equal(f.bind()[0],true);f.hook.close();assert.equal(f.bind({revision:2})[0],false);assert.throws(()=>f.hook.wrapConsult(f.request.runAgentConsult)({prompt:'late'}),/closed/);
 const expired=fixture();expired.bind();expired.advance();assert.equal(expired.bind({revision:2})[0],false);assert.throws(()=>expired.hook.wrapConsult(expired.request.runAgentConsult)({prompt:'late'}),/expired/);
});
test('platform patches are bounded, idempotent and reject anchor drift',()=>{
 const sdk=readFileSync(new URL('./fixtures/voice-device-context/realtime-voice.js',import.meta.url),'utf8'),talk=readFileSync(new URL('./fixtures/voice-device-context/talk-DkFuKRod.js',import.meta.url),'utf8');
 const patched=patchVoiceDeviceContextTalk(talk);assert(patched.includes('voiceSessionId: activeVoiceSessionId'));assert.equal(patchVoiceDeviceContextTalk(patched),patched);assert.throws(()=>patchVoiceDeviceContextTalk('changed runtime'),/anchor/);
 const changed=patchVoiceDeviceContextSdk(sdk);assert.equal(patchVoiceDeviceContextSdk(changed),changed);assert(changed.includes('registerRealtimeVoiceDeviceContext'));
});
