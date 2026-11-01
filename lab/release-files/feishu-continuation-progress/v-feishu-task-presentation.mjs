import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export const PRESENTATION_KEY = Symbol.for('openclaw.v.boundTaskPresentation.v1');
export const PRESENTATION_METHOD = 'v.feishu.taskPresentation';
const sources = new Set(['inter-session','voice-direct','voice-native','queued-followup','subagent-announce','cron-continuation','desktop-handback']);
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = value => typeof value === 'string' ? value.trim() : '';
const copy = value => JSON.parse(JSON.stringify(value));
const publicPayload = p => p && !p.isReasoning && p.phase !== 'analysis' && p.phase !== 'commentary';
const safeText = text => String(text ?? '').replace(/\b(?:sk-[\w-]{20,}|gh[oprs]_[\w]{20,}|github_pat_[\w]{20,})\b/gu,'‹已隐去›').replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,'‹已隐去›');
// Older releases persisted an observation interruption as an execution failure.
// Only this exact, locally authored notice is eligible for recovery migration.
const legacyInterruption = r => r.executionOutcome?.error === 'Gateway 重启打断了任务；请核对原执行状态后继续。';
const QUEUED_TEXT='⏳ 请求已排队，等待当前任务结束后继续处理。';

/** Only an explicit external binding is eligible. A key alone is not publish authority. */
export function boundFeishuRoute(entry, actor) {
  if (!entry || entry.archivedAt || entry.delivery?.kind !== 'external') return null;
  const d = entry.delivery.context;
  if (d?.channel !== 'feishu' || !clean(d.accountId)) return null;
  const target = /^(?:chat:)?(oc_[A-Za-z0-9]+)$/u.exec(d.to ?? '') ?? /^(?:user:)?(ou_[A-Za-z0-9]+)$/u.exec(d.to ?? '');
  if (!target) return null;
  const id = target[1], kind = id.startsWith('oc_') ? 'group' : 'direct';
  if (actor && (actor.accountId !== d.accountId || (kind === 'group' ? actor.chatId !== id : actor.openId !== id))) return null;
  return {accountId:d.accountId,to:`${kind === 'group' ? 'chat' : 'user'}:${id}`,chatId:id,kind,...clean(d.threadId)?{threadId:d.threadId}:{}};
}

