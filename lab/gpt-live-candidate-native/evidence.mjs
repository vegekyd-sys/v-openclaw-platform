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
      ['completed','exited'].includes(result.details?.status) && (!Number.isFinite(result.details?.exitCode) || result.details.exitCode===0));
    const dateExecs=combined?[wait]:waitTerminal?pairs.filter(row=>row.name==='exec' && isVerified(row) && sameActor(wait,row) &&
      row.calledAt>=waitTerminal.result.at && /\bdate\b/u.test(row.args?.command ?? '') && !/\bsleep\b/u.test(row.args?.command ?? '')):[];
    for (const exec of dateExecs) {
      for (const {call,result,processSessionId} of candidatesFor(exec)) {
        const fields=parseCompleteTimestamps(result.text), offset=/([+-])(\d{2}):?(\d{2})\b/u.exec(result.text);
        if (!isVerified(call) || !sameActor(wait,call) || !Number.isFinite(result.at) || !toolResultSucceeded(result) ||
            !['completed','exited'].includes(result.details?.status) || (Number.isFinite(result.details?.exitCode) && result.details.exitCode!==0) ||
            result.at-wait.calledAt<seconds*1000 || result.at<exec.calledAt || fields.length!==1 || !offset || +offset[2]>23 || +offset[3]>59) continue;
        const offsetMinutes=(+offset[2]*60 + +offset[3])*(offset[1]==='-'?-1:1), f=fields[0];
        return {command:exec.args.command,execCallId:exec.id,resultCallId:call.id,processSessionId,
          source:exec.source ?? 'session-history',runId:exec.runId,sessionKey:exec.sessionKey,
          resultText:result.text,fields:f,offsetMinutes,resultAt:result.at,resultObservedAt:result.observedAt ?? null,
          waitExecCallId:wait.id,waitCalledAt:wait.calledAt,waitResultAt:combined?result.at:waitTerminal.result.at,
          waitDurationMs:(combined?result.at:waitTerminal.result.at)-wait.calledAt,combinedCommand:combined,
          actualCommandTime:Date.UTC(f.year,f.month-1,f.day,f.hour,f.minute,f.second)-offsetMinutes*60000};
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

// All frames, including non-quiet ones, must be present. Metadata completion,
// HTML mute, paused playback, an unattached receiver or sampling gaps cannot
// stand in for real continuous playback/RTP quiet.
export function continuousPlaybackQuiet(frames,{pcIndex,after,durationMs=750,threshold=.003,maxGapMs=100,requireTail=true}={}) {
  const source=frames.filter(f => f.pcIndex===pcIndex && f.at>=after).sort((a,b)=>a.at-b.at);
  let run=[],found=null;
  for (const f of source) {
    const eligible=f.rms<=threshold && !f.muted && !f.paused && f.contextState==='running' &&
      f.receiverAttachedToPlayback && f.trackState==='live' && f.connected==='connected';
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
