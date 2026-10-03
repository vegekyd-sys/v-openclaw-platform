import {parseCompleteTimestamps} from '../gpt-live-call-live-evidence.mjs';
import {createHash} from 'node:crypto';

const textOf = value => typeof value === 'string' ? value : (value?.content ?? [])
  .filter(part => part?.type === 'text').map(part => part.text ?? '').join('\n');

export function toolResultSucceeded(result) {
  if (!result || result.isError===true) return false;
  try {
    const body=JSON.parse(result.text);
    if (body && typeof body==='object' && !Array.isArray(body)) {
      if (body.error || body.isError===true || ['error','failed','cancelled','blocked','rejected'].includes(body.status)) return false;
    }
  } catch {}
  return true;
}

// A complete affirmative answer can follow an acknowledgement of the new topic.
// Counting fragments, negations, estimates and retractions do not qualify.
export function isExactTwoPlusTwoReply(text) {
  const normalized=String(text??'').trim().replace(/\s+/gu,'');
  const statements=normalized.split(/[。.!！]/u).filter(Boolean);
  const exact=/^(?:(?:二加二|2[+＋]2)(?:(?:的)?(?:答案|结果))?(?:等于|就是|是|为)?|(?:答案|结果)(?:就是|是|为)|(?:等于|是))?(?:四|4)$/u;
  const counting=statements.filter(statement=>/^(?:[零一二三四五六七八九十百]+|\d+)$/u.test(statement));
  const contradictory=statements.some(statement=>/^(?:(?:二加二|2[+＋]2)(?:(?:的)?(?:答案|结果))?(?:等于|就是|是|为)?|(?:答案|结果)(?:就是|是|为)|(?:其实|还是)?(?:等于|是))(?:[零一二三五六七八九十百]+|[0-35-9]\d*|4\d+)$/u.test(statement));
  return statements.some(statement=>exact.test(statement)) && counting.length<=1 &&
    !contradictory &&
    !/(?:不是[四4]|不等于[四4]|不对|错了|可能|也许|大概|不确定|还是[五5])/u.test(normalized);
}

export function nativeCountRequestsEighty(text) {
  const transcript=String(text??'').replace(/\s+/gu,'');
  return /(?:从|先)?(?:一|1)(?:开始)?(?:[，,、]*)(?:慢慢)?数(?:到|至)(?:八十|80)(?![零一二三四五六七八九十百\d])/u.test(transcript) ||
    /从(?:一|1)[，,、]*数[，,、]*到[，,、]*(?:八十|80)(?![零一二三四五六七八九十百\d])/u.test(transcript);
}

export function hasOrderedCountBeginning(text) {
  return /^(?:一[、，,。.!！;；\s]+二|1[、，,。.!！;；\s]+2)(?=[、，,。.!！;；\s]|$)/u.test(String(text??'').trim());
}

const normalizedTranscript = text=>String(text??'').replace(/\s+/gu,'').replace(/，/gu,',');

// Native turn.created is a summary and can arrive after the first spoken words.
// Associate a consecutive sequence of real caption items with one terminal body;
// never move a receipt timestamp or borrow a neighboring assistant response.
export function resolveNativeTurnTranscriptWindow(events,{pcIndex,turnId,after=-Infinity,before=Infinity}={}) {
  const terminal=events.find(e=>e.pcIndex===pcIndex&&e.turnId===turnId&&e.type==='turn.done'&&e.role==='assistant');
  if(!terminal||!Number.isFinite(terminal.at)||terminal.at>=before||!normalizedTranscript(terminal.text))return null;
  const preceding=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&
    e.turnId!==turnId&&Number.isFinite(e.at)&&e.at<terminal.at).sort((a,b)=>a.at-b.at).at(-1);
  const bound=Math.max(after,preceding?.at??-Infinity),body=normalizedTranscript(terminal.text);
  const captions=events.filter(e=>e.pcIndex===pcIndex&&e.type==='output_transcript.added'&&
    Number.isFinite(e.at)&&e.at>bound&&e.at<=terminal.at&&(!e.turnId||e.turnId===turnId))
    .sort((a,b)=>a.at-b.at);
  const matches=[];
  for(let first=0;first<captions.length;first++) {
    let text='';
    for(let last=first;last<captions.length;last++) {
      text+=normalizedTranscript(captions[last].text);
      if(!body.startsWith(text))break;
      if(text===body){matches.push(captions.slice(first,last+1));break;}
    }
  }
  if(matches.length!==1)return null;
  const sequence=matches[0];
  return {pcIndex,turnId,from:Math.max(bound,sequence[0].at-100),to:terminal.at,
    firstCaptionAt:sequence[0].at,lastCaptionAt:sequence.at(-1).at,terminal,
    created:events.find(e=>e.pcIndex===pcIndex&&e.turnId===turnId&&e.type==='turn.created'&&e.role==='assistant')??null,
    captions:sequence,alignmentToleranceMs:100,source:'exact-consecutive-native-caption-items-and-terminal-body'};
}

