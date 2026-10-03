import {parseCompleteTimestamps} from '../gpt-live-call-live-evidence.mjs';

const textOf = value => typeof value === 'string' ? value : (value?.content ?? [])
  .filter(part => part?.type === 'text').map(part => part.text ?? '').join('\n');

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
  for (const exec of pairs.filter(row => row.name === 'exec' && row.sourceExecutionTimingVerified===true && Number.isFinite(row.calledAt) &&
      new RegExp('\\bsleep\\s+'+seconds+'\\b', 'u').test(row.args?.command ?? '') && /\bdate\b/u.test(row.args?.command ?? ''))) {
    for (const first of exec.results) {
      const processSessionId=first.details?.sessionId ?? /session ID\s+([\w-]+)/iu.exec(first.text)?.[1] ?? null;
      const candidates=[{call:exec,result:first}, ...pairs.filter(row => row.name === 'process' &&
        processSessionId && (row.args?.sessionId ?? row.args?.session_id) === processSessionId)
        .flatMap(call => call.results.map(result => ({call,result})))];
      for (const {call,result} of candidates) {
        const fields=parseCompleteTimestamps(result.text), offset=/([+-])(\d{2}):?(\d{2})\b/u.exec(result.text);
        if (call.sourceExecutionTimingVerified!==true || !Number.isFinite(result.at) || result.isError || fields.length !== 1 || !offset || +offset[2]>23 || +offset[3]>59) continue;
        const offsetMinutes=(+offset[2]*60 + +offset[3])*(offset[1]==='-'?-1:1), f=fields[0];
        return {command:exec.args.command,execCallId:exec.id,resultCallId:call.id,processSessionId,
          source:exec.source ?? 'session-history',runId:exec.runId,sessionKey:exec.sessionKey,
          resultText:result.text,fields:f,offsetMinutes,resultAt:result.at,resultObservedAt:result.observedAt ?? null,
          actualCommandTime:Date.UTC(f.year,f.month-1,f.day,f.hour,f.minute,f.second)-offsetMinutes*60000};
      }
    }
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
