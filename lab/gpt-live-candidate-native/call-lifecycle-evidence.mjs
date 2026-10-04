import {createHash} from 'node:crypto';
import {resolveNativeTurnTranscriptWindow,assessCompletePlaybackWindow,continuousPlaybackQuiet,mergeSessionToolEvidence,toolResultSucceeded} from './evidence.mjs';

const normalize=text=>String(text??'').replace(/[\s，。！？,.!?]/gu,'');
const messageText=m=>typeof m?.content==='string'?m.content:(m?.content??[]).filter?.(v=>v?.type==='text').map(v=>v.text??'').join('\n')??'';
const timestamp=value=>typeof value==='number'?value<1e11?value*1000:value:Date.parse(value);
const queryIncluded=(text,query)=>normalize(text).toLowerCase().includes(normalize(query).toLowerCase());

/** Narrow control diagnostics do not stand in for the combined release gate. */
export function resolveLifecycleValidationProfile(value='full',target='candidate') {
  if(!['full','end-only'].includes(value)||!['candidate','shared','v'].includes(target))
    throw Error('Unknown lifecycle validation scope');
  if(value==='end-only'&&target!=='candidate')throw Error('Narrow lifecycle diagnostics are Candidate-only');
  return {name:value,memoryWebRequired:value==='full',combinedReleaseEvidenceEligible:value==='full'};
}

/** This exact temporary read failure may retry within the caller's existing budget. */
export async function readLifecycleHistoryOrRetry(read,onRebuilding=()=>{}) {
  try {return await read();}
  catch(error) {
    if(error?.message!=='session history is rebuilding; retry shortly')throw error;
    onRebuilding(error);
    return null;
  }
}

/** Private final readback is diagnostic only; never select a neighboring run. */
export function selectLifecycleFinalHistoryBinding({bindings=[],owners,state}={}) {
  if(bindings.length!==1)return {status:'unavailable',reason:'no-unique-owned-backend-binding',bindingCount:bindings.length};
  const binding=bindings[0],owner=owners?.get(binding.pcIndex);
  if(!owner||!binding.sessionId||owner.sessionKey!==binding.sessionKey||owner.voiceSessionId!==binding.voiceSessionId||!binding.runId)
    return {status:'unavailable',reason:'original-owner-or-session-identity-missing'};
  const delegations=(state?.events??[]).filter(e=>e.pcIndex===binding.pcIndex&&e.type==='delegation.created'&&
    e.raw?.item?.target==='client'&&e.raw.item.user_bidi_turn_id===binding.userTurnId&&e.at>=binding.inputStartedAt);
  const calls=(state?.tools??[]).filter(e=>e.raw?.type==='tool.call'&&e.raw.voiceSessionId===binding.voiceSessionId&&
    e.raw.callId===binding.runId&&e.at>=binding.inputStartedAt);
  if(delegations.length!==1||calls.length!==1)return {status:'unavailable',reason:'native-USER-or-host-run-ambiguous'};
  const close=(state?.api??[]).find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===binding.voiceSessionId);
  if(state?.pcStates?.[binding.pcIndex]!=='closed'||!Number.isFinite(close?.requestedAt)||!Number.isFinite(close?.at))
    return {status:'unavailable',reason:'original-close-not-observed'};
  return {status:'bound',binding,originalCloseRequestedAt:close.requestedAt,originalCloseReturnedAt:close.at,
    nativeDelegationId:delegations[0].raw.item.id,hostCallAt:calls[0].at};
}