export class TaskPresentationManager {
  constructor({getEntry,getConfig=()=>({}),directory,logger={},now=Date.now}={}) {
    this.getEntry=getEntry;this.getConfig=getConfig;this.directory=directory;this.logger=logger;this.now=now;
    this.accounts=new Map();this.tasks=new Map();this.runs=new Map();this.claims=new Map();this.opening=new Map();this.closed=false;
    this.progressListener=e=>this.onProgressEvent(e);this.listenProgress();
  }
  listenProgress(){(globalThis[Symbol.for('openclaw.v.progressCardChangedListeners')]??=new Set()).add(this.progressListener);}
  onProgressEvent(event){try{
    const h=this.runs.get(event?.runId);
    if(!h?.ownsRun(event.runId)||event.sessionKey!==(h.record.executionSessionKey??h.record.sessionKey)||JSON.stringify(event).length>100000)return;
    // Native card creation awaits remote APIs. Retain the latest verified plan
    // before a subscriber exists, then let the renderer replay that same event.
    h.record.latestProgressEvent=copy(event);this.save(h.record);
  }catch{}}
  registerAccount(accountId,factory) {
    this.accounts.set(accountId,factory);
    return ()=>{if(this.accounts.get(accountId)===factory)this.accounts.delete(accountId);};
  }
  claimNative(runId,identity) {if(clean(runId)){this.claims.set(runId,identity);if(this.claims.size>2048)this.claims.delete(this.claims.keys().next().value);}}
  entry(key,agentId) {return this.getEntry?.({sessionKey:key,agentId,readConsistency:'latest'});}
  current(record) {
    const e=this.entry(record.sessionKey,record.agentId);
    return e?.sessionId===record.sessionId && (record.lifecycleRevision===undefined||e?.lifecycleRevision===record.lifecycleRevision) && JSON.stringify(boundFeishuRoute(e))===JSON.stringify(record.route);
  }
  save(record) {
    record.updatedAt=this.now();
    if(!this.directory)return;
    try {
    delete record.persistenceError;
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const file=path.join(this.directory,record.id+'.json'),tmp=file+'.'+randomUUID()+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(record),{mode:0o600});fs.renameSync(tmp,file);
    } catch(error){record.persistenceError=true;this.logger.warn?.('Feishu task checkpoint unavailable: '+String(error?.message??error));}
  }
  async open(input,{trusted=false,actor,owner}={}) {
    if(this.closed||!trusted||!sources.has(input?.source)||!clean(input?.sessionKey)||!clean(input?.agentId)||!clean(input?.taskId))return null;
    const entry=this.entry(input.sessionKey,input.agentId),route=boundFeishuRoute(entry,actor);
    if(!route||!clean(entry.sessionId)||input.sessionId&&entry.sessionId!==input.sessionId)return null;
    if(input.runId&&this.claims.has(input.runId))return null;
    if(!this.accounts.has(route.accountId))return null;
    const id=hash(JSON.stringify([input.agentId,input.sessionKey,entry.sessionId,input.source,input.taskId]));
    if(input.runId&&this.runs.has(input.runId)&&this.runs.get(input.runId).record.id!==id)return null;
    if(this.tasks.has(id)){const h=this.tasks.get(id);if(h.record.owner!==(owner??null)||!this.current(h.record))return null;
      if(input.runId&&!h.record.runIds.includes(input.runId)&&!h.bindRun(input.runId))return null;return h;}
    if(this.opening.has(id)){const h=await this.opening.get(id);if(!h||h.record.owner!==(owner??null)||!this.current(h.record))return null;
      if(input.runId&&!h.record.runIds.includes(input.runId)&&!h.bindRun(input.runId))return null;return h;}
    const pending=(async()=>{
      const stored=this.directory?path.join(this.directory,id+'.json'):null;
      if(stored&&fs.existsSync(stored)){
        const record=JSON.parse(fs.readFileSync(stored,'utf8'));
        if(record.owner!==(owner??null)||!this.current(record))return null;
        const h=new TaskPresentation(this,record);this.tasks.set(id,h);
        for(const runId of record.runIds??[])if(!record.delivered)this.runs.set(runId,h);
        if(input.runId&&!record.runIds.includes(input.runId)&&!h.bindRun(input.runId))return null;
        return h;
      }
      if(this.closed)return null;
      const record={v:1,id,agentId:input.agentId,sessionKey:input.sessionKey,sessionId:entry.sessionId,route,source:input.source,taskId:input.taskId,
        owner:owner??null,text:safeText(clean(input.text)).slice(0,20000),createdAt:this.now(),updatedAt:this.now(),phase:'queued',runIds:[],lastSeq:0,
        lifecycleRevision:entry.lifecycleRevision,
        ...(input.source==='cron-continuation'&&clean(input.executionSessionKey)?{executionSessionKey:input.executionSessionKey}:{}),
        anchorId:route.kind==='group'&&/^om_[a-zA-Z0-9_-]+$/u.test(input.anchorId??'')?input.anchorId:null,sinkState:null,publicSnapshot:'',payloads:[],executionOutcome:null,delivered:false};
      const handle=new TaskPresentation(this,record);this.tasks.set(id,handle);this.save(record);
      if(input.runId)handle.bindRun(input.runId);
      // Completion notifications may be deliberate silence. Publish only once
      // this run has public progress or a real outcome; admission is not progress.
      if(input.source!=='subagent-announce')void handle.enqueue(()=>handle.ensureSink());
      if(['queued-followup','desktop-handback'].includes(input.source))void handle.partial({text:QUEUED_TEXT,phase:'commentary',kind:'status'});
      return handle;
    })().catch(error=>{this.logger.warn?.('Feishu task presentation unavailable: '+String(error?.message??error));return null;}).finally(()=>this.opening.delete(id));
    this.opening.set(id,pending);return pending;
  }
  onAgentEvent(event) {try {
    const h=this.runs.get(event?.runId);if(!h||event.sessionKey&&event.sessionKey!==(h.record.executionSessionKey??h.record.sessionKey))return;
    h.observe(event);
  } catch(error){this.logger.warn?.('Feishu task observer unavailable: '+String(error?.message??error));}}
  executionHandle(params) {
    try {
    const h=this.runs.get(params.runId)??[...this.tasks.values()].find(h=>h.record.activeRunId===params.runId&&(h.record.interruptedAt||legacyInterruption(h.record)));
    if(!h||!this.current(h.record)||params.sessionKey&&params.sessionKey!==(h.record.executionSessionKey??h.record.sessionKey)||params.sessionId&&params.sessionId!==h.record.sessionId&&h.record.source!=='cron-continuation'||params.agentId&&params.agentId!==h.record.agentId)return null;
    return h;
    } catch{return null;}
  }
  async rpc({params:p,client,respond}) {
    try {
      const actor=client?.internal?.voiceActor,admin=client?.connect?.scopes?.includes('operator.admin');
      if(!actor&&!admin)throw Error('presentation requires an authorized backend caller');
      if(!p||typeof p!=='object'||!['begin','event','finish','status','owns'].includes(p.op))throw Error('invalid presentation operation');
      if(actor&&(p.sessionKey!==actor.sessionKey||p.agentId!==actor.agentId))throw Error('presentation conversation mismatch');
      const owner=JSON.stringify([client?.connId??'internal',actor?.accountId??null,actor?.openId??null]);
      if(p.op==='owns'){
        const h=this.runs.get(p.runId)??[...this.tasks.values()].find(h=>h.record.runIds.includes(p.runId));
        // Native observers belong to the validated session, independently of
        // the Voice transport. RPC-created presentation handles remain owned
        // by their exact connection; arbitration never exposes task contents.
        if(actor&&h&&h.record.owner!==null&&h.record.owner!==owner)throw Error('presentation ownership mismatch');
        const native=this.claims.get(p.runId);
        const nativeAgent=native?.agentId??/^agent:([^:]+):/u.exec(native?.sessionKey??'')?.[1];
        respond(true,{owned:Boolean(h&&h.record.agentId===p.agentId&&h.record.sessionKey===p.sessionKey||native?.sessionKey===p.sessionKey&&nativeAgent===p.agentId)});return;
      }
      if(p.op==='begin') {
        if(p.source!=='voice-direct'||!clean(p.runId)||p.taskId!==p.runId||typeof p.text!=='string'||p.text.length>20000)throw Error('invalid voice task presentation');
        const h=await this.open(p,{trusted:true,actor,owner});
        respond(true,h?{presentationId:h.record.id,enabled:true}:{enabled:false});return;
      }
      const h=this.tasks.get(p.presentationId);
      if(!h||h.record.owner!==owner||h.record.sessionKey!==p.sessionKey||h.record.agentId!==p.agentId)throw Error('presentation ownership mismatch');
      if(p.op==='status'){respond(true,{phase:h.record.phase,delivered:h.record.delivered,error:h.record.error??null});return;}
      if(!h.record.runIds.includes(p.runId)||h.record.activeRunId&&h.record.activeRunId!==p.runId)throw Error('presentation run mismatch');
      if(p.op==='event'&&(!p.event||JSON.stringify(p.event).length>100000))throw Error('invalid presentation event');
      if(!Number.isSafeInteger(p.sequence)||p.sequence<1)throw Error('invalid presentation sequence');
      if(p.sequence<=h.record.lastSeq){respond(true,{duplicate:true});return;}
      h.record.lastSeq=p.sequence;this.save(h.record);
      if(p.op==='finish')await h.finish(p.result,p.error);
      else {if(!p.event||JSON.stringify(p.event).length>100000)throw Error('invalid presentation event');h.observe({...p.event,runId:p.runId,sessionKey:p.sessionKey});await h.flush();}
      respond(true,{accepted:true,delivered:h.record.delivered});
    } catch(error){respond(false,undefined,{code:'INVALID_REQUEST',message:String(error?.message??error)});}
  }
  async recover() {
    if(!this.directory||!fs.existsSync(this.directory))return;
    for(const name of fs.readdirSync(this.directory).filter(n=>/^[a-f0-9]{64}\.json$/u.test(n)).slice(-1024)) {
      let r;try{r=JSON.parse(fs.readFileSync(path.join(this.directory,name),'utf8'));}catch{continue;}
      if(r.v!==1||r.id+'.json'!==name||r.delivered&&!legacyInterruption(r)&&(!r.deliveryCompletion||r.deliverySettled)||this.tasks.has(r.id)||!this.accounts.has(r.route?.accountId))continue;
      if(!this.current(r)){r.phase='retired';this.save(r);continue;}
      const h=new TaskPresentation(this,r);this.tasks.set(r.id,h);
      // Do not rewrite an old visible notice or replay execution on startup.
      // A subsequently admitted execution of this exact run may reclaim it.
      if(legacyInterruption(r))continue;
      if(r.delivered){await h.settleDelivery();continue;}
      if(r.executionOutcome)await h.finish(r.executionOutcome.result,r.executionOutcome.error);
      else if(r.capturedTerminal&&!r.yielded&&r.source!=='cron-continuation')await h.finish({payloads:r.payloads});
      else await h.interrupt();
    }
  }
  async retryPending(){
    for(const h of this.tasks.values()){
      if(h.record.delivered&&h.record.deliveryCompletion&&!h.record.deliverySettled){await h.settleDelivery();continue;}
      if(h.record.delivered||h.record.phase==='retired'||!h.record.error||h.retrying||this.now()<(h.record.retryAfter??0))continue;
      h.retrying=true;
      try {this.save(h.record);if(h.record.executionOutcome)await h.finish();else if(h.record.interruptedAt)await h.interrupt();else await h.start();}
      finally {h.retrying=false;}
    }
  }
  async close(){this.closed=true;globalThis[Symbol.for('openclaw.v.progressCardChangedListeners')]?.delete(this.progressListener);await Promise.all([...this.tasks.values()].map(h=>h.flush()));for(const h of this.tasks.values())await h.sink?.cleanup?.();this.runs.clear();}
}