// Validate every sampled player state over the complete speech window. Three
// audible samples alone cannot prove that the remainder was played normally.
export function assessCompletePlaybackWindow(frames,{pcIndex,from,to,maxGapMs=100}={}) {
  if(![from,to,maxGapMs].every(Number.isFinite)||to<=from||maxGapMs<=0)return null;
  const rows=frames.filter(f=>f.pcIndex===pcIndex&&Number.isFinite(f.at)&&f.at>=from&&f.at<=to).sort((a,b)=>a.at-b.at);
  const valid=f=>f.muted===false&&f.paused===false&&Number.isFinite(f.volume)&&f.volume>0&&
    f.contextState==='running'&&f.receiverAttachedToPlayback===true&&f.trackState==='live'&&f.connected==='connected';
  const invalid=rows.filter(f=>!valid(f)),gaps=rows.slice(1).flatMap((f,i)=>f.at-rows[i].at>maxGapMs?[{from:rows[i].at,to:f.at}]:[]);
  const covered=rows.length>0&&rows[0].at-from<=maxGapMs&&to-rows.at(-1).at<=maxGapMs;
  const audibleRows=rows.filter(f=>valid(f)&&Number.isFinite(f.rms)&&f.rms>.005);
  return {passed:covered&&gaps.length===0&&invalid.length===0&&audibleRows.length>=3,
    pcIndex,from,to,frameCount:rows.length,audibleFrames:audibleRows.length,covered,
    invalidFrames:invalid,gaps,maxGapMs,source:'all-original-player-samples-in-complete-window'};
}

export function assessDecodedPlaybackWindow(pcm,{recordingStartedAt,from,to,sampleRate=48000}={}) {
  if(!Buffer.isBuffer(pcm)||![recordingStartedAt,from,to,sampleRate].every(Number.isFinite)||
    sampleRate<=0||to<=from)return null;
  const fromByte=Math.floor((from-recordingStartedAt)*sampleRate/1000)*2,
    toByte=Math.ceil((to-recordingStartedAt)*sampleRate/1000)*2;
  if(fromByte<0||toByte>pcm.length||toByte<=fromByte)return null;
  const segment=pcm.subarray(fromByte,toByte);let sum=0,peak=0;
  for(let at=0;at+1<segment.length;at+=2){const n=segment.readInt16LE(at);sum+=n*n;peak=Math.max(peak,Math.abs(n));}
  const rms=Math.sqrt(sum/(segment.length/2));
  return {passed:rms>30,from,to,recordingStartedAt,sampleRate,fromByte,toByte,pcmBytes:segment.length,
    sha256:createHash('sha256').update(segment).digest('hex'),rms,peak,coversWholeWindow:true,
    mediaRecorderTimeAlignmentToleranceMs:100,source:'original-native-receiver-decoded-s16-PCM'};
}

export function assessEarlySpeechBoundary({window,markerResultAt,captionAt,waitResultAt,finalAppendAt}={}) {
  return Boolean(window)&&[window.from,window.to,window.metadataTerminalAt,window.quiet?.from,window.quiet?.to,
    window.observedQuietThrough,window.childOrFinalBoundary,markerResultAt,captionAt,waitResultAt,finalAppendAt].every(Number.isFinite)&&
    window.metadataTerminalAt>=captionAt&&window.quiet.from>=window.metadataTerminalAt&&window.quiet.to===window.to&&
    window.quiet.to-window.quiet.from>=250&&window.quiet.rtp?.length>0&&window.observedQuietThrough>=window.to&&
    window.childOrFinalBoundary===Math.min(waitResultAt,finalAppendAt)&&window.observedQuietThrough<window.childOrFinalBoundary&&
    window.childOrFinalBoundary-window.observedQuietThrough<=100&&
    window.from>=markerResultAt&&captionAt>=markerResultAt&&window.to>=captionAt&&
    window.to<waitResultAt&&window.to<finalAppendAt;
}