/** Preserve provider fields only from the actual same-run durable final. */
export function assessLifecycleFinalHistory({selection,history,transcript,body,observedAt}={}) {
  const result={status:'unavailable',source:'owned-backend-post-close-readback',acceptanceGateChanged:false,
    readbackIsNotNativeSpeechOrSemanticAcceptance:true,observedAt:observedAt??null,
    canonicalFinal:body?{textSha256:createHash('sha256').update(body.text).digest('hex'),textBytes:Buffer.byteLength(body.text),
      sourceAt:body.event?.payload?.ts??null,receivedAt:body.canonical?.received?.at??null}:null};
  if(selection?.status!=='bound')return {...result,reason:selection?.reason??'no-owned-binding'};
  const b=selection.binding;
  Object.assign(result,{binding:b,originalCloseRequestedAt:selection.originalCloseRequestedAt,originalCloseReturnedAt:selection.originalCloseReturnedAt});
  if(!Number.isFinite(observedAt)||observedAt<selection.originalCloseReturnedAt)return {...result,reason:'readback-not-after-original-close'};
  if(history?.sessionKey!==b.sessionKey||history?.sessionId!==b.sessionId)return {...result,reason:'final-history-session-identity-mismatch'};
  const historyMessages=history.messages??[];
  result.historyDisplayTruncated=historyMessages.some(m=>m.__openclaw?.truncated===true||m.__openclaw?.reason==='display-cap');
  if(!body||body.event?.payload?.sessionKey!==b.sessionKey||body.event.payload.runId!==b.runId||
    !Number.isFinite(body.event.payload.ts)||body.event.payload.ts<b.inputStartedAt||body.event.payload.ts>observedAt)
    return {...result,reason:'exact-canonical-final-unavailable'};
  const sha=text=>createHash('sha256').update(text).digest('hex'),canonicalHash=sha(body.text);
  result.historyFinalCandidates=historyMessages.filter(m=>m.role==='assistant'&&messageText(m).trim()&&
    sha(messageText(m).trim())===canonicalHash).map(m=>({timestamp:timestamp(m.timestamp??m.__openclaw?.recordTimestampMs),
      textSha256:sha(messageText(m).trim()),displayTruncated:m.__openclaw?.truncated===true||m.__openclaw?.reason==='display-cap'}));
  // chat.history may abbreviate runId or display-cap content. The private
  // SQLite projection supplies original bytes and actual declared identities;
  // the reader's requested runId label alone is deliberately not source proof.
  if(transcript?.canonicalSessionKey!==b.sessionKey||transcript.sessionId!==b.sessionId||
    transcript.queryOnly!==true||transcript.source!=='private-sqlite-active-transcript')
    return {...result,reason:'exact-private-final-transcript-unavailable'};
  const rows=(transcript.rawEvents??[]).flatMap(row=>{
    const message=row.event?.message,declared=[message?.runId,message?.__openclaw?.runId,row.event?.runId,row.event?.data?.runId]
      .filter(value=>typeof value==='string');
    const text=messageText(message).trim();
    if(message?.role!=='assistant'||message.stopReason!=='stop'||!declared.length||declared.some(runId=>runId!==b.runId)||!text||sha(text)!==canonicalHash)return [];
    const messageAt=timestamp(message.timestamp??row.createdAt),persistedAt=timestamp(row.createdAt);
    if(!Number.isFinite(messageAt)||!Number.isFinite(persistedAt)||messageAt>observedAt||persistedAt>observedAt||
      messageAt<b.inputStartedAt||persistedAt<b.inputStartedAt)return [];
    return [{row,message,text,messageAt,persistedAt}];
  });
  if(rows.length!==1)return {...result,reason:'no-unique-exact-run-canonical-durable-final',matchingFinalCount:rows.length};
  const {row,message,text,messageAt,persistedAt}=rows[0],fields=['api','provider','model','responseModel','responseId','modelCallId','stopReason'];
  const providerMetadata=Object.fromEntries(fields.map(key=>[key,Object.hasOwn(message,key)?{status:'observed',value:message[key]}:{status:'not-present'}]));
  return {...result,status:'captured',reason:null,final:{rawSeq:row.seq,messageAt,persistedAt,
    timestampIsNotBackendCompletionClock:true,backendFinalSourceAt:body.event.payload.ts,
    textSha256:sha(text),textBytes:Buffer.byteLength(text),rawTextSha256:sha(messageText(message)),rawTextBytes:Buffer.byteLength(messageText(message)),
    originalBytesSource:'same-session-exact-run-private-sqlite-raw-message',
    sourceRunIdentityActuallyDeclared:true,providerMetadata}};
}

/** Same read-only history projection used by native-smoke; clocks stay native. */
export function extractLifecycleToolPairs(history) {
  const messages=history?.messages??[],rows=[];
  for(const message of messages)if(message.role==='assistant'&&Array.isArray(message.content))for(const item of message.content)if(item.type==='toolCall') {
    let args=item.arguments;try{if(typeof args==='string')args=JSON.parse(args)}catch{}
    rows.push({id:item.id,name:item.name,args,source:'session-history',calledAt:timestamp(message.timestamp??message.at??message._transcriptCreatedAt),
      results:messages.filter(m=>m.role==='toolResult'&&m.toolCallId===item.id).map(result=>({
        at:timestamp(result.timestamp??result.at??result._transcriptCreatedAt),isError:result.isError===true,
        text:messageText(result),details:result.details,rawResult:result,source:'session-history'}))});
  }
  return rows;
}

export function resolveLifecycleMemoryUser(events,{pcIndex,after,memoryQuery}={}) {
  if(!memoryQuery)return null;
  const matches=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&e.turnId&&
    Number.isFinite(e.at)&&e.at>=after&&queryIncluded(e.text,memoryQuery)&&/(?:memory|记忆)/iu.test(e.text)&&
    /(?:web|网页)/iu.test(e.text)&&/OpenAI/iu.test(normalize(e.text))&&/(?:real[-\s]*time|实时)/iu.test(e.text)&&/先/u.test(e.text)&&/再/u.test(e.text)&&
    /(?:不要|不)写入/u.test(normalize(e.text))&&/(?:不要|不)发消息/u.test(normalize(e.text)));
  return matches.length===1?matches[0]:null;
}

/** Exact own-session tool identities and actual execution clocks, no old sample. */
export function resolveLifecycleMemoryWeb({events=[],history,sessionKey,memoryQuery,after=-Infinity}={}) {
  if(!sessionKey||!memoryQuery||!Number.isFinite(after))return null;
  const pairs=mergeSessionToolEvidence(events,extractLifecycleToolPairs(history),sessionKey);
  const verified=p=>p.sessionKey===sessionKey&&p.sourceExecutionTimingVerified===true&&p.runId&&Number.isFinite(p.calledAt)&&p.calledAt>=after;
  const succeeded=p=>p.results.filter(r=>Number.isFinite(r.at)&&r.at>=p.calledAt&&toolResultSucceeded(r)&&r.completeBodySource==='session-history');
  const memories=pairs.filter(p=>verified(p)&&p.name==='memory_search'&&queryIncluded(JSON.stringify(p.completeArgs??p.args),memoryQuery));
  for(const memory of memories)for(const memoryResult of succeeded(memory)) {
    let m;try{m=JSON.parse(memoryResult.text)}catch{continue}
    if(!Array.isArray(m.results)||!m.results.some(r=>typeof r.snippet==='string'&&r.snippet.trim()))continue;
    const webs=pairs.filter(p=>verified(p)&&p.runId===memory.runId&&p.name==='web_search'&&p.calledAt>=memoryResult.at&&
      /OpenAI/iu.test(JSON.stringify(p.completeArgs??p.args))&&/Realtime/iu.test(JSON.stringify(p.completeArgs??p.args)));
    for(const web of webs)for(const webResult of succeeded(web)) {
      let w;try{w=JSON.parse(webResult.text)}catch{continue}
      const content=typeof w.content==='string'?w.content:typeof w.answer==='string'?w.answer:'';
      if(!content.trim()||!/OpenAI/iu.test(content)||!/Realtime/iu.test(content))continue;
      return {memory,web,memoryResult,webResult,runId:memory.runId,sessionKey,pairs,
        sequentialExecutionVerified:true,readOnlyToolNames:['memory_search','web_search'],
        source:'exact-own-session-native-tool-envelopes-with-complete-current-history-results',
        semanticResultIndependentReviewRequired:true};
    }
  }
  return null;
}

