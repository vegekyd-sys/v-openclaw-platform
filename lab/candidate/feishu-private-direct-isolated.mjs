// Candidate-only native event probe. A dedicated app is mandatory: never attach
// a second consumer to a shared/production bot. No Gateway or model is started.
import assert from 'node:assert/strict';
import {open,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createPhoneTabHandler} from '../feishu-phone-tabs.mjs';
import {createPrivateConversationWriter} from '../feishu-private-conversations.mjs';

export function validateIndependentApp(app,shared) {
  const channel=shared.channels?.feishu??{};
  const used=[channel,...Object.values(channel.accounts??{})].map(row=>row.appId);
  assert(/^cli_[A-Za-z0-9]+$/u.test(app?.appId)&&typeof app.appSecret==='string'&&app.appSecret.length>8,'Dedicated app configuration required');
  assert(!used.includes(app.appId),'Refusing a shared bot consumer');
}

export function createNativeProbe({app,file,request,record=createPrivateConversationWriter({file})}) {
  const stats={entered:0,firstCreated:0,verifiedMappings:0,directoryFailures:0};
  const handler=createPhoneTabHandler({account:{accountId:'isolated',appId:app.appId},
    getSettings:()=>({appId:app.appId,allowedOpenIds:[],privateConversationsFile:file}),
    recordPrivateConversation:async row=>{await record(row);stats.verifiedMappings++;},
    log:line=>{if(JSON.parse(line).status==='private_directory_unavailable')stats.directoryFailures++;},
    api:async(method,url)=>{
      assert(method==='GET'&&/^\/open-apis\/im\/v1\/chats\/oc_[A-Za-z0-9]+(?:\/members\?member_id_type=open_id&page_size=100)?$/u.test(url),'Read-only chat verification required');
      const result=await request({method,url});
      if(result?.code!==0)throw Error('chat_verification_failed');
      return result.data;
    }});
  return {stats,handlers:{
    'im.chat.access_event.bot_p2p_chat_entered_v1':async data=>{
      stats.entered++;
      return handler.run({header:{event_type:'im.chat.access_event.bot_p2p_chat_entered_v1',app_id:app.appId},event:data.event??data});
    },
    // Observe which event a truly first DM emits. This legacy event is not used
    // to grant identity or silently count the production entered path as tested.
    p2p_chat_create:async()=>{stats.firstCreated++;},
  },async stop(){handler.stop();await handler.drain();}};
}

async function privateJson(file,maxBytes=65536) {
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat();assert(stat.isFile()&&(stat.mode&0o777)===0o600&&stat.size<maxBytes,'Private 0600 configuration required');
    return JSON.parse(await handle.readFile('utf8'));
  } finally {await handle.close();}
}

let stage='candidate-context';
async function main() {
  const runtime=process.env.VLAB_CANDIDATE_RUNTIME,state=process.env.OPENCLAW_STATE_DIR;
  assert(process.env.VLAB_CANDIDATE_ID&&runtime&&state,'Independent candidate required');
  stage='candidate-config';
  const shared=await privateJson(process.env.OPENCLAW_CONFIG_PATH,8*1024*1024);
  stage='candidate-plugin';
  const plugin=shared.plugins.load.paths.find(p=>p.endsWith('/@openclaw/feishu'));
  assert(plugin?.startsWith(runtime+'/'),'SDK must come from the isolated runtime');
  stage='candidate-sdk';
  const sdk=createRequire(path.join(plugin,'package.json'))('@larksuiteoapi/node-sdk');
  assert.equal(typeof sdk.WSClient,'function');assert.equal(typeof sdk.EventDispatcher,'function');
  if(process.argv.includes('--sdk-check')){
    console.log(JSON.stringify({isolatedSdkLoaded:true,webSocketStarted:false,gatewayStarted:false}));return;
  }
  stage='dedicated-app-config';
  const app=await privateJson(process.env.PRIVATE_DIRECT_LIVE_CONFIG);
  validateIndependentApp(app,shared);
  const quiet={error(){},warn(){},info(){},debug(){},trace(){}};
  const client=new sdk.Client({appId:app.appId,appSecret:app.appSecret,logger:quiet});
  const probe=createNativeProbe({app,file:path.join(state,'private-direct-native.json'),request:args=>client.request(args)});
  const ws=new sdk.WSClient({appId:app.appId,appSecret:app.appSecret,logger:quiet});
  const save=()=>writeFile(path.join(state,'private-direct-probe-report.json'),JSON.stringify({
    ...probe.stats,realNativeEvents:true,sharedConsumer:false,gatewayStarted:false,messagesSent:0,groupWrites:0,modelCalls:0}),{mode:0o600});
  let closing=false;
  const close=async()=>{
    if(closing)return;closing=true;
    await probe.stop();await save();
    ws.close?.({force:true});process.exit(0);
  };
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
  setTimeout(()=>void close(),15*60*1000);
  stage='native-connection';
  await ws.start({eventDispatcher:new sdk.EventDispatcher({}).register(probe.handlers)});
  await save();
  console.log(JSON.stringify({stage:'independent-native-probe-started',sharedGatewayChanged:false,expiresAfterMinutes:15}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error=>{console.error(JSON.stringify({error:'independent_probe_failed',stage,code:/^[A-Z_0-9]+$/u.test(error.code??'')?error.code:undefined}));process.exit(1);});
