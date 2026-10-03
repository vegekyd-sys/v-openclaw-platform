// Real Gateway/model questions + actual patched Feishu receive/authorization path.
// Synthetic IM events and a local card sink: never attach a second bot consumer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { patchFeishuAskUser } from "../release-files/feishu-ask-user/patch.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && state && configPath);
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const channelCfg = structuredClone(cfg);
for (const key of ["TMPDIR", "XDG_CACHE_HOME", "npm_config_cache"]) {
  process.env[key] = path.join(state, "candidate-" + key.toLowerCase());
  fs.mkdirSync(process.env[key], {recursive:true,mode:0o700});
}
const port = cfg.gateway.port;
const dist = path.join(runtime, "openclaw/dist");
const plugin = cfg.plugins.load.paths.find(p => p.endsWith("/@openclaw/feishu"));
assert(plugin?.startsWith(runtime), "private runtime only");
const monitor = path.join(plugin, "dist", fs.readdirSync(path.join(plugin, "dist")).find(n => /^monitor\.account-.*\.js$/.test(n)));
let patched = patchFeishuAskUser(fs.readFileSync(monitor, "utf8"));
assert(patched.includes("// v-feishu-ask-user-v4\n"));
assert.equal(patchFeishuAskUser(patched), patched);

const trace = path.join(state, "chat-answer-trace.jsonl");
const inbox = path.join(state, "chat-answer-inbox.json");
const resultFile = path.join(state, "chat-answer-result.json");
const hookReady = path.join(state, "chat-answer-hook-ready");
const hookError = path.join(state, "chat-answer-hook-error");
// Only the candidate presentation is local. The resolver and all ingress logic
// remain the actual runtime code; no callback or question.resolve is injected.
patched = patched.replace("send: sendCardFeishu,", `send: async p => {
  const id = p.card.body.elements.find(e => e.behaviors?.[0]?.value?.q)?.behaviors[0].value.q;
  const messageId = "om_candidate_" + id;
  process.getBuiltinModule("node:fs").appendFileSync(process.env.V_ASK_CHAT_TRACE, JSON.stringify({kind:"card",messageId,questionId:id,card:p.card})+"\\n");
  return {messageId};
},`);
patched = patched.replace("patch: vSecretEntryPatchCard,", `patch: async p => {
  process.getBuiltinModule("node:fs").appendFileSync(process.env.V_ASK_CHAT_TRACE, JSON.stringify({kind:"paint",messageId:p.messageId,card:p.card})+"\\n");
},`);
patched += "\nexport { vSecretEntrySubscribeRequested as candidateSubscribe, vFeishuAsk as candidateAsk, vAskTryChatAnswer as candidateTry, createFeishuMessageReceiveHandler as candidateReceive, handleFeishuMessage as candidateHandle, parseFeishuMessageEvent as candidateParse, hasProcessedFeishuMessage as candidateProcessed, getFeishuRuntime as candidateRuntime };\n";
fs.writeFileSync(monitor, patched);
assert.equal(spawnSync(process.execPath, ["--check", monitor]).status, 0);