export function resolveLifecycleConsultResult(state,{pcIndex,voiceSessionId,userTurnId,toolChain,after}={}) {
  if(!toolChain||!voiceSessionId||!userTurnId)return null;
  const delegations=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.type==='delegation.created'&&e.at>=after&&
    e.raw?.item?.target==='client'&&e.raw.item.user_bidi_turn_id===userTurnId);
  if(delegations.length!==1)return null;
  const owned=e=>e.raw?.voiceSessionId===voiceSessionId&&e.raw.callId===toolChain.runId&&e.at>=after;
  const call=(state.tools??[]).find(e=>owned(e)&&e.raw.type==='tool.call');
  const result=(state.tools??[]).find(e=>owned(e)&&e.raw.type==='tool.result'&&e.at>=call?.at);
  if(!call||!result||(state.tools??[]).some(e=>owned(e)&&e.raw.type==='tool.error'))return null;
  return {delegation:delegations[0],call,result,source:'actual-native-USER-delegation-and-owned-consult-run-SSE-result'};
}

/** An actual run's complete body must match the canonical callback hash. */
export function resolveLifecycleCanonicalBody(events,{canonical,sessionKey,runId}={}) {
  if(!canonical||!sessionKey||!runId)return null;
  const rows=events.filter(e=>e.event==='agent'&&e.payload?.stream==='assistant'&&e.payload.runId===runId&&
    e.payload.sessionKey===sessionKey&&typeof e.payload.data?.text==='string'&&Number.isFinite(e.payload.ts)&&
    e.payload.ts<=canonical.received.at&&createHash('sha256').update(e.payload.data.text.trim()).digest('hex')===canonical.received.textSha256);
  const bodies=new Set(rows.map(e=>e.payload.data.text.trim()));
  return bodies.size===1?{text:[...bodies][0],event:rows.at(-1),canonical,source:'same-run-complete-body-matches-canonical-callback-hash'}:null;
}

// Strict observer readiness, not a paraphrase or truth evaluator. Preserve all
// substantive words and qualifications; only punctuation, a known presentation
// label, case and the unambiguous spoken/ISO representation of a date differ.
export function normalizeLifecycleFinalBody(text) {
  const digits={'零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  const small=value=>/^\d+$/u.test(value)?Number(value):/^[一二三四五六七八九]$/u.test(value)?digits[value]:
    /^(?:十[一二三四五六七八九]?|[二三]十[一二三四五六七八九]?)$/u.test(value)?
      (value.split('十')[0]?digits[value.split('十')[0]]:1)*10+(value.split('十')[1]?digits[value.split('十')[1]]:0):NaN;
  const date=(year,month,day,original)=>{
    if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<1000||year>9999||month<1||month>12||day<1||day>31)return original;
    const value=new Date(Date.UTC(year,month-1,day));
    return value.getUTCFullYear()===year&&value.getUTCMonth()===month-1&&value.getUTCDate()===day?`date${year}m${month}d${day}`:original;
  };
  return String(text??'').replace(/^\s*(?:记忆检索结果|检索结果)\s*[:：]/u,'')
    .replace(/(\d{4})-(\d{2})-(\d{2})/gu,(original,y,m,d)=>date(Number(y),Number(m),Number(d),original))
    .replace(/([零〇一二三四五六七八九]{4}|\d{4})年([零〇一二三四五六七八九十\d]{1,3})月([零〇一二三四五六七八九十\d]{1,3})日/gu,
      (original,y,m,d)=>date(/^\d+$/u.test(y)?Number(y):Number([...y].map(c=>digits[c]).join('')),small(m),small(d),original))
    .replace(/[\s\p{P}]/gu,(character,offset,value)=>
      character==='%'||character==='‰'||/[.,:/+\-−]/u.test(character)&&
        (/\d/u.test(value[offset-1]??'')&&/\d/u.test(value[offset+1]??'')||/[+\-−]/u.test(character)&&/\d/u.test(value[offset+1]??''))?
        character:'').toLowerCase();
}

