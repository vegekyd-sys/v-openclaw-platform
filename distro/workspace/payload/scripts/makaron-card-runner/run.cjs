// Makaron Card Runner — outbound Channel SDK + card streaming
//
// Uses Lark Channel SDK's outbound sender and `channel.stream()` card mode for
// automatic throttled card updates. Inbound Feishu events are owned exclusively
// by the OpenClaw Gateway; task workers must never create a second WebSocket.
//
// This replaces the old manual REST-only approach that caused sessions
// to die when Feishu long connections timed out during long tasks.
//
// Quick Start:
//   const {connect, streamCard, submitChat, watchEvents,
//          eventText, eventVideo, eventIsDone, getRunOutput,
//          downloadAndSend, eventAsset, createAssetDeliveryTracker,
//          downloadAndSendAsset, normalizeMediaAssets, renderCard, esc, trim
//   } = require('./scripts/makaron-card-runner/run.cjs');
//
//   const {channel, chatId} = await connect('oc_xxx');
//   await streamCard(channel, chatId, {
//     title:'视频工作台', brief:'5s Kling · 1:1',
//     async producer(ctrl) {
//       ctrl.update({status:'提交中', progress:5});
//       const {runId, projectId, projectUrl} = await submitChat({imagePath, prompt});
//       ctrl.update({projectUrl, status:'已提交', progress:22});
//
//       for await (const ev of watchEvents(runId)) {
//         const text = eventText(ev);
//         if (text) ctrl.update({makaronSay: text, status:'Makaron 输出中'});
//         // ... V reads Makaron, decides dynamically
//       }
//
//       const out = await getRunOutput(runId);
//       if (out.videoUrl) {
//         await downloadAndSend(channel, chatId, out.videoUrl);
//         ctrl.update({status:'已发送', done:true, progress:100});
//       }
//     }
//   });
//
// ⛔ NEVER run watchEvents in the session that received the Feishu message.
//    Preferred path for deterministic Makaron tasks:
//      1) parent creates bootstrap card with createCard(...)
//      2) parent launches detached Node worker via launch-worker.cjs
//      3) worker updates the existing card and runs watchEvents
//    Use sessions_spawn only when the worker needs LLM reasoning, not for pure Node runners.

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT=require('./workspace-root.cjs');
const {assertMakaronCliRuntime}=require('./makaron-cli-runtime.cjs');

function resolveLarkSdk(){
  const direct=[
    process.env.OPENCLAW_LARK_SDK_PATH,
    '@@STATE_DIR@@/npm/node_modules/@larksuiteoapi/node-sdk/lib/index.js',
    // OpenClaw worker releases after 2026-09-09 ship the Feishu plugin as a
    // top-level `feishu/` directory rather than npm/projects/openclaw-feishu-*.
    '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu/node_modules/@larksuiteoapi/node-sdk/lib/index.js',
    process.env.OPENCLAW_STATE_DIR && path.join(process.env.OPENCLAW_STATE_DIR,'npm/node_modules/@larksuiteoapi/node-sdk/lib/index.js'),
    path.join(os.homedir(),'.openclaw/npm/node_modules/@larksuiteoapi/node-sdk/lib/index.js'),
  ].filter(Boolean);
  const roots=[
    '@@STATE_DIR@@/npm/projects',
    process.env.OPENCLAW_STATE_DIR && path.join(process.env.OPENCLAW_STATE_DIR,'npm/projects'),
    path.join(os.homedir(),'.openclaw/npm/projects'),
  ].filter(Boolean);
  const discovered=[];
  for(const root of [...new Set(roots)]){
    if(!fs.existsSync(root))continue;
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){
      if(!entry.isDirectory()||!entry.name.startsWith('openclaw-feishu-'))continue;
      const candidate=path.join(root,entry.name,'node_modules/@openclaw/feishu/node_modules/@larksuiteoapi/node-sdk/lib/index.js');
      if(fs.existsSync(candidate))discovered.push({path:candidate,mtimeMs:fs.statSync(candidate).mtimeMs});
    }
  }
  // Release layouts are versioned directories under /opt/openclaw-experiments.
  // Support both the legacy nested plugin layout and the current top-level
  // feishu layout so a Gateway/worker upgrade cannot strand Makaron cards.
  const experimentRoot='/opt/openclaw-experiments';
  if(fs.existsSync(experimentRoot)){
    for(const entry of fs.readdirSync(experimentRoot,{withFileTypes:true})){
      if(!entry.isDirectory())continue;
      for(const relative of [
        'feishu/node_modules/@larksuiteoapi/node-sdk/lib/index.js',
        'node_modules/@openclaw/feishu/node_modules/@larksuiteoapi/node-sdk/lib/index.js',
      ]){
        const candidate=path.join(experimentRoot,entry.name,relative);
        if(fs.existsSync(candidate))discovered.push({path:candidate,mtimeMs:fs.statSync(candidate).mtimeMs});
      }
    }
  }
  discovered.sort((a,b)=>b.mtimeMs-a.mtimeMs);
  for(const candidate of [...new Set([...direct,...discovered.map(x=>x.path)])]){
    if(!fs.existsSync(candidate))continue;
    try{
      const sdk=require(candidate);
      if(typeof sdk.createLarkChannel==='function'&&sdk.LoggerLevel&&sdk.Domain)return sdk;
    }catch{}
  }
  throw new Error('Unable to locate Feishu Lark SDK; set OPENCLAW_LARK_SDK_PATH or reinstall the OpenClaw Feishu plugin.');
}

const {createLarkChannel,LoggerLevel,Domain}=resolveLarkSdk();
const {assertMakaronWorker}=require('./worker-guard.cjs');
const activeTasks=require('./active-task-registry.cjs');
const deliveredMedia=require('./delivered-media-registry.cjs');

const PENDING_CARD_UPDATE_DIR=path.resolve(process.env.MAKARON_PENDING_CARD_UPDATES_DIR||path.join(ROOT,'tmp/makaron-card-pending-updates'));

function esc(s){return String(s||'').replace(/</g,'‹').replace(/>/g,'›');}

