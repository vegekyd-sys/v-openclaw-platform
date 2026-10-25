import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHmac} from 'node:crypto';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const root=runtime+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const bridge=await import(pathToFileURL(root+'v-feishu-voice-confirm.mjs'));
const monitor=await readFile(root+'monitor.account-WFdlCDhR.js','utf8');
test('patched native Feishu monitor loads and intercepts confirmation before existing handlers',async()=>{
 const module=await import(pathToFileURL(root+'monitor.account-WFdlCDhR.js'));assert.equal(typeof module.resolveVoiceFeishuAccount,'function');
 const handler=monitor.slice(monitor.indexOf('"card.action.trigger": async (data) => {'));
 assert(handler.indexOf('if (vVoiceConfirmation) return vVoiceConfirmation;')<handler.indexOf('vFeishuApprovalCardAction'));
});
test('deployed native bridge sends exact signed callback to fixed configured endpoint',async()=>{
 const account={accountId:'fixture',appId:'cli_fixture',appSecret:'fixture'},settings={appId:'cli_fixture',cardConfirmation:true,url:'https://voice.example/voice/feishu'};
 let captured;const result=await bridge.confirmVoiceCard({operator:{tenant_key:'external',open_id:'ou_external'},context:{open_chat_id:'oc_group',open_message_id:'om_card'},action:{value:{action:'v.voice.confirm.v1',request:'r'.repeat(43)}}},{account,settings,fetchImpl:async(url,init)=>{captured={url:String(url),...init};return Response.json({confirmed:true});}});
 assert.equal(result.toast.type,'success');assert.equal(captured.url,'https://voice.example/voice/feishu/confirm/callback');assert.equal(captured.headers['x-voice-confirm-signature'],createHmac('sha256','fixture').update('voice-card-confirm-v1\n'+captured.body).digest('base64url'));
});