// Native Codex is registry-owned, outside the runtime bundle cache. Register a
// private install, then copy the shared instance's exact patched dist read-only.
const install = spawnSync(process.execPath, [path.join(dist,"index.js"),"plugins","install","@openclaw/codex@2026.9.1","--pin","--force","--accept-capabilities","--acknowledge-install-policy-warning"], {env:process.env,encoding:"utf8",timeout:300000,maxBuffer:16*1024*1024});
assert.equal(install.status,0,"private Codex plugin registration failed: "+String(install.stderr).replace(/https?:\/\/\S+/g,"[url]").slice(-1500));
Object.assign(cfg, JSON.parse(fs.readFileSync(configPath,"utf8")));
const projects = root => fs.readdirSync(path.join(root,"npm/projects")).filter(n=>n.startsWith("openclaw-codex-"));
const sharedProject=projects(process.env.VLAB_SHARED_STATE_DIR)[0],privateProject=projects(state)[0];
assert(sharedProject&&privateProject,"Codex native plugin missing");
fs.cpSync(path.join(process.env.VLAB_SHARED_STATE_DIR,"npm/projects",sharedProject,"node_modules/@openclaw/codex/dist"),path.join(state,"npm/projects",privateProject,"node_modules/@openclaw/codex/dist"),{recursive:true});
cfg.plugins.entries.codex.config ??= {};
cfg.plugins.entries.codex.config.appServer ??= {};
cfg.plugins.entries.codex.config.appServer.homeScope="agent";
const codexHome=path.join(cfg.agents.entries.makaron.agentDir,"codex-home");
fs.mkdirSync(codexHome,{recursive:true,mode:0o700});
const sharedToml=fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR,"agents/makaron/agent/codex-home/config.toml"),"utf8");
let inProvider=false;const provider=[];
for(const line of sharedToml.split(/\r?\n/)){
  if(line.trim()==="[model_providers.deepseek]")inProvider=true;
  else if(inProvider&&/^\s*\[/.test(line))break;
  if(inProvider)provider.push(line);
}
fs.writeFileSync(path.join(codexHome,"config.toml"),provider.join("\n")+"\n",{mode:0o600});

// Reuse only a currently valid access token, entirely on the candidate host.
// Never give this private process a shared refresh token: it cannot rotate or
// invalidate the live instance's credentials. No conversation data is copied.
const authSource = new DatabaseSync(path.join(process.env.VLAB_SHARED_STATE_DIR,"agents/makaron/agent/openclaw-agent.sqlite"),{readOnly:true});
const authPath = path.join(cfg.agents.entries.makaron.agentDir,"openclaw-agent.sqlite");
const authTarget = new DatabaseSync(authPath);
const maintenance = fs.readdirSync(dist).find(n=>/^openclaw-agent-db-maintenance-.*\.js$/.test(n));
const {a:ensureAgentSchema}=await import(path.join(dist,maintenance));
ensureAgentSchema(authTarget,"makaron",authPath);
for(const table of ["auth_profile_store","auth_profile_state"]){
  for(const row of authSource.prepare(`SELECT * FROM ${table}`).all()){
    const column=table==="auth_profile_store"?"store_json":"state_json";
    const data=JSON.parse(row[column]);
    if(table==="auth_profile_store"){
      data.profiles=Object.fromEntries(Object.entries(data.profiles??{}).filter(([,p])=>p.provider==="openai"&&p.type==="oauth"&&p.access&&p.expires>Date.now()+600000).map(([id,p])=>[id,{...p,refresh:""}]));
      assert(Object.keys(data.profiles).length,"no unexpired OpenAI access token available for private candidate");
    }
    row[column]=JSON.stringify(data);
    const columns=Object.keys(row);
    authTarget.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).run(...columns.map(c=>row[c]));
  }
}
authSource.close();authTarget.close();fs.chmodSync(authPath,0o600);

const owner = "ou_candidateAskOwner";
const feishu = channelCfg.channels.feishu;
Object.assign(feishu, { resolveSenderNames: false, groupPolicy: "open", groupAllowFrom: [], groupSenderAllowFrom: [owner], requireMention: true });
if (feishu.accounts?.default) Object.assign(feishu.accounts.default, { resolveSenderNames: false, groupPolicy: "open", groupAllowFrom: [], groupSenderAllowFrom: [owner], requireMention: true });
channelCfg.messages = { ...channelCfg.messages, inbound: { ...channelCfg.messages?.inbound, debounceMs: 0, byChannel: { ...channelCfg.messages?.inbound?.byChannel, feishu: 0 } } };
const channelPath = path.join(state, "chat-answer-channel.json");
fs.writeFileSync(channelPath, JSON.stringify(channelCfg), {mode:0o600});

cfg.channels = {};
cfg.bindings = [];
cfg.cron = { ...cfg.cron, enabled: false };
const worker = cfg.plugins.entries["vlab-agent-worker-isolation"].config;
Object.assign(worker, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPath });
const rel = path.relative(state, worker.workerConfigPath);
assert(!rel.startsWith(".."));
let workerCfg = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8").replaceAll(process.env.VLAB_SHARED_STATE_DIR, state).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
workerCfg.channels = {};
workerCfg.cron = { ...workerCfg.cron, enabled: false };
if(workerCfg.plugins?.entries?.codex?.config?.appServer)workerCfg.plugins.entries.codex.config.appServer.homeScope="agent";
fs.mkdirSync(path.dirname(worker.workerConfigPath), {recursive:true});
fs.writeFileSync(worker.workerConfigPath, JSON.stringify(workerCfg), {mode:0o600});
fs.writeFileSync(configPath, JSON.stringify(cfg), {mode:0o600});