function resolveEnvReference(value){
  if(typeof value!=='string')return value;
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g,(_,name)=>process.env[name]||'');
}
function trim(s,n=1400){s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s;}
function now(){const d=new Date();return d.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function bar(p){const n=12;if(typeof p!=='number'||isNaN(p))p=0;const d=Math.max(0,Math.min(n,Math.round(p/100*n)));return '▰'.repeat(d)+'<font color="grey">'+'▱'.repeat(n-d)+'</font>';}

// ---- Card rendering ----

function renderCard(s){
  s=s||{};
  const projectUrl = s.projectUrl || '';
  const logs=(s.logs||[]).slice(-5).map(l=>`· <font color="grey">${l.t}</font> ${esc(l.text)}`).join('\n')||'· 等待事件';
  const say=trim(s.makaronSay||'等待 Makaron 输出。');
  const outs=(s.outputs||[]).slice(-5).map(o=>`· ${esc(o)}`).join('\n')||'· 暂无产物';
  const color=s.superseded?'grey':s.failed?'red':s.done?'green':s.status && s.status.includes('染')?'turquoise':'purple';
  const title=s.title||'Makaron 工作台';
  const subtitle=s.subtitle||'';
  const status=s.status||'处理中';
  const progress=s.progress!=null?s.progress:0;

  const els=[
    {tag:'div',text:{tag:'lark_md',text_size:'large',content:`**${esc(title)}**\n${subtitle?`<font color="grey">${esc(subtitle)}</font>`:''}`}},
    {tag:'hr'},
    {tag:'div',text:{tag:'lark_md',text_size:'large',content:`**状态：** <font color="${color}">${esc(status)}</font>\n${bar(progress)}  ${progress}%`}},
  ];

  if(s.brief) els.push({tag:'div',text:{tag:'lark_md',text_size:'large',content:`🎬 **任务方向**\n${esc(s.brief)}`}});
  if(s.superseded) els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:'🧹 **旧卡已关闭**\n这张卡已被新任务卡替代，后续请看最新卡片。'}});
  if(say) els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:`💬 **Makaron 说**\n${esc(say)}`}});
  if(outs!=='· 暂无产物'||(s.outputs||[]).length>0) els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:`📦 **产物区**\n${outs}`}});
  const usageLine=usageSummaryLine(s.usage);
  if(usageLine) els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:usageLine}});

  // Account/claim URLs must be native card actions, never raw text in an
  // output block. Long claim tokens can otherwise wrap, truncate, or become
  // non-clickable in Feishu clients.
  const accountLinks=(Array.isArray(s.accountLinks)?s.accountLinks:[])
    .map((link,i)=>({
      label:trim(link?.label||'',40),
      url:String(link?.url||'').trim(),
      id:trim(link?.id||`account_link_${i+1}`,20).replace(/[^a-zA-Z0-9_]/g,'_'),
      type:link?.type==='primary'?'primary':'default',
    }))
    .filter(link=>link.label&&/^https:\/\//i.test(link.url))
    .slice(0,2);
  if(accountLinks.length){
    els.push({tag:'hr'});
    els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:'🔐 **账号处理**\n请通过下方按钮完成绑定或充值，完成后可继续当前任务。'}});
    if(accountLinks.length===1){
      const link=accountLinks[0];
      els.push({tag:'button',element_id:link.id,text:{tag:'plain_text',content:link.label},type:link.type,width:'fill',behaviors:[{type:'open_url',default_url:link.url}]});
    }else{
      els.push({tag:'column_set',flex_mode:'bisect',background_style:'default',columns:accountLinks.map(link=>({tag:'column',width:'weighted',weight:1,elements:[{tag:'button',element_id:link.id,text:{tag:'plain_text',content:link.label},type:link.type,width:'fill',behaviors:[{type:'open_url',default_url:link.url}]}]}))});
    }
  }

  els.push({tag:'div',text:{tag:'lark_md',text_size:'normal',content:`🧭 **事件日志**\n${logs}`}});

  if (projectUrl) els.push({tag:'button',element_id:'open_project',text:{tag:'plain_text',content:'🔗 查看 Makaron 项目'},type:'primary',width:'fill',behaviors:[{type:'open_url',default_url:projectUrl}]});

  // Acceptance is terminal for this card's two action buttons. Re-rendering
  // after an accept must remove them immediately so a stale second click can
  // never be routed ambiguously.
  if(s.done && !s.failed && !s.superseded && !s.accepted){
    // OpenClaw dispatches callback `q` as a synthetic chat command. Include
    // this card's immutable message id so the Makaron agent can act on the
    // exact card without a channel-runtime patch or "latest card" guess.
    const actionCardId=String(s.cardId||s.messageId||'').trim();
    const acceptCommand=actionCardId?`makaron.action.accept:${actionCardId}`:'makaron.action.accept';
    const regenCommand=actionCardId?`makaron.action.regen:${actionCardId}`:'makaron.action.regen';
    els.push({tag:'hr'});
    els.push({tag:'div',text:{tag:'lark_md',text_size:'large',content:'✅ **产出完成，下一步：**'}});
    els.push({tag:'column_set',flex_mode:'bisect',background_style:'default',columns:[
      {tag:'column',width:'weighted',weight:1,elements:[{tag:'button',element_id:'accept_btn',text:{tag:'plain_text',content:'✅ 确认交付'},type:'primary_filled',width:'fill',behaviors:[{type:'callback',value:{oc:'ocf1',k:'quick',a:'makaron.card.accept',q:acceptCommand}}]}]},
      {tag:'column',width:'weighted',weight:1,elements:[{tag:'button',element_id:'regen_btn',text:{tag:'plain_text',content:'🔁 重新生成'},type:'default',width:'fill',behaviors:[{type:'callback',value:{oc:'ocf1',k:'quick',a:'makaron.card.regen',q:regenCommand}}]}]},
    ]});
  }

  return{schema:'2.0',config:{width_mode:'fill'},header:{title:{tag:'plain_text',content:title},template:color},body:{elements:els}};
}

function isRetryableCardUpdateError(e){
  const msg=String(e?.message||e||'').toLowerCase();
  const status=Number(e?.status||e?.statusCode||e?.code||e?.response?.status||0);
  return status===504 || status===429 || /\b504\b|gateway timeout|timeout|timed out|etimedout|econnreset|rate limit|too many requests|payload|too large|invalid card|content too long/.test(msg);
}

function cardUpdateErrorCode(e){
  const msg=String(e?.message||e||'');
  const status=Number(e?.status||e?.statusCode||e?.response?.status||0);
  if(status)return String(status);
  const m=msg.match(/\b(4\d\d|5\d\d)\b/);
  return m?m[1]:(e?.code?String(e.code):'unknown');
}

function compactCardStateForRetry(state={}, level=0){
  if(level<=0)return state;
  const maxSay=level>=2?420:900;
  const maxBrief=level>=2?360:700;
  return {
    ...state,
    brief: trim(state.brief||'', maxBrief),
    makaronSay: trim(state.makaronSay||'', maxSay),
    logs: (state.logs||[]).slice(level>=2?-1:-3).map(l=>({...l,text:trim(l.text||'', level>=2?120:220)})),
    outputs: (state.outputs||[]).slice(level>=2?-2:-4).map(o=>trim(o, level>=2?120:220)),
    // Keep one actionable account link even in degraded card retries; it is
    // the only path a blocked customer may have to recover the task.
    accountLinks: (state.accountLinks||[]).slice(0,1),
  };
}

function writePendingCardUpdate(record){
  try{
    fs.mkdirSync(PENDING_CARD_UPDATE_DIR,{recursive:true});
    const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
    const file=path.join(PENDING_CARD_UPDATE_DIR,`${day}.jsonl`);
    fs.appendFileSync(file,JSON.stringify({version:'makaron-card-pending-update-v1',at:new Date().toISOString(),...record})+'\n');
    return file;
  }catch(e){
    console.error('pending card update record failed:',e.message);
    return '';
  }
}

async function updateCardWithRetry(channel,messageId,state={},opts={}){
  // Different task surfaces (for example Scene) reuse the retry/transport
  // layer but own their visual language. Never silently fall back to Makaron's
  // renderer when a caller supplies its own renderer.
  const cardRenderer=typeof opts.renderCard==='function'?opts.renderCard:renderCard;
  const attempts=opts.attempts||[
    {delay:0,level:0},
    {delay:700,level:0},
    {delay:1800,level:1},
    {delay:4200,level:2},
  ];
  let lastErr=null;
  for(let i=0;i<attempts.length;i++){
    const a=attempts[i];
    if(a.delay)await new Promise(r=>setTimeout(r,a.delay));
    const compactState=compactCardStateForRetry(state,a.level||0);
    try{
      await channel.updateCard(messageId,cardRenderer(compactState));
      if(i>0)console.error(`card update recovered after retry ${i}: ${messageId}`);
      return {ok:true,attempt:i+1,degradedLevel:a.level||0};
    }catch(e){
      lastErr=e;
      console.error(`card update failed attempt ${i+1}/${attempts.length}: ${messageId}: ${e.message||e}`);
      if(!isRetryableCardUpdateError(e))break;
    }
  }
  const pendingPath=writePendingCardUpdate({
    chatId:opts.chatId||state.chatId||'',
    messageId,
    context:opts.context||'',
    error:{code:cardUpdateErrorCode(lastErr),message:String(lastErr?.message||lastErr||'').slice(0,2000)},
    state:compactCardStateForRetry(state,2),
  });
  return {ok:false,pendingPath,error:lastErr};
}

