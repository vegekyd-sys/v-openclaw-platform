import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPhoneTabHandler,ensurePhoneTab,publicPhoneUrl,readPhoneTabSettings,createRuntimePhoneTabHandler} from './feishu-phone-tabs.mjs';
import {patchFeishuPhoneTabs,patchFeishuPhoneTabClient} from './patch-feishu-phone-tabs.mjs';

const account = {accountId:'trial',appId:'cli_test'};
const url = 'https://voice.example/voice/feishu';
const event = {chat_id:'oc_private',operator_id:{open_id:'ou_alice'}};
const settings = {enabled:true,appId:account.appId,url,allowedOpenIds:['ou_alice']};
const baseTab = {tab_id:'messages',tab_type:'message'};
function fixture(options = {}) {
  let tabs = [structuredClone(baseTab)], requests = [], writes = 0;
  const api = async (method,payloadPath,body) => {
    requests.push({method,path:payloadPath});
    if (method === 'GET' && !payloadPath.endsWith('list_tabs')) return {chat_mode:options.mode ?? 'p2p'};
    if (method === 'GET') return {chat_tabs:structuredClone(tabs)};
    writes++;
    if (!options.rejectWrite) tabs.push(...body.chat_tabs.map((tab,index) => ({tab_id:'new'+index,...tab})));
    if (options.ambiguous || options.rejectWrite) throw Error('SDK accidentally contains Bearer private-secret');
    return {};
  };
  return {api,requests,get tabs(){return tabs;},set tabs(value){tabs=value;},get writes(){return writes;}};
}

test('first private-chat entry creates one top tab and repeated entry preserves existing tabs',async () => {
  const f=fixture();const h=createPhoneTabHandler({account,getSettings:async()=>settings,api:f.api,cacheMs:0});
  const first=await h.run(event);assert.equal(first.created,true);assert.equal(first.status,'verified');
  assert.equal((await h.run(event)).created,false);assert.equal(f.writes,1);assert.deepEqual(f.tabs[0],baseTab);
  assert.equal(f.tabs[1].tab_content.url,url);assert.equal(f.tabs[1].tab_config.is_built_in,false);
});

test('a lost successful POST response is reconciled without a second write',async()=>{
  const f=fixture({ambiguous:true});
  assert.equal((await ensurePhoneTab({api:f.api,chat:event.chat_id,url})).recoveredUnknownWrite,true);
  assert.equal((await ensurePhoneTab({api:f.api,chat:event.chat_id,url})).created,false);assert.equal(f.writes,1);
});

test('a conflicting tab is not overwritten and failed writes back off then retry on next entry',async()=>{
  const f=fixture();f.tabs.push({tab_name:'📞 打给 V',tab_type:'url',tab_content:{url:'https://other.example'}});
  await assert.rejects(ensurePhoneTab({api:f.api,chat:event.chat_id,url}),/tab_conflict/);assert.equal(f.writes,0);
  const broken=fixture({rejectWrite:true});let time=0;const logs=[];
  const h=createPhoneTabHandler({account,getSettings:async()=>settings,api:broken.api,now:()=>time,log:x=>logs.push(x)});
  assert.equal((await h.run(event)).status,'unconfirmed_write');assert.equal(broken.writes,1);
  assert.equal((await h.run(event)).status,'cached');assert.equal(broken.writes,1);
  time=30001;assert.equal((await h.run(event)).status,'unconfirmed_write');assert.equal(broken.writes,2);
  assert.ok(logs.every(line=>!line.includes('private-secret')&&!line.includes('oc_private')&&!line.includes('ou_alice')));
});

test('unknown users, accounts, malformed events and group conversations do not receive private tabs',async()=>{
  const f=fixture();const h=createPhoneTabHandler({account,getSettings:async()=>settings,api:f.api});
  assert.equal((await h.run({...event,operator_id:{open_id:'ou_other'}})).status,'ignored_audience');
  assert.equal((await h.run({...event,chat_id:'oc_a/../b'})).status,'ignored_event');
  assert.equal((await h.run({header:{app_id:'cli_other'},event})).status,'ignored_event');
  assert.equal((await h.run({header:{event_type:'im.message.receive_v1'},event})).status,'ignored_event');
  assert.equal(f.requests.length,0);
  const other=createPhoneTabHandler({account:{...account,appId:'cli_other'},getSettings:async()=>settings,api:f.api});
  assert.equal((await other.run(event)).status,'ignored_audience');assert.equal(f.requests.length,0);
  const group=fixture({mode:'group'});
  assert.equal((await ensurePhoneTab({api:group.api,chat:event.chat_id,url})).status,'ignored_non_p2p');assert.equal(group.writes,0);
});

test('API work does not delay event acknowledgement and duplicate concurrent events coalesce',async()=>{
  const gate=Promise.withResolvers();const f=fixture();let entered=false;
  const h=createPhoneTabHandler({account,getSettings:async()=>{entered=true;await gate.promise;return settings;},api:f.api});
  assert.equal(h.schedule(event),undefined);await Promise.resolve();assert.equal(entered,true);
  const requests=Array.from({length:30},()=>h.run(event));assert.equal(f.requests.length,0);
  gate.resolve();const results=await Promise.all(requests);assert.ok(results.every(result=>result.created));assert.equal(f.writes,1);
});