/** Never feed the next USER on a progress sentence or one partial final turn. */
export function resolveLifecycleFinalSpeechTurns(state,{pcIndex,body,host,userTurnId,before=Infinity}={}) {
  if(!body?.canonical||!host?.result||host.delegation?.raw?.item?.id!==body.canonical.final.delegationId||
    !Number.isFinite(host.result.at)||!userTurnId)return null;
  const after=body.canonical.received.at,readyAt=Math.max(host.result.at,body.canonical.final.at);
  const users=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.role==='user'&&e.type==='turn.done'&&e.turnId===userTurnId&&Number.isFinite(e.at));
  if(users.length!==1||users[0].at>after)return null;
  if((state.events??[]).some(e=>e.pcIndex===pcIndex&&e.role==='user'&&e.turnId!==userTurnId&&
    ['turn.created','turn.done'].includes(e.type)&&e.at>users[0].at&&e.at<before))return null;
  const turns=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&
    e.turnId&&normalize(e.text)&&Number.isFinite(e.at)&&e.at>readyAt&&e.at<before)
    .map(terminal=>({terminal,window:resolveNativeTurnTranscriptWindow(state.events,{pcIndex,turnId:terminal.turnId,after,before})}))
    .filter(row=>row.window?.created&&row.window.created.at>=after).sort((a,b)=>a.terminal.at-b.terminal.at);
  if(!turns.length)return null;
  const required=normalizeLifecycleFinalBody(body.text),spoken=normalizeLifecycleFinalBody(turns.map(row=>row.terminal.text).join(''));
  if(!required||!spoken.includes(required))return null;
  const terminal=turns.at(-1).terminal;
  if((state.events??[]).some(e=>e.pcIndex===pcIndex&&e.role==='assistant'&&e.type==='turn.created'&&e.at>terminal.at&&e.at<before))return null;
  return {terminal,turns,after,readyAt,from:Math.min(...turns.map(row=>row.window.from)),canonical:body.canonical,
    completeBodyMatched:true,semanticResultIndependentReviewRequired:true,source:'actual-complete-canonical-body-in-original-native-turn-sequence'};
}

export function assessLifecycleFinalSpeech(state,params={}) {
  const delivery=resolveLifecycleFinalSpeechTurns(state,params);if(!delivery)return null;
  const {pcIndex,before=Infinity}=params,frames=(state.audioFrames??[]).filter(f=>f.at<before);
  const quiet=continuousPlaybackQuiet(frames,{pcIndex,after:delivery.terminal.at,durationMs:750,threshold:.003,maxGapMs:100,requireTail:true});
  if(!quiet||!quiet.rtp.length)return null;
  const independentRtp=assessLifecyclePostTerminalRtp(quiet,{terminalAt:delivery.terminal.at});
  if(!independentRtp)return null;
  const window={pcIndex,from:delivery.from,to:quiet.to,turnId:delivery.terminal.turnId,
    turnIds:delivery.turns.map(row=>row.terminal.turnId),terminal:delivery.terminal,
    canonicalFinalReceivedAt:delivery.after,completeBodyMatched:true};
  const playback=assessCompletePlaybackWindow(frames,window);
  if(!playback?.passed||playback.invalidFrames.length||playback.audibleFrames<3)return null;
  return {...delivery,window,quiet,independentRtp,playback,strictCompletePlaybackPassed:playback.passed};
}

export function hasLifecycleFinalPlaybackTail(state,params={}) {
  const delivery=resolveLifecycleFinalSpeechTurns(state,params);if(!delivery)return false;
  const {pcIndex,before=Infinity}=params;
  const quiet=continuousPlaybackQuiet((state.audioFrames??[]).filter(f=>f.at<before),{
    pcIndex,after:delivery.terminal.at,durationMs:750,threshold:.003,maxGapMs:100,requireTail:true});
  return Boolean(assessLifecyclePostTerminalRtp(quiet,{terminalAt:delivery.terminal.at}));
}

/** Real receiver clocks/counters must cover the tail; one stale stats row cannot. */
export function assessLifecyclePostTerminalRtp(quiet,{terminalAt,durationMs=750,maxClockAgeMs=100,maxRtpGapMs=300}={}) {
  if(!quiet||!Number.isFinite(terminalAt)||!Number.isFinite(quiet.to))return null;
  const groups=new Map();
  for(const row of quiet.rtp??[])for(const stat of row.rtp??[]) {
    if(typeof stat.id!=='string'||!stat.id||!Number.isFinite(row.at)||!Number.isFinite(stat.timestamp)||
      row.at<terminalAt||stat.timestamp<terminalAt||Math.abs(stat.timestamp-row.at)>maxClockAgeMs||
      !Number.isSafeInteger(stat.packetsReceived)||stat.packetsReceived<0||!Number.isSafeInteger(stat.bytesReceived)||stat.bytesReceived<0)continue;
    const rows=groups.get(stat.id)??[];rows.push({at:row.at,...stat});groups.set(stat.id,rows);
  }
  for(const [id,rows] of groups) {
    rows.sort((a,b)=>a.at-b.at);
    const first=rows[0],last=rows.at(-1);
    // Browser probe schedules getStats every 200ms while player/mic state is
    // sampled every 50ms. The unchanged player gate enforces 100ms continuity;
    // stats cadence has a separate 200ms + 100ms observation-gap bound.
    if(rows.length<2||last.timestamp-first.timestamp<durationMs||quiet.to-last.at>maxRtpGapMs)continue;
    if(rows.some((row,index)=>index>0&&(row.at-rows[index-1].at>maxRtpGapMs||row.timestamp<=rows[index-1].timestamp||
      row.packetsReceived<rows[index-1].packetsReceived||row.bytesReceived<rows[index-1].bytesReceived)))continue;
    return {id,fromTimestamp:first.timestamp,toTimestamp:last.timestamp,durationMs:last.timestamp-first.timestamp,
      terminalAt,frameCount:rows.length,first,last,source:'same-receiver-post-terminal-real-RTP-clocks-and-monotonic-counters'};
  }
  return null;
}