const hook = path.join(state, "chat-answer-hook.mjs");
fs.writeFileSync(hook, `import fs from "node:fs";
if (process.argv.includes("gateway")) {
 const cfg=JSON.parse(fs.readFileSync(${JSON.stringify(channelPath)},"utf8"));
 const api=await import(${JSON.stringify(monitor)});
 api.candidateSubscribe({cfg,accountId:"default",log:()=>{}});
 let receive, initializing=false;
 const write=entry=>fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify(entry)+"\\n");
 setInterval(()=>{
  if(initializing || receive || !fs.existsSync(${JSON.stringify(path.join(state,"chat-answer-ready"))}))return;
  initializing=true;
  try {
   const channelRuntime=api.candidateRuntime().channel;
   receive=api.candidateReceive({cfg,channelRuntime,accountId:"default",fireAndForget:false,
    getBotOpenId:()=>"ou_candidateAskBot",getBotName:()=>"Candidate",
    resolveIngressLifecycle:e=>e.message.message_id.startsWith("om_answer_")?{
     abortSignal:new AbortController().signal,
     registerAbandonHandler:()=>{},
     onAdoptionFinalizing:()=>write({kind:"adoption-finalizing",messageId:e.message.message_id}),
     onAdopted:async()=>write({kind:"adopted",messageId:e.message.message_id})
    }:undefined,
    hasProcessedMessage:api.candidateProcessed,
    resolveDebounceText:({event,botOpenId,botName})=>api.candidateParse(event,botOpenId,botName).content,
    tryQuestionAnswer:async p=>{
     const c=api.candidateParse(p.event,p.botOpenId,p.botName);
     const questionId=api.candidateAsk.chatCandidate({accountId:p.accountId,chatId:c.chatId,senderOpenId:c.senderOpenId,messageId:c.messageId,parentId:c.parentId,timestamp:Number(p.event.message.create_time)});
     write({kind:"candidate-check",messageId:c.messageId,questionId,chatId:c.chatId,senderOpenId:c.senderOpenId});
     return await api.candidateTry(p);
    },
    runtime:{log:s=>write({kind:"ingress-log",text:String(s)}),error:e=>write({kind:"ingress-error",error:String(e).replace(/https?:\\/\\/\\S+/g,"[url]")})},
    handleMessage:async p=>{
     if(p.askUserAnswerOnly)return await api.candidateHandle(p);
     if(p.event.message.message_id.startsWith("om_initial_")){
      const chat=p.event.message.chat_id;
      const session="agent:makaron:feishu:group:"+chat;
      const unbind=api.candidateAsk.bindStream(session,"default",async()=>undefined,()=>false,{chatId:chat,senderOpenId:${JSON.stringify(owner)},isActive:()=>true});
      write({kind:"queue-start",messageId:p.event.message.message_id,sessionKey:session});
      await new Promise(resolve=>{const timer=setInterval(()=>{const f=${JSON.stringify(state)}+"/finished-"+p.event.message.message_id;if(fs.existsSync(f)){clearInterval(timer);resolve()}},50)});
      unbind();write({kind:"queue-finished",messageId:p.event.message.message_id});return;
     }
     write({kind:"ordinary-turn",messageId:p.event.message.message_id});
    }
   });
   fs.writeFileSync(${JSON.stringify(hookReady)},"ok");
  } catch(e) {fs.writeFileSync(${JSON.stringify(hookError)},String(e).replace(/https?:\\/\\/\\S+/g,"[url]"))}
 },100).unref();
 setInterval(()=>{
  if(!receive || !fs.existsSync(${JSON.stringify(inbox)}))return;
  let job;try{job=JSON.parse(fs.readFileSync(${JSON.stringify(inbox)},"utf8"));fs.unlinkSync(${JSON.stringify(inbox)})}catch{return}
  void (async()=>{try{
   if(job.policyProbe){
    const denied=structuredClone(cfg),chat=job.event.message.chat_id;
    const policy={allowFrom:["ou_candidateDenied"]};
    denied.channels.feishu.groups={...denied.channels.feishu.groups,[chat]:policy};
    if(denied.channels.feishu.accounts?.default)denied.channels.feishu.accounts.default.groups={...denied.channels.feishu.accounts.default.groups,[chat]:policy};
    const handled=await api.candidateHandle({cfg:denied,event:job.event,accountId:"default",botOpenId:"ou_candidateAskBot",channelRuntime:api.candidateRuntime().channel,askUserAnswerOnly:true,askUserQuestionId:job.policyProbe,runtime:{log:s=>write({kind:"policy-log",text:String(s)})}});
    if(handled===true)throw Error("sender allowlist failed to block the answer");
    write({kind:"policy-denied",messageId:job.event.message.message_id});
   }else await receive(job.event);
   fs.writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({ok:true,job:job.id}));
  }catch(e){fs.writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({error:String(e),job:job.id}))}})();
 },50).unref();
}
`);