// turn.done does not identify the end of received audio. The first continuous
// quiet period after that metadata must occur before the child finishes, and
// must remain quiet through the observed child/final boundary. Later energy or
// a neighboring response cannot be replaced with its subsequent sentence pause.
export function resolveEarlyPlaybackTail(frames,events,{window,waitResultAt,finalAppendAt}={}) {
  if(!window||![window.from,window.to,waitResultAt,finalAppendAt].every(Number.isFinite))return null;
  const bound=Math.min(waitResultAt,finalAppendAt);
  if(window.to>=bound)return null;
  const rows=frames.filter(f=>f.pcIndex===window.pcIndex&&Number.isFinite(f.at)&&f.at>=window.to&&f.at<bound).sort((a,b)=>a.at-b.at);
  if(!rows.length||rows[0].at-window.to>100||bound-rows.at(-1).at>100)return null;
  const valid=f=>f.muted===false&&f.paused===false&&Number.isFinite(f.volume)&&f.volume>0&&
    f.contextState==='running'&&f.receiverAttachedToPlayback===true&&f.trackState==='live'&&f.connected==='connected';
  let run=[],firstQuiet=null;
  for(let index=0;index<rows.length;index++) {
    const f=rows[index];
    if(!valid(f)||!Number.isFinite(f.rms)||index>0&&f.at-rows[index-1].at>100)return null;
    const quiet=f.rms<=.003;
    if(firstQuiet&&!quiet)return null;
    if(!quiet)run=[];else run.push(f);
    if(!firstQuiet&&run.length&&f.at-run[0].at>=250)firstQuiet={from:run[0].at,to:f.at,frameCount:run.length,
      rtp:run.filter(row=>row.rtp?.length).map(row=>({at:row.at,rtp:row.rtp}))};
  }
  if(!firstQuiet||!firstQuiet.rtp.length)return null;
  if(events.some(e=>e.pcIndex===window.pcIndex&&Number.isFinite(e.at)&&e.at>window.to&&e.at<=firstQuiet.to&&
    (e.type==='output_transcript.added'&&e.turnId!==window.turnId||
      ['turn.created','turn.done'].includes(e.type)&&e.role==='assistant'&&e.turnId!==window.turnId)))return null;
  return {...window,to:firstQuiet.to,metadataTerminalAt:window.to,quiet:firstQuiet,
    observedQuietThrough:rows.at(-1).at,childOrFinalBoundary:bound,thresholdFloatRms:.003,
    rtpAttribution:'Continuous original receiver quiet; metadata alone is not a native audio termination acknowledgement'};
}

export function assessNativeResponseDrain(frames,events,{pcIndex,terminalAt,newTurnId}={}) {
  if(!Number.isFinite(terminalAt))return null;
  const response=resolveNativeTurnTranscriptWindow(events,{pcIndex,turnId:newTurnId,after:terminalAt});
  if(!response)return null;
  const possibleNewAudio=frames.filter(f=>f.pcIndex===pcIndex&&Number.isFinite(f.at)&&f.at>=response.from&&
    f.at<=response.to&&f.digitalAudible).sort((a,b)=>a.at-b.at)[0]?.at;
  if(!Number.isFinite(possibleNewAudio))return null;
  const upperBound=Math.min(possibleNewAudio,response.firstCaptionAt);
  const bounded=frames.filter(f=>f.pcIndex===pcIndex&&f.at<upperBound);
  // Quiet must continue to the first possible new speech boundary. A pause
  // after that response started, or a quiet interval followed by old energy,
  // cannot be used to declare the old output drained.
  const quiet=continuousPlaybackQuiet(bounded,{pcIndex,after:terminalAt,durationMs:250,requireTail:true});
  if(!quiet||upperBound-quiet.to>100||quiet.rtp.length===0)return null;
  return {pcIndex,terminalAt,quiet,response,firstPossibleNewPlayback:possibleNewAudio,
    firstNewTranscript:response.firstCaptionAt,drainUpperBound:upperBound,
    alignmentToleranceMs:100,requiresIndependentTurnAudioAttribution:true,
    rtpAttribution:'Receiver stats have no native turn identity; this is continuous observed track quiet, not a protocol clear acknowledgement'};
}