const emptyArguments=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0;
const pendingClientMarker=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  value.status==='pending'&&value.tool==='openclaw_end_call'&&value.message==='Tool execution delegated to client';
function storedPendingClientMarker(result) {
  if(result?.isError!==false)return false;
  if(result.details!==undefined)return pendingClientMarker(result.details);
  if(!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text')return false;
  try{return pendingClientMarker(JSON.parse(result.content[0].text));}catch{return false;}
}

/** A model tool must be visible in the real global tool stream AND durable history. */
function resolveBackendEndCallWitness(event,{events,tools,backendEvents,backendHistory,sessionKey,userTurnId,pcIndex,voiceSessionId,after,before}) {
  const item=event.raw.item;
  if(!sessionKey||!userTurnId||item.user_bidi_turn_id!==userTurnId||typeof item.content[0].text!=='string'||!item.content[0].text.trim()||
    backendHistory?.sessionKey!==sessionKey||!Number.isFinite(backendHistory.observedAt)||backendHistory.observedAt<after||
    backendHistory.history?.sessionKey!==sessionKey||!Array.isArray(backendHistory.history.messages))return null;
  // Keep the old strict JSON route independent. A quoted/fake JSON example
  // cannot be treated as a plain native consult declaration on this route.
  try{JSON.parse(item.content[0].text);return null;}catch{}
  const users=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&e.turnId===userTurnId&&
    Number.isFinite(e.at)&&e.at>=after&&e.at<before&&normalize(e.text));
  if(users.length!==1)return null;
  const originStart=events.filter(e=>e.pcIndex===pcIndex&&e.role==='user'&&e.turnId===userTurnId&&
    ['turn.created','turn.done'].includes(e.type)&&Number.isFinite(e.at)).reduce((at,e)=>Math.min(at,e.at),users[0].at);
  if(events.some(e=>e.pcIndex===pcIndex&&e.role==='user'&&e.turnId&&e.turnId!==userTurnId&&
    ['turn.created','turn.done'].includes(e.type)&&Number.isFinite(e.at)&&e.at>originStart&&e.at<before))return null;
  const owned=row=>row.raw?.voiceSessionId===voiceSessionId&&row.raw.name==='openclaw_end_call'&&
    row.raw.source==='backend_model_client_tool'&&row.raw.requestId===item.id&&row.raw.nativeDelegationId===item.id&&
    row.raw.originUserTurnId===userTurnId&&row.raw.callId===row.raw.backendToolCallId&&
    /^call_[a-zA-Z0-9_.:-]{1,155}$/.test(row.raw.callId??'')&&/^[a-zA-Z0-9_.:-]{1,256}$/.test(row.raw.backendRunId??'')&&
    Number.isSafeInteger(row.raw.delegationGeneration)&&row.raw.delegationGeneration>=1&&
    Number.isFinite(row.at)&&row.at>=after&&row.at<before;
  const calls=tools.filter(row=>owned(row)&&row.raw.type==='tool.call'&&row.raw.status==='accepted');
  const results=tools.filter(row=>owned(row)&&row.raw.type==='tool.result'&&row.raw.status==='accepted'&&row.raw.closeAfterPlayback===true);
  if(calls.length!==1||results.length!==1||tools.some(row=>row.raw?.voiceSessionId===voiceSessionId&&row.raw?.requestId===item.id&&row.raw.type==='tool.error'))return null;
  const call=calls[0],result=results[0],receipt=result.raw,runId=receipt.backendRunId,id=receipt.backendToolCallId;
  if(result.at<call.at||call.raw.backendRunId!==runId||call.raw.backendToolCallId!==id||
    call.raw.delegationGeneration!==receipt.delegationGeneration)return null;
  // Only the original consult's host call binds this run to the native owner.
  // A child/resume run or another call in the same session has no such receipt.
  const consultCalls=tools.filter(row=>row.raw?.voiceSessionId===voiceSessionId&&row.raw.type==='tool.call'&&
    row.raw.name===undefined&&row.raw.callId===runId&&Number.isFinite(row.at)&&row.at>=after&&row.at<=call.at);
  if(consultCalls.length!==1)return null;
  const nativeRows=new Map();
  for(const row of backendEvents??[]) {
    const p=row.payload,d=p?.data;
    if(!['agent','session.tool'].includes(row.event)||p?.stream!=='tool'||p.sessionKey!==sessionKey||p.runId!==runId||
      d?.name!=='openclaw_end_call'||d.toolCallId!==id||!Number.isFinite(p.ts)||p.ts<after||p.ts>=before)continue;
    // The same genuine envelope may be delivered on both subscribed channels.
    const key=JSON.stringify({runId:p.runId,sessionKey:p.sessionKey,ts:p.ts,seq:p.seq,data:d});
    if(!nativeRows.has(key))nativeRows.set(key,row);
  }
  const starts=[...nativeRows.values()].filter(row=>row.payload.data.phase==='start');
  const finishes=[...nativeRows.values()].filter(row=>row.payload.data.phase==='result');
  if(starts.length!==1||finishes.length!==1)return null;
  const start=starts[0],finish=finishes[0],data=finish.payload.data;
  if(!emptyArguments(start.payload.data.args)||data.isError!==false||data.result?.terminate!==true||
    !pendingClientMarker(data.result.details)||finish.payload.ts<start.payload.ts||
    finish.payload.ts>call.at||backendHistory.observedAt<finish.payload.ts)return null;
  const storedCalls=[];
  for(const message of backendHistory.history.messages)if(message.role==='assistant'&&Array.isArray(message.content))
    for(const block of message.content)if(block.type==='toolCall'&&block.id===id)storedCalls.push(block);
  if(storedCalls.length!==1||storedCalls[0].name!=='openclaw_end_call')return null;
  let args=storedCalls[0].arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return null;}
  const storedResults=backendHistory.history.messages.filter(message=>message.role==='toolResult'&&message.toolCallId===id);
  if(!emptyArguments(args)||storedResults.length!==1||
    storedResults[0].toolName!==undefined&&storedResults[0].toolName!=='openclaw_end_call'||!storedPendingClientMarker(storedResults[0]))return null;
  return {delegation:event,call,result,requestId:item.id,voiceSessionId,userTurnId,pcIndex,sessionKey,backendRunId:runId,
    backendToolCallId:id,backendStart:start,backendResult:finish,historyObservedAt:backendHistory.observedAt,
    historyObservedBeforeClose:Number.isFinite(before)?backendHistory.observedAt<before:null,
    historyObservationPhase:Number.isFinite(before)?backendHistory.observedAt<before?'pre-close':'post-close':'close-not-yet-observed',
    storedCall:storedCalls[0],storedResult:storedResults[0],consultCall:consultCalls[0],finalizedUser:users[0],
    farewellAfter:finish.payload.ts,receiptClockOrder:{nativeDelegationAt:event.at,hostCallAt:call.at,hostResultAt:result.at,
      backendToolStartAt:start.payload.ts,backendToolResultAt:finish.payload.ts,SSEBeforeNativeFrame:call.at<event.at},
    source:'exact-backend-model-tool-global-stream-and-durable-history-with-native-USER-and-host-owner'};
}