const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), V_ASK_CHAT_TRACE: trace };
fs.mkdirSync(env.TMPDIR,{recursive:true});fs.mkdirSync(env.XDG_CACHE_HOME,{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const until = async (check, ms, label) => {
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){const r=check();if(r)return r;await sleep(100)}
  throw Error(label);
};
const traces = () => fs.existsSync(trace) ? fs.readFileSync(trace,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s)) : [];
const atomically = (file, value) => {fs.writeFileSync(file+".tmp",JSON.stringify(value),{mode:0o600});fs.renameSync(file+".tmp",file)};
const event = (chat, id, text) => ({sender:{sender_type:"user",sender_id:{open_id:owner}},message:{message_id:id,chat_id:chat,chat_type:"group",message_type:"text",content:JSON.stringify({text}),create_time:String(Date.now())}});
const input = async (id, e, wait=true, extra={}) => {
  fs.rmSync(resultFile,{force:true});atomically(inbox,{id,event:e,...extra});
  if(wait){const r=await until(()=>fs.existsSync(resultFile)&&JSON.parse(fs.readFileSync(resultFile,"utf8")),10000,"receive handler timed out");assert.equal(r.job,id);assert(!r.error,r.error)}
};
const models = { ...channelCfg.agents?.defaults?.models, ...channelCfg.agents?.entries?.makaron?.models };
const alias = name => {
  const id=Object.entries(models).find(([,v])=>v?.alias===name)?.[0];
  assert(id, "model alias not configured: "+name);return id;
};
const matrix = [
 {name:"worker",model:"deepseek/deepseek-v4-flash",text:"保留原图，只调整灯光",expected:"保留原图，只调整灯光"},
 {name:"vds",model:alias("vds"),text:"2",expected:"重画"},
 {name:"vcc",model:alias("vcc"),text:"保留构图，只柔化灯光",expected:"保留构图，只柔化灯光"},
 {name:"vcodex",model:alias("vcodex"),text:"重画",expected:"重画"},
];
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
let gateway,client;
const gatewayLogs=[];
const start = () => {
 gateway=spawn(process.execPath,["--max-old-space-size=3072",`${dist}/index.js`,"gateway","--port",String(port)],{env:{...env,NODE_OPTIONS:`--import ${hook}`},stdio:["ignore","pipe","pipe"]});
 for(const s of [gateway.stdout,gateway.stderr])s.on("data",b=>{gatewayLogs.push(b.toString());if(gatewayLogs.length>300)gatewayLogs.shift()});
};
const results=[];
start();
try {
 let ready=false;
 for(let i=0;i<150&&!ready;i++){
  if(gateway.exitCode!==null){
   if(gatewayLogs.join("").includes("Restart OpenClaw so state migrations run")&&i<130)start();
   else throw Error("private Gateway exited "+gateway.exitCode);
  }
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error("hello timeout")),3000);
    client=new GatewayClient({url:`ws://127.0.0.1:${port}`,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:"cli",mode:"cli",scopes:["operator.admin","operator.read","operator.write","operator.questions"],onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:e=>{clearTimeout(timer);reject(e)}});client.start();
   });ready=true;
  }catch{client?.stop();await sleep(1000)}
 }
 assert(ready,"private Gateway not ready");
 fs.writeFileSync(path.join(state,"chat-answer-ready"),"ok");
 await until(()=>{assert(!fs.existsSync(hookError),fs.existsSync(hookError)?fs.readFileSync(hookError,"utf8"):"");return fs.existsSync(hookReady)},10000,"candidate Feishu hook not ready");
 for(const item of matrix){
  const chat="oc_candidateaskchat_"+item.name;
  const sessionKey="agent:makaron:feishu:group:"+chat;
  const initialId="om_initial_"+item.name;
  const initialEvent=event(chat,initialId,"candidate initial question");
  await input("initial-"+item.name,initialEvent,false);
  await until(()=>traces().find(e=>e.kind==="queue-start"&&e.messageId===initialId),10000,"initial turn not occupying sequential queue");
  const previousCards=new Set(traces().filter(e=>e.kind==="card").map(e=>e.questionId));
  let stdout="",stderr="";
  const prompt=`这里只验收 Ask User，不修改文件、不生成媒体。调用 ask_user，严格只问一个单选题“如何处理画面？”，选项“原图”和“重画”，isOther=true。必须等待回答，不能自己决定。收到答案后只回复“ASK_CHAT_${item.name.toUpperCase()}_DONE ”加收到的完整答案。`;
  const agent=spawn(process.execPath,[`${dist}/index.js`,"agent","--agent","makaron","--session-key",sessionKey,"--model",item.model,"--message",prompt,"--json","--timeout","180"],{env,stdio:["ignore","pipe","pipe"]});
  agent.stdout.on("data",b=>stdout+=b);agent.stderr.on("data",b=>stderr+=b);
  const completed=new Promise(resolve=>agent.on("close",resolve));
  const card=await until(()=>{assert(agent.exitCode===null,"model exited before question: "+item.name);return traces().find(e=>e.kind==="card"&&!previousCards.has(e.questionId))},150000,"model did not ask a question: "+item.name);
  const pending=await client.request("question.get",{id:card.questionId});
  assert.equal(pending.question.status,"pending");assert.equal(pending.question.sessionKey,sessionKey);assert.equal(agent.exitCode,null);
  const answerEvent=event(chat,"om_answer_"+item.name,item.text);
  await input("denied-"+item.name,event(chat,"om_denied_"+item.name,item.text),true,{policyProbe:card.questionId});
  assert.equal((await client.request("question.get",{id:card.questionId})).question.status,"pending","allowlist-denied answer resolved the question");
  const answerStarted=Date.now();
  await input("answer-"+item.name,answerEvent);
  const answerMs=Date.now()-answerStarted;
  let resumeTimer;
  const exit=await Promise.race([completed,new Promise(resolve=>{resumeTimer=setTimeout(()=>resolve("timeout"),60000)})]);
  clearTimeout(resumeTimer);
  if(exit==="timeout"){agent.kill("SIGTERM");throw Error("model did not resume from chat: "+item.name)}
  assert.equal(exit,0,"agent exit failed: "+item.name);
  const parsed=JSON.parse(stdout.slice(stdout.indexOf("{")));
  const result=parsed.result??parsed;
  const reply=result.payloads?.map(p=>p.text??"").join("\n");
  assert(reply?.includes(`ASK_CHAT_${item.name.toUpperCase()}_DONE`)&&reply.includes(item.expected),"unexpected continuation: "+reply);
  const answered=await client.request("question.get",{id:card.questionId});
  assert.equal(answered.question.status,"answered");
  const values=Object.values(answered.question.answers.answers).flat();
  assert.deepEqual(values,[item.expected]);
  fs.writeFileSync(path.join(state,"finished-"+initialId),"ok");
  await until(()=>traces().find(e=>e.kind==="queue-finished"&&e.messageId===initialId),5000,"first turn queue did not settle");
  // Logical replay must not become a new model turn after the question ended.
  await input("duplicate-"+item.name,answerEvent);
  assert.equal(traces().filter(e=>e.kind==="adopted"&&e.messageId===answerEvent.message.message_id).length,2,"answer or duplicate left durable ingress unadopted");
  await input("ordinary-"+item.name,event(chat,"om_ordinary_"+item.name,"candidate new turn"));
  await until(()=>traces().find(e=>e.kind==="ordinary-turn"&&e.messageId==="om_ordinary_"+item.name),5000,"next ordinary message did not dispatch");
  assert(!traces().some(e=>e.kind==="ordinary-turn"&&e.messageId===answerEvent.message.message_id),"answer replay started a new turn");
  await until(()=>traces().some(e=>e.kind==="paint"&&e.messageId===card.messageId&&JSON.stringify(e.card).includes("已选择")),5000,"answered card did not close");
  results.push({entry:item.name,model:item.model,agentMeta:result.meta?.agentMeta,questionId:card.questionId,answerMs,answer:item.expected,reply,queueWasWaiting:true,senderAllowlistEnforced:true,durableIngressAdopted:true,logicalReplaySuppressed:true,nextMessageDispatched:true});
 }
 assert(!traces().some(e=>e.kind==="ingress-error"),JSON.stringify(traces().filter(e=>e.kind==="ingress-error")));
 console.log(JSON.stringify({ok:true,matrix:results,transport:"synthetic Feishu IM events through actual patched receive and authorization handler",cardTransport:"local candidate sink",sharedBotConsumerStarted:false}));
} catch(error) {
 const relevant=gatewayLogs.join("").split("\n").filter(s=>/chat.answer|ask_user|question\.|Error:|error|failed/i.test(s)).slice(-12).map(s=>s.replace(/https?:\/\/\S+/g,"[url]").replace(/(token|secret|api.?key|bearer)([=: ]+)[^\s"]+/gi,"$1$2[redacted]"));
 console.error(JSON.stringify({phase:"candidate",error:String(error),completed:results,diagnostics:relevant,trace:traces().slice(-12).map(({card,...r})=>r)}));throw error;
} finally {
 client?.stop();gateway?.kill("SIGTERM");await sleep(1000);if(gateway?.exitCode===null)gateway.kill("SIGKILL");
}
