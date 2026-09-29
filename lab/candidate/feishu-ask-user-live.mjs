// Real worker + real Feishu messages, without a second Feishu WebSocket consumer.
// CLI-originated input/answer are read from Feishu REST. The form callback is
// injected into the exact candidate handler; this is NOT a real client-click test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { patchFeishuAskUser } from "../release-files/feishu-ask-user/patch.mjs";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && state && configPath);
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = cfg.gateway.port, token = cfg.gateway.auth.token;
const chat = process.env.FEISHU_ASK_CHAT;
const inputId = process.env.FEISHU_ASK_INPUT;
assert(/^oc_/.test(chat) && /^om_/.test(inputId));
const channelCfg = structuredClone(cfg);
const account = { ...cfg.channels.feishu, ...cfg.channels.feishu.accounts?.default };
const auth = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: account.appId, app_secret: account.appSecret }), signal: AbortSignal.timeout(15000) }).then(r => r.json());
assert.equal(auth.code, 0, "Feishu authentication failed (redacted)");
async function feishu(url, body) {
  const r = await fetch(`https://open.feishu.cn/open-apis/${url}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${auth.tenant_access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }).then(r => r.json());
  assert.equal(r.code, 0, `Feishu request failed: ${r.code} ${r.msg}`);
  return r.data;
}
const input = (await feishu(`im/v1/messages/${inputId}`)).items[0];
assert.equal(input.chat_id, chat);
const prompt = JSON.parse(input.body.content).text;
assert(prompt.startsWith("ASK_CANDIDATE_0929_ASKUSER"));
const dist = path.join(runtime, "openclaw/dist");
const feishuDir = cfg.plugins.load.paths.find(p => p.endsWith("/@openclaw/feishu"));
assert(feishuDir.startsWith(runtime));
const monitor = path.join(feishuDir, "dist", fs.readdirSync(path.join(feishuDir, "dist")).find(n => /^monitor\.account-.*\.js$/.test(n)));
const probe = path.join(state, "ask-probe.jsonl"), inbox = path.join(state, "ask-inbox.json"), outcome = path.join(state, "ask-outcome.json");
let patched = patchFeishuAskUser(fs.readFileSync(monitor, "utf8"));
patched = patched.replace("send: sendCardFeishu,", `send: async (p) => { const r = await sendCardFeishu(p); process.getBuiltinModule("node:fs").appendFileSync(process.env.V_ASK_PROBE, JSON.stringify({kind:"sent",...r,card:p.card})+"\\n"); return r; },`);
patched += "\nexport { vSecretEntrySubscribeRequested as candidateSubscribe, vFeishuAsk as candidateAsk, FeishuStreamingSession as CandidateStream, createFeishuClient as candidateClient, createFeishuReplyDispatcher as candidateDispatcher };\n";
fs.writeFileSync(monitor, patched);
const channelPath = path.join(state, "ask-channel-config.json");
fs.writeFileSync(channelPath, JSON.stringify(channelCfg), { mode: 0o600 });
cfg.channels = {};
cfg.cron = { ...(cfg.cron ?? {}), enabled: false };
const worker = cfg.plugins.entries["vlab-agent-worker-isolation"].config;
Object.assign(worker, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPath });
const rel = path.relative(state, worker.workerConfigPath);
assert(!rel.startsWith(".."));
let workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8").replaceAll(process.env.VLAB_SHARED_STATE_DIR, state).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
workerConfig = JSON.parse(workerConfig); workerConfig.channels = {};
fs.mkdirSync(path.dirname(worker.workerConfigPath), { recursive: true });
fs.writeFileSync(worker.workerConfigPath, JSON.stringify(workerConfig), { mode: 0o600 });
fs.writeFileSync(configPath, JSON.stringify(cfg), { mode: 0o600 });
const hook = path.join(state, "ask-hook.mjs");
fs.writeFileSync(hook, `import fs from "node:fs";
if(process.argv.includes("gateway")) {
 const cfg=JSON.parse(fs.readFileSync(${JSON.stringify(channelPath)},"utf8"));
 const {candidateSubscribe,candidateAsk,CandidateStream,candidateClient,candidateDispatcher}=await import(${JSON.stringify(monitor)});
 candidateSubscribe({cfg,accountId:"default",log:console.log});
 const prefix="B 方案 · 独立 candidate 同卡片实测\\n收到，我先确认重做方式。";
 let dispatcher, messageId, initialized=false;
 const originalUpdate=CandidateStream.prototype.vAskUpdate;
 CandidateStream.prototype.vAskUpdate=async function(card,owner){
   const result=await originalUpdate.call(this,card,owner);
   if(!owner && result){messageId=result.messageId;fs.appendFileSync(${JSON.stringify(probe)},JSON.stringify({kind:"sent",messageId,card,inline:true})+"\\n");}
   return result;
 };
 let finalized=false;
 setInterval(async()=>{
   if(!initialized && fs.existsSync(${JSON.stringify(path.join(state,"ask-ready"))})){
     initialized=true;
     try { dispatcher=candidateDispatcher({cfg,agentId:"makaron",sessionKey:${JSON.stringify(`agent:makaron:feishu:group:${chat}`)},chatId:${JSON.stringify(chat)},sendTarget:${JSON.stringify(chat)},accountId:"default",runtime:{log:console.log,error:console.error},skipReplyToInMessages:true});
       dispatcher.replyOptions.onPartialReply({text:prefix});
       fs.writeFileSync(${JSON.stringify(path.join(state,"ask-dispatcher-ready"))},"ok");
     } catch(e) {fs.writeFileSync(${JSON.stringify(path.join(state,"ask-dispatcher-error"))},String(e));}
   }
   const file=${JSON.stringify(path.join(state,"ask-final.json"))};
   if(finalized || !dispatcher || !fs.existsSync(file))return;
   finalized=true;
   try {const text=prefix+"\\n\\n"+JSON.parse(fs.readFileSync(file,"utf8")).text;
     dispatcher.replyOptions.onPartialReply({text});
     await dispatcher.dispatcherOptions.onIdle();
     dispatcher.dispatcherOptions.onCleanup();
     fs.writeFileSync(${JSON.stringify(path.join(state,"ask-final-outcome.json"))},JSON.stringify({messageId}));
   } catch(e){fs.writeFileSync(${JSON.stringify(path.join(state,"ask-final-outcome.json"))},JSON.stringify({error:String(e)}));}
 },200).unref();
 let processing=false;
 setInterval(async()=>{
  if(processing || !fs.existsSync(${JSON.stringify(inbox)})) return;
  processing=true;
  try { const event=JSON.parse(fs.readFileSync(${JSON.stringify(inbox)},"utf8"));
   const result=await candidateAsk.submit(event,{cfg,accountId:"default"});
   fs.writeFileSync(${JSON.stringify(outcome)},JSON.stringify(result));
  } catch(e) { fs.writeFileSync(${JSON.stringify(outcome)},JSON.stringify({error:String(e)})); }
 },200).unref();
}
`);
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), V_ASK_PROBE: probe };
env.TMPDIR = path.join(state, "tmp");
env.XDG_CACHE_HOME = path.join(state, "cache");
fs.mkdirSync(env.TMPDIR, { recursive: true });
fs.mkdirSync(env.XDG_CACHE_HOME, { recursive: true });
for (const line of fs.readFileSync("/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?(DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=3072", `${dist}/index.js`, "gateway", "--port", String(port)], { env: { ...env, NODE_OPTIONS: `--import ${hook}` }, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) s.on("data", b => { logs.push(b.toString()); if (logs.length > 300) logs.shift(); });
}
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
let ready = false;
startGateway();
try {
  for (let i = 0; i < 120 && !ready; i++) {
    if (gateway.exitCode !== null) {
      if (logs.join("").includes("Restart OpenClaw so state migrations run") && i < 100) startGateway();
      else throw new Error(`Gateway exited ${gateway.exitCode}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("hello timeout")), 3000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write", "operator.questions"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: e => { clearTimeout(timer); reject(e); } }); client.start();
      }); ready = true;
    } catch { client?.stop(); await sleep(1000); }
  }
  assert(ready, "candidate readiness failed");
  fs.writeFileSync(path.join(state,"ask-ready"),"ok");
  for(let i=0;i<100&&!fs.existsSync(path.join(state,"ask-dispatcher-ready"));i++){
    const error=path.join(state,"ask-dispatcher-error");
    assert(!fs.existsSync(error),fs.existsSync(error)?fs.readFileSync(error,"utf8"):"");
    await sleep(200);
  }
  assert(fs.existsSync(path.join(state,"ask-dispatcher-ready")),"actual dispatcher not ready");
  const sessionKey = `agent:makaron:feishu:group:${chat}`;
  let stdout = "", stderr = "";
  const agent = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", "deepseek/deepseek-v4-flash", "--message", prompt, "--json", "--timeout", "360"], { env, stdio: ["ignore", "pipe", "pipe"] });
  agent.stdout.on("data", b => stdout += b); agent.stderr.on("data", b => stderr += b);
  const completed = new Promise(resolve => agent.on("close", code => resolve(code)));
  const deadline = Date.now() + 240000;
  let delivery;
  while (Date.now() < deadline && !delivery && agent.exitCode === null) {
    if (fs.existsSync(probe)) delivery = fs.readFileSync(probe, "utf8").trim().split("\n").map(l => JSON.parse(l)).find(e => e.kind === "sent");
    if (!delivery) await sleep(1000);
  }
  assert(delivery?.messageId, `no real question card delivered: ${stdout.slice(-1000)} ${stderr.slice(-300)}`);
  const button = delivery.card.body.elements.filter(e => e.tag === "interactive_container")[1];
  assert(button?.behaviors?.[0]?.value?.q);
  const questionId = button.behaviors[0].value.q;
  // Human-originated CLI answer must arrive AFTER the actual question card.
  let answer;
  while (Date.now() < deadline && !answer) {
    // Bot can read an exact test message but cannot list all group messages.
    // lark-cli reads as the authorized user and passes only its sent message ID.
    const answerPath = path.join(state, "ask-answer-id.json");
    if (fs.existsSync(answerPath)) {
      const answerId = JSON.parse(fs.readFileSync(answerPath, "utf8")).messageId;
      assert(/^om_/.test(answerId));
      const messages = await feishu(`im/v1/messages/${answerId}`);
      answer = messages.items.find(m => m.chat_id === chat && m.msg_type === "text" && m.sender.sender_type === "user" && Number(m.create_time) > Number(input.create_time) && JSON.parse(m.body.content).text === "ASK_CANDIDATE_0929_ANSWER=2");
      assert(answer, "invalid CLI answer");
    }
    if (!answer) await sleep(2000);
  }
  assert(answer, "waiting for lark-cli test answer timed out");
  const callback = { operator: { open_id: answer.sender.id }, context: { open_message_id: delivery.messageId }, action: { tag: "button", name: button.name, value: button.behaviors[0].value } };
  fs.writeFileSync(inbox, JSON.stringify(callback), { mode: 0o600 });
  const exit = await completed;
  assert.equal(exit, 0, stderr.slice(-500));
  const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const reply = result.result?.payloads?.map(p => p.text ?? "").join("\n") ?? result.payloads?.map(p => p.text ?? "").join("\n");
  assert(reply?.includes("ASK_CANDIDATE_0929_DONE") && reply.includes("重画"), `unexpected final answer ${reply}`);
  const callbackResult = JSON.parse(fs.readFileSync(outcome, "utf8"));
  assert.equal(callbackResult.toast.type, "success");
  assert(delivery.inline, "question must reuse the existing streaming message");
  fs.writeFileSync(path.join(state,"ask-final.json"),JSON.stringify({text:reply}));
  const finalPath=path.join(state,"ask-final-outcome.json");
  for(let i=0;i<100&&!fs.existsSync(finalPath);i++)await sleep(200);
  assert(fs.existsSync(finalPath),"inline continuation timed out");
  const finalOutcome=JSON.parse(fs.readFileSync(finalPath,"utf8"));
  assert(!finalOutcome.error,JSON.stringify(finalOutcome));
  assert.equal(finalOutcome.messageId,delivery.messageId,"must keep the same message id");
  let received;
  for(let i=0;i<40;i++) {
    received=(await feishu(`im/v1/messages/mget?card_msg_content_type=raw_card_content&message_ids=${delivery.messageId}`)).items[0];
    if(received.body.content.includes("ASK_CANDIDATE_0929_DONE") && received.body.content.includes("已选择"))break;
    await sleep(500);
  }
  assert(received.body.content.includes("ASK_CANDIDATE_0929_DONE"), "final model output missing from original card");
  assert(received.body.content.includes("已选择"), "answer record missing from original card");
  const sent={message_id:delivery.messageId};
  console.log(JSON.stringify({ ok: true, sessionKey, inputMessageId: inputId, questionId, cardMessageId: delivery.messageId, answerMessageId: answer.message_id, finalMessageId: sent.message_id, reply, agentMeta: result.result?.meta?.agentMeta ?? result.meta?.agentMeta, callback: "injected into actual candidate handler from real Feishu text", sameMessageContinuation: true, actualReplyDispatcher: true, sharedChannelConsumerStarted: false }));
} catch (error) {
  console.error(logs.join("").slice(-14000).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/gi, "$1$2[redacted]"));
  throw error;
} finally {
  client?.stop(); gateway?.kill("SIGTERM"); await sleep(2000);
  if (gateway?.exitCode === null) gateway.kill("SIGKILL");
}