class TaskPresentation {
  constructor(manager,record){this.manager=manager;this.record=record;this.queue=Promise.resolve();this.sink=null;this.seen=new Set();this.partialQueued=false;}
  enqueue(fn){this.queue=this.queue.then(async()=>{
    if(!this.manager.current(this.record)){this.record.phase='retired';this.manager.save(this.record);return;}
    if(this.manager.now()<(this.record.retryAfter??0))return;
    return fn();
  }).catch(error=>{this.record.error=String(error?.message??error).slice(0,500);this.record.deliveryAttempts=(this.record.deliveryAttempts??0)+1;
    // A rejected native finalization can poison the dispatcher's internal idle
    // promise. Retry with a fresh dispatcher resuming the persisted card/message,
    // never with the failed in-memory sender or a new model execution.
    const failedSink=this.sink;this.sink=null;
    void Promise.resolve().then(()=>failedSink?.cleanup?.()).catch(()=>{});
    this.record.retryAfter=this.manager.now()+Math.min(60000,1000*2**Math.min(this.record.deliveryAttempts-1,6));
    this.manager.save(this.record);this.manager.logger.warn?.('Feishu task presentation: '+this.record.error);});return this.queue;}
  async ensureSink(){if(this.record.persistenceError)throw Error('Feishu task checkpoint unavailable');const f=this.manager.accounts.get(this.record.route.accountId);if(!f)throw Error('Feishu account unavailable');
    if(this.sink&&this.factory===f)return this.sink;
    await this.sink?.cleanup?.();this.sink=null;await f.authorize?.(this.record.route);
    this.sink=await f.open(this.record,async state=>{this.record.sinkState=copy(state);this.manager.save(this.record);});this.factory=f;return this.sink;}
  bindRun(runId,{continuation=false}={}){if(!clean(runId)||this.record.delivered||!this.manager.current(this.record))return false;
    if(this.manager.claims.has(runId)||this.manager.runs.has(runId)&&this.manager.runs.get(runId)!==this)return false;
    if(this.record.activeRunId&&this.record.activeRunId!==runId&&this.record.phase!=='waiting'&&!continuation)return false;
    if(this.record.activeRunId&&this.record.activeRunId!==runId){
      this.record.payloads=[];this.record.publicSnapshot='';this.record.yielded=false;this.record.capturedTerminal=false;this.record.executionFailed=false;delete this.record.latestProgressEvent;
    }
    if(!this.record.runIds.includes(runId))this.record.runIds.push(runId);
    this.record.activeRunId=runId;this.manager.save(this.record);this.manager.runs.set(runId,this);return true;}
  ownsRun(runId){return !this.record.delivered&&this.manager.current(this.record)&&this.manager.runs.get(runId)===this&&(!this.record.activeRunId||this.record.activeRunId===runId);}
  selectModel(model){if(!this.record.delivered&&model?.provider&&model?.model){this.record.selectedModel={...this.record.selectedModel,...model,agentRuntime:model.agentRuntime??this.record.selectedModel?.agentRuntime};this.manager.save(this.record);}}
  async interrupt(){
    this.record.interruptedAt??=this.manager.now();this.record.phase='interrupted';this.manager.save(this.record);
    // An interrupted observer has no authority to settle the task ledger.
    return this.partial({text:'⚠️ Gateway 已重启，等待原任务恢复或核对执行状态。',phase:'commentary',kind:'status'});
  }
  resumeExecution(params){
    if(this.manager.executionHandle(params)!==this||this.manager.claims.has(params.runId))return false;
    if(this.record.interruptedAt||legacyInterruption(this.record)){
      this.record.interruptions=[...(this.record.interruptions??[]),{at:this.record.interruptedAt??this.record.updatedAt,resumedAt:this.manager.now(),runId:params.runId}].slice(-16);
      delete this.record.interruptedAt;
      const legacy=legacyInterruption(this.record);
      this.record.delivered=false;this.record.executionOutcome=null;this.record.payloads=[];this.record.publicSnapshot='';
      this.record.capturedTerminal=false;this.record.executionFailed=false;this.record.yielded=false;delete this.record.latestProgressEvent;this.seen.clear();
      delete this.record.error;delete this.record.retryAfter;
      if(legacy){this.record.deliverySettled=false;delete this.record.deliveryCompletion;
        // Retain the native card identity, but the interruption notice is not
        // a receipt for the resumed execution's eventual final payload.
        this.record.sinkState={...this.record.sinkState,deliveredPayloads:0,receipts:[]};
        const old=this.sink;this.sink=null;void Promise.resolve(old?.cleanup?.()).catch(()=>{});
      }
      this.manager.runs.set(params.runId,this);this.manager.save(this.record);
      void this.partial({text:'已恢复执行，正在继续处理原任务。',phase:'commentary',kind:'status'});
    }
    return this.ownsRun(params.runId);
  }
  start(model){this.selectModel(model);
    if(this.record.publicSnapshot===QUEUED_TEXT)void this.partial({text:'正在继续处理请求。',phase:'commentary',kind:'status'});
    return this.enqueue(async()=>{if(this.record.delivered)return;
    this.record.phase='running';this.manager.save(this.record);
    if(this.record.source==='subagent-announce'&&!this.record.publicSnapshot&&!this.record.sinkState)return;
    const s=await this.ensureSink();await s.start?.(this.record.selectedModel);});}
  partial(payload){if(!payload||payload.isReasoning||payload.phase==='analysis'||!clean(payload.text)||this.record.delivered)return;
    const text=safeText(payload.text).slice(-100000);
    // Native final-answer streaming arrives before final normalization. Hold
    // control-token prefixes so a silent turn cannot create a preview card.
    if(this.record.source==='subagent-announce'&&['NO_REPLY','REPLY_SKIP','ANNOUNCE_SKIP'].some(token=>token.startsWith(clean(text))))return;
    if(this.record.publicSnapshot===text)return;this.record.publicSnapshot=text;
    if(this.partialQueued)return this.queue;this.partialQueued=true;
    return this.enqueue(async()=>{this.partialQueued=false;this.manager.save(this.record);const s=await this.ensureSink();await s.partial?.({...payload,text:this.record.publicSnapshot});});}
  observe(event){if(!this.ownsRun(event.runId))return;const d=event.data??{};
    const key=event.seq!==undefined?event.runId+':'+event.seq+':'+event.stream:null;if(key&&this.seen.has(key))return;if(key){this.seen.add(key);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);}
    if(event.stream==='lifecycle'&&d.phase==='start')this.start(d);
    if(event.stream==='item'&&d.kind==='preamble'&&!d.isReasoning&&d.phase!=='analysis'&&clean(d.progressText))this.partial({text:d.progressText,phase:'commentary',kind:'preamble',itemId:d.itemId});
    if(event.stream==='tool'&&d.phase==='start'&&!d.hideFromChannelProgress)this.enqueue(async()=>{const s=await this.ensureSink();await s.tool?.({name:d.name,phase:d.phase});});
  }
  capture(result){if(!result)return;const payloads=(result.payloads??[]).filter(publicPayload).map(p=>({...p,...p.text?{text:safeText(p.text)}:{}}));
    if(Array.isArray(result.payloads))this.record.payloads=copy(payloads);
    this.record.yielded=result.meta?.yielded===true||result.yielded===true;
    this.record.executionFailed=this.record.executionFailed===true||result.meta?.aborted===true||payloads.some(p=>p.isError===true);
    this.record.capturedTerminal=!this.record.yielded;this.manager.save(this.record);}
  async finish(result,error){if(this.record.delivered)return this.flush();
    if(result?.payloads)this.capture(result);
    if((result?.yielded===true||result?.meta?.yielded===true||(this.record.yielded&&typeof result?.text!=='string'&&typeof result?.result!=='string'))&&!error){this.record.phase='waiting';this.manager.save(this.record);return this.flush();}
    const text=typeof result?.text==='string'?result.text:typeof result?.result==='string'?result.result:undefined;
    let payloads=text!==undefined?[{text:safeText(text)},...this.record.payloads.filter(p=>p.mediaUrl||p.mediaUrls?.length).map(p=>({...p,text:undefined}))]:this.record.payloads;
    if(error){const detail=String(error?.message??error);const reason=/超时|timeout|timed out/iu.test(detail)?'任务超时，尚未完成。':/取消|cancel|abort/iu.test(detail)?'任务已取消。':/重启/iu.test(detail)?'Gateway 重启后无法确认原执行状态，请回到原会话核对。':'任务未完成，请回到原会话查看错误。';payloads=[{text:'⚠️ '+reason,isError:true}];}
    const silent=p=>!p.mediaUrl&&!p.mediaUrls?.length&&!p.isError&&(!clean(p.text)||['NO_REPLY','REPLY_SKIP','ANNOUNCE_SKIP'].includes(clean(p.text)));
    const suppress=this.record.source==='subagent-announce'&&!error&&!this.record.executionFailed&&payloads.every(silent);
    payloads=payloads.filter(p=>!silent(p));
    if(!payloads.length&&!suppress)payloads=[{text:this.record.executionFailed?'⚠️ 任务未完成，请回到原会话查看错误。':'任务已结束，本轮没有文字结果。',...(this.record.executionFailed?{isError:true}:{})}];
    // First terminal is canonical. Retries replay its exact payload rather than a late caller's result.
    if(!this.record.executionOutcome){this.record.executionOutcome={result:{payloads:copy(payloads)},suppressed:suppress,error:error?String(error?.message??error):null};
      this.record.phase=error||this.record.executionFailed?'failed':'completed';this.manager.save(this.record);}
    payloads=this.record.executionOutcome.result.payloads;
    return this.enqueue(async()=>{if(this.record.delivered)return;
      if(this.record.executionOutcome.suppressed){
        // Close an existing preview without inventing a final payload or ACK.
        // With no public content, do not even construct the native sender.
        if(this.sink||this.record.sinkState){const s=await this.ensureSink();await s.suppress?.();await s.cleanup?.();}
        this.record.suppressed=true;this.record.delivered=true;delete this.record.error;delete this.record.retryAfter;
        this.manager.save(this.record);for(const id of this.record.runIds)if(this.manager.runs.get(id)===this)this.manager.runs.delete(id);return;
      }
      const s=await this.ensureSink();await this.factory.authorize?.(this.record.route);await s.start?.();await s.finish(payloads);
      this.record.delivered=true;delete this.record.error;delete this.record.retryAfter;this.manager.save(this.record);await this.settleDelivery();for(const id of this.record.runIds)if(this.manager.runs.get(id)===this)this.manager.runs.delete(id);await s.cleanup?.();});
  }
  flush(){return this.queue;}
  captureDelivery(payloads){
    const completion=globalThis[Symbol.for('openclaw.v.boundTaskDeliveryCompletion.v1')]?.resolve(payloads);
    if(completion){this.record.deliveryCompletion=copy(completion);this.manager.save(this.record);}
  }
  async settleDelivery(){
    const r=this.record;if(r.suppressed||!r.delivered||!r.deliveryCompletion||r.deliverySettled||!this.manager.current(r))return;
    const complete=globalThis[Symbol.for('openclaw.v.boundTaskDeliveryCompletion.v1')]?.complete;
    const receipt=r.sinkState?.receipts?.find(x=>x.visibleReplySent===true&&x.messageId);
    if(!complete||!receipt)return;
    try{await complete(r.deliveryCompletion,receipt);r.deliverySettled=true;delete r.settlementError;}
    catch(error){r.settlementError=String(error?.message??error).slice(0,500);}
    this.manager.save(r);
  }
}