/** Native JSON tool or real backend model tool, never a USER caption/promise. */
export function resolveEndCallToolWitness({events=[],tools=[],backendEvents=[],backendHistory,sessionKey,userTurnId,
  pcIndex,voiceSessionId,after=-Infinity,before=Infinity}={}) {
  if(!voiceSessionId)return null;
  const candidates=[];
  for(const event of events) {
    if(event.pcIndex!==pcIndex||event.type!=='delegation.created'||!Number.isFinite(event.at)||event.at<after||event.at>=before)continue;
    const item=event.raw?.item;
    if(item?.type!=='delegation'||item.target!=='client'||typeof item.id!=='string'||!item.id||
      !Array.isArray(item.content)||item.content.length!==1||item.content[0].type!=='input_text')continue;
    const backend=resolveBackendEndCallWitness(event,{events,tools,backendEvents,backendHistory,sessionKey,userTurnId,
      pcIndex,voiceSessionId,after,before});
    if(backend)candidates.push(backend);
    let input;try{input=JSON.parse(item.content[0].text)}catch{continue}
    if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||
      input.name!=='openclaw_end_call'||!Object.hasOwn(input,'arguments')||input.arguments===null||
      typeof input.arguments!=='object'||Array.isArray(input.arguments)||Object.keys(input.arguments).length!==0)continue;
    // Native data-channel and host SSE reception clocks can be reordered. The
    // exact native item id and authenticated voice owner establish the join;
    // do not require SSE to be received after the native frame.
    const owned=row=>row.raw?.voiceSessionId===voiceSessionId&&row.raw.name==='openclaw_end_call'&&
      row.raw.callId===item.id&&row.raw.requestId===item.id&&Number.isFinite(row.at)&&row.at>=after&&row.at<before;
    const call=tools.find(row=>owned(row)&&row.raw.type==='tool.call');
    const result=call&&tools.find(row=>owned(row)&&row.at>=call.at&&row.raw.type==='tool.result'&&row.raw.closeAfterPlayback===true);
    const errors=tools.filter(row=>owned(row)&&row.raw.type==='tool.error');
    if(call&&result&&errors.length===0)candidates.push({delegation:event,input,call,result,requestId:item.id,
      voiceSessionId,userTurnId:item.user_bidi_turn_id??null,pcIndex,
      receiptClockOrder:{nativeDelegationAt:event.at,hostCallAt:call.at,hostResultAt:result.at,SSEBeforeNativeFrame:call.at<event.at},
      source:'exact-native-item-id-and-authenticated-H5-SSE-voice-owner'});
  }
  // Multiple requests are not silently collapsed into a single successful tool.
  return candidates.length===1?candidates[0]:null;
}

