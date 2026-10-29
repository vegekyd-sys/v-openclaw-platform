import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareCandidate,OWNER,GROUP_B,groupKey,until,redact,sleep} from './bound-task-support.mjs';

test('page handback uses the real plugin poller, native agent RPC and one visible progress/result card',{timeout:540000},async t=>{
 let c,server; t.after(async()=>{await c?.stop();server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());});
 c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'vds',maxWorkers:1,registerCleanup:fn=>t.after(fn)});
 // The captured runtime no longer accepts this legacy test-only setting.
 // This scenario does not spawn agents or use ping-pong announcements.
 delete c.config.session?.agentToAgent;
 // The plugin lives outside OpenClaw in deployment. Reuse this private
 // runtime's installed dependencies when loading its source in the candidate.
 const pluginModules=path.join(c.runtime,'extensions/v-desktop-handoff/node_modules');
 fs.mkdirSync(pluginModules,{recursive:true});
 fs.symlinkSync(path.join(c.runtime,'openclaw/node_modules/typebox'),path.join(pluginModules,'typebox'));
 fs.symlinkSync(path.join(c.runtime,'openclaw'),path.join(pluginModules,'openclaw'));
 const sessionKey=groupKey(GROUP_B),adminToken='candidate-only-handoff-token';
 const origin=createHash('sha256').update(`${c.env.OPENCLAW_HOME??''}\0${c.env.OPENCLAW_STATE_DIR??''}`).digest('hex').slice(0,24);
 let handoff=null,claims=0;
 server=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.headers.authorization!==`Bearer ${adminToken}`){res.statusCode=403;res.end('{}');return;}
  let body='';for await(const b of req)body+=b;
  if(req.url==='/v1/state'){res.end(JSON.stringify({controlActive:false,activeHandoffs:handoff?[handoff]:[]}));return;}
  if(req.method==='POST'&&req.url===`/v1/handoffs/${handoff?.id}/wake`){
   const claimed=JSON.parse(body).origin===origin&&!handoff.wakeClaimedAt;
   if(claimed){handoff.wakeClaimedAt=Date.now();claims++;}res.end(JSON.stringify({claimed}));return;
  }
  if(req.method==='GET'&&req.url===`/v1/handoffs/${handoff?.id}`){res.end(JSON.stringify(handoff));return;}
  res.statusCode=404;res.end(JSON.stringify({error:'candidate-only endpoint'}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const tokenFile=path.join(c.data,'handoff-admin-token');fs.writeFileSync(tokenFile,adminToken,{mode:0o600});
 c.config.plugins.load.paths.push(path.join(c.runtime,'extensions/v-desktop-handoff'));
 c.config.plugins.entries['v-desktop-handoff']={enabled:true,config:{adminUrl:`http://127.0.0.1:${server.address().port}`,adminTokenFile:tokenFile}};
 if(Array.isArray(c.config.plugins.allow))c.config.plugins.allow.push('v-desktop-handoff');
 fs.writeFileSync(c.configPath,JSON.stringify(c.config,null,2),{mode:0o600});
 const proof={harness:c.harness,checks:[]};
 try{
  await c.start({timeoutMs:150000});console.log(JSON.stringify({stage:'gateway-ready'}));
  assert(!c.lines.some(x=>/v-desktop-handoff failed to load/u.test(x.line)),'desktop plugin must load before testing handback');
  const seed=c.fake.post({receive_id:GROUP_B,msg_type:'text',content:JSON.stringify({text:'handback fixture'})});
  const prompt='这是电脑交还进度的隔离测试。当前这一轮只回复 HAND_BACK_READY，不调用工具。记住：随后接到用户在接管页交还电脑的通知时，先发公开进度 HAND_BACK_PROGRESS，调用 exec 执行 printf HAND_BACK_TOOL; sleep 6; printf HAND_BACK_RESULT，等真实命令完成后才最终回复 HAND_BACK_RESULT。不得调用发消息工具。';
  await c.inject({chatId:GROUP_B,chatType:'group',sender:OWNER,messageId:seed.message_id,mentionBot:true,text:prompt});
  await until(()=>c.fake.list(GROUP_B).some(m=>m.msg_type==='interactive'&&JSON.stringify(m.body).includes('HAND_BACK_READY')),{timeoutMs:120000,label:'normal Feishu ingress baseline'});
  const inspect=()=>c.rpc('candidate.boundTask',{op:'inspect',sessionKey});
  assert.equal((await inspect()).tasks.length,0);
  handoff={id:'h_candidate_progress',sessionKey,origin,pageHandBackAt:Date.now(),wakeClaimedAt:null,controlActive:false,ended:false,card:null};
  const runId=`v-desktop-handoff-wake-${handoff.id}-${handoff.pageHandBackAt}`;
  const opened=await until(async()=>{const s=await inspect();return s.tasks.find(x=>x.source==='desktop-handback');},{timeoutMs:60000,label:'handback presentation opened'});
  assert.equal(opened.activeRunId,runId);assert.equal(opened.sessionKey,sessionKey);
  console.log(JSON.stringify({stage:'handback-open',runId}));
  const terminal=await until(async()=>{const s=await inspect();return s.tasks.find(x=>x.id===opened.id&&x.delivered);},{timeoutMs:180000,label:'native handback final ACK'});
  assert.equal(terminal.phase,'completed');assert.equal(claims,1);assert.equal(terminal.runIds.length,1);
  const finals=c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m.body).includes('HAND_BACK_RESULT'));
  assert.equal(finals.length,1,'only one final card');
  const prior=c.fake.snapshots.filter(x=>x.at>=opened.createdAt&&x.message.chat_id===GROUP_B&&x.message.msg_type==='interactive'&&!JSON.stringify(x.message.body).includes('HAND_BACK_RESULT'));
  assert(prior.some(x=>JSON.stringify(x.message.body).includes('HAND_BACK_PROGRESS')),'public commentary visible before final');
  assert(prior.some(x=>/exec|bash|执行|运行命令/iu.test(JSON.stringify(x.message.body))),'actual tool status visible before final');
  assert(!prior.some(x=>JSON.stringify(x.message.body).includes('后台任务已结束')),'ordinary session end must not overwrite handback lifecycle');
  assert(terminal.sinkState.receipts.every(r=>r.visibleReplySent&&r.messageId));
  const before=c.fake.list(GROUP_B).length;
  await sleep(6500);assert.equal(claims,1);assert.equal(c.fake.list(GROUP_B).length,before,'polling does not duplicate admission or messages');
  const wakeLogs=c.lines.filter(x=>x.line.includes(`woke ${sessionKey}`));assert.equal(wakeLogs.length,1);
  assert(wakeLogs[0].line.includes(`(run ${runId})`),'the Gateway admits exactly the prebound idempotency/run identity');
  proof.checks=['real desktop plugin polling and claim','real runtime.subagent.run / agent RPC','public progress and tool status before final','one original-group card and native final ACK','polling cannot duplicate the run'];
  proof.result={phase:terminal.phase,delivered:terminal.delivered,source:terminal.source,selectedModel:terminal.selectedModel,claims,progressSnapshots:prior.length,finalCards:finals.length};
  assert.equal(c.fake.unimplemented.length,0,JSON.stringify(c.fake.unimplemented));
  console.log(JSON.stringify({stage:'passed',proof}));
 }catch(error){console.error(redact(error.stack));console.error(redact(c.lines.slice(-55).map(x=>x.line).join('\n')));
  try{console.log(JSON.stringify({stage:'failure-evidence',tasks:await c.rpc('candidate.boundTask',{op:'inspect'}),messages:c.fake.list(GROUP_B)}));}catch{}
  throw error;
 }
});
