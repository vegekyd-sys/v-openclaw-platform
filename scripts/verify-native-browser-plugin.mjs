import assert from 'node:assert/strict';
import os from 'node:os';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/astra';
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const plugin=root+'/runtime/browser-plugin-0.4.6';
const {createPluginRuntimeStore}=await import(root+'/runtime/openclaw/dist/plugin-sdk/runtime-store.js');
const {getRegistrationRuntime}=await import(plugin+'/core/registration-runtime.js');
const config={brokerUrl:'http://fixture.invalid',adminTokenFile:'/fixture/not-a-real-token'};
let acquisitions=0,releases=0;
getRegistrationRuntime({config},createPluginRuntimeStore,()=>({
 async acquireLease(){acquisitions++;return {leaseId:'fixture',fencingToken:1,profile:'vbrowser-01',deviceId:'fixture',tabId:42};},
 async renewLease(){return {};},async releaseLease(){releases++;}
}));
const {default:entry}=await import(plugin+'/index.js');
function register(mode){
 const tools=new Map(),hooks=new Map();
 entry.register({pluginConfig:config,registrationMode:mode,logger:console,registerTool(factory,{name}){tools.set(name,factory);},on(name,fn){hooks.set(name,fn);}});
 return {tools,hooks};
}
const full=register('full'),discovery=register('discovery');
const ctx={sessionKey:'agent:test:feishu:direct:fixture',messageChannel:'feishu',requesterSenderId:'fixture'};
await full.tools.get('v_browser_acquire')(ctx).execute('t1',{deviceId:'fixture',tabId:42});
const routed=await discovery.hooks.get('before_tool_call')({toolName:'browser',params:{action:'status'}},ctx);
assert.equal(routed.params.profile,'vbrowser-01');assert.equal(routed.params.target,'host');
assert.equal(await discovery.hooks.get('before_tool_call')({toolName:'browser',params:{action:'status'}},{...ctx,sessionKey:'other-session'}),undefined);
await discovery.hooks.get('agent_end')({},ctx);
await full.hooks.get('gateway_stop')();
assert.equal(acquisitions,1);assert.equal(releases,1);
console.log(JSON.stringify({ok:true,nativeSdk:'2026.9.1',plugin:'0.4.6',fullAcquireDiscoveryRoute:true,otherSessionIsolated:true,releaseExactlyOnce:true,fixtureBroker:true,realBrowserAcceptance:false}));