// This observes completion of an independent input. A fixed delay or a quiet
// microphone by itself does not mean that the provider accepted the whole turn.
export function assessIndependentInputConvergence({events=[],micFrames=[],pcIndex=0,input,lastSpeechAt,observedAt}) {
  if(!input||![input.startedAt,input.completedAt,lastSpeechAt,observedAt].every(Number.isFinite)||
      input.exitCode!==0||input.completedAt<input.startedAt||lastSpeechAt<input.startedAt||lastSpeechAt>input.completedAt)return null;
  const turn=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&
    e.at>=input.startedAt&&e.at>=lastSpeechAt).at(-1);
  if(!turn||events.some(e=>e.pcIndex===pcIndex&&e.at>turn.at&&
    (e.type==='input_transcript.added'||e.type==='turn.created'&&e.role==='user'&&
      !events.some(done=>done.pcIndex===pcIndex&&done.type==='turn.done'&&done.turnId===e.turnId))))return null;
  const frames=micFrames.filter(f=>f.pcIndex===pcIndex&&f.at>=input.completedAt).sort((a,b)=>a.at-b.at);
  let quiet=[];
  for(const frame of frames) {
    const eligible=frame.rms<=.003&&frame.trackState==='live'&&frame.trackEnabled===true&&
      typeof frame.trackId==='string'&&frame.senderTrackId===frame.trackId;
    if(!eligible||quiet.length&&frame.at-quiet.at(-1).at>100)quiet=[];
    if(eligible)quiet.push(frame);
  }
  if(!quiet.length||quiet.at(-1).at-quiet[0].at<250||observedAt-quiet.at(-1).at>100)return null;
  return {turnId:turn.turnId,userTurnAt:turn.at,lastSpeechAt,pcmStartedAt:input.startedAt,
    pcmCompletedAt:input.completedAt,quietFrom:quiet[0].at,quietTo:quiet.at(-1).at,
    quietFrameCount:quiet.length,quietThresholdFloatRms:.003};
}

export function matchesConsumedConditionBatch(event,texts,owner,sourceRunIdSha256) {
  if (!texts.length || !texts.every(text=>typeof text==='string') || !/^[a-f0-9]{64}$/u.test(sourceRunIdSha256??'')) return false;
  const batch=event?.steeringConsumed;
  return event?.stage==='backend-steering-consumed' && event.traceId===owner?.traceId &&
    event.delegationId===owner?.delegationId && event.generation===owner?.generation &&
    event.sourceRunIdSha256===sourceRunIdSha256 && batch?.count===texts.length &&
    Number.isSafeInteger(batch?.sequence) && batch.sequence>=batch.count &&
    batch.textSha256===createHash('sha256').update(JSON.stringify(texts),'utf8').digest('hex');
}

export function extractQueuedConditionResume(text,batch,childCompletionText) {
  const header='Additional user conditions for this same authorized voice task (not child results).';
  const at=String(text??'').indexOf(header);
  if (at<0 || !childCompletionText?.trim() || !text.slice(0,at).includes(childCompletionText.trim())) return null;
  const lines=text.slice(at+header.length).trim().split('\n');
  if (!lines.shift()?.startsWith('Apply these in sequence;')) return null;
  let inputs;try{inputs=lines.filter(line=>line.trim()).map(line=>JSON.parse(line))}catch{return null}
  if (!inputs.length || inputs.some((input,index)=>!Number.isSafeInteger(input.sequence)||input.sequence<1||
      !['steer','followup'].includes(input.mode)||typeof input.text!=='string'||!Number.isFinite(input.receivedAt)||
      index>0&&input.sequence<=inputs[index-1].sequence)) return null;
  if(batch?.count!==inputs.length||batch.sequence!==inputs.at(-1).sequence||batch.textSha256!==createHash('sha256').update(JSON.stringify(inputs.map(input=>input.text)),'utf8').digest('hex'))return null;
  return {originalChildCompletion:text.slice(0,at).trim(),inputs};
}