/** End-tool acceptance does not prove that its original host consult settled. */
export function assessEndCallConsultTerminal(state,{tool,before}={}) {
  const voiceSessionId=tool?.voiceSessionId,backendRunId=tool?.backendRunId,issues=[];
  const bindingValid=tool?.source==='exact-backend-model-tool-global-stream-and-durable-history-with-native-USER-and-host-owner'&&
    typeof voiceSessionId==='string'&&Boolean(voiceSessionId)&&typeof backendRunId==='string'&&Boolean(backendRunId)&&
    tool.consultCall?.raw?.voiceSessionId===voiceSessionId&&tool.consultCall.raw.callId===backendRunId&&
    tool.consultCall.raw.type==='tool.call'&&tool.consultCall.raw.name===undefined&&Number.isFinite(tool.consultCall.at)&&
    tool.result?.raw?.voiceSessionId===voiceSessionId&&tool.result.raw.backendRunId===backendRunId&&
    tool.result.raw.type==='tool.result'&&tool.result.raw.name==='openclaw_end_call'&&
    tool.result.raw.source==='backend_model_client_tool'&&tool.result.raw.status==='accepted'&&
    tool.result.raw.closeAfterPlayback===true&&tool.result.raw.backendToolCallId===tool.backendToolCallId&&
    tool.result.raw.requestId===tool.requestId&&tool.result.raw.originUserTurnId===tool.userTurnId&&
    Number.isFinite(tool.result.at);
  if(!bindingValid)issues.push('missing-exact-backend-end-tool-owner-binding');
  const close=(state?.api??[]).find(row=>row.route==='/api/close'&&row.status===200&&
    row.request?.voiceSessionId===voiceSessionId&&Number.isFinite(before)&&row.requestedAt===before);
  if(!close)issues.push('missing-original-owned-close-boundary');
  // Do not deduplicate terminal rows or infer a result from the named end-tool
  // receipt. Retain invalid clocks and every same-run error as failure evidence.
  const owned=(state?.tools??[]).filter(row=>bindingValid&&row.raw?.voiceSessionId===voiceSessionId&&
    row.raw.callId===backendRunId&&['tool.call','tool.result','tool.error'].includes(row.raw.type));
  const invalidClocks=owned.filter(row=>!Number.isFinite(row.at));
  const rows=owned.filter(row=>Number.isFinite(row.at)&&Number.isFinite(before)&&row.at<=before);
  const calls=rows.filter(row=>row.raw.type==='tool.call'),results=rows.filter(row=>row.raw.type==='tool.result'),
    errors=rows.filter(row=>row.raw.type==='tool.error'),terminals=[...results,...errors];
  const call=calls.length===1?calls[0]:null,result=results.length===1?results[0]:null;
  if(invalidClocks.length)issues.push('invalid-owned-event-clock');
  if(rows.some(row=>row.raw.name!==undefined))issues.push('unexpected-named-consult-event');
  if(calls.length!==1)issues.push('original-consult-call-not-unique');
  if(call&&call.at!==tool.consultCall.at)issues.push('original-consult-call-clock-mismatch');
  if(results.length!==1)issues.push('normal-consult-result-not-unique');
  if(errors.length)issues.push('owned-consult-tool-error');
  if(terminals.length!==1)issues.push('consult-terminal-not-unique');
  if(result&&(!call||result.at<call.at||result.at<tool.result.at||result.at>=before))issues.push('consult-result-outside-causal-window');
  return {passed:issues.length===0,issues,voiceSessionId:voiceSessionId??null,backendRunId:backendRunId??null,
    before:Number.isFinite(before)?before:null,close:close??null,call,result,calls,results,errors,terminals,invalidClocks,
    source:'exact-end-tool-owned-host-consult-SSE-terminal-through-original-close'};
}

export function resolveLifecycleUserTurn(events,{pcIndex,after,before=Infinity,intent,expectedText}={}) {
  const rows=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&
    Number.isFinite(e.at)&&e.at>=after&&e.at<before&&e.turnId&&normalize(e.text));
  const matches=rows.filter(e=>intent==='keep'
    ?normalize(e.text).includes('今天先聊到这里')&&normalize(e.text).includes('先别挂')&&normalize(e.text).includes('还想问你一件事')
    :intent==='end'&&(expectedText?normalize(e.text)===normalize(expectedText):
      normalize(e.text).includes('今天就先这样')&&normalize(e.text).includes('帮我把电话挂掉')));
  return matches.length===1?matches[0]:null;
}

export function assessLifecycleSpeech(state,{pcIndex,after,terminalAfter=after,before=Infinity,turnId,requireCreatedAfter=false}={}) {
  const endings=(state?.events??[]).filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&
    Number.isFinite(e.at)&&e.at>terminalAfter&&e.at<before&&e.turnId&&normalize(e.text)&&(!turnId||e.turnId===turnId));
  for(const terminal of endings) {
    const window=resolveNativeTurnTranscriptWindow(state.events,{pcIndex,turnId:terminal.turnId,after,before});
    if(!window||requireCreatedAfter&&(!window.created||window.created.at<after||window.created.at>terminal.at))continue;
    const frames=(state.audioFrames??[]).filter(f=>f.at<before);
    const quiet=continuousPlaybackQuiet(frames,{pcIndex,after:terminal.at,durationMs:750,threshold:.003,maxGapMs:100,requireTail:true});
    if(!quiet||quiet.rtp.length===0)continue;
    const wholeWindow={...window,to:quiet.to};
    const playback=assessCompletePlaybackWindow(frames,wholeWindow);
    // A sampling gap remains a strict whole-window FAIL. Retain the real
    // functional speech/quiet witness so later lifecycle steps can still be
    // observed; never turn missing samples into complete playback evidence.
    if(playback&&playback.invalidFrames.length===0&&playback.audibleFrames>=3)return {terminal,window:wholeWindow,quiet,playback,
      strictCompletePlaybackPassed:playback.passed,source:'exact-native-caption-body-and-original-playback-tail'};
  }
  return null;
}

// A cheap readiness check for the observer's bounded frame tail. Do not copy
// the entire recording every poll: that stalls the original browser sampler.
// The final proof still checks the complete raw caption and playback window.
export function hasLifecyclePlaybackTail(state,{pcIndex,after,terminalAfter=after,before=Infinity}={}) {
  return (state?.events??[]).some(terminal=>terminal.pcIndex===pcIndex&&terminal.type==='turn.done'&&terminal.role==='assistant'&&
    terminal.turnId&&normalize(terminal.text)&&Number.isFinite(terminal.at)&&terminal.at>terminalAfter&&terminal.at<before&&
    Boolean(continuousPlaybackQuiet((state.audioFrames??[]).filter(f=>f.at<before),{
      pcIndex,after:terminal.at,durationMs:750,threshold:.003,maxGapMs:100,requireTail:true})?.rtp.length));
}