/** Gateway registration is owned by the native Feishu plugin, not each Worker. */
export function registerTaskPresentation(api,{onAgentEvent}={}) {
  if(process.env.VLAB_WORKER_CHILD==='1'||process.env.V_FEISHU_TASK_PRESENTATION!=='1')return;
  let manager=globalThis[PRESENTATION_KEY];
  if(!manager){manager=new TaskPresentationManager({getEntry:p=>api.runtime.agent.session.getSessionEntry(p),getConfig:()=>api.runtime.config?.loadConfig?.()??api.config,logger:api.logger});globalThis[PRESENTATION_KEY]=manager;}
  api.registerGatewayMethod(PRESENTATION_METHOD,opts=>manager.rpc(opts),{scope:'operator.write'});
  let unsubscribe,retryTimer;
  api.registerService({id:'feishu-bound-task-presentation',start:async ctx=>{manager.closed=false;manager.listenProgress();manager.directory=path.join(ctx.stateDir??process.env.OPENCLAW_STATE_DIR,'feishu-task-presentation');unsubscribe=onAgentEvent?.(e=>manager.onAgentEvent(e));await manager.recover();
    retryTimer=setInterval(()=>{void manager.retryPending().catch(error=>api.logger.warn?.(String(error?.message??error)));},5000);retryTimer.unref?.();
  },stop:async()=>{clearInterval(retryTimer);unsubscribe?.();await manager.close();}});
}