// This is an index of actual envelopes, not a synthesized session transcript.
// payload.ts is the source clock; the outer at is observer receipt time.
export function indexNativeToolPairs(events, {runId, sessionKey} = {}) {
  const rows = new Map();
  for (const envelope of events) {
    const p = envelope.payload, d = p?.data;
    if (!['agent', 'session.tool'].includes(envelope.event) || p?.stream !== 'tool' ||
        (runId && p.runId !== runId) || (sessionKey && p.sessionKey !== sessionKey) ||
        !d?.toolCallId || !d.name || !Number.isFinite(p.ts)) continue;
    const key = `${p.runId}\0${p.sessionKey ?? ''}\0${d.toolCallId}`;
    const row = rows.get(key) ?? {id:d.toolCallId, name:d.name, runId:p.runId,
      sessionKey:p.sessionKey ?? null, source:'native-tool-envelope', sourceExecutionTimingVerified:true, results:[], rawEnvelopes:[]};
    row.rawEnvelopes.push(envelope);
    if (d.phase === 'start') {row.args=d.args; row.calledAt=p.ts; row.startObservedAt=envelope.at;}
    if (d.phase === 'result' && !row.results.some(r => r.at === p.ts && r.seq === p.seq)) {
      row.results.push({at:p.ts, observedAt:envelope.at, seq:p.seq, isError:d.isError === true,
        text:textOf(d.result), details:d.result?.details ?? null, rawResult:d.result,
        originEvent:envelope.event, diagnosticResultMayBeRedacted:true});
    }
    rows.set(key, row);
  }
  return [...rows.values()].filter(row => Number.isFinite(row.calledAt));
}

// Persisted transcripts supply complete bodies, not tool execution clocks.
// An unmatched transcript call remains explicitly timing-unverified.
export function mergeExactToolBodies(native, stored) {
  const out=native.map(row=>({...row,results:row.results.map(r=>({...r}))}));
  for (const full of stored) {
    const pair=out.find(row=>row.id===full.id&&row.name===full.name&&row.runId===full.runId&&row.sessionKey===full.sessionKey);
    if (!pair) {out.push({...full,sourceExecutionTimingVerified:false,persistedCalledAt:full.calledAt,calledAt:null,
      results:full.results.map(r=>({...r,persistedAt:r.at,at:null}))});continue;}
    if (full.args) {pair.completeArgs=full.args;pair.completeBodySource=full.source;}
    for (const result of pair.results) {
      const candidates=full.results.filter(r=>r.isError===result.isError&&
        (r.details?.status??null)===(result.details?.status??null));
      if(candidates.length===1){result.text=candidates[0].text;result.completeRawResult=candidates[0].rawResult;
        result.completeBodySource=full.source;result.persistedAt=candidates[0].at;}
    }
    pair.sourceExecutionTimingVerified=true;
  }
  return out;
}

// A persisted parent message is stamped when generation begins, so that stamp
// cannot establish the order of individual tools. Link its body to one actual
// native call identity and keep only the native start/result source clocks.
export function mergeSessionToolEvidence(events, stored, sessionKey) {
  const native=indexNativeToolPairs(events,{sessionKey});
  const bound=stored.map(full=>{
    const matches=native.filter(row=>row.id===full.id&&row.name===full.name&&
      (!full.runId||row.runId===full.runId));
    if(matches.length!==1)return {...full,sessionKey,runId:full.runId??null};
    return {...full,sessionKey,runId:matches[0].runId,
      persistedIdentityAssociation:'unique-native-toolCallId/name/sessionKey'};
  });
  return mergeExactToolBodies(native,bound);
}