export function assessProactiveGreeting(state,{pcIndex,owner,readyAt,before=Infinity}={}) {
  if(!owner||!Number.isFinite(readyAt))return null;
  const speech=assessLifecycleSpeech(state,{pcIndex,after:readyAt,before,requireCreatedAfter:true});
  if(!speech)return null;
  const from=owner.connectedAt,to=speech.quiet.to;
  const userTurns=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.at>=from&&e.at<=to&&
    e.type==='turn.done'&&e.role==='user'&&normalize(e.text));
  const delegations=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.at>=from&&e.at<=to&&e.type==='delegation.created');
  const microphone=(state.micFrames??[]).filter(f=>f.pcIndex===pcIndex&&f.at>=from&&f.at<=to);
  const idleMicrophone=microphone.length>0&&microphone.every(f=>Number.isFinite(f.rms)&&f.rms<=.003&&
    f.trackState==='live'&&f.trackEnabled===true&&f.senderTrackId===f.trackId);
  return {passed:userTurns.length===0&&delegations.length===0&&idleMicrophone,speech,userTurns,delegations,
    idleMicrophone,micFrameCount:microphone.length,from,to,source:'native-greeting-before-any-fed-USER-PCM'};
}

export function assessLifecycleFarewell(state,{pcIndex,tool,before=Infinity}={}) {
  if(!tool||tool.pcIndex!==pcIndex)return null;
  const after=tool.farewellAfter??tool.delegation.at;
  const exactDrain=terminal=>(state.duplex?.transitions??[]).find(e=>e.type==='model-end-call-playback-drained'&&
    e.requestId===tool.requestId&&e.originUserTurnId===tool.userTurnId&&e.turnId===terminal.turnId&&Number.isFinite(e.at)&&
    (!tool.backendToolCallId||e.source==='backend_model_client_tool'&&e.backendToolCallId===tool.backendToolCallId&&
      e.backendRunId===tool.backendRunId&&e.nativeDelegationId===tool.requestId)&&
    Number.isFinite(state.browserTimeOrigin)&&state.browserTimeOrigin+e.at>=terminal.at&&state.browserTimeOrigin+e.at<=before);
  const strict=assessLifecycleSpeech(state,{pcIndex,after,before,requireCreatedAfter:true});
  if(strict){const appDrain=exactDrain(strict.terminal);
    const independentRtp=assessLifecyclePostTerminalRtp(strict.quiet,{terminalAt:strict.terminal.at});
    return {...strict,appDrain:appDrain??null,independentRtp,strictTailPassed:Boolean(independentRtp)};}
  // The original app closes on its own 50ms analyser phase. Its exact trusted
  // drain transition can exist while this independent sampler has only 700ms
  // before the close. Preserve that functional witness without inventing the
  // missing strict 750ms RTP tail.
  const endings=(state.events??[]).filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&
    e.turnId&&e.at>after&&e.at<before&&normalize(e.text));
  for(const terminal of endings){const appDrain=exactDrain(terminal);if(!appDrain)continue;
    const window=resolveNativeTurnTranscriptWindow(state.events,{pcIndex,turnId:terminal.turnId,after,before});
    if(!window?.created||window.created.at<after||window.created.at>terminal.at)continue;
    const wholeWindow={...window,to:before},playback=assessCompletePlaybackWindow(state.audioFrames??[],wholeWindow);
    if(playback&&playback.invalidFrames.length===0&&playback.audibleFrames>=3)return {terminal,window:wholeWindow,playback,appDrain,
      quiet:null,strictTailPassed:false,strictCompletePlaybackPassed:false,
      source:'exact-native-request-and-original-app-drain-functional-witness-with-strict-tail-missing'};
  }
  return null;
}

export function assessAutomaticEnd(state,{pcIndex,owner,tool,farewell}={}) {
  if(!tool||!farewell||!owner||tool.voiceSessionId!==owner.voiceSessionId||tool.pcIndex!==pcIndex)return null;
  const after=tool.farewellAfter??tool.delegation.at;
  const close=(state.api??[]).find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId&&
    Number.isFinite(a.requestedAt)&&a.requestedAt>=after);
  const exactSpeech=farewell.window.created?.at>=after&&farewell.terminal.at>=after&&
    farewell.window.to>=farewell.terminal.at&&farewell.appDrain?.requestId===tool.requestId&&farewell.appDrain.originUserTurnId===tool.userTurnId&&
    farewell.appDrain.turnId===farewell.terminal.turnId;
  const appDrainAt=Number.isFinite(state.browserTimeOrigin)&&Number.isFinite(farewell.appDrain?.at)?state.browserTimeOrigin+farewell.appDrain.at:null;
  const independentRtp=assessLifecyclePostTerminalRtp(farewell.quiet,{terminalAt:farewell.terminal.at});
  const strictTailPassed=Boolean(farewell.strictTailPassed&&independentRtp&&close?.requestedAt>=farewell.quiet.to);
  const closed=state.pcStates?.[pcIndex]==='closed'&&state.remoteAudio?.attached===false;
  return {passed:Boolean(close)&&exactSpeech&&closed&&Number.isFinite(appDrainAt)&&close.requestedAt>=appDrainAt,
    close:close??null,exactSpeech,closed,requestId:tool.requestId,voiceSessionId:owner.voiceSessionId,
    farewellTerminalAt:farewell.terminal.at,quiet:farewell.quiet,independentRtp,strictTailPassed,appDrain:farewell.appDrain,appDrainAt,
    source:'owned-host-tool-acceptance-then-real-farewell-tail-before-original-close-request'};
}
