import {resolveNativeTurnTranscriptWindow,assessCompletePlaybackWindow,continuousPlaybackQuiet,mergeSessionToolEvidence,toolResultSucceeded} from './evidence.mjs';

const normalize=text=>String(text??'').replace(/[\s，。！？,.!?]/gu,'');
const messageText=m=>typeof m?.content==='string'?m.content:(m?.content??[]).filter?.(v=>v?.type==='text').map(v=>v.text??'').join('\n')??'';
const timestamp=value=>typeof value==='number'?value<1e11?value*1000:value:Date.parse(value);
const queryIncluded=(text,query)=>normalize(text).toLowerCase().includes(normalize(query).toLowerCase());

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

/** An actual client delegation item is the tool source, never USER captions. */
export function resolveEndCallToolWitness({events=[],tools=[],pcIndex,voiceSessionId,after=-Infinity,before=Infinity}={}) {
  if(!voiceSessionId)return null;
  const candidates=[];
  for(const event of events) {
    if(event.pcIndex!==pcIndex||event.type!=='delegation.created'||!Number.isFinite(event.at)||event.at<after||event.at>=before)continue;
    const item=event.raw?.item;
    if(item?.type!=='delegation'||item.target!=='client'||typeof item.id!=='string'||!item.id||
      !Array.isArray(item.content)||item.content.length!==1||item.content[0].type!=='input_text')continue;
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

export function resolveLifecycleUserTurn(events,{pcIndex,after,before=Infinity,intent}={}) {
  const rows=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&
    Number.isFinite(e.at)&&e.at>=after&&e.at<before&&e.turnId&&normalize(e.text));
  const matches=rows.filter(e=>intent==='keep'
    ?normalize(e.text).includes('今天先聊到这里')&&normalize(e.text).includes('先别挂')&&normalize(e.text).includes('还想问你一件事')
    :intent==='end'&&normalize(e.text).includes('今天就先这样')&&normalize(e.text).includes('帮我把电话挂掉'));
  return matches.length===1?matches[0]:null;
}

export function assessLifecycleSpeech(state,{pcIndex,after,before=Infinity,turnId,requireCreatedAfter=false}={}) {
  const endings=(state?.events??[]).filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&
    Number.isFinite(e.at)&&e.at>after&&e.at<before&&e.turnId&&normalize(e.text)&&(!turnId||e.turnId===turnId));
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
export function hasLifecyclePlaybackTail(state,{pcIndex,after,before=Infinity}={}) {
  return (state?.events??[]).some(terminal=>terminal.pcIndex===pcIndex&&terminal.type==='turn.done'&&terminal.role==='assistant'&&
    terminal.turnId&&normalize(terminal.text)&&Number.isFinite(terminal.at)&&terminal.at>after&&terminal.at<before&&
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
  const after=tool.delegation.at;
  const exactDrain=terminal=>(state.duplex?.transitions??[]).find(e=>e.type==='model-end-call-playback-drained'&&
    e.requestId===tool.requestId&&e.originUserTurnId===tool.userTurnId&&e.turnId===terminal.turnId&&Number.isFinite(e.at)&&
    Number.isFinite(state.browserTimeOrigin)&&state.browserTimeOrigin+e.at>=terminal.at&&state.browserTimeOrigin+e.at<=before);
  const strict=assessLifecycleSpeech(state,{pcIndex,after,before,requireCreatedAfter:true});
  if(strict){const appDrain=exactDrain(strict.terminal);return {...strict,appDrain:appDrain??null,strictTailPassed:true};}
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
  const close=(state.api??[]).find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId&&
    Number.isFinite(a.requestedAt)&&a.requestedAt>=tool.delegation.at);
  const exactSpeech=farewell.window.created?.at>=tool.delegation.at&&farewell.terminal.at>=tool.delegation.at&&
    farewell.window.to>=farewell.terminal.at&&farewell.appDrain?.requestId===tool.requestId&&farewell.appDrain.originUserTurnId===tool.userTurnId&&
    farewell.appDrain.turnId===farewell.terminal.turnId;
  const appDrainAt=Number.isFinite(state.browserTimeOrigin)&&Number.isFinite(farewell.appDrain?.at)?state.browserTimeOrigin+farewell.appDrain.at:null;
  const strictTailPassed=Boolean(farewell.strictTailPassed&&farewell.quiet?.durationMs>=750&&farewell.quiet.rtp.length>0&&close?.requestedAt>=farewell.quiet.to);
  const closed=state.pcStates?.[pcIndex]==='closed'&&state.remoteAudio?.attached===false;
  return {passed:Boolean(close)&&exactSpeech&&closed&&Number.isFinite(appDrainAt)&&close.requestedAt>=appDrainAt,
    close:close??null,exactSpeech,closed,requestId:tool.requestId,voiceSessionId:owner.voiceSessionId,
    farewellTerminalAt:farewell.terminal.at,quiet:farewell.quiet,strictTailPassed,appDrain:farewell.appDrain,appDrainAt,
    source:'owned-host-tool-acceptance-then-real-farewell-tail-before-original-close-request'};
}