// ---- Outbound-only Channel ----

/**
 * Initialize a Lark Channel for outbound API calls only.
 *
 * Feishu WebSocket delivery is cluster-mode, not broadcast. A task worker that
 * opens another connection with the Gateway's App credentials can randomly
 * consume normal messages. `transport: 'webhook'` initializes identity and the
 * outbound sender without starting a WSClient.
 * Returns {channel, chatId, domain}.
 */
async function connect(chatId){
  const configPath=process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_CONFIG||path.join(process.env.OPENCLAW_STATE_DIR||path.join(os.homedir(),'.openclaw'),'openclaw.json');
  const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const feishu=cfg.channels?.feishu||{},account=feishu.accounts?.default||feishu;
  const domain=(account.domain||feishu.domain||'feishu')==='lark'?Domain.Lark:Domain.Feishu;

  const channel=createLarkChannel({
    appId:resolveEnvReference(account.appId||feishu.appId),
    appSecret:resolveEnvReference(account.appSecret||feishu.appSecret),
    domain,
    transport:'webhook',
    loggerLevel:LoggerLevel.warn,
    policy:{requireMention:false,dmMode:'open'},
  });

  await channel.connect();
  if(channel.rawWsClient){
    await channel.disconnect().catch(()=>{});
    throw new Error('Makaron worker must not create a Feishu WebSocket; Gateway owns inbound events');
  }

  return {channel,chatId,domain};
}

/**
 * Dispose outbound Channel resources after one-shot scripts complete.
 */
async function disconnect(channel){
  try{await channel.disconnect();}catch(e){console.error('disconnect failed:',e.message);}
}

async function disconnectWithTimeout(channel, timeoutMs=3000){
  try{
    await Promise.race([
      channel.disconnect(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('disconnect timeout')),timeoutMs)),
    ]);
  }catch(e){
    console.error('disconnect failed:',e.message);
  }
}

/**
 * Auto-connect + auto-disconnect wrapper for one-shot card runner scripts.
 * Usage: await withChannel('oc_xxx', async ({channel, chatId}) => { ... });
 */
async function withChannel(chatId, fn){
  const {channel}=await connect(chatId);
  try{return await fn({channel,chatId});}finally{await disconnect(channel);}
}

// ---- Card streaming (replaces manual createCard + updateCard loop) ----

/**
 * Stream a Makaron task card via Channel SDK's card streaming.
 *
 * - Creates one card via channel.stream() and updates it in-place
 * - SDK handles throttling, queueing, retries, error fallbacks
 * - producer receives a `ctrl` with:
 *     ctrl.update(state)   — merge state into card, schedule patch
 *     ctrl.log(text)        — append to event log
 *     ctrl.output(text)     — append to outputs
 *     ctrl.messageId        — the card's message_id (set after initial send)
 *
 * @param {Object} channel - connected LarkChannel
 * @param {string} chatId
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {string} opts.brief
 * @param {string} opts.status
 * @param {Function} opts.producer - async (ctrl) => void
 * @param {Function} [opts.onCardAction] - deprecated; Gateway owns card callbacks
 * @param {number} [opts.keepAliveMs] - optional post-producer delay; defaults to 0
 */
async function streamCard(channel, chatId, opts={}){
  assertMakaronWorker('streamCard() realtime Makaron task card');
  let cardState={
    title:opts.title||'Makaron 任务',
    subtitle:opts.subtitle||'',
    status:opts.status||'初始化',
    brief:opts.brief||'',
    makaronSay:'',
    projectUrl:'',
    logs:[],
    outputs:[],
    progress:0,
    done:false,
    failed:false,
  };

  const makeCard=()=>renderCard(cardState);
  let streamCtrl=null;
  let streamMessageId=null;
  let registeredCard=false;

  const patch=async(s={})=>{
    // Protect projectUrl — never allow it to be cleared once set
    if ('projectUrl' in s && !s.projectUrl) delete s.projectUrl;
    Object.assign(cardState,s||{});
    const rendered=makeCard();
    if(streamCtrl?.update){
      try{streamCtrl.update(rendered);return;}catch(e){console.error('stream update failed:',e.message);}
    }
    if(streamMessageId){
      const r=await updateCardWithRetry(channel,streamMessageId,cardState,{chatId,context:'streamCard.patch'});
      if(!r.ok)console.error('card update failed; pending record written:',r.pendingPath||r.error?.message||r.error);
    }
  };

  const ctrlForUser=()=>({
    update:patch,
    log(text){cardState.logs.push({t:now(),text});return patch({});},
    output(text){cardState.outputs.push(text);return patch({});},
    getState(){return {...cardState};},
    get messageId(){return streamMessageId;},
  });

  // Card callbacks are handled by the Gateway's single Feishu connection.
  // Keeping a worker-side listener would reintroduce random message loss.
  if(opts.onCardAction)console.error('worker onCardAction ignored: Gateway owns Feishu callbacks');

  try{
    const sendOptions = opts.sendOptions || (opts.replyTo ? {replyTo: opts.replyTo} : undefined);
    await channel.stream(chatId, {
      card: {
        initial: makeCard(),
        producer: async (ctrl)=>{
          streamCtrl=ctrl;
          streamMessageId=ctrl.messageId||streamMessageId;
          if(streamMessageId&&!registeredCard){
            registeredCard=true;
            cardState.cardId=cardState.cardId||streamMessageId;
            cardState.messageId=cardState.messageId||streamMessageId;
            try{activeTasks.upsertActiveTask(chatId,{...cardState,messageId:streamMessageId,source:'streamCard'});}catch(e){console.error('active task registry write failed:',e.message);}
          }
          await opts.producer(ctrlForUser());
        },
      }
    }, sendOptions);
  }finally{
    const keepAliveMs = Number(opts.keepAliveMs ?? 0);
    if(keepAliveMs>0){
      await new Promise(r=>setTimeout(r,keepAliveMs));
    }
    // Dispose promptly so the process exits. Never wait forever here.
    await disconnectWithTimeout(channel, Number(opts.disconnectTimeoutMs ?? 3000));
    if(process.env.MAKARON_WORKER==='1' && opts.autoExit!==false){
      setTimeout(()=>process.exit(0),100).unref?.();
    }
  }
}

// ---- Makaron primitives ----