// Select the output of the designated date tool, not an unrelated later clock.
// The numeric date line with an explicit zone/offset identifies local date even
// when the same command also prints GNU date and timedatectl's UTC clock.
export function selectCommandLocalTimestamp(text) {
  const candidates=[];
  for(const line of String(text??'').split(/\r?\n/u)) {
    const offset=/\s(?:[A-Za-z][A-Za-z0-9_+:/-]*\s+)?([+-])(\d{2}):?(\d{2})\s*$/u.exec(line);
    if(!offset||+offset[2]>23||+offset[3]>59)continue;
    const numeric=/^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\b/u.test(line);
    const fields=parseCompleteTimestamps(line);
    if(!numeric||fields.length!==1)continue;
    const offsetMinutes=(+offset[2]*60 + +offset[3])*(offset[1]==='-'?-1:1);
    candidates.push({fields:fields[0],offsetMinutes,originalLine:line});
  }
  const unique=new Map(candidates.map(value=>[JSON.stringify([value.fields,value.offsetMinutes]),value]));
  if(unique.size===1)return [...unique.values()][0];
  if(unique.size>1)return null;
  // GNU date's default form may omit a numeric offset. Preserve its exact
  // calendar value, while leaving an ambiguous abbreviation such as CST unproved.
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],gnu=[];
  for(const line of String(text??'').split(/\r?\n/u)) {
    const m=/^\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(?:(AM|PM)\s+)?(\S+)\s+(\d{4})\s*$/u.exec(line);
    if(!m||!months.includes(m[1]))continue;
    let hour=+m[3];if(m[6]){if(hour<1||hour>12)continue;hour=hour%12+(m[6]==='PM'?12:0);}
    const fields={year:+m[8],month:months.indexOf(m[1])+1,day:+m[2],hour,minute:+m[4],second:+m[5]};
    const date=new Date(Date.UTC(fields.year,fields.month-1,fields.day,hour,fields.minute,fields.second));
    if(fields.year<2000||fields.year>2100||date.getUTCFullYear()!==fields.year||date.getUTCMonth()+1!==fields.month||date.getUTCDate()!==fields.day||
      hour>23||fields.minute>59||fields.second>59)continue;
    const explicit=/^([+-])(\d{2}):?(\d{2})$/u.exec(m[7]);
    const offsetMinutes=['UTC','GMT'].includes(m[7])?0:explicit&&+explicit[2]<=23&&+explicit[3]<=59?
      (+explicit[2]*60 + +explicit[3])*(explicit[1]==='-'?-1:1):null;
    gnu.push({fields,offsetMinutes,zoneLiteral:m[7],originalLine:line,sourceFormat:'GNU-date'});
  }
  const gnuUnique=new Map(gnu.map(value=>[JSON.stringify([value.fields,value.zoneLiteral]),value]));
  if(gnuUnique.size===1)return [...gnuUnique.values()][0];
  if(gnuUnique.size>1)return null;
  const fields=parseCompleteTimestamps(text),offset=/([+-])(\d{2}):?(\d{2})\b/u.exec(text);
  if(fields.length!==1||!offset||+offset[2]>23||+offset[3]>59)return null;
  return {fields:fields[0],offsetMinutes:(+offset[2]*60 + +offset[3])*(offset[1]==='-'?-1:1),originalLine:String(text)};
}