test('queue is bounded and abort stops queued entries',async()=>{
  const gate=Promise.withResolvers(),abort=new AbortController();let active=0,max=0;
  const h=createPhoneTabHandler({account,getSettings:async()=>{active++;max=Math.max(max,active);await gate.promise;active--;return settings;},
    api:fixture().api,signal:abort.signal,concurrency:1,maxPending:2});
  const first=h.run(event),second=h.run({...event,chat_id:'oc_second'});
  assert.equal((await h.run({...event,chat_id:'oc_third'})).status,'queue_full');abort.abort();gate.resolve();
  assert.equal((await second).status,'stopped');assert.equal((await first).status,'stopped');assert.equal(max,1);
});

test('configured HTTPS login URLs cannot publish credentials or caller-selected session identity',()=>{
  assert.equal(publicPhoneUrl(url),url);
  assert.equal(publicPhoneUrl(url+'?phone=dm-alice'),url+'?phone=dm-alice');
  for (const bad of [url+'#access=secret',url+'?access=secret',url+'?sessionKey=other',url+'?phone=a&phone=b',
    'http://voice.example/voice/feishu','https://secret@voice.example/voice/feishu',url+'/callback',url+'?phone=']) {
    assert.throws(()=>publicPhoneUrl(bad));
  }
});

test('private rollout settings are scoped by both account ID and app ID',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'phone-tabs-'));const file=path.join(root,'settings.json');
  try {
    assert.equal(await readPhoneTabSettings(undefined,account),null);
    await writeFile(file,JSON.stringify({version:1,accounts:{trial:settings}}),{mode:0o600});
    assert.equal((await readPhoneTabSettings(file,account)).url,url);
    assert.equal(await readPhoneTabSettings(file,{...account,accountId:'other'}),null);
    await assert.rejects(readPhoneTabSettings(file,{...account,appId:'cli_other'}));
    await chmod(file,0o644);await assert.rejects(readPhoneTabSettings(file,account));await chmod(file,0o600);
    await symlink(file,path.join(root,'link'));await assert.rejects(readPhoneTabSettings(path.join(root,'link'),account));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('runtime handler is opt-in and does not create a Feishu API client when disabled',async()=>{
  const original=process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE;delete process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE;
  try {
    const handler=createRuntimePhoneTabHandler({account,createClient:()=>{throw Error('must not create');}});
    assert.equal((await handler.run(event)).status,'ignored_audience');
  } finally {if(original)process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=original;}
});

test('runtime patch replaces only the existing private-entry no-op and is idempotent',async()=>{
  const original=await readFile(new URL('./release-files/feishu-ingress-catchup/monitor.account-WFdlCDhR.js',import.meta.url),'utf8');
  const patched=patchFeishuPhoneTabs(original);assert.equal(patchFeishuPhoneTabs(patched),patched);
  assert.ok(patched.includes('data => vPhoneTab.schedule(data)'));
  const restored=patched.replace(/^import \{createFeishuPhoneTabClient[^\n]+\n/u,'').replace(/^import \{createRuntimePhoneTabHandler[^\n]+\n\/\/ v-feishu-auto-phone-tab-v1\n/u,'')
    .replace('\n\tconst vPhoneTab = vCreatePhoneTabHandler({account:resolveFeishuAccount({cfg,accountId}),createClient:vCreatePhoneTabClient,runtime,abortSignal});','')
    .replace('data => vPhoneTab.schedule(data),','async () => {},');
  assert.equal(restored,original);assert.throws(()=>patchFeishuPhoneTabs('different upstream source'));
});


test('dedicated phone client preserves transport settings and cannot log SDK error headers',async()=>{
  const source = `const feishuClientSdk={AppType:{SelfBuild:'self'},Client:class {constructor(options){this.options=options;}}};
const resolveSdkDomain=value=>'domain:'+value;
const resolveConfiguredHttpTimeoutMs=creds=>creds.httpTimeoutMs;
const createFeishuHttpInstance=(timeout,domain)=>({timeout,domain});
export const untouchedCache=new Map();`;
  const patched=patchFeishuPhoneTabClient(source);
  assert.equal(patchFeishuPhoneTabClient(patched),patched);
  assert(patched.startsWith(source));
  const module=await import('data:text/javascript;base64,'+Buffer.from(patched).toString('base64'));
  const config={appId:'cli_test',appSecret:'fixture',domain:'feishu',httpTimeoutMs:8000};
  const client=module.createFeishuPhoneTabClient(config);
  assert.deepEqual(client.options.httpInstance,{timeout:8000,domain:'feishu'});
  assert.equal(client.options.domain,'domain:feishu');
  assert.equal(client.options.appType,'self');
  for(const log of Object.values(client.options.logger))assert.equal(log({Authorization:'Bearer fixture'}),undefined);
  assert.notEqual(client,module.createFeishuPhoneTabClient(config));assert.equal(module.untouchedCache.size,0);
});