async function runShell(cmd,args,opts={}){
  return new Promise(resolve=>{
    let settled=false;
    const finish=result=>{
      if(settled)return;
      settled=true;
      resolve(result);
    };
    const p=spawn(cmd,args,{...opts,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    p.stdout.on('data',d=>stdout+=d.toString());
    p.stderr.on('data',d=>stderr+=d.toString());
    p.on('error',error=>finish({code:127,signal:null,stdout,stderr:stderr||error.message,error}));
    p.on('close',(code,signal)=>finish({code,signal,stdout,stderr}));
  });
}

function larkCliNetworkFailure(result){
  if(!result || result.code===0)return false;
  const text=`${result.stderr||''}\n${result.stdout||''}`.toLowerCase();
  return [
    'use of closed network connection',
    'socket hang up',
    'connection reset',
    'econnreset',
    'tls handshake timeout',
    'i/o timeout',
    'context deadline exceeded',
    'http 502',
    'http 503',
    'http 504',
    '"retryable": true',
  ].some(marker=>text.includes(marker));
}

async function runLarkCliWithNetworkRetry(args,opts={}){
  const {retryDelaysMs=[1000,2500,5000],...spawnOpts}=opts;
  const delays=retryDelaysMs;
  let result;
  for(let attempt=0;attempt<=delays.length;attempt++){
    result=await runShell('lark-cli',args,spawnOpts);
    if(result.code===0 || !larkCliNetworkFailure(result) || attempt===delays.length)return result;
    const delay=delays[attempt];
    console.error(`[lark-cli] transient network failure; retry ${attempt+1}/${delays.length} in ${delay}ms`);
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  return result;
}

/**
 * Normalize Makaron input materials into an ordered v1.3 media bundle.
 *
 * Backward compatible inputs:
 *   - imagePath / videoPath (single-material callers)
 *   - imagePaths / videoPaths (old job schema)
 * Preferred v1.3 input:
 *   - mediaAssets: [{type:'image'|'video'|'audio', path, role?, label?, sourceMessageId?, order?}]
 */
function normalizeMediaAssets(input={}){
  const out=[];
  const seen=new Set();
  const add=(asset, fallbackType, fallbackOrder)=>{
    if(!asset)return;
    const pathValue=typeof asset==='string' ? asset : (asset.path||asset.filePath||asset.localPath||asset.source||'');
    const type=String((typeof asset==='string' ? fallbackType : (asset.type||fallbackType||''))||'').toLowerCase();
    if(!pathValue || !['image','video','audio'].includes(type))return;
    const key=`${type}:${pathValue}`;
    if(seen.has(key))return;
    seen.add(key);
    out.push({
      type,
      path:pathValue,
      role: typeof asset==='string' ? '' : (asset.role||''),
      label: typeof asset==='string' ? '' : (asset.label||''),
      sourceMessageId: typeof asset==='string' ? '' : (asset.sourceMessageId||asset.messageId||''),
      order: Number.isFinite(Number(typeof asset==='string' ? fallbackOrder : asset.order)) ? Number(typeof asset==='string' ? fallbackOrder : asset.order) : fallbackOrder,
    });
  };

  const mediaAssets=Array.isArray(input.mediaAssets) ? input.mediaAssets : [];
  if(mediaAssets.length){
    mediaAssets.forEach((asset,i)=>add(asset, null, i+1));
    return out.sort((a,b)=>(a.order||0)-(b.order||0));
  }

  let order=1;
  const imageList=[...(input.imagePath?[input.imagePath]:[]), ...(Array.isArray(input.imagePaths)?input.imagePaths:[])];
  const videoList=[...(input.videoPath?[input.videoPath]:[]), ...(Array.isArray(input.videoPaths)?input.videoPaths:[])];
  const audioList=[...(input.audioPath?[input.audioPath]:[]), ...(Array.isArray(input.audioPaths)?input.audioPaths:[])];
  for(const p of imageList)add(p,'image',order++);
  for(const p of videoList)add(p,'video',order++);
  for(const p of audioList)add(p,'audio',order++);
  return out;
}

function buildMakaronChatArgs({imagePath, imagePaths, videoPath, videoPaths, audioPath, audioPaths, mediaAssets, mediaManifest, prompt, projectId, skill, agentModel}={}){
  const args=['chat','--json'];
  if(projectId&&projectId!=='auto'){args.push('--project',projectId);}else{args.push('--project','auto');}
  if(mediaManifest) args.push('--media-manifest', mediaManifest);
  const assets=normalizeMediaAssets({imagePath,imagePaths,videoPath,videoPaths,audioPath,audioPaths,mediaAssets});
  for(const asset of assets){
    const flag=asset.type==='video'?'--video':asset.type==='audio'?'--audio':'--image';
    args.push(flag, asset.path);
  }
  if(skill&&skill.length) args.push('--skill',skill);
  if(agentModel&&agentModel.length) args.push('--agent-model',agentModel);
  args.push('-b',prompt||'');
  return args;
}

/**
 * Submit a Makaron chat prompt and return {runId, projectId, projectUrl}.
 */
async function submitChat({imagePath, imagePaths, videoPath, videoPaths, audioPath, audioPaths, mediaAssets, mediaManifest, prompt, projectId, skill, agentModel}){
  const {prepareImageInputs}=require('./image-input-preflight.cjs');
  const prepared=await prepareImageInputs(normalizeMediaAssets({imagePath,imagePaths,videoPath,videoPaths,audioPath,audioPaths,mediaAssets}));
  const args=buildMakaronChatArgs({mediaAssets:prepared,mediaManifest,prompt,projectId,skill,agentModel});
  const res=await runShell(assertMakaronCliRuntime(),args,{cwd:ROOT,env:process.env});
  if(res.code!==0) throw new Error(`makaron chat failed: ${res.stderr||res.stdout}`);
  const firstJson=res.stdout.split('\n').find(l=>l.trim().startsWith('{'))||res.stdout.trim();
  return JSON.parse(firstJson);
}

/**
 * Async generator over `responses watch --jsonl` events.
 */
async function* watchEvents(runId){
  assertMakaronWorker(`responses watch ${runId}`);
  const watcher=spawn(assertMakaronCliRuntime(),['responses','watch',runId,'--jsonl'],{
    cwd:ROOT,
    env:process.env,
    stdio:['ignore','pipe','pipe']
  });

  let buf='';
  let resolveNext=null;
  let lines=[];

  watcher.stdout.on('data',d=>{
    buf+=d.toString();
    let idx;
    while((idx=buf.indexOf('\n'))>=0){
      const line=buf.slice(0,idx);
      buf=buf.slice(idx+1);
      lines.push(line);
      if(resolveNext){const r=resolveNext;resolveNext=null;r();}
    }
  });

  let closed=false;
  watcher.on('close',()=>{closed=true;if(resolveNext){const r=resolveNext;resolveNext=null;r();}});

  try{
    while(true){
      while(lines.length>0){
        const line=lines.shift();
        if(!line.trim().startsWith('{'))continue;
        try{const ev=JSON.parse(line);yield ev;}catch{}
      }
      if(closed)break;
      await new Promise(r=>{resolveNext=r;});
    }
  }finally{
    // If the consumer exits early or the worker is interrupted, do not leave
    // `makaron-cli responses watch` running in the background.
    if(!closed && !watcher.killed){
      try{watcher.kill('SIGTERM');}catch{}
      setTimeout(()=>{try{if(!watcher.killed)watcher.kill('SIGKILL');}catch{}},1500).unref?.();
    }
  }
}

function eventText(ev){
  const item=ev.item||ev.data?.item||{};
  return ev.data?.text||ev.text||item.content||'';
}

function eventVideo(ev){
  const item=ev.item||ev.data?.item||{};
  if(item.type==='video') return {status:item.status,url:item.url||item.videoUrl||null};
  return null;
}

function itemUrl(item){
  return item?.url||item?.imageUrl||item?.videoUrl||item?.audioUrl||item?.musicUrl||item?.fileUrl||item?.downloadUrl||null;
}

/**
 * Extract any non-text Makaron deliverable from a watch event.
 *
 * Makaron `responses watch --jsonl` emits text as `type:text` and generated
 * media as `output.added` / `output.updated` items, e.g.:
 *   {event:'output.added', item:{type:'image', status:'completed', url:'...'}}
 *   {event:'output.updated', item:{type:'video', status:'completed', url:'...'}}
 *
 * User-facing rule: text stays in the card; every non-text item with a URL is
 * eligible for attachment delivery. This helper deliberately returns only the
 * normalized asset metadata; delivery/dedupe stays in createAssetDeliveryTracker.
 */
function eventAsset(ev){
  const item=ev?.item||ev?.data?.item||ev?.output||{};
  const type=String(item.type||'').toLowerCase();
  if(!type||type==='text')return null;
  if(!['image','video','design','music','audio','file'].includes(type))return null;
  const url=itemUrl(item);
  return {
    id:item.id||item.output_id||item.snapshot_id||'',
    type,
    status:item.status||ev?.status||'',
    url,
    snapshotId:item.snapshot_id||item.snapshotId||'',
    createdAt:item.created_at||item.createdAt||'',
    raw:item,
  };
}

function eventIsDone(ev){
  return ev.type==='done'||ev.event==='done'||ev.status==='completed';
}

// Some Suno runs report the generated takes only as tool-result rows in text.
// Recover the default take, not arbitrary links or the alternate take.
function recoverSunoDefaultTake(text, projectId){
  if(!projectId)return null;
  let inAudioResult=false;
  for(const line of String(text||'').split(/\r?\n/)){
    if(line.trim()==='🎵 Audio generated'){
      inAudioResult=true;
      continue;
    }
    if(!inAudioResult)continue;
    if(!line.startsWith('music:')){
      inAudioResult=false;
      continue;
    }
    const [take,,,tags,url,duplicateUrl]=line.split('|');
    const labels=tags?.split(',')||[];
    if(take!=='music:0'||!labels.includes('suno-v6')||!labels.includes('take:1/2')||!url||url!==duplicateUrl)continue;
    let parsed;
    try{parsed=new URL(url);}catch{continue;}
    const parts=parsed.pathname.split('/');
    if(parsed.origin!=='https://cdn.makaron.app'||parsed.username||parsed.password||
        !parsed.pathname.startsWith('/storage/v1/object/public/images/')||
        parts.length!==10||!parts[6]||parts[7]!==projectId||parts[8]!=='audio'||!/^[a-f0-9]+-0\.mp3$/i.test(parts[9]))continue;
    return {type:'music',url:parsed.href,status:'completed'};
  }
  return null;
}

// Credit usage is the customer-visible cost signal for a Makaron run. CLI 0.15.0
// reports it per run; keep the parse defensive so an older CLI or a run without
// usage simply renders nothing instead of breaking the card.
function normalizeRunUsage(usage){
  if(!usage||typeof usage!=='object')return null;
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const creditsNet=num(usage.credits_net ?? usage.creditsNet);
  const creditsCharged=num(usage.credits_charged ?? usage.creditsCharged);
  const creditsRefunded=num(usage.credits_refunded ?? usage.creditsRefunded);
  const entries=Array.isArray(usage.entries)?usage.entries.map(entry=>({
    // Accept both the raw CLI field name and this normalizer's own output so
    // re-normalizing an already-normalized usage is idempotent.
    tool:String(entry?.tool_name ?? entry?.toolName ?? entry?.tool ?? ''),
    model:entry?.model?String(entry.model):'',
    calls:num(entry?.calls),
    credits:num(entry?.credits),
    inputTokens:num(entry?.input_tokens ?? entry?.inputTokens),
    outputTokens:num(entry?.output_tokens ?? entry?.outputTokens),
  })).filter(entry=>entry.tool||entry.credits):[];
  if(!creditsCharged&&!creditsNet&&!entries.length&&!usage.balance)return null;
  return {
    creditsCharged, creditsRefunded, creditsNet, entries,
    inputTokens:num(usage.input_tokens ?? usage.inputTokens),
    outputTokens:num(usage.output_tokens ?? usage.outputTokens),
    balance:usage.balance!=null?num(usage.balance):null,
  };
}

// The card shows only the task total; per-tool breakdown stays in the parsed
// usage data so V can answer "这次花在哪了" on request, but it is not rendered.
// A customer-facing card should not carry an internal cost ledger.
function usageSummaryLine(usage){
  const u=normalizeRunUsage(usage);
  if(!u)return '';
  const net=Number.isInteger(u.creditsNet)?u.creditsNet:Number(u.creditsNet.toFixed(2));
  return `💳 **本轮消耗：${net} credits**${u.balance!=null?`｜余额 ${u.balance}`:''}`;
}

/**
 * Recover output from a completed run.
 */
async function getRunOutput(runId){
  const res=await runShell(assertMakaronCliRuntime(),['responses','get',runId,'--json'],{cwd:ROOT,env:process.env});
  if(res.code!==0)return null;
  const j=JSON.parse(res.stdout);
  const outputs=j.output||[];
  const videoOutputs=outputs.filter(o=>o.type==='video');
  const designOutputs=outputs.filter(o=>['design','composition'].includes(String(o.type||'').toLowerCase()));
  const resultVideos=j.result?.videos||[];
  const resultDesigns=j.result?.designs||[];
  return {
    text:trim(j.result?.text||'',5000),
    usage:normalizeRunUsage(j.usage),
    videoUrl:resultVideos[0]?.videoUrl||videoOutputs.find(o=>o.url)?.url||null,
    imageUrls:(j.result?.images||[]).map(i=>i.imageUrl).filter(Boolean),
    completionActions:[
      ...outputs.flatMap(o=>o.completion_actions||o.completionActions||[]),
      ...resultVideos.flatMap(v=>v.completionActions||v.completion_actions||[]),
    ],
    videos:[...resultVideos,...videoOutputs],
    designs:[...resultDesigns,...designOutputs],
    needsMaterialize:!resultVideos.length && !videoOutputs.some(o=>o.url) && designOutputs.length>0,
    raw:j,
  };
}

/**
 * Create a stable cover image for a local video.
 * Feishu native media messages render much better when sent as video+cover.
 */
async function makeVideoCover(videoPath, coverPath){
  const res=await runShell('ffmpeg',['-y','-ss','0.2','-i',videoPath,'-frames:v','1','-vf','scale=720:-1',coverPath]);
  if(res.code!==0)throw new Error(`ffmpeg cover failed: ${res.stderr||res.stdout}`);
  return coverPath;
}

function larkLocal(file){
  const abs=path.resolve(file);
  return {abs,cwd:path.dirname(abs),rel:`./${path.basename(abs)}`};
}

function larkSendTargetArgs(target){
  const value=String(target||'').trim();
  const normalized=value.replace(/^(chat|user):/, '');
  if(normalized.startsWith('ou_'))return ['--user-id', normalized];
  if(normalized.startsWith('oc_'))return ['--chat-id', normalized];
  // Keep backward compatibility for callers that pass a bare chat id or
  // platform-specific chat id. Feishu groups are normally oc_xxx, while DMs
  // must use --user-id ou_xxx so video+cover delivery does not fall back to a
  // coverless Channel SDK video.
  return ['--chat-id', normalized];
}

function extForAsset(asset, url){
  try{
    const ext=path.extname(new URL(url).pathname).toLowerCase();
    if(ext&&ext.length<=8)return ext;
  }catch{}
  const t=asset?.type;
  if(t==='video')return '.mp4';
  if(t==='music'||t==='audio')return '.mp3';
  if(t==='file')return '.bin';
  return '.jpg';
}

async function downloadUrl(url, outDir='output', outPrefix='makaron-asset', ext='.bin'){
  const outAbs=path.resolve(outDir);
  fs.mkdirSync(outAbs,{recursive:true});
  const safePrefix=String(outPrefix||'makaron-asset').replace(/[^a-z0-9._-]+/gi,'-').slice(0,80)||'makaron-asset';
  const out=path.join(outAbs,`${safePrefix}-${Date.now()}${ext||'.bin'}`);
  const res=await runShell('bash',['-lc',`curl -L --fail --retry 3 -o ${JSON.stringify(out)} ${JSON.stringify(url)}`]);
  if(res.code!==0)throw new Error(`download failed: ${res.stderr||res.stdout}`);
  return out;
}

function assetZh(type){
  return ({image:'图片',video:'视频',design:'设计图',music:'音乐',audio:'音频',file:'文件'})[type]||'素材';
}

function assetIcon(type){
  return ({image:'🖼️',video:'🎬',design:'🎨',music:'🎵',audio:'🔊',file:'📎'})[type]||'📎';
}

function outboundMessageId(value, depth=0){
  if(!value || depth>7) return '';
  if(typeof value==='string') return /^om_[A-Za-z0-9_]+$/.test(value) ? value : '';
  if(Array.isArray(value)){
    for(const item of value){ const id=outboundMessageId(item,depth+1); if(id)return id; }
    return '';
  }
  if(typeof value!=='object') return '';
  for(const key of ['messageId','message_id','openMessageId','open_message_id']){
    const id=outboundMessageId(value[key],depth+1); if(id)return id;
  }
  for(const key of ['data','message','sent','result','body','response']){
    const id=outboundMessageId(value[key],depth+1); if(id)return id;
  }
  return '';
}

async function sendLocalAssetViaLarkCli({chatId, assetType, filePath, replyTo, idempotencyKey}){
  const local=larkLocal(filePath);
  const flag=(assetType==='image'||assetType==='design')?'--image':(assetType==='audio'?'--audio':'--file');
  const args=replyTo
    ? ['im','+messages-reply','--message-id',replyTo,flag,local.rel,'--as','bot','--json']
    : ['im','+messages-send',...larkSendTargetArgs(chatId),flag,local.rel,'--as','bot','--json'];
  if(idempotencyKey)args.push('--idempotency-key',idempotencyKey);
  const res=await runLarkCliWithNetworkRetry(args,{cwd:local.cwd,env:process.env});
  if(res.code!==0)throw new Error(`lark-cli asset send failed: ${res.stderr||res.stdout}`);
  let raw;
  try{raw=JSON.parse(res.stdout);}catch{raw={ok:true,raw:res.stdout};}
  return {raw,messageId:outboundMessageId(raw)};
}

/**
 * Download and send a normalized Makaron asset as a Feishu attachment/media.
 * Videos use the existing video+cover path. Images/designs are sent as native
 * images unless they exceed the inline limit. Oversized images and
 * music/audio/files are sent as attachments so the group receives the
 * actual intermediate deliverable, not just a card note.
 */
async function downloadAndSendAsset(channel, chatId, asset, outDir='output', outPrefix='makaron-asset', sendOptions){
  if(!asset?.url)throw new Error('asset has no url');
  const replyTo=sendOptions?.replyTo||sendOptions?.reply_to;
  const hash=crypto.createHash('sha1').update(`${chatId}\n${replyTo||''}\n${asset.type}\n${asset.url}`).digest('hex').slice(0,32);
  const idempotencyKey=`makaron-asset-${hash}`;
  if(asset.type==='video'){
    return await downloadAndSend(channel,chatId,asset.url,outDir,outPrefix,{...(sendOptions||{}),returnDetails:true});
  }
  const out=await downloadUrl(asset.url,outDir,outPrefix,extForAsset(asset,asset.url));
  if(typeof sendOptions?.hashGuard==='function'&&sendOptions.hashGuard(out)){
    try{fs.unlinkSync(out);}catch{}
    return {duplicate:true,localPath:out,transport:'content-dedupe'};
  }
  const isImage=asset.type==='image'||asset.type==='design';
  const oversizedImage=isImage&&fs.statSync(out).size>5_000_000;
  let sent,transport='lark-cli';
  try{
    if(oversizedImage){
      transport='lark-cli-image-file';
      sent=await sendLocalAssetViaLarkCli({
        chatId,assetType:'file',filePath:out,replyTo,idempotencyKey:`makaron-file-${hash}`,
      });
    }else{
      try{
        sent=await sendLocalAssetViaLarkCli({chatId,assetType:asset.type,filePath:out,replyTo,idempotencyKey});
      }catch(e){
        if(!isImage)throw e;
        console.error('[downloadAndSendAsset] lark-cli image send failed, falling back to Channel SDK image:',e.message);
        sent={raw:await channel.send(chatId,{image:{source:out}}, sendOptions)};
        sent.messageId=outboundMessageId(sent.raw);
        transport='channel-sdk';
      }
    }
  }catch(e){
    if(!isImage)throw e;
    throw Object.assign(new Error('图片已生成，但飞书发送失败。可从原 Makaron 项目取图，无需重新生成。',{cause:e}),{
      code:'MAKARON_IMAGE_DELIVERY_FAILED',
    });
  }
  return {localPath:out,messageId:sent?.messageId||outboundMessageId(sent?.raw),transport,raw:sent?.raw||sent};
}

function hashFileSha256(filePath){
  try{return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');}catch{return '';}
}

/**
 * Build a per-task attachment delivery helper for watch-event loops.
 *
 * Usage:
 *   const deliverAsset = createAssetDeliveryTracker({channel, chatId, ctrl});
 *   for await (const ev of watchEvents(runId)) {
 *     const asset = eventAsset(ev);
 *     if (asset?.url) await deliverAsset(asset); // deduped
 *   }
 */
function createAssetDeliveryTracker({channel,chatId,ctrl,outDir='output',outPrefix='makaron-asset',sendOptions,deliveryContext,contentHashes}={}){
  const delivered=new Set();
  // Content-level de-duplication ledger.
  // The same rendered artifact can be exposed under TWO different URLs (the
  // provider direct link, e.g. files.evolink.ai, and the Makaron CDN mirror,
  // e.g. cdn.makaron.app) and TWO different synthetic ids (`<runId>:video`
  // from the stream event vs `<runId>:recovered-video` from run-output
  // recovery). URL/id based dedupe misses that, so the identical bytes were
  // delivered twice. Hashing the downloaded file and suppressing an
  // already-seen digest fixes it while still allowing genuinely different
  // assets through.
  const hashLedger=contentHashes instanceof Set ? contentHashes : new Set();
  const idKeyOf=(assetOrUrl)=>{
    if(typeof assetOrUrl==='string')return '';
    const a=assetOrUrl||{};
    return a.id ? `${a.type||'asset'}:${a.id}` : '';
  };
  const keyOf=(assetOrUrl)=>{
    if(typeof assetOrUrl==='string')return assetOrUrl;
    const a=assetOrUrl||{};
    return a.url||`${a.type||'asset'}:${a.id||''}:${a.status||''}`;
  };
  const deliver=async(assetOrEvent)=>{
    const asset=assetOrEvent?.url?assetOrEvent:eventAsset(assetOrEvent);
    if(!asset)return null;
    const key=keyOf(asset);
    const idKey=idKeyOf(asset);
    if(!asset.url)return {...asset,delivered:false};
    if(delivered.has(key)||delivered.has(asset.url)||(idKey&&delivered.has(idKey)))return {...asset,delivered:true,duplicate:true};
    delivered.add(key); delivered.add(asset.url); if(idKey)delivered.add(idKey);
    const label=`${assetIcon(asset.type)} ${assetZh(asset.type)}`;
    const hashGuard=(filePath)=>{
      const digest=hashFileSha256(filePath);
      if(!digest)return false;
      if(hashLedger.has(digest))return true;
      hashLedger.add(digest);
      return false;
    };
    const delivery=await downloadAndSendAsset(channel,chatId,asset,outDir,`${outPrefix}-${asset.type}`,{...(sendOptions||{}),hashGuard});
    if(delivery&&delivery.duplicate){
      ctrl?.log?.('检测到与已发送内容完全相同的产物（同一成片的不同链接/镜像），已跳过重复发送');
      return {...asset,delivered:false,duplicate:true};
    }
    ctrl?.log?.(`${label}已生成，发送附件`);
    const localPath=typeof delivery==='string' ? delivery : delivery?.localPath||'';
    const state=ctrl?.getState?.()||{};
    const context=typeof deliveryContext==='function' ? (deliveryContext(asset)||{}) : (deliveryContext||{});
    const messageId=typeof delivery==='string' ? '' : delivery?.messageId||'';
    if(messageId){
      try{
        deliveredMedia.recordDelivery({
          messageId,chatId,cardId:context.cardId||ctrl?.messageId||state.cardId||state.messageId||'',
          projectId:context.projectId||state.projectId||'',projectUrl:context.projectUrl||state.projectUrl||'',runId:context.runId||'',
          asset:{...asset,localPath},delivery:{transport:delivery?.transport||'',replyTo:sendOptions?.replyTo||sendOptions?.reply_to||''},
        });
      }catch(e){console.error('[delivered-media] registry write failed:',e.message);}
    }else{
      console.error('[delivered-media] outbound asset sent without messageId; reply routing will be unavailable for this asset');
    }
    ctrl?.output?.(delivery?.transport==='lark-cli-image-file' ? `${label}原图已作为文件发送到群` : `${label}已发送到群`);
    return {...asset,delivered:true,localPath,messageId};
  };
  deliver.wasDelivered=(assetOrUrl)=>delivered.has(keyOf(assetOrUrl))||delivered.has(assetOrUrl?.url||'')||Boolean(idKeyOf(assetOrUrl)&&delivered.has(idKeyOf(assetOrUrl)));
  deliver.markDelivered=(assetOrUrl)=>{const k=keyOf(assetOrUrl);const ik=idKeyOf(assetOrUrl);delivered.add(k);if(ik)delivered.add(ik);if(assetOrUrl?.url)delivered.add(assetOrUrl.url);};
  deliver.delivered=delivered;
  deliver.contentHashes=hashLedger;
  return deliver;
}

function extractDriveUploadToken(uploadResult){
  const candidates=[
    uploadResult?.file_token,
    uploadResult?.fileToken,
    uploadResult?.token,
    uploadResult?.data?.file_token,
    uploadResult?.data?.fileToken,
    uploadResult?.data?.token,
    uploadResult?.file?.token,
    uploadResult?.file?.file_token,
  ].filter(Boolean);
  return candidates[0]||'';
}

async function uploadLocalFileToDriveViaLarkCli({filePath,name}){
  const local=larkLocal(filePath);
  const args=['drive','+upload','--file',local.rel,'--as','bot','--json'];
  if(name)args.push('--name',name);
  const res=await runLarkCliWithNetworkRetry(args,{cwd:local.cwd,env:process.env});
  if(res.code!==0)throw new Error(`lark-cli drive upload failed: ${res.stderr||res.stdout}`);
  try{return JSON.parse(res.stdout);}catch{return {ok:true,raw:res.stdout};}
}

async function sendDriveFileFallbackViaLarkCli({chatId,filePath,replyTo,idempotencyKey}){
  const uploaded=await uploadLocalFileToDriveViaLarkCli({filePath,name:path.basename(filePath)});
  const token=extractDriveUploadToken(uploaded);
  if(!token)throw new Error(`drive upload succeeded but file token missing: ${JSON.stringify(uploaded).slice(0,500)}`);
  // A Drive file token (e.g. AbCd...nXy) is not an IM file_key
  // (file_xxx). Passing it to --file makes lark-cli interpret the token as a
  // local path and fail with ENOENT. Large files already exceeded the IM
  // upload limit, so the correct fallback is to send the accessible Drive
  // link instead of trying to upload the same bytes to IM again.
  const driveOrigin=String(process.env.LARK_DRIVE_ORIGIN||process.env.FEISHU_DRIVE_ORIGIN||'https://www.feishu.cn').replace(/\/+$/,'');
  const driveUrl=`${driveOrigin}/file/${encodeURIComponent(token)}?from=from_copylink`;
  const markdown=`📥 **${path.basename(filePath)}**\n[打开飞书云空间文件](${driveUrl})`;
  const args=replyTo
    ? ['im','+messages-reply','--message-id',replyTo,'--markdown',markdown,'--as','bot','--json']
    : ['im','+messages-send',...larkSendTargetArgs(chatId),'--markdown',markdown,'--as','bot','--json'];
  if(idempotencyKey){
    const rawKey=`${idempotencyKey}-drive`;
    const driveKey=rawKey.length<=50
      ? rawKey
      : `makaron-drive-${crypto.createHash('sha1').update(rawKey).digest('hex').slice(0,32)}`;
    args.push('--idempotency-key',driveKey);
  }
  const res=await runLarkCliWithNetworkRetry(args,{env:process.env});
  if(res.code!==0)throw new Error(`lark-cli drive link send failed: ${res.stderr||res.stdout}`);
  let sent;
  try{sent=JSON.parse(res.stdout);}catch{sent={ok:true,raw:res.stdout};}
  return {uploaded,sent,messageId:outboundMessageId(sent),driveFallback:true,driveUrl};
}

/**
 * Send local video with cover through lark-cli.
 * Supports both normal chat send and reply-to-message send.
 */
async function sendVideoWithCoverViaLarkCli({chatId, videoPath, coverPath, replyTo, idempotencyKey}){
  const video=larkLocal(videoPath);
  let cover=larkLocal(coverPath);
  if(cover.cwd!==video.cwd){
    const copied=path.join(video.cwd,path.basename(cover.abs));
    fs.copyFileSync(cover.abs,copied);
    cover=larkLocal(copied);
  }

  const args=replyTo
    ? ['im','+messages-reply','--message-id',replyTo,'--video',video.rel,'--video-cover',cover.rel,'--as','bot','--json']
    : ['im','+messages-send',...larkSendTargetArgs(chatId),'--video',video.rel,'--video-cover',cover.rel,'--as','bot','--json'];
  if(idempotencyKey)args.push('--idempotency-key',idempotencyKey);

  const res=await runLarkCliWithNetworkRetry(args,{cwd:video.cwd,env:process.env});
  if(res.code!==0)throw new Error(`lark-cli video send failed: ${res.stderr||res.stdout}`);
  let raw;
  try{raw=JSON.parse(res.stdout);}catch{raw={ok:true,raw:res.stdout};}
  return {raw,messageId:outboundMessageId(raw)};
}

/**
 * Download a video URL and send to chat.
 * Primary path: lark-cli native video + explicit cover.
 * Fallback: existing Channel SDK video send if lark-cli fails.
 */
async function downloadAndSend(channel, chatId, videoUrl, outDir='output', outPrefix='makaron', sendOptions){
  const outAbs=path.resolve(outDir);
  fs.mkdirSync(outAbs,{recursive:true});
  const out=path.join(outAbs,`${outPrefix}-${Date.now()}.mp4`);
  await runShell('bash',['-lc',`curl -L --fail --retry 3 -o ${JSON.stringify(out)} ${JSON.stringify(videoUrl)}`]);

  // Content-level de-duplication: skip re-sending byte-identical artifacts that
  // were already delivered (same video exposed as provider URL and CDN mirror).
  if(typeof sendOptions?.hashGuard==='function'&&sendOptions.hashGuard(out)){
    try{fs.unlinkSync(out);}catch{}
    return sendOptions?.returnDetails ? {localPath:out,duplicate:true,transport:'content-dedupe'} : out;
  }

  const cover=path.join(outAbs,`${path.basename(out,'.mp4')}.cover.jpg`);
  const replyTo=sendOptions?.replyTo||sendOptions?.reply_to;
  const idempotencyKey=`makaron-video-${crypto.createHash('sha1').update(`${chatId}\n${replyTo||''}\n${videoUrl}`).digest('hex').slice(0,32)}`;

  let sent,transport='lark-cli-video';
  try{
    await makeVideoCover(out,cover);
    sent=await sendVideoWithCoverViaLarkCli({chatId,videoPath:out,coverPath:cover,replyTo,idempotencyKey});
  }catch(e){
    console.error('[downloadAndSend] lark-cli video+cover failed, falling back to Channel SDK video:',e.message);
    try{
      sent={raw:await channel.send(chatId,{video:{source:out}}, sendOptions)};
      sent.messageId=outboundMessageId(sent.raw);
      transport='channel-sdk-video';
    }catch(channelErr){
      console.error('[downloadAndSend] Channel SDK video send failed, falling back to Drive file:',channelErr.message);
      sent=await sendDriveFileFallbackViaLarkCli({chatId,filePath:out,replyTo,idempotencyKey});
      transport='drive-file-fallback';
    }
  }
  const details={localPath:out,messageId:sent?.messageId||outboundMessageId(sent?.raw||sent?.sent),transport,raw:sent?.raw||sent};
  return sendOptions?.returnDetails ? details : out;
}

// ---- Legacy helpers (kept for backward compat) ----

/**
 * @deprecated Use `streamCard()` instead. This exists for backward compat only.
 * Create a card via REST API (no WebSocket streaming).
 */
function normalizeMessageId(sent){
  return sent?.messageId||sent?.message_id||sent?.data?.message_id||sent?.data?.messageId||sent?.message?.message_id||sent?.message?.messageId;
}

function normalizeCardState(state={}){
  return {
    parentTaskId:state.parentTaskId||'',childId:state.childId||'',
    title:state.title||'Makaron 任务',subtitle:state.subtitle||'',status:state.status||'初始化',
    brief:state.brief||'',makaronSay:state.makaronSay||'',projectUrl:state.projectUrl||'',
    logs:state.logs||[],outputs:state.outputs||[],accountLinks:state.accountLinks||[],progress:state.progress||0,
    usage:normalizeRunUsage(state.usage)||undefined,
    phase:state.phase||'init',done:state.done||false,failed:state.failed||false,
    superseded:state.superseded||false,supersededBy:state.supersededBy||'',supersededAt:state.supersededAt||'',
  };
}

/**
 * Create the visible bootstrap card immediately. This is intentionally safe to
 * run in the inbound Feishu session because it only sends one card; it does not
 * run Makaron, watchEvents, downloads, or any long producer. Use this when card
 * appearance latency matters: parent sends this first, then spawns a worker that
 * updates the returned messageId.
 */
async function createCard(channel, chatId, state={}, sendOptions){
  const cardState=normalizeCardState(state);
  const sent=await channel.send(chatId,{card:renderCard(cardState)},sendOptions);
  const messageId=normalizeMessageId(sent);
  if(!messageId)throw new Error(`card sent but message_id missing: ${JSON.stringify(sent).slice(0,500)}`);
  cardState.cardId=cardState.cardId||messageId;
  cardState.messageId=cardState.messageId||messageId;
  try{activeTasks.upsertActiveTask(chatId,{...cardState,messageId,source:'createCard'});}catch(e){console.error('active task registry write failed:',e.message);}
  return {messageId, message_id:messageId, raw:sent, state:cardState};
}

/**
 * Controller for an already-created card. This is the worker-side counterpart
 * to createCard(): pass the bootstrap messageId into the worker and let the
 * worker update that card in-place.
 */
function createExistingCardController(channel, messageId, initialState={}){
  if(!messageId)throw new Error('createExistingCardController requires messageId');
  let cardState=normalizeCardState({...initialState,cardId:initialState.cardId||messageId,messageId:initialState.messageId||messageId});
  const patch=async(s={})=>{
    if('projectUrl' in s && !s.projectUrl)delete s.projectUrl;
    Object.assign(cardState,s||{});
    const r=await updateCardWithRetry(channel,messageId,cardState,{chatId:cardState.chatId||initialState.chatId,context:'existingCardController.patch'});
    if(!r.ok)console.error('card update failed; pending record written:',r.pendingPath||r.error?.message||r.error);
    const registryChatId=cardState.chatId||initialState.chatId;
    if(registryChatId){
      try{activeTasks.upsertActiveTask(registryChatId,{...cardState,messageId,source:'existingCardController'});}catch(e){console.error('active task registry write failed:',e.message);}
    }
  };
  return {
    update:patch,
    async log(text){cardState.logs.push({t:now(),text});await patch({});},
    async output(text){cardState.outputs.push(text);await patch({});},
    getState(){return {...cardState};},
    get messageId(){return messageId;},
  };
}

/**
 * @deprecated Use `streamCard()` instead. This exists for backward compat only.
 * Patch an existing card via REST API (no WebSocket streaming).
 */
async function updateCard(channel, messageId, patch={}){
  const state=normalizeCardState({...patch,status:patch.status||'处理中',progress:patch.progress!=null?patch.progress:0});
  const r=await updateCardWithRetry(channel,messageId,state,{chatId:patch.chatId,context:'legacy.updateCard'});
  if(!r.ok)console.error('updateCard failed; pending record written:',r.pendingPath||r.error?.message||r.error);
}

module.exports={
  // Primary API (outbound-only channel + card streaming)
  connect, disconnect, withChannel, streamCard,
  // Makaron primitives
  submitChat, normalizeMediaAssets, buildMakaronChatArgs, watchEvents, eventText, eventVideo, eventAsset, eventIsDone, getRunOutput, assertMakaronCliRuntime,
  downloadAndSend, downloadAndSendAsset, createAssetDeliveryTracker, recoverSunoDefaultTake,
  // Feishu delivery helpers
  makeVideoCover, sendVideoWithCoverViaLarkCli, sendLocalAssetViaLarkCli, outboundMessageId, updateCardWithRetry,
  larkCliNetworkFailure, runLarkCliWithNetworkRetry,
  // Rendering
  renderCard, esc, trim, now, normalizeRunUsage, usageSummaryLine,
  // Deprecated (backward compat)
  createCard, createExistingCardController, updateCard,
};