export function extractExecDateFromPairs(pairs, seconds=45) {
  const isVerified=row=>row.sourceExecutionTimingVerified===true && Number.isFinite(row.calledAt) &&
    typeof row.runId==='string' && row.runId.length>0 && typeof row.sessionKey==='string' && row.sessionKey.length>0;
  const sameActor=(a,b)=>a.runId===b.runId && a.sessionKey===b.sessionKey;
  const candidatesFor=exec=>exec.results.flatMap(first=>{
    const processSessionId=first.details?.sessionId ?? /session ID\s+([\w-]+)/iu.exec(first.text)?.[1] ?? null;
    return [{call:exec,result:first,processSessionId},...pairs.filter(row=>row.name==='process' && isVerified(row) && sameActor(exec,row) &&
      processSessionId && (row.args?.sessionId ?? row.args?.session_id)===processSessionId)
      .flatMap(call=>call.results.map(result=>({call,result,processSessionId})))];
  });
  const waits=pairs.filter(row=>row.name==='exec' && isVerified(row) &&
    new RegExp('\\bsleep\\s+["\']?'+seconds+'(?:s)?["\']?(?=\\s|[;&|]|$)','u').test(row.args?.command ?? ''));
  for (const wait of waits) {
    const command=wait.args?.command ?? '';
    const hasDate=/\bdate\b/u.test(command);
    // Combined commands are only eligible when their source text places the
    // requested sleep before date. Reversed/ambiguous source is not proof.
    const combined=hasDate && command.search(/\bsleep\b/u)<command.search(/\bdate\b/u);
    if(hasDate && !combined) continue;
    const waitTerminal=candidatesFor(wait).find(({result})=>toolResultSucceeded(result) && Number.isFinite(result.at) && result.at-wait.calledAt>=seconds*1000 &&
      ['completed','exited'].includes(result.details?.status) && result.details?.exitCode===0);
    const dateExecs=combined?[wait]:waitTerminal?pairs.filter(row=>row.name==='exec' && isVerified(row) && sameActor(wait,row) &&
      row.calledAt>=waitTerminal.result.at && /\bdate\b/u.test(row.args?.command ?? '') && !/\bsleep\b/u.test(row.args?.command ?? '')):[];
    for (const exec of dateExecs) {
      for (const {call,result,processSessionId} of candidatesFor(exec)) {
        const selected=selectCommandLocalTimestamp(result.text);
        if (!isVerified(call) || !sameActor(wait,call) || !Number.isFinite(result.at) || !toolResultSucceeded(result) ||
            !['completed','exited'].includes(result.details?.status) || result.details?.exitCode!==0 ||
            result.at-wait.calledAt<seconds*1000 || result.at<exec.calledAt || !selected) continue;
        const {offsetMinutes,fields:f}=selected;
        return {command:exec.args.command,execCallId:exec.id,resultCallId:call.id,processSessionId,
          source:exec.source ?? 'session-history',runId:exec.runId,sessionKey:exec.sessionKey,
          resultText:result.text,selectedDateOutputLine:selected.originalLine,fields:f,offsetMinutes,zoneLiteral:selected.zoneLiteral??null,resultAt:result.at,resultObservedAt:result.observedAt ?? null,
          waitExecCallId:wait.id,waitCalledAt:wait.calledAt,waitResultAt:combined?result.at:waitTerminal.result.at,
          waitDurationMs:(combined?result.at:waitTerminal.result.at)-wait.calledAt,combinedCommand:combined,
          actualCommandTime:Number.isFinite(offsetMinutes)?Date.UTC(f.year,f.month-1,f.day,f.hour,f.minute,f.second)-offsetMinutes*60000:null};
      }
    }
  }
  return null;
}

// Callback hashes link distinct identifiers without unredacting logs or treating
// the native item id as the bridge's real backend call id.
export function resolveNativeControlOwner({diagnostics=[],events=[],tools=[],backendRunId,voiceSessionId,pcIndex=0}) {
  if (!backendRunId || !voiceSessionId) return null;
  const sourceRunIdSha256=createHash('sha256').update(backendRunId).digest('hex');
  const bridgeCall=tools.find(e=>e.raw?.type==='tool.call' && e.raw.callId===backendRunId && e.raw.voiceSessionId===voiceSessionId);
  if (!bridgeCall) return null;
  const candidates=diagnostics.filter(d=>d.stage==='backend-run-started' && d.sourceRunIdSha256===sourceRunIdSha256 &&
    events.some(e=>e.pcIndex===pcIndex && e.type==='delegation.created' && e.raw?.item?.id===d.delegationId));
  const owners=new Set(candidates.map(d=>`${d.traceId}\0${d.delegationId}\0${d.generation}`));
  if (owners.size!==1) return null;
  const owner=candidates[0];
  return {traceId:owner.traceId,delegationId:owner.delegationId,generation:owner.generation,
    backendRunId,sourceRunIdSha256,voiceSessionId,bridgeCallId:bridgeCall.raw.callId,
    bridgeCallObservedAt:bridgeCall.at,publicOwnerObservedAt:owner.at,proof:'actual-callback-source-hash+exact-native-item+exact-H5-call'};
}

