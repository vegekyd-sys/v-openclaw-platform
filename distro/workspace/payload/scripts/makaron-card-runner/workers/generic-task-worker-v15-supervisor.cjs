#!/usr/bin/env node
'use strict';
process.env.MAKARON_WORKER='1';

/**
 * Makaron v1.5 Sidecar Supervisor Event Bus worker.
 *
 * Staged, opt-in worker. It keeps the Node-speed execution/delivery path,
 * but reports CLI / stream / project media / delivery / error events to a
 * sidecar supervisor. Telemetry events are recorded only; decision events ask
 * the sidecar for JSON: confirm / retry / revise / stop / close / request_human.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {
  connect, disconnect, createExistingCardController,
  submitChat, normalizeMediaAssets, watchEvents, eventText, eventVideo, eventAsset, eventIsDone,
  getRunOutput, createAssetDeliveryTracker, trim, normalizeRunUsage,
} = require('../run.cjs');

const ROOT = require('../workspace-root.cjs');
const {assertMakaronCliRuntime}=require('../makaron-cli-runtime.cjs');
const DELIVERED_DIR = path.join(ROOT, 'tmp', 'makaron-delivered-assets');
const SIDECAR_ROOT = path.join(ROOT, 'tmp', 'makaron-sidecar-supervisors-v15');

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function required(job, key) { if (!job[key]) throw new Error(`job missing ${key}`); return job[key]; }
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'makaron-task'; }
function readJson(file, fallback=null){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function writeJson(file,obj){ fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(obj,null,2)); }
function appendJsonl(file,obj){ fs.mkdirSync(path.dirname(file),{recursive:true}); fs.appendFileSync(file,JSON.stringify(obj)+'\n'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function sha256Buffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function localFileHash(file) { try { return sha256Buffer(fs.readFileSync(path.resolve(file))); } catch { return null; } }
async function remoteUrlHash(url) { try { const res=await fetch(url); if(!res.ok)return null; return sha256Buffer(Buffer.from(await res.arrayBuffer())); } catch { return null; } }
function mediaKind(url='') { if(url.includes('/uploads/'))return 'upload'; if(url.includes('/videos/'))return 'generated'; if(url.includes('/images/')||url.includes('/renders/')||url.includes('/designs/')||url.includes('/music/')||url.includes('/audio/')||url.includes('/files/'))return 'generated'; return 'unknown'; }
function hasExpectedMedia(expected) { return ['image','video','design','music','audio','file'].some(t=>expected.has(t)); }
function mediaSummary(assets=[]){
  if(!assets.length) return '无本地素材';
  const counts=assets.reduce((m,a)=>{m[a.type]=(m[a.type]||0)+1;return m;},{});
  const head=[`素材确认｜共 ${assets.length} 个`,counts.image?`图片 ${counts.image} 张`:null,counts.video?`视频 ${counts.video} 段`:null,counts.audio?`音频 ${counts.audio} 条`:null].filter(Boolean).join('　');
  const rows=assets.slice(0,10).map((a,i)=>`${String(i+1).padStart(2,'0')}　${path.basename(a.path||'')}`);
  const tail=assets.length>10?[`…　其余 ${assets.length-10} 个素材已收起`]:[];
  return [head,...rows,...tail].join('\n');
}
function mediaManifestSummary(manifest){
  if(!manifest) return '';
  const title=String(manifest.title||'Scene 精确片段');
  const count=Number(manifest.rangeCount||0);
  const seconds=Number(manifest.totalDurationSec||0);
  const images=Number(manifest.imageCount||0);
  const videos=Number(manifest.videoCount||0);
  return `Scene 精确片段｜${title}\n${videos} 段视频 · ${seconds.toFixed(1)} 秒${images?` · ${images} 张图片`:''}\n在线 source_url（视频含精确入/出点，图片为整源，未导出 MP4）`;
}
function mediaUrlIdentity(value=''){
  try{
    const u=new URL(String(value));
    return `${u.protocol}//${u.host}${u.pathname}`;
  }catch{
    return String(value||'').split('?')[0];
  }
}
function sceneAssetIdentity(value=''){
  const match=mediaUrlIdentity(value).match(/\/v1\/assets\/([^/?#]+)\/media$/i);
  return match ? match[1] : '';
}
function loadManifestInputMedia(manifestPath){
  const urls=new Set(), assetIds=new Set();
  if(!manifestPath)return {urls,assetIds};
  try{
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const clips=Array.isArray(manifest.clips) ? manifest.clips : (Array.isArray(manifest.source_ranges) ? manifest.source_ranges : []);
    for(const range of clips){
      const url=String(range?.source_url||'');
      if(!url)continue;
      urls.add(mediaUrlIdentity(url));
      const assetId=sceneAssetIdentity(url);
      if(assetId)assetIds.add(assetId);
    }
  }catch(e){
    console.error(`unable to read Scene manifest input media: ${e.message}`);
  }
  return {urls,assetIds};
}
function isManifestInputMedia(value='', inputMedia={urls:new Set(),assetIds:new Set()}){
  const identity=mediaUrlIdentity(value);
  return inputMedia.urls.has(identity) || Boolean(sceneAssetIdentity(value) && inputMedia.assetIds.has(sceneAssetIdentity(value)));
}
function runShell(cmd,args,opts={}){ return new Promise(resolve=>{ const p=spawn(cmd,args,{...opts,stdio:['ignore','pipe','pipe']}); let stdout='',stderr=''; p.stdout.on('data',d=>stdout+=d.toString()); p.stderr.on('data',d=>stderr+=d.toString()); p.on('close',(code,signal)=>resolve({code,signal,stdout,stderr})); }); }
const {parseJsonLoose}=require('../json-output.cjs');
function formatChallengeAnswer(val, expectedFormat=''){
  if(!Number.isFinite(val))throw new Error('注册题目计算失败');
  const fmt=String(expectedFormat||'').toLowerCase();
  if(fmt.includes('2')||fmt.includes('two')||fmt.includes('decimal'))return Number(val).toFixed(2);
  if(Number.isInteger(val))return String(val);
  return String(Math.round(val*100)/100);
}
function solveArithmeticChallengeText(challenge, expectedFormat=''){
  const raw=String(challenge||'')
    .replace(/[×xX]/g,'*')
    .replace(/[÷／]/g,'/')
    .replace(/[−–—]/g,'-')
    .replace(/[＋]/g,'+')
    .replace(/（/g,'(').replace(/）/g,')');
  // Only solve explicit arithmetic. Word problems go to the LLM solver;
  // do not keep adding fragile case parsers here.
  const candidates=[];
  const re=/\(?\s*\d+(?:\.\d+)?\s*(?:[+\-*/]\s*\d+(?:\.\d+)?\s*)+\)?/g;
  for(const m of raw.matchAll(re))candidates.push(m[0]);
  let expr=candidates.sort((a,b)=>b.length-a.length)[0]||'';
  expr=expr.replace(/[^0-9+\-*/().\s]/g,'').trim();
  if(!expr||!/[+\-*/]/.test(expr))throw new Error('no explicit arithmetic expression');
  if(!/^[0-9+\-*/().\s]+$/.test(expr))throw new Error('注册题目含不安全字符');
  if(/\d\s+\d/.test(expr))throw new Error('注册题目格式不明确：'+expr);
  // eslint-disable-next-line no-new-func
  const val=Function(`"use strict"; return (${expr});`)();
  return formatChallengeAnswer(val, expectedFormat);
}
function parseJsonCandidate(value) {
  let s = String(value || '').trim().replace(/^\uFEFF/, '').trim();
  if (!s) return null;
  s = s.replace(/^```\s*[a-z0-9_-]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  s = s.replace(/^json\s*\n/i, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const direct = parseJsonCandidate(raw);
  if (direct) return direct;
  const fences = [...raw.matchAll(/```\s*[a-z0-9_-]*\s*\n?([\s\S]*?)```/gi)];
  for (const m of fences) {
    const parsed = parseJsonCandidate(m[1]);
    if (parsed) return parsed;
  }

  // LLMs sometimes emit a wrong JSON object, then prose, then a corrected JSON
  // object. The old first-brace/last-brace slice merged both objects and failed.
  // Parse balanced object candidates from the end so the final corrected answer wins.
  const candidates=[];
  for (let i=0;i<raw.length;i++) {
    if (raw[i] !== '{') continue;
    let depth=0, inString=false, escape=false;
    for (let j=i;j<raw.length;j++) {
      const ch=raw[j];
      if (inString) {
        if (escape) escape=false;
        else if (ch === '\\') escape=true;
        else if (ch === '"') inString=false;
        continue;
      }
      if (ch === '"') { inString=true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { candidates.push(raw.slice(i,j+1)); break; }
      }
    }
  }
  for (let i=candidates.length-1;i>=0;i--) {
    const parsed=parseJsonCandidate(candidates[i]);
    if (parsed) return parsed;
  }
  return null;
}
function parseOpenClawAgentReply(stdout) {
  try {
    const obj=JSON.parse(stdout);
    const payloadText = obj.result?.payloads?.find?.(p => typeof p?.text === 'string' && p.text.trim())?.text;
    if (payloadText) return payloadText;
    if (typeof obj.result?.finalAssistantRawText === 'string') return obj.result.finalAssistantRawText;
    if (typeof obj.result?.finalAssistantVisibleText === 'string') return obj.result.finalAssistantVisibleText;
    return obj.reply || obj.message || obj.output || obj.text || stdout;
  }catch{}
  return stdout;
}
function normalizeChallengeAnswer(answer, expectedFormat=''){
  const m=String(answer||'').match(/-?\d+(?:\.\d+)?/);
  if(!m)throw new Error('LLM 注册题答案不是数字');
  return formatChallengeAnswer(Number(m[0]), expectedFormat);
}
async function solveChallengeWithLLM({challenge, expectedFormat='', chatId=''}){
  const prompt=`你是 Makaron 自注册数学题求解器。只解决这道注册 challenge，不要执行其它任务。题目可能包含大小写混乱、噪声符号、中文数字、Esperanto 数字、英文应用题。忽略无关符号，求 numeric answer。\n\n输出必须是 JSON，不要 markdown，不要解释：\n{\"answer\":\"数字答案\",\"confidence\":0.0-1.0,\"reason\":\"一句话说明算法\"}\n\nexpected_format: ${expectedFormat||'numeric'}\nchallenge: ${challenge}`;
  const sessionKey=`agent:@@AGENT_ID@@:registration-solver-${safeName(chatId||'chat')}`;
  const openclawBin=process.env.MAKARON_REVIEW_AGENT_BIN||process.env.OPENCLAW_BIN||'openclaw';
  const res=await runShell(openclawBin,['agent','--agent','makaron','--session-key',sessionKey,'--message',prompt,'--thinking','off','--timeout','180','--json'],{cwd:ROOT,env:{...process.env,MAKARON_WORKER:'1'}});
  if(res.code!==0)throw new Error(`registration solver failed code=${res.code}: ${trim(res.stderr||res.stdout,1200)}`);
  const reply=parseOpenClawAgentReply(res.stdout);
  const parsed=extractJsonObject(reply)||extractJsonObject(res.stdout);
  if(!parsed||parsed.answer==null)throw new Error(`registration solver did not return JSON answer: ${trim(reply||res.stdout,1200)}`);
  const confidence=Number(parsed.confidence??0);
  if(confidence<0.55)throw new Error(`registration solver low confidence ${confidence}: ${parsed.reason||''}`);
  return {answer:normalizeChallengeAnswer(parsed.answer, expectedFormat), confidence, reason:String(parsed.reason||'')};
}
async function solveRegistrationChallenge(challenge, expectedFormat='', chatId='', ctrl=null){
  try{
    return {answer:solveArithmeticChallengeText(challenge, expectedFormat), source:'arithmetic'};
  }catch{}
  if(ctrl)await ctrl.log('注册 challenge 不是显式算式，交给 LLM solver 判断');
  const solved=await solveChallengeWithLLM({challenge, expectedFormat, chatId});
  if(ctrl)await ctrl.log(`LLM solver 已给出注册答案（confidence=${solved.confidence}${solved.reason?`，reason=${trim(solved.reason,120)}`:''}）`);
  return {...solved, source:'llm'};
}
function isInvalidApiKeyError(message=''){
  return /invalid\s*api\s*key|api\s*key\s*(?:无效|失效)|key\s*(?:无效|失效)|unauthorized|401/i.test(String(message||''));
}
function quarantineRegisteredMakaronKey(chatId, reason='invalid_api_key'){
  const store=path.join(os.homedir(),'.makaron','chat-keys.json');
  const backup=path.join(os.homedir(),'.makaron',`chat-keys.${Date.now()}.${reason}.bak.json`);
  let db={};
  try{db=JSON.parse(fs.readFileSync(store,'utf8'));}catch{return {moved:[], store, skipped:true};}
  const raw=String(chatId||'');
  const bare=raw.replace(/^chat:/,'');
  const keys=[raw,bare,`chat:${bare}`].filter(Boolean);
  const moved=[];
  const stamp=Date.now();
  for(const k of [...new Set(keys)]){
    if(Object.prototype.hasOwnProperty.call(db,k)){
      const quarantineKey=`quarantine:${stamp}:${k}`;
      db[quarantineKey]={...db[k],key_health:{state:'invalid_suspected',reason,quarantinedAt:new Date().toISOString(),originalScope:k}};
      moved.push({from:k,to:quarantineKey});
      delete db[k];
    }
  }
  if(!moved.length)return {moved, store, skipped:false};
  fs.copyFileSync(store,backup);
  fs.writeFileSync(store,JSON.stringify(db,null,2));
  return {moved, store, backup};
}
function restoreQuarantinedMakaronKey(quarantine={}){
  const store=quarantine.store;
  if(!store || !Array.isArray(quarantine.moved) || !quarantine.moved.length)return {restored:[],skipped:true};
  let db={};
  try{db=JSON.parse(fs.readFileSync(store,'utf8'));}catch{return {restored:[],skipped:true};}
  const restored=[];
  for(const item of quarantine.moved){
    const record=db[item.to];
    if(!record || Object.prototype.hasOwnProperty.call(db,item.from))continue;
    const {key_health,...original}=record;
    db[item.from]=original;
    delete db[item.to];
    restored.push(item.from);
  }
  if(restored.length)fs.writeFileSync(store,JSON.stringify(db,null,2));
  return {restored,store};
}
function discardQuarantinedMakaronKey(quarantine={}){
  const store=quarantine.store;
  if(!store || !Array.isArray(quarantine.moved) || !quarantine.moved.length)return {discarded:[],skipped:true};
  let db={};
  try{db=JSON.parse(fs.readFileSync(store,'utf8'));}catch{return {discarded:[],skipped:true};}
  const discarded=[];
  for(const item of quarantine.moved){
    if(Object.prototype.hasOwnProperty.call(db,item.to)){delete db[item.to];discarded.push(item.to);}
  }
  if(discarded.length)fs.writeFileSync(store,JSON.stringify(db,null,2));
  return {discarded,store};
}
function isCreditError(message=''){
  return /(insufficient|credit|credits|quota|balance|余额|积分|额度|充值|top\s*up)/i.test(String(message||''));
}
function creditGuidance(keyInfo={}){
  if(keyInfo.claimed===false && keyInfo.claim_url){
    return 'Makaron 返回额度不足。请先通过卡片里的「注册/绑定账号」按钮完成绑定，然后即可充值并继续当前任务。';
  }
  return 'Makaron 返回额度不足。请通过卡片里的「前往充值」按钮充值后继续使用。';
}
async function getLiveMakaronCredits(){
  const res=await runShell('makaron',['credits','--json'],{cwd:ROOT,env:process.env});
  if(res.code!==0) return {ok:false};
  let parsed;
  try{ parsed=parseJsonLoose(res.stdout||''); }
  catch{ return {ok:false}; }
  const balance=Number(parsed?.balance);
  if(!Number.isFinite(balance)) return {ok:false};
  return {ok:true,balance,lifetimePurchased:parsed.lifetimePurchased,lifetimeUsed:parsed.lifetimeUsed,subscription:parsed.subscription??null};
}
async function attachLiveCreditSnapshot(keyInfo={}){
  const live=await getLiveMakaronCredits();
  return live.ok ? {...keyInfo,liveCredits:live} : keyInfo;
}
function creditEventInfo(keyInfo={}){
  const live=keyInfo.liveCredits;
  return {
    source:keyInfo.source,
    scope:keyInfo.scope,
    claimed:keyInfo.claimed,
    hasClaimUrl:Boolean(keyInfo.claim_url),
    ...(live?.ok ? {liveCredits:{balance:live.balance,lifetimePurchased:live.lifetimePurchased,lifetimeUsed:live.lifetimeUsed,subscription:live.subscription}} : {}),
  };
}
function accountLinksFor(keyInfo={}){
  const links=[];
  const claimUrl=String(keyInfo.claim_url||'').trim();
  if(keyInfo.claimed===false && /^https:\/\//i.test(claimUrl)){
    links.push({id:'claim_account',label:'🔗 注册/绑定账号',url:claimUrl,type:'primary'});
  }
  links.push({id:'topup_account',label:'💳 前往充值',url:'https://www.makaron.app/dashboard?tab=topup',type:links.length?'default':'primary'});
  return links;
}
function removeAccountUrls(text='', keyInfo={}){
  const claimUrl=String(keyInfo.claim_url||'').trim();
  let out=String(text||'');
  if(claimUrl)out=out.split(claimUrl).join('请使用卡片里的「注册/绑定账号」按钮');
  return out.replace(/https:\/\/www\.makaron\.app\/dashboard\?tab=topup/gi,'请使用卡片里的「前往充值」按钮');
}
async function registerMakaronKeyForChat(chatId, ctrl){
  await ctrl.update({status:'群账号未注册，正在自动注册',progress:8,done:false,failed:false,makaronSay:'当前群没有绑定 Makaron key。V 正在走自注册流程，不会使用 the owner 的个人 key。'});
  await ctrl.log('群账号未注册：开始 Makaron 自注册');
  let challenge=parseJsonLoose((await runShell('bash',['scripts/makaron-register.sh',chatId,'Makaron 群聊任务'],{cwd:ROOT,env:process.env})).stdout);
  for(let attempt=0;attempt<4;attempt++){
    if(challenge.api_key){
      process.env.MAKARON_API_KEY=challenge.api_key;
      if(challenge.claim_url){
        await ctrl.update({accountLinks:accountLinksFor({claimed:false,claim_url:challenge.claim_url})});
        await ctrl.output('Makaron 账号：已自动注册。需要绑定到你的账号时，请使用卡片里的「注册/绑定账号」按钮。');
      }else await ctrl.output('Makaron 账号：已自动注册。');
      return {ok:true, source:'self_registered', claimed:Boolean(challenge.claimed), claim_url:challenge.claim_url||'', action:'use_key'};
    }
    if(!challenge.challenge_id)throw new Error('Makaron 自注册失败：'+trim(JSON.stringify(challenge),500));
    const solvedChallenge=await solveRegistrationChallenge(challenge.challenge, challenge.expected_format, chatId, ctrl);
    const answer=solvedChallenge.answer;
    await ctrl.log(`自注册 challenge 已解析（source=${solvedChallenge.source}），提交验证（attempt ${attempt+1}）`);
    const solved=await runShell('bash',['scripts/makaron-register.sh','--solve',chatId,challenge.challenge_id,answer,'Makaron 群聊任务'],{cwd:ROOT,env:process.env});
    const parsed=parseJsonLoose(solved.stdout||'{}');
    if(parsed.api_key){
      process.env.MAKARON_API_KEY=parsed.api_key;
      if(parsed.claim_url){
        await ctrl.update({accountLinks:accountLinksFor({claimed:false,claim_url:parsed.claim_url})});
        await ctrl.output('Makaron 账号：已自动注册。需要绑定到你的账号时，请使用卡片里的「注册/绑定账号」按钮。');
      }else await ctrl.output('Makaron 账号：已自动注册。');
      return {ok:true, source:'self_registered', claimed:Boolean(parsed.claimed), claim_url:parsed.claim_url||'', action:'use_key'};
    }
    if(parsed.status==='retry_challenge'){ challenge=parsed; continue; }
    if(parsed.action==='manual_registration_required'){
      await ctrl.update({status:'需要人工处理 Makaron 注册',progress:12,done:false,failed:false,makaronSay:trim(parsed.admin_message||'自动注册失败，需要人工处理后继续。',1200)});
      throw new Error('Makaron 自注册需要人工处理：'+trim(JSON.stringify(parsed),800));
    }
    throw new Error('Makaron 注册验证失败：'+trim(JSON.stringify(parsed),800));
  }
  throw new Error('Makaron 自注册重试耗尽');
}
function stripChatPrefix(value){ return String(value||'').replace(/^chat:/,''); }
function shouldSelfRegister(chatId){
  const stripped=stripChatPrefix(chatId);
  return /^(oc_|ou_|user:ou_)/.test(stripped);
}
async function ensureMakaronKeyForChat(chatId, ctrl, job){
  const {resolveJobAccount, applyJobAccount} = require('../account-routing.cjs');
  const result = resolveJobAccount(job);
  if(result.api_key || result.action === 'blocked' || process.env.MAKARON_ACCOUNT_REF) return applyJobAccount(job);
  delete process.env.MAKARON_API_KEY;
  if(shouldSelfRegister(chatId)) return await registerMakaronKeyForChat(chatId, ctrl);
  throw new Error('当前会话无可用账号绑定；未回退环境或本机登录。');
}

async function getProjectMedia(projectId){ if(!projectId)return []; const res=await runShell(assertMakaronCliRuntime(),['project','media',projectId,'--json'],{cwd:ROOT,env:process.env}); if(res.code!==0)return []; try{return JSON.parse(res.stdout).media||[];}catch{return [];} }
function loadJob(){ const jobPath=arg('--job')||process.env.MAKARON_JOB_JSON; if(!jobPath)throw new Error('missing --job <job.json>'); const abs=path.resolve(jobPath); return {jobPath:abs, job:JSON.parse(fs.readFileSync(abs,'utf8'))}; }
function readDelivered(file){
  try{
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    return {urls:new Set(data.urls||[]), ids:new Set(data.ids||[]), hashes:new Set(data.hashes||[])};
  }catch{return {urls:new Set(), ids:new Set(), hashes:new Set()};}
}
function writeDelivered(file,state){ fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify({version:3,updatedAt:Date.now(),urls:[...state.urls],ids:[...state.ids],hashes:[...(state.hashes||[])]},null,2)); }
function unlinkIfSet(file){ if(file)try{fs.unlinkSync(file);}catch{} }
function autoContinuePrompt({makaronSay, expected}) {
  const types=[...expected].filter(t=>['image','video','design','music','audio','file'].includes(t)).join('/')||'最终媒体';
  return `V QC 通过。请不要再等待用户确认，也不要只输出脚本/方案。请基于上一轮已经确认的方案，继续同一个项目生成并返回${types}产物 URL / artifact。\n\n上一轮 Makaron 输出摘要：\n${trim(makaronSay||'',2400)}\n\n硬要求：本轮必须继续到${types}生成；如果需要使用素材，请引用项目中已有的 media ref（例如 <<<media_1>>>），不要要求重新上传素材。`;
}

function createSidecar(job, jobPath){
  const cfg=job.reviewSidecar || {};
  const enabled = cfg.enabled === true || process.env.MAKARON_REVIEW_SIDECAR === '1' || process.env.MAKARON_SIDECAR_SUPERVISOR === '1';
  if(!enabled) return null;
  const key=safeName(job.cardId || `${job.chatId}-${Date.now()}`);
  const dir=path.join(SIDECAR_ROOT, key, String(Date.now()));
  fs.mkdirSync(path.join(dir,'decisions'),{recursive:true});
  const eventsFile=path.join(dir,'events.jsonl');
  const doneFile=path.join(dir,'done.json');
  const spawnErrorFile=path.join(dir,'spawn-error.json');
  const child=spawn(process.execPath,[path.join(ROOT,'scripts/makaron-card-runner/workers/review-sidecar-supervisor-v15.cjs'),'--dir',dir,'--job',jobPath,'--owner-pid',String(process.pid)],{cwd:ROOT,env:{...process.env,MAKARON_WORKER:'1'},detached:true,stdio:['ignore','ignore','ignore']});
  child.once('error', err => {
    writeJson(spawnErrorFile,{reason:'sidecar_spawn_error', at:new Date().toISOString(), message:err.message, stack:String(err.stack||'').slice(0,2000)});
  });
  child.once('exit', (code, signal) => {
    if(code === 0 || fs.existsSync(doneFile)) return;
    writeJson(doneFile,{reason:'sidecar_exit', at:new Date().toISOString(), code, signal});
  });
  child.unref();
  return {dir, eventsFile, doneFile, spawnErrorFile, pid:child.pid, enabled:true, mode:cfg.mode||'required'};
}
async function stopSidecar(sidecar, reason='worker_done'){
  if(!sidecar) return;
  writeJson(sidecar.doneFile,{reason, at:new Date().toISOString()});
}
async function requestSidecarDecision(sidecar,{eventType='gate_review',gateIndex=0,makaronSay='',expected,projectId,runId,summary='',error=null,failedMediaSummary='',failedMedia=[],history=[],artifactSummary=null,projectMedia=null}){
  if(!sidecar) return null;
  const prefix=eventType==='artifact_finality'?'artifact-finality':eventType==='failed_media'?'failed-media':eventType==='cli_error'?'cli-error':eventType==='delivery_failed'?'delivery-failed':eventType==='no_asset'?'no-asset':eventType==='timeout'?'timeout':'decision';
  const id=`${prefix}-${gateIndex||0}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  appendJsonl(sidecar.eventsFile,{id, at:new Date().toISOString(), eventType, needsDecision:true, gateIndex, makaronSay, expectedAssets:[...expected], projectId, runId, summary, error, failedMediaSummary, failedMedia, artifactSummary, projectMedia, history:history.slice(-60)});
  const decisionFile=path.join(sidecar.dir,'decisions',`${safeName(id)}.json`);
  const started=Date.now();
  const timeoutMs=Number(process.env.MAKARON_REVIEW_SIDECAR_DECISION_TIMEOUT_MS || 5*60*1000);
  while(Date.now()-started<timeoutMs){
    const spawnError=readJson(sidecar.spawnErrorFile,null);
    if(spawnError) return {decision:'stop',passed:false,reason:`v1.5 sidecar supervisor spawn failed: ${spawnError.message||spawnError.reason||'unknown error'}`,prompt:'',confidence:0};
    const done=readJson(sidecar.doneFile,null);
    if(done) return {decision:'stop',passed:false,reason:`v1.5 sidecar supervisor stopped before decision: ${done.reason||'done'}`,prompt:'',confidence:0};
    const d=readJson(decisionFile,null);
    if(d) return normalizeDecision(d);
    await sleep(1000);
  }
  return {decision:'stop',passed:false,reason:'v1.5 sidecar supervisor timeout',prompt:'',confidence:0};
}
function normalizeDecision(d={}){
  const allowed=new Set(['confirm','retry','revise','stop','close','request_human']);
  const decision=String(d.decision||'stop').toLowerCase();
  return {...d, decision:allowed.has(decision)?decision:'stop', prompt:String(d.prompt||''), reason:String(d.reason||''), confidence:Number(d.confidence??0)};
}

(async()=>{
  const {jobPath, job}=loadJob();
  const chatId=required(job,'chatId');
  const cardId=required(job,'cardId');
  const prompt=required(job,'prompt');
  const skill=job.skill || undefined;
  const agentModel=job.agentModel || undefined;
  const mediaAssets=normalizeMediaAssets(job);
  const mediaManifest=job.mediaManifest || null;
  const mediaManifestSummaryData=job.mediaManifestSummary || null;
  // Manifest source ranges become project media after import. They are inputs,
  // not Makaron outputs, so they must never be sent back into the Feishu chat.
  const manifestInputMedia=loadManifestInputMedia(mediaManifest);
  let manifestInputSkipLogged=false;
  // Project reconciliation is a recovery path for outputs that were missed by
  // the stream. It must never send media that already existed before the
  // current run (including Scene source ranges imported into the timeline).
  const reconciliationInputIds=new Set();
  const reconciliationInputUrls=new Set();
  let reconciliationInputSkipLogged=false;
  const outDir=job.outDir||path.join(ROOT,'output','generic-task-worker-v15-supervisor');
  const outPrefix=job.outPrefix||'makaron-task-v15';
  const launchedAt=Number(process.env.LAUNCHED_AT||job.launchedAt||Date.now());
  const workerStartedAt=Date.now();
  const expected=new Set(job.expectedAssets||job.expectedAssetTypes||[]);
  const maxGateContinues=Number(job.maxGateContinues ?? 2);
  const initialState={...(job.initialState||{}),chatId};
  const deliveredFile=path.join(DELIVERED_DIR,`${safeName(chatId)}.${safeName(cardId)}.json`);
  const deliveredState=readDelivered(deliveredFile);
  const deliveredUrls=deliveredState.urls;
  const deliveredIds=deliveredState.ids;
  const inputAssetHashes=new Set(mediaAssets.filter(a=>a.type==='image').map(a=>localFileHash(a.path)).filter(Boolean));
  const sidecar=createSidecar(job, jobPath);

  const {channel}=await connect(chatId);
  const ctrl=createExistingCardController(channel,cardId,initialState);
  const deliverAsset=createAssetDeliveryTracker({
    channel,chatId,ctrl,outDir,outPrefix,
    contentHashes:deliveredState.hashes,
    deliveryContext:()=>({cardId,projectId,projectUrl,runId}),
  });
  let runId=null,projectUrl=null,projectId=job.projectId||null,makaronSay='';
  const runIds=[],sentAssets=[],deliveredAssets=[],sidecarHistory=[];
  let lastRunOutput=null;
  // Credit usage accumulates across every run this single task performs
  // (submit, gate continuation, recovery). The card shows the task total, not
  // just the last run, so a reworked task reports its true cost.
  let usageTotals=null;
  let gateContinues=0, failedRecoveryAttempts=0, noAssetDecisionAttempts=0, remotionMaterializeAttempts=0;
  // 一个任务（同一个 worker 运行）只交付一条成片：
  // 上次修的是「同一份字节被两个 URL 发两次」（content-hash 去重）；
  // 这一类是「中间导出（fast_720p）+ 原生分辨率重导」两个不同文件各发一次，
  // 哈希拦不住，所以这里再加一道「每任务最多交付一条视频」的护栏。
  let videoDeliveredThisJob=false;
  // Attach explicitly provided media on the first submit even when continuing
  // an existing project. Screenshot-fix / reference-image workflows depend on
  // these files becoming available to Makaron; previously existing-project
  // restarts defaulted to attachMedia=false, so the prompt mentioned images
  // that were never actually submitted.
  let currentPrompt=prompt,currentProjectId=job.projectId||null,attachMedia=mediaAssets.length>0 || !currentProjectId || job.attachOnContinue===true;
  let attachMediaManifest=Boolean(mediaManifest);
  const maxFailedRecoveryAttempts=Number(job.maxFailedRecoveryAttempts ?? 1);
  const maxNoAssetDecisionAttempts=Number(job.maxNoAssetDecisionAttempts ?? 1);
  const maxRemotionMaterializeAttempts=Number(job.maxRemotionMaterializeAttempts ?? 1);

  function reportSidecarEvent(eventType, data={}){
    const ev={id:`event-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, at:new Date().toISOString(), eventType, projectId, runId, ...data};
    sidecarHistory.push(ev);
    if(sidecar){
      try{appendJsonl(sidecar.eventsFile, ev);}catch(e){console.error('sidecar event append failed:', e.message);}
    }
    return ev;
  }

  async function sidecarDecisionFor(payload){
    return await requestSidecarDecision(sidecar,{...payload, expected, projectId, runId, makaronSay, history:sidecarHistory});
  }

  function rememberReconciliationInputs(items=[]){
    for(const item of items){
      const id=String(item?.id||item?.snapshot_id||item?.snapshotId||item?.task_id||item?.taskId||'');
      const url=String(item?.url||item?.imageUrl||item?.videoUrl||item?.audioUrl||item?.fileUrl||'');
      if(id)reconciliationInputIds.add(id);
      if(url)reconciliationInputUrls.add(mediaUrlIdentity(url));
    }
  }

  function isReconciliationInputMedia(item={},url=''){
    const ids=[item.id,item.snapshot_id,item.snapshotId,item.task_id,item.taskId].filter(Boolean).map(String);
    return ids.some(id=>reconciliationInputIds.has(id)) || Boolean(url&&reconciliationInputUrls.has(mediaUrlIdentity(url)));
  }

  // 只投递成片：分段片段一律不发到聊天里
  function expectedDurationSec(){
    const t=String(job.prompt||'');
    const m=t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:秒|s\b|sec)/i);
    return m?parseFloat(m[1]):0;
  }
  function isSegmentClip(asset){
    if(asset?.type!=='video')return false;
    const exp=expectedDurationSec();
    if(!exp)return false;
    const d=Number(asset.duration||asset.duration_seconds||asset.durationSec||0);
    if(!d)return false;
    return d < exp*0.85;
  }
  async function deliverOnce(asset,statusLabel){
    if(!asset?.url)return {delivered:false};
    if(isSegmentClip(asset)){
      await ctrl.log('分段片段不投递到群，等最终成片');
      reportSidecarEvent('delivery_skipped_segment',{summary:'segment clip suppressed, waiting final cut',asset:{type:asset.type,url:asset.url,duration:asset.duration||asset.duration_seconds}});
      return {segment:true,delivered:false};
    }
    if(isManifestInputMedia(asset.url,manifestInputMedia)){
      if(!manifestInputSkipLogged){
        manifestInputSkipLogged=true;
        await ctrl.log('已识别 Scene 导入片段：仅作为 Makaron 输入，不会回传到群。');
      }
      return {skippedInput:true,delivered:false};
    }
    // 2026-10-13: 允许一个任务交付多支视频（此前这里会拦掉第 2 支，导致「一次提交 2 条只收到 1 条」）。
    // 真正的重复投递仍由下面的 deliveredUrls / deliveredIds / 内容哈希 三重去重拦住，不会重复发同一条。
    if(asset.type==='video'&&videoDeliveredThisJob&&job.allowMultipleVideos===false){
      await ctrl.log('本任务已交付过成片，跳过后续重复交付（显式禁用多发）');
      reportSidecarEvent('delivery_skipped_extra_video',{summary:'extra video delivery suppressed', asset:{type:asset.type,url:asset.url,id:asset.id}});
      return {duplicate:true,delivered:false,skippedExtraVideo:true};
    }
    const idKey=asset.id ? `${asset.type||'asset'}:${asset.id}` : '';
    if(deliveredUrls.has(asset.url)||(idKey&&deliveredIds.has(idKey))||deliverAsset.wasDelivered(asset))return {duplicate:true,delivered:false};
    try{
      if(statusLabel)await ctrl.update({status:statusLabel,progress:asset.type==='video'?86:78});
      const delivered=await deliverAsset(asset);
      if(delivered?.delivered){
        deliveredUrls.add(asset.url);if(idKey)deliveredIds.add(idKey);
        if(deliverAsset.contentHashes){for(const h of deliverAsset.contentHashes)deliveredState.hashes.add(h);}
        writeDelivered(deliveredFile,deliveredState);sentAssets.push(asset.type||'asset');
        deliveredAssets.push({type:asset.type||'asset',url:asset.url,localPath:delivered.localPath||'',id:asset.id||'',status:asset.status||'completed',deliveredAt:new Date().toISOString()});
        if(asset.type==='video')videoDeliveredThisJob=true;
        reportSidecarEvent('delivery_succeeded',{summary:`${asset.type||'asset'} delivered`, asset:{type:asset.type,url:asset.url,id:asset.id,status:asset.status}});
        await ctrl.update({status:`${asset.type||'asset'} 已发送`,progress:asset.type==='video'?92:90});
      }
      return delivered;
    }catch(e){
      reportSidecarEvent('delivery_failed',{summary:`${asset.type||'asset'} delivery failed`, asset:{type:asset.type,url:asset.url,id:asset.id,status:asset.status}, error:{message:e.message, stack:String(e.stack||'').slice(0,2000)}});
      throw e;
    }
  }
  function persistState(patch={}){
    if(!job.stateFile)return;
    try{
      const prev=readJson(job.stateFile,{})||{};
      writeJson(job.stateFile,{...prev,...(ctrl.getState?.()||{}),...patch,chatId,cardId,projectUrl:patch.projectUrl||projectUrl||prev.projectUrl||'',projectId:patch.projectId||projectId||prev.projectId||'',runIds,updatedAt:Date.now()});
    }catch(e){console.error('state file write failed:', e.message);}
  }
  function accumulateUsage(usage){
    const u=normalizeRunUsage(usage);
    if(!u)return null;
    const base=usageTotals||{creditsCharged:0,creditsRefunded:0,creditsNet:0,entries:[],balance:null};
    const merged={...base};
    merged.creditsCharged=base.creditsCharged+u.creditsCharged;
    merged.creditsRefunded=base.creditsRefunded+u.creditsRefunded;
    merged.creditsNet=base.creditsNet+u.creditsNet;
    const entries=base.entries.map(e=>({...e}));
    for(const entry of u.entries){
      const existing=entries.find(e=>e.tool===entry.tool&&e.model===entry.model);
      if(existing){existing.calls+=entry.calls;existing.credits+=entry.credits;}
      else entries.push({...entry});
    }
    merged.entries=entries;
    if(u.balance!=null)merged.balance=u.balance;
    usageTotals=merged;
    return merged;
  }
  async function recoverFromRunOutput(currentRunId){
    const out=await getRunOutput(currentRunId);
    lastRunOutput=out;
    accumulateUsage(out?.usage);
    reportSidecarEvent('run_output',{summary:out?'run output recovered':'run output empty', output:out});
    if(usageTotals)await ctrl.update({usage:usageTotals});
    if(out?.text&&!makaronSay)makaronSay=out.text;
    if(out?.videoUrl)await deliverOnce({type:'video',url:out.videoUrl,status:'completed',id:`${currentRunId}:recovered-video`},'从结果中恢复到视频，发送中');
    for(const url of out?.imageUrls||[])await deliverOnce({type:'image',url,status:'completed',id:`${currentRunId}:recovered-image`},'从结果中恢复到图片，发送中');
  }
  function remotionDesignSummary(){
    const designs=lastRunOutput?.designs||[];
    const parts=[];
    for(const d of designs.slice(0,6)){
      parts.push(`${d.type||'design'} id=${d.id||''} snapshot=${d.snapshot_id||d.snapshotId||''} status=${d.status||''}`.trim());
    }
    return parts.join('\n');
  }
  function shouldMaterializeRemotionVideo(){
    if(!expected.has('video'))return false;
    if(!lastRunOutput?.needsMaterialize && !(lastRunOutput?.designs||[]).length)return false;
    if((lastRunOutput?.videos||[]).some(v=>v.videoUrl||v.url))return false;
    return remotionMaterializeAttempts < maxRemotionMaterializeAttempts;
  }
  async function continueForRemotionMaterialize(){
    remotionMaterializeAttempts++;
    const summary=remotionDesignSummary();
    reportSidecarEvent('remotion_materialize_needed',{summary:'Remotion/design output found without video URL; continuing same project to materialize/export MP4', designs:lastRunOutput?.designs||[], completionActions:lastRunOutput?.completionActions||[]});
    await ctrl.output(`🎞️ 检测到 Remotion/design 产物但没有 MP4 URL，继续同一项目导出视频`);
    await ctrl.update({status:'Remotion 已生成，正在导出 MP4',progress:72,done:false,failed:false,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}V 检测到项目里已有 Remotion/design composition，但还没有可发送的视频 URL。继续同一项目 materialize/export MP4。`,1800)});
    currentPrompt=`项目里已有 Remotion/design composition，但上一轮没有返回可发送的 MP4/video URL。请不要重新设计，不要只输出说明文字。请基于当前项目里已有的 composition/design snapshot，执行 materialize / export composition / render，生成并返回最终 MP4 视频 URL。\n\n已检测到的 design/composition:\n${summary||'(见项目当前设计稿)'}\n\n硬要求：本轮必须返回 type=video 的 MP4 URL 或可下载视频 artifact；不要再次停在 design/composition。`;
    attachMedia=false;
    return 'continue';
  }
  async function reconcileProjectMedia(reason='项目产物复核'){
    const media=await getProjectMedia(projectId);
    reportSidecarEvent('project_media_snapshot',{summary:`project media count ${media.length}`, media:media.map(m=>({id:m.id,ref:m.ref,type:m.type,status:m.status,taskId:m.task_id||m.taskId,url:m.url||m.imageUrl||m.videoUrl||m.audioUrl||m.fileUrl||''})).slice(0,30)});
    if(!media.length)return 0;
    const allowed=expected.size?expected:new Set(['image','video','design','music','audio','file']); let count=0, skippedInputs=0;
    for(const m of media){
      const type=String(m.type||'').toLowerCase(); const url=m.url||m.imageUrl||m.videoUrl||m.audioUrl||m.fileUrl;
      if(!url||!allowed.has(type))continue; if(m.status&&!['completed','succeeded','ready'].includes(String(m.status).toLowerCase()))continue; if(mediaKind(url)==='upload')continue;
      if(isReconciliationInputMedia(m,url)){
        skippedInputs++;
        continue;
      }
      if(type==='image'&&inputAssetHashes.size){const h=await remoteUrlHash(url); if(h&&inputAssetHashes.has(h)){await ctrl.log(`跳过参考图/输入图，不作为生成产物发送：${m.ref||''}`.trim()); continue;}}
      const r=await deliverOnce({type,url,status:m.status||'completed',id:m.id||m.snapshot_id||m.snapshotId||m.task_id||m.taskId||url,snapshotId:m.snapshot_id||m.snapshotId||'',createdAt:m.created_at||m.createdAt||'',raw:m},`${reason}：发现${type}，发送中`);
      if(r?.delivered)count++;
    }
    if(skippedInputs>0&&!reconciliationInputSkipLogged){
      reconciliationInputSkipLogged=true;
      await ctrl.log(`项目复核跳过 ${skippedInputs} 个本轮前已存在的输入素材，避免把 Scene/参考素材误发回群。`);
    }
    if(count>0)await ctrl.output(`🔎 项目复核补发产物：${count} 个`); return count;
  }
  async function failedProjectMedia(){
    const media=await getProjectMedia(projectId); if(!media.length)return [];
    const allowed=expected.size?expected:new Set(['image','video','design','music','audio','file']);
    return media.filter(m=>{
      const type=String(m.type||'').toLowerCase(); if(!allowed.has(type))return false;
      const status=String(m.status||'').toLowerCase(); if(!['failed','error','errored','canceled','cancelled'].includes(status))return false;
      const url=m.url||m.imageUrl||m.videoUrl||m.audioUrl||m.fileUrl||''; if(url&&mediaKind(url)==='upload')return false;
      return true;
    });
  }
function summarizeFailedMedia(items=[]){
    return items.slice(0,8).map(m=>{
      const type=String(m.type||'asset'); const status=String(m.status||'failed');
      const id=m.ref||m.id||m.task_id||m.taskId||m.snapshot_id||m.snapshotId||'';
      const desc=(m.description||m.error||m.error_message||m.message||m.failure_reason||m.failReason)?`｜${String(m.description||m.error||m.error_message||m.message||m.failure_reason||m.failReason).slice(0,800)}`:'';
      return `${type} ${id ? id+' ' : ''}= ${status}${desc}`;
    }).join('\n');
  }
  function compactRaw(obj, max=12000){
    try{
      const json=JSON.stringify(obj);
      return json.length>max ? {truncated:true, json:json.slice(0,max)} : obj;
    }catch{
      return {rawText:String(obj||'').slice(0,max)};
    }
  }
  function failedMediaPayload(items=[]){
    return items.map(m=>({
      id:m.id||'', ref:m.ref||'', type:m.type||'', status:m.status||'', taskId:m.task_id||m.taskId||'', snapshotId:m.snapshot_id||m.snapshotId||'',
      description:m.description||'', message:m.message||'', error:m.error||m.error_message||m.errorMessage||'', reason:m.reason||m.failure_reason||m.failReason||'',
      url:m.url||m.imageUrl||m.videoUrl||m.audioUrl||m.fileUrl||'',
      createdAt:m.created_at||m.createdAt||'', updatedAt:m.updated_at||m.updatedAt||'',
      model:m.model||m.provider||'', progress:m.progress,
      rawMedia:compactRaw(m),
    }));
  }
  async function applySidecarDecision(decision, fallbackPrompt, contextLabel){
    const d=normalizeDecision(decision||{});
    await ctrl.output(`🧠 V 决策：${d.decision}｜${trim(d.reason||'',500)}`);
    if(['confirm','retry','revise'].includes(d.decision)){
      currentPrompt=d.prompt||fallbackPrompt;
      attachMedia=job.attachOnContinue===true || mediaAssets.some(a=>a.type==='audio');
      await ctrl.update({status:d.decision==='revise'?'V 要求修正后继续':'V 要求继续/重试',progress:Math.max(58, Number(ctrl.getState?.().progress||58)),done:false,failed:false,makaronSay:trim(`${contextLabel||'V'}：${d.reason||''}`,1800)});
      return 'continue';
    }
    if(d.decision==='close') return 'break';
    if(d.decision==='request_human'){
      await ctrl.update({status:'需要你决定下一步',progress:75,done:false,failed:false,makaronSay:trim(d.humanMessage||d.reason||'当前情况需要你补充信息或做出选择后再继续。',1800)});
      persistState({status:'需要你决定下一步',progress:75,done:false,failed:false,makaronSay:trim(d.humanMessage||d.reason||'当前情况需要你补充信息或做出选择后再继续。',1800)});
      console.log(JSON.stringify({status:'request_human',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sidecarDecision:d,reviewSidecar:Boolean(sidecar)},null,2));
      process.exitCode=0;
      return 'return';
    }
    await ctrl.update({status:'V 判断停止',progress:100,done:true,failed:true,makaronSay:trim(d.reason||'V 判断该任务无法自动继续',1800)});
    persistState({status:'V 判断停止',progress:100,done:true,failed:true,makaronSay:trim(d.reason||'V 判断该任务无法自动继续',1800)});
    console.log(JSON.stringify({status:'agent_stop',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sidecarDecision:d,reviewSidecar:Boolean(sidecar)},null,2));
    process.exitCode=1;
    return 'return';
  }

  async function askArtifactFinalityDecision(){
    if(!sidecar) return {decision:'close', reason:'sidecar disabled; legacy finality fallback'};
    const media=await getProjectMedia(projectId);
    const deliveredSummary=deliveredAssets.slice(-10).map(a=>({type:a.type,url:a.url,id:a.id,status:a.status,localPath:a.localPath}));
    const outputSummary=lastRunOutput ? {
      text: trim(lastRunOutput.text||'',2400),
      videoUrl: lastRunOutput.videoUrl||'',
      imageUrls: lastRunOutput.imageUrls||[],
      raw: lastRunOutput.raw||null,
    } : null;
    reportSidecarEvent('artifact_finality_checkpoint',{summary:'artifact delivered; sidecar must judge finality before card completion', deliveredAssets:deliveredSummary, output:outputSummary, media:media.map(m=>({id:m.id,ref:m.ref,type:m.type,status:m.status,duration:m.duration||m.duration_seconds,url:m.url||m.videoUrl||m.imageUrl||''})).slice(-20)});
    return await sidecarDecisionFor({
      eventType:'artifact_finality',
      gateIndex:runIds.length,
      summary:'Worker has already delivered available non-text artifacts. Decide whether the original user intent is fully satisfied, or whether these artifacts are intermediate and the same project/card must continue.',
      artifactSummary:{deliveredAssets:deliveredSummary, output:outputSummary},
      projectMedia:media.map(m=>({id:m.id,ref:m.ref,type:m.type,status:m.status,duration:m.duration||m.duration_seconds,url:m.url||m.videoUrl||m.imageUrl||''})).slice(-20),
    });
  }

  try{
    reportSidecarEvent('worker_started',{summary:`worker handoff ${workerStartedAt-launchedAt}ms`, expectedAssets:[...expected], mediaSummary:mediaSummary(mediaAssets), mediaManifest:mediaManifestSummaryData});
    await ctrl.log(`V 接管任务：${workerStartedAt-launchedAt}ms${sidecar?`；监督 agent 已启动 pid=${sidecar.pid}`:'；监督 agent 未启用'}`);
    await ctrl.update({status:job.statusOnStart||'V 已接管，提交 Makaron 中',progress:job.progressOnStart??12,makaronSay:job.startSay||`V 已接管任务（${workerStartedAt-launchedAt}ms）。${sidecar?'V 监督模式已启动：常规事件只记录，需要判断时 V 会介入。':'V 监督模式未启用，本文件为 staged path。'}\n\n${[mediaManifestSummary(mediaManifestSummaryData),mediaSummary(mediaAssets)].filter(Boolean).join('\n\n')}`});

    let keyInfo=await ensureMakaronKeyForChat(chatId, ctrl, job);
    let invalidKeyRecoveryAttempted=false;
    // Hard guard: a non-the owner scope must never submit with an inherited personal env key.
    // ensureMakaronKeyForChat already strips env for non-the owner scopes, but enforce it once more
    // as a defensive backstop before any submitChat call so no path leaks the pro key.
    if(!keyInfo.ok){
      delete process.env.MAKARON_API_KEY;
    }
    await ctrl.log(keyInfo.ok ? `已使用当前会话/群绑定的 Makaron key（source=${keyInfo.source||'unknown'}，claimed=${keyInfo.claimed?'yes':'no'}）` : '当前会话不是 the owner 本人，且无专属 key，已阻止继承环境 key，走自注册');

    while(true){
      const submitStartedAt=Date.now();
      const submitHadAttachedInputs=Boolean(attachMedia||attachMediaManifest);
      if(currentProjectId)rememberReconciliationInputs(await getProjectMedia(currentProjectId));
      let submitted;
      try{
        submitted=await submitChat({mediaAssets:attachMedia?mediaAssets:[],mediaManifest:attachMediaManifest?mediaManifest:null,prompt:currentPrompt,projectId:currentProjectId,skill,agentModel});
      }catch(e){
        if(e?.code==='MAKARON_IMAGE_INPUT_INVALID'){
          // Local attachments are owned by this worker, not the remote Agent.
          // Rewriting the creative prompt cannot restore missing local bytes.
          const message=`本地图片尚未满足提交条件，未发起本轮 Makaron chat。请修复/补齐附件后续接原任务；不要求 Makaron 查找或压缩本地文件。\n${e.message}`;
          reportSidecarEvent('local_input_blocked',{summary:'local image preflight failed before chat; no remote retry',error:{code:e.code,message:e.message}});
          await ctrl.update({status:'需要补齐本地图片附件',progress:18,done:false,failed:false,makaronSay:message});
          persistState({status:'需要补齐本地图片附件',progress:18,done:false,failed:false,makaronSay:message});
          console.log(JSON.stringify({status:'blocked_local_input',code:e.code,mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl},null,2));
          process.exitCode=0; return;
        }
        if(isInvalidApiKeyError(e?.message||e) && !invalidKeyRecoveryAttempted && /^oc_|^chat:oc_/.test(String(chatId||''))){
          invalidKeyRecoveryAttempted=true;
          const keyHealth=await getLiveMakaronCredits();
          if(keyHealth.ok){
            keyInfo={...keyInfo,liveCredits:keyHealth};
            await ctrl.update({status:'Makaron 提交鉴权异常，正在复核后重试',progress:18,done:false,failed:false,makaronSay:'刚才提交遇到鉴权异常，但该群 key 的账户校验仍正常。V 将保留现有绑定并重试，不会要求重新绑定。'});
            await ctrl.log('Makaron submit returned an auth-like error, but credits health check passed; keeping the existing group binding and retrying once');
            continue;
          }
          keyInfo={...keyInfo,liveCredits:keyHealth};
          reportSidecarEvent('account_key_issue',{summary:'registered Makaron key is invalid; sidecar must choose self-registration, top-up/update request, retry, or the owner override if explicitly authorized', error:{message:e.message, stack:String(e.stack||'').slice(0,2000)}, keyInfo:creditEventInfo(keyInfo), availableActions:['self_register_same_card','ask_topup','ask_update_key','use_tianyi_override','retry_existing_key']});
          if(sidecar){
            await ctrl.update({status:'Makaron key 异常，V 判断恢复策略',progress:18,done:false,failed:false,makaronSay:'当前群绑定的 Makaron key 返回无效。V 正在判断：同卡自注册、要求更新/充值、重试，或在 the owner 明确授权时使用 the owner key。'});
            const decision=await sidecarDecisionFor({
              eventType:'account_key_issue',
              gateIndex:runIds.length+1,
              summary:'Registered Makaron key is invalid. Choose the correct account recovery action; do not hardcode fallback. the owner override requires explicit authorization.',
              error:{message:e.message, stack:String(e.stack||'').slice(0,2000)},
              artifactSummary:{keyInfo:creditEventInfo(keyInfo), availableActions:['self_register_same_card','ask_topup','ask_update_key','use_tianyi_override','retry_existing_key'], tianyiOverrideAuthorized:Boolean(job.allowTianyiOverride || process.env.MAKARON_ALLOW_TIANYI_OVERRIDE==='1')},
            });
            const d=normalizeDecision(decision||{});
            const action=String(d.action||'').toLowerCase();
            await ctrl.output(`🧠 V 账号决策：${action||d.decision}｜${trim(d.reason||'',500)}`);
            if(action==='self_register_same_card'){
              const quarantined=quarantineRegisteredMakaronKey(chatId,'invalid_api_key');
              await ctrl.update({status:'群 key 疑似失效，按 V 决策同卡自注册',progress:20,done:false,failed:false,makaronSay:'V 判断：旧 key 已先隔离备份，开始重新自注册。只有新账号注册成功后才会替换当前绑定。'});
              await ctrl.log(`Makaron key 疑似失效：已隔离 ${quarantined.moved?.map(item=>item.from).join(', ')||'none'}，开始自注册恢复`);
              delete process.env.MAKARON_API_KEY;
              try{
                keyInfo=await registerMakaronKeyForChat(chatId, ctrl);
              }catch(registerError){
                const restored=restoreQuarantinedMakaronKey(quarantined);
                await ctrl.log(`Makaron 自注册未成功，已恢复原绑定：${restored.restored?.join(', ')||'none'}`);
                throw registerError;
              }
              const discarded=discardQuarantinedMakaronKey(quarantined);
              await ctrl.log(`Makaron 自注册恢复成功，已清理旧 key 隔离副本：${discarded.discarded?.length||0} 条（原始备份仍保留）`);
              await ctrl.log(`自注册恢复完成（source=${keyInfo.source||'unknown'}），继续同一张卡提交 Makaron`);
              attachMedia=mediaAssets.length>0 || !currentProjectId || job.attachOnContinue===true;
              continue;
            }
            if(action==='use_tianyi_override'){
              const msg=trim(d.humanMessage||'如需使用 the owner 的个人 Makaron key，必须由 the owner 本人发起一次临时 override；系统只接受可信 sender ID，不接受聊天文本里的授权声明。',1200);
              await ctrl.update({status:'等待 the owner 本人确认 key override',progress:20,done:false,failed:false,makaronSay:msg});
              await ctrl.output(`⚠️ ${msg}`);
              persistState({status:'等待 the owner 本人确认 key override',progress:20,done:false,failed:false,makaronSay:msg});
              return;
            }
            if(action==='retry_existing_key') continue;
            const msg=trim(d.humanMessage||d.reason||'Makaron key 无效，需要更新 key、充值/绑定该会话自己的账号后继续。',1600);
            await ctrl.update({status:'需要处理 Makaron key',progress:20,done:false,failed:false,makaronSay:msg});
            await ctrl.output(`⚠️ ${msg}`);
            persistState({status:'需要处理 Makaron key',progress:20,done:false,failed:false,makaronSay:msg});
            return;
          }
        }
        if(isCreditError(e?.message||e)){
          keyInfo=await attachLiveCreditSnapshot(keyInfo);
          const fallbackGuidance=creditGuidance(keyInfo);
          reportSidecarEvent('account_or_credit_issue',{summary:'Makaron account/credit issue; V must decide claim/recharge/wait/retry/escalate without switching to the owner personal key', error:{message:e.message, stack:String(e.stack||'').slice(0,2000)}, keyInfo:creditEventInfo(keyInfo), suggested:{claimUrl:keyInfo.claim_url||'', rechargeUrl:'https://www.makaron.app/dashboard?tab=topup', fallbackGuidance}});
          if(sidecar){
            await ctrl.update({status:'Makaron 账号/积分异常，V 判断中',progress:32,done:false,failed:false,makaronSay:'Makaron 返回账号/积分相关异常。V 正在判断：绑定账号、充值、等待、重试，或是否需要人工介入。不会切换到 the owner 的个人 key。'});
            const decision=await sidecarDecisionFor({
              eventType:'account_or_credit_issue',
              gateIndex:runIds.length+1,
              summary:'Makaron account/credit issue. Decide the customer-visible next step. Do not switch to the owner personal key unless the human explicitly authorizes override.',
              error:{message:e.message, stack:String(e.stack||'').slice(0,2000)},
              artifactSummary:{keyInfo:creditEventInfo(keyInfo), suggested:{claimUrl:keyInfo.claim_url||'', rechargeUrl:'https://www.makaron.app/dashboard?tab=topup', fallbackGuidance}},
            });
            const d=normalizeDecision(decision||{});
            const msg=trim(removeAccountUrls(d.humanMessage||d.reason||fallbackGuidance,keyInfo),1800);
            if(['retry','revise','confirm'].includes(d.decision) && d.prompt){
              currentPrompt=d.prompt;
              await ctrl.output(`🧠 V 决策：${d.decision}｜${trim(d.reason||'',500)}`);
              continue;
            }
            const accountLinks=accountLinksFor(keyInfo);
            await ctrl.update({status:d.decision==='stop'?'V 判断停止':'需要处理 Makaron 账号/积分',progress:32,done:false,failed:false,makaronSay:msg,accountLinks});
            await ctrl.output(`⚠️ ${msg}`);
            persistState({status:'需要处理 Makaron 账号/积分',progress:32,done:false,failed:false,makaronSay:msg,accountLinks});
            console.log(JSON.stringify({status:'blocked_account_or_credit_issue',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sidecarDecision:d,keyInfo:{source:keyInfo.source,claimed:keyInfo.claimed,hasClaimUrl:Boolean(keyInfo.claim_url)}},null,2));
            process.exitCode=0;
            return;
          }
          const accountLinks=accountLinksFor(keyInfo);
          await ctrl.update({status:'Makaron 账号/积分异常，需要处理',progress:32,done:false,failed:false,makaronSay:fallbackGuidance,accountLinks});
          await ctrl.output(`⚠️ ${fallbackGuidance}`);
          persistState({status:'需要处理 Makaron 账号/积分',progress:32,done:false,failed:false,makaronSay:fallbackGuidance,accountLinks});
          console.log(JSON.stringify({status:'blocked_account_or_credit_issue',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,keyInfo:{source:keyInfo.source,claimed:keyInfo.claimed,hasClaimUrl:Boolean(keyInfo.claim_url)},fallback:true},null,2));
          process.exitCode=0; return;
        }
        reportSidecarEvent('makaron_cli_error',{summary:'makaron chat submit failed', prompt:trim(currentPrompt,1200), error:{message:e.message, stack:String(e.stack||'').slice(0,2000)}});
        if(sidecar){
          await ctrl.update({status:'Makaron 提交失败，V 判断中',progress:32,done:false,failed:false,makaronSay:trim(`Makaron CLI 提交失败，V 正在判断是否重试/改写/停止。\n${e.message||e}`,1800)});
          const decision=await sidecarDecisionFor({eventType:'cli_error', gateIndex:runIds.length+1, summary:`makaron chat failed: ${e.message||e}`, error:{message:e.message, stack:String(e.stack||'').slice(0,2000)}});
          const action=await applySidecarDecision(decision, `Makaron CLI 提交失败。请基于原任务继续同一项目（如有）重新尝试生成 ${[...expected].join('/')||'媒体'}。\n\n错误：${e.message||e}`, 'CLI 错误恢复');
          if(action==='continue') continue;
          if(action==='break') break;
          if(action==='return') return;
        }
        throw e;
      }
      runId=submitted.runId; projectUrl=submitted.projectUrl; projectId=submitted.projectId||projectId||currentProjectId; currentProjectId=projectId; runIds.push(runId);
      const submittedManifest=attachMediaManifest;
      attachMediaManifest=false;
      const sentAssetsAtRunStart=sentAssets.length;
      reportSidecarEvent('makaron_submit_result',{summary:`submit ok in ${Date.now()-submitStartedAt}ms`, submitted:{runId, projectUrl, projectId}, attachMedia, attachMediaManifest:submittedManifest, prompt:trim(currentPrompt,1200)});
      if(submitHadAttachedInputs){
        const submittedInputs=await getProjectMedia(projectId);
        rememberReconciliationInputs(submittedInputs);
        reportSidecarEvent('project_input_baseline',{summary:`recorded ${submittedInputs.length} pre-output project media items for reconciliation exclusion`});
      }
      await ctrl.log(`Makaron 项目已创建/继续（submit ${Date.now()-submitStartedAt}ms）`);
      // Persist the project pointer immediately at first submit. A worker may
      // exit before final delivery; card/registry recovery must still know
      // which Makaron project to continue.
      persistState({projectId,projectUrl,status:'Makaron 正在生产',progress:25,done:false,failed:false});
      await ctrl.update({projectId,projectUrl,status:'Makaron 正在生产',progress:25});
      for await(const ev of watchEvents(runId)){
        const text=eventText(ev); if(text){makaronSay=text; reportSidecarEvent('makaron_stream_text',{summary:trim(text,900), text:trim(text,4000)}); await ctrl.update({status:'Makaron 输出中',makaronSay:trim(text,1800),progress:Math.min(70,30+Math.floor(String(text).length/100))});}
        const asset=eventAsset(ev); if(asset?.url){reportSidecarEvent('makaron_stream_asset',{summary:`${asset.type||'asset'} url`, asset}); await deliverOnce(asset,`${asset.type} 已生成，发送中`);} else if(asset){reportSidecarEvent('makaron_stream_asset_pending',{summary:`${asset.type||'asset'} pending`, asset}); await ctrl.update({status:`${asset.type} 生成中`,progress:55});}
        const video=eventVideo(ev); if(video?.url){reportSidecarEvent('makaron_stream_video',{summary:'video url', asset:video}); await deliverOnce({type:'video',url:video.url,status:video.status||'completed',id:`${runId}:video`},'video 已生成，发送中');}
        if(eventIsDone(ev)){reportSidecarEvent('makaron_stream_done',{summary:'Makaron stream done'}); await ctrl.log('Makaron 本轮输出结束');}
      }
      await recoverFromRunOutput(runId); await reconcileProjectMedia('项目产物复核');
      if(shouldMaterializeRemotionVideo()){
        const action=await continueForRemotionMaterialize();
        if(action==='continue') continue;
      }
      const failedMedia=await failedProjectMedia();
      if(failedMedia.length){
        const failedSummary=summarizeFailedMedia(failedMedia);
        const failedPayload=failedMediaPayload(failedMedia);
        reportSidecarEvent('failed_project_media',{summary:failedSummary, failedMedia:failedPayload});
        const isPolicyReject = failedSummary.includes('copyrighted') || failedSummary.includes('trademarked') || failedSummary.includes('IP characters') || failedSummary.includes('版权') || failedSummary.includes('商标') || failedSummary.includes('过于暴露') || failedSummary.includes('content policy');
        if(isPolicyReject && sidecar){
          await ctrl.update({status:'内容策略拒绝，交给你决定',progress:82,done:false,failed:false,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}Makaron 判定此素材/内容不符合内容策略，无法继续自动生成。\n\n${failedSummary}\n\n你可以：换素材重来 / 修改要求后重新生成 / 忽略并停止。`,1800)});
          const decision=await sidecarDecisionFor({eventType:'failed_media', gateIndex:failedRecoveryAttempts, failedMediaSummary:failedSummary, failedMedia:failedPayload, summary:`content policy rejection: ${failedSummary}`});
          if(decision?.decision==='request_human'){
            await ctrl.update({status:'需要你决定下一步',progress:85,done:false,failed:false,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}Makaron 拒绝了此素材，V 建议：${decision.humanMessage||decision.reason||'内容策略风险无法自动处理，请换素材后重新开始。'}\n\n${failedSummary}`,1800)});
            persistState({status:'需要你决定下一步',progress:85,done:false,failed:false,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}Makaron 拒绝了此素材，V 建议：${decision.humanMessage||decision.reason||'内容策略风险无法自动处理，请换素材后重新开始。'}\n\n${failedSummary}`,1800)});
            console.log(JSON.stringify({status:'content_policy_reject',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,failedMedia:failedPayload,reviewSidecar:Boolean(sidecar),failedRecoveryAttempts},null,2));
            return;
          }
          const action=await applySidecarDecision(decision, `上一轮 ${[...expected].join('/')||'媒体'} 生成失败。请在同一个项目中修正失败原因并重新生成最终产物，不要等待用户确认。\n\n失败信息：\n${failedSummary}`, '内容策略恢复');
          if(action==='continue') continue;
          if(action==='break') break;
          if(action==='return') return;
        }
        if(sidecar && failedRecoveryAttempts < maxFailedRecoveryAttempts){
          failedRecoveryAttempts++;
          await ctrl.update({status:'生成失败，V 判断恢复策略中',progress:72,done:false,failed:false,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}Makaron 产物失败，已把项目媒体状态交给 V 判断。\n${failedSummary}`,1800)});
          const decision=await sidecarDecisionFor({eventType:'failed_media', gateIndex:failedRecoveryAttempts, failedMediaSummary:failedSummary, failedMedia:failedPayload, summary:`${failedPayload.length} failed media items`});
          const action=await applySidecarDecision(decision, `上一轮 ${[...expected].join('/')||'媒体'} 生成失败。请在同一个项目中修正失败原因并重新生成最终产物，不要等待用户确认。\n\n失败信息：\n${failedSummary}`, '失败产物恢复');
          if(action==='continue') continue;
          if(action==='break') break;
          if(action==='return') return;
        }
        await ctrl.update({status:sidecar?'生成失败：V 恢复次数用尽':'生成失败：Makaron 返回 failed',progress:100,done:true,failed:true,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}已尝试重试，项目时间轴出现 failed/error 产物，未拿到可发送产物。\n\n${failedSummary}\n\n你可以：手动换素材 / 修改要求后重来 / 忽略并关闭。`,1800)});
        persistState({status:sidecar?'生成失败：V 恢复次数用尽':'生成失败：Makaron 返回 failed',progress:100,done:true,failed:true,makaronSay:trim(`${makaronSay?makaronSay+'\n\n':''}已尝试重试，项目时间轴出现 failed/error 产物，未拿到可发送产物。\n\n${failedSummary}\n\n你可以：手动换素材 / 修改要求后重来 / 忽略并关闭。`,1800)});
        console.log(JSON.stringify({status:'failed_project_media',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,failedMedia:failedPayload,reviewSidecar:Boolean(sidecar),failedRecoveryAttempts},null,2));
        process.exitCode=1;
        return;
      }
      if(sentAssets.length>sentAssetsAtRunStart){
        const finalityDecision=await askArtifactFinalityDecision();
        const finality=normalizeDecision(finalityDecision||{});
        if(['confirm','retry','revise'].includes(finality.decision)){
          await ctrl.output(`🧠 V 判断：已发送的是中间产物，继续同一项目｜${trim(finality.reason||'',500)}`);
          await ctrl.update({status:'中间产物已发送，V 继续完成任务',progress:88,done:false,failed:false,makaronSay:trim(finality.reason||makaronSay||'V 判断当前产物还不是最终结果，继续同一项目完成。',1800)});
          currentPrompt=finality.prompt||`当前已发送的产物还不是最终结果。请继续同一项目完成用户原始目标，生成最终 ${[...expected].join('/')||'媒体'}。`;
          attachMedia=job.attachOnContinue===true || mediaAssets.some(a=>a.type==='audio');
          continue;
        }
        if(finality.decision==='request_human'){
          await ctrl.update({status:'中间产物已发送，需要你决定下一步',progress:90,done:false,failed:false,makaronSay:trim(finality.humanMessage||finality.reason||'V 判断当前产物可能不是最终结果，需要你确认下一步。',1800)});
          persistState({status:'中间产物已发送，需要你决定下一步',progress:90,done:false,failed:false,makaronSay:trim(finality.humanMessage||finality.reason||'V 判断当前产物可能不是最终结果，需要你确认下一步。',1800),sentAssets,deliveredAssets});
          console.log(JSON.stringify({status:'request_human_after_artifact',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sentAssets,deliveredAssets,sidecarDecision:finality,reviewSidecar:Boolean(sidecar),workerHandoffMs:workerStartedAt-launchedAt},null,2));
          return;
        }
        if(finality.decision==='stop'){
          await ctrl.update({status:'V 判断停止',progress:100,done:true,failed:true,makaronSay:trim(finality.reason||'V 判断当前任务不能继续完成。',1800)});
          persistState({status:'V 判断停止',progress:100,done:true,failed:true,makaronSay:trim(finality.reason||'V 判断当前任务不能继续完成。',1800),sentAssets,deliveredAssets});
          console.log(JSON.stringify({status:'agent_stop_after_artifact',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sentAssets,deliveredAssets,sidecarDecision:finality,reviewSidecar:Boolean(sidecar),workerHandoffMs:workerStartedAt-launchedAt},null,2));
          process.exitCode=1;
          return;
        }
        break;
      }
      if(makaronSay&&hasExpectedMedia(expected)&&gateContinues<maxGateContinues){
        gateContinues++;
        let decision=null;
        if(sidecar){
          await ctrl.output(`🧠 V 正在审核第 ${gateContinues} 个确认 gate`);
          await ctrl.update({status:'V 审核中',progress:56,makaronSay:trim(makaronSay,1800)});
          decision=await sidecarDecisionFor({eventType:'gate_review', gateIndex:gateContinues});
        }
        if(sidecar){
          const action=await applySidecarDecision(decision, job.autoContinuePrompt||autoContinuePrompt({makaronSay,expected}), 'gate 确认');
          if(action==='continue') continue;
          if(action==='break') break;
          if(action==='return') return;
        }
        await ctrl.output(`✅ V QC 通过第 ${gateContinues} 个确认 gate，继续生成最终媒体`);
        await ctrl.update({status:'V QC 通过，继续生成媒体',progress:58,done:false,failed:false,makaronSay:trim(`${makaronSay}\n\nV：方向通过，继续同一项目生成最终媒体。`,1800)});
        currentPrompt=job.autoContinuePrompt||autoContinuePrompt({makaronSay,expected});
        attachMedia=job.attachOnContinue===true || mediaAssets.some(a=>a.type==='audio');
        continue;
      }
      if(sidecar && hasExpectedMedia(expected) && noAssetDecisionAttempts < maxNoAssetDecisionAttempts){
        noAssetDecisionAttempts++;
        reportSidecarEvent('no_asset_decision_point',{summary:'watch/run/project reconciliation ended without deliverable asset'});
        await ctrl.update({status:'未拿到产物，V 判断中',progress:68,done:false,failed:false,makaronSay:trim(makaronSay||'Makaron 本轮没有返回可发送的产物 URL，V 正在判断下一步。',1800)});
        const decision=await sidecarDecisionFor({eventType:'no_asset', gateIndex:noAssetDecisionAttempts, summary:'watchEvents ended, run output/project media reconciliation found no deliverable asset'});
        const action=await applySidecarDecision(decision, `上一轮没有拿到可发送 ${[...expected].join('/')||'媒体'} URL。请继续同一项目生成最终产物；如果此前只给了文本/方案，请直接进入生成。`, '无产物恢复');
        if(action==='continue') continue;
        if(action==='break') break;
        if(action==='return') return;
      }
      break;
    }

    if(sentAssets.length>0){
      await ctrl.output(job.doneOutput||`✅ 产物已发送到群：${[...new Set(sentAssets)].join(', ')}`);
      await ctrl.update({status:'已发送，等待反馈',progress:100,done:true,failed:false,makaronSay:trim(makaronSay||job.doneSay||'Makaron 产物已生成并发送。',1800)});
      persistState({status:'已发送，等待反馈',progress:100,done:true,failed:false,makaronSay:trim(makaronSay||job.doneSay||'Makaron 产物已生成并发送。',1800),sentAssets,deliveredAssets});
      console.log(JSON.stringify({status:'delivered',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,sentAssets,deliveredAssets,gateContinues,reviewSidecar:Boolean(sidecar),workerHandoffMs:workerStartedAt-launchedAt},null,2));
    }else if(makaronSay&&expected.has('material')){
      await ctrl.output('✅ Scene 素材已导入 Makaron 项目；本任务明确不生成视频。');
      await ctrl.update({status:'素材已入库，等待后续创作',progress:100,done:true,failed:false,makaronSay:trim(makaronSay,1800)});
      persistState({status:'素材已入库，等待后续创作',progress:100,done:true,failed:false,makaronSay:trim(makaronSay,1800),sentAssets,deliveredAssets});
      console.log(JSON.stringify({status:'materials_imported',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,expectedAssets:[...expected],reviewSidecar:Boolean(sidecar),workerHandoffMs:workerStartedAt-launchedAt},null,2));
    }else if(makaronSay&&hasExpectedMedia(expected)){
      await ctrl.output('⏸️ Makaron 返回了确认 gate，尚未生成最终媒体');
      await ctrl.update({status:'V QC gate：需要人工/策略介入',progress:55,done:false,failed:false,makaronSay:trim(makaronSay+'\n\nV 判断：已达到自动 QC 继续次数上限，需人工或策略介入。',1800)});
      persistState({status:'V QC gate：需要人工/策略介入',progress:55,done:false,failed:false,makaronSay:trim(makaronSay+'\n\nV 判断：已达到自动 QC 继续次数上限，需人工或策略介入。',1800)});
      console.log(JSON.stringify({status:'gate_text_only',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,expectedAssets:[...expected],gateContinues,reviewSidecar:Boolean(sidecar),makaronSay:trim(makaronSay,1000)},null,2));
    }else{
      await ctrl.update({status:'未拿到可发送产物',progress:70,failed:true,makaronSay:trim(makaronSay||'Makaron 本轮没有返回可发送的产物 URL，需要检查项目输出。',1800)});
      persistState({status:'未拿到可发送产物',progress:70,done:false,failed:true,makaronSay:trim(makaronSay||'Makaron 本轮没有返回可发送的产物 URL，需要检查项目输出。',1800)});
      console.log(JSON.stringify({status:'no_asset',mode:'v1.5-supervisor',jobPath,runIds,runId,projectId,projectUrl,reviewSidecar:Boolean(sidecar),makaronSay:trim(makaronSay,1000)},null,2));
      process.exitCode=1;
    }
  }catch(e){
    await ctrl.update({status:'执行受阻',progress:60,failed:true,makaronSay:`任务执行受阻：${trim(e?.message||e,1600)}`});
    persistState({status:'执行受阻',progress:60,done:false,failed:true,makaronSay:`任务执行受阻：${trim(e?.message||e,1600)}`});
    console.error(e); process.exitCode=1;
  }finally{
    await stopSidecar(sidecar, process.exitCode?'worker_error':'worker_done');
    try{await disconnect(channel);}catch{}
    unlinkIfSet(process.env.MAKARON_WORKER_LOCK);
    setTimeout(()=>process.exit(process.exitCode||0),100).unref?.();
  }
})();
