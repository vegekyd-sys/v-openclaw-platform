import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const prefix=process.env.VLAB_CANDIDATE_RUNTIME+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const source=await readFile(prefix+'monitor.account-WFdlCDhR.js','utf8');
assert(source.includes('// v-feishu-private-phone-menu-v1'));
await writeFile(prefix+'private-menu-test-entry.mjs',source+'\nexport {createFeishuBotMenuHandler as testMenu};\n');
const {testMenu}=await import(pathToFileURL(prefix+'private-menu-test-entry.mjs'));
test('actual native menu handler consumes the phone event without model dispatch when rollout is disabled',async()=>{
 const logs=[];
 const handler=testMenu({cfg:{channels:{feishu:{enabled:true,appId:'cli_fixture',appSecret:'fixture'}}},accountId:'default',runtime:{log:l=>logs.push(l),error:()=>{}},chatHistories:new Map(),fireAndForget:true});
 await handler({event_key:'v.voice.phone.v1',timestamp:Date.now(),operator:{operator_id:{open_id:'ou_fixture'}}});
 const deadline=Date.now()+3000;while(!logs.some(l=>l.includes('voice.private-phone-menu'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert(logs.some(l=>l.includes('voice.private-phone-menu')));assert(logs.every(l=>!l.includes('bot-menu:')));
});