// The registry supplies the terminal actor identity. History generation stamps
// and an observer's expected run id cannot establish the final's source.
export function resolveCanonicalFinalTrace(diagnostics, owner, sourceRunIdSha256) {
  const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
  if(!owner||!validHash(owner.sourceRunIdSha256)||
      sourceRunIdSha256!==undefined&&!validHash(sourceRunIdSha256))return null;
  const owned=row=>row.traceId===owner.traceId&&row.delegationId===owner.delegationId&&row.generation===owner.generation;
  const finals=diagnostics.filter(row=>owned(row)&&row.stage==='backend-final-received'&&row.kind==='final'&&
    row.provenance?.source==='canonical_final'&&validHash(row.sourceRunIdSha256)&&
    row.ownerRunIdSha256===owner.sourceRunIdSha256&&Number.isFinite(row.at)&&
    (sourceRunIdSha256===undefined||row.sourceRunIdSha256===sourceRunIdSha256));
  for(const received of finals.toReversed()) {
    const started=diagnostics.find(row=>owned(row)&&['backend-run-started','backend-steering-consumed'].includes(row.stage)&&
      row.sourceRunIdSha256===received.sourceRunIdSha256&&Number.isFinite(row.at)&&row.at<=received.at);
    if(!started)continue;
    const final=diagnostics.findLast(row=>owned(row)&&row.stage==='context-append-sent'&&row.kind==='final'&&
      row.role==='final_complete'&&row.sourceRunIdSha256===received.sourceRunIdSha256&&
      row.ownerRunIdSha256===received.ownerRunIdSha256&&row.provenance?.source==='canonical_final'&&
      Number.isFinite(row.at)&&row.at>=received.at);
    if(!final)continue;
    const chunks=diagnostics.filter(row=>owned(row)&&row.stage==='context-append-sent'&&row.kind==='final'&&row.appendId===final.appendId);
    if(!Number.isSafeInteger(final.chunkCount)||final.chunkCount<1||!final.appendId||chunks.length!==final.chunkCount||
        new Set(chunks.map(row=>row.chunkIndex)).size!==final.chunkCount||
        chunks.some(row=>!Number.isSafeInteger(row.chunkIndex)||row.chunkIndex<0||row.chunkIndex>=final.chunkCount||
          row.sourceRunIdSha256!==received.sourceRunIdSha256||row.ownerRunIdSha256!==received.ownerRunIdSha256||
          row.provenance?.source!=='canonical_final'||!Number.isFinite(row.at)||row.at<received.at)||
        chunks.at(-1)?.role!=='final_complete')continue;
    return {received,started,final,chunks,sourceRunIdSha256:received.sourceRunIdSha256,ownerRunIdSha256:received.ownerRunIdSha256};
  }
  return null;
}

// All frames, including non-quiet ones, must be present. Metadata completion,
// HTML mute, paused playback, an unattached receiver or sampling gaps cannot
// stand in for real continuous playback/RTP quiet.
export function continuousPlaybackQuiet(frames,{pcIndex,after,durationMs=750,threshold=.003,maxGapMs=100,requireTail=true}={}) {
  const source=frames.filter(f => f.pcIndex===pcIndex && f.at>=after).sort((a,b)=>a.at-b.at);
  let run=[],found=null;
  for (const f of source) {
    const eligible=Number.isFinite(f.rms)&&f.rms<=threshold && f.muted===false && f.paused===false && Number.isFinite(f.volume)&&f.volume>0&&f.contextState==='running' &&
      f.receiverAttachedToPlayback===true && f.trackState==='live' && f.connected==='connected';
    if (!eligible || (run.length && f.at-run.at(-1).at>maxGapMs)) run=[];
    if (eligible) run.push(f);
    if (run.length && f.at-run[0].at>=durationMs) found={from:run[0].at,to:f.at,
      durationMs:f.at-run[0].at,frameCount:run.length,thresholdFloatRms:threshold,
      rtp:run.filter(row=>row.rtp?.length).map(row=>({at:row.at,rtp:row.rtp}))};
    if (!eligible && requireTail) found=null;
  }
  return found && (!requireTail || source.at(-1)?.at===found.to) ? found : null;
}

export function explicitSpokenOffsets(text) {
  const digits={零:'0',〇:'0',一:'1',二:'2',两:'2',三:'3',四:'4',五:'5',六:'6',七:'7',八:'8',九:'9'};
  const normalized=String(text).replace(/[零〇一二两三四五六七八九]/gu, c=>digits[c])
    .replace(/(?:加|正)(\d{4})/gu,'+$1').replace(/(?:减|负)(\d{4})/gu,'-$1');
  const offsets=[...normalized.matchAll(/(?:UTC|GMT|时区|偏移)?\s*([+-])(\d{2}):?(\d{2})\b/giu)]
    .filter(m=>+m[2]<=23&&+m[3]<=59).map(m=>(+m[2]*60 + +m[3])*(m[1]==='-'?-1:1));
  if (/北京时间|中国标准时间|东八区/u.test(text)) offsets.push(480);
  if (/(?:UTC|协调世界时|世界标准时间|格林尼治)/iu.test(text) && !/[+-]\d{2}/u.test(normalized)) offsets.push(0);
  return offsets;
}
