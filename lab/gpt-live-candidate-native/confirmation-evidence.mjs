import {createHash} from 'node:crypto';
import {resolveNativeControlOwner} from './evidence.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const normalized=value=>String(value??'').trim().replace(/[\s。.!！]/gu,'');
const textOf=message=>typeof message?.content==='string'?message.content:
  (message?.content??[]).filter(part=>part?.type==='text').map(part=>part.text??'').join('\n');

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}

// This is an observation fingerprint, never a grant or server policy receipt.
export function confirmationArgsFingerprint(args) {
  if(!args||typeof args!=='object'||Array.isArray(args)||typeof args.command!=='string')return null;
  return sha256(JSON.stringify(canonical(args)));
}

export function isOriginalControlSleep60(command) {
  // Only the requested sleep step, optionally followed by its date step. A
  // quoted/echoed command or another shell action is not this control fixture.
  return /^\s*sleep\s+["']?60(?:s)?["']?\s*(?:(?:;|&&)\s*date(?:\s+[^\n;&|]+)?)?\s*$/u.test(String(command??''));
}

export function resolveControlExecConfirmationChallenge(pairs,{sessionKey,voiceSessionId,pcIndex,
  diagnostics=[],events=[],tools=[],initialInput,alreadyAttempted=false}={}) {
  if(alreadyAttempted||!sessionKey||!voiceSessionId||!Number.isInteger(pcIndex)||
    ![initialInput?.startedAt,initialInput?.completedAt].every(Number.isFinite)||initialInput.exitCode!==0)return null;
  const candidates=[];
  for(const pair of pairs) {
    if(pair.name!=='exec'||pair.sessionKey!==sessionKey||!pair.runId||pair.sourceExecutionTimingVerified!==true||
      !Number.isFinite(pair.calledAt)||pair.calledAt<initialInput.startedAt||!isOriginalControlSleep60(pair.args?.command))continue;
    const start=pair.rawEnvelopes?.find(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===sessionKey&&e.payload.ts===pair.calledAt&&
      e.payload.data?.phase==='start'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id);
    if(!start||confirmationArgsFingerprint(start.payload.data.args)!==confirmationArgsFingerprint(pair.args))continue;
    const blocked=pair.rawEnvelopes.filter(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===sessionKey&&Number.isFinite(e.payload.ts)&&e.payload.ts>=pair.calledAt&&
      e.payload.data?.phase==='result'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id&&
      e.payload.data.isError===true&&e.payload.data.result?.details?.status==='blocked'&&
      e.payload.data.result.details.deniedReason==='client-voice-confirmation');
    if(blocked.length!==1)continue;
    const reason=blocked[0].payload.data.result.details.reason;
    const ids=typeof reason==='string'?[...reason.matchAll(/VOICE_CONFIRMATION_REQUIRED:([a-f0-9-]+)/giu)].map(m=>m[1]):[];
    if(ids.length!==1||!uuid.test(ids[0]))continue;
    const owner=resolveNativeControlOwner({diagnostics,events,tools,backendRunId:pair.runId,voiceSessionId,pcIndex});
    const argsObservationSha256=confirmationArgsFingerprint(pair.args);
    if(!owner||!argsObservationSha256)continue;
    candidates.push({confirmationId:ids[0],confirmationIdSha256:sha256(ids[0]),callId:pair.id,runId:pair.runId,
      sessionKey,voiceSessionId,pcIndex,calledAt:pair.calledAt,blockedAt:blocked[0].payload.ts,
      blockedObservedAt:blocked[0].at,args:pair.args,argsObservationSha256,commandSha256:sha256(pair.args.command),
      owner,startEnvelope:start,blockedEnvelope:blocked[0],source:'exact-native-exec-start-and-confirmation-blocked-result'});
  }
  return candidates.length===1?candidates[0]:null;
}

export function resolveConfirmationUserTurn(events,{pcIndex,input,challenge}={}) {
  if(!challenge||challenge.pcIndex!==pcIndex||![input?.startedAt,input?.completedAt,challenge.blockedAt].every(Number.isFinite)||
    input.exitCode!==0||input.completedAt<input.startedAt||input.startedAt<challenge.blockedAt)return null;
  const turns=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&e.turnId&&
    Number.isFinite(e.at)&&e.at>=input.startedAt&&normalized(e.text)==='确认执行');
  return turns.length===1?turns[0]:null;
}

export function resolveConfirmedControlExec(pairs,{challenge,userTurn,owner,input}={}) {
  if(!challenge||!userTurn||!owner||!Number.isFinite(input?.startedAt)||owner.voiceSessionId!==challenge.voiceSessionId||
    owner.backendRunId===challenge.runId||owner.sourceRunIdSha256===challenge.owner.sourceRunIdSha256||
    owner.delegationId===challenge.owner.delegationId)return null;
  const candidates=pairs.filter(pair=>pair.name==='exec'&&pair.sessionKey===challenge.sessionKey&&
    pair.runId===owner.backendRunId&&pair.sourceExecutionTimingVerified===true&&Number.isFinite(pair.calledAt)&&
    pair.calledAt>=input.startedAt&&confirmationArgsFingerprint(pair.args)===challenge.argsObservationSha256&&
    pair.rawEnvelopes?.some(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===pair.sessionKey&&e.payload.ts===pair.calledAt&&
      e.payload.data?.phase==='start'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id));
  return candidates.length===1?candidates[0]:null;
}

export function findDurableConfirmationUserMessage(transcript,{sessionKey,userTurn,input}={}) {
  if(transcript?.source!=='private-sqlite-active-transcript'||transcript.queryOnly!==true||
    transcript.canonicalSessionKey!==sessionKey||!userTurn||!Number.isFinite(input?.startedAt))return null;
  const candidates=(transcript.rawEvents??[]).filter(row=>{
    const message=row.event?.message;
    return Number.isFinite(row.createdAt)&&row.createdAt>=input.startedAt&&message?.role==='user'&&
      normalized(textOf(message))===normalized(userTurn.text)&&normalized(textOf(message))==='确认执行';
  });
  return candidates.length===1?candidates[0]:null;
}

// These rows come only from the private Gateway's actual core tracer. Neither
// a provider event nor the observer can create a confirmation grant.
export function parseVoiceConfirmationDiagnostics(text) {
  const rows=[];
  for(const [lineIndex,line] of String(text??'').split('\n').entries()) {
    const prefix='GPT_LIVE_VOICE_CONFIRMATION ';
    if(!line.startsWith(prefix))continue;
    try {
      const event=JSON.parse(line.slice(prefix.length));
      if(event&&typeof event==='object'&&['eligible','bind','consume'].includes(event.stage))
        rows.push({...event,source:'private-gateway-core-confirmation-trace',lineIndex,rawLine:line});
    }catch{}
  }
  return rows;
}

export function assessControlConfirmationCoreReceipt(rows,{challenge,userTurn,input,owner,execPair,durableUserMessage}={}) {
  const missing=reason=>({identityValid:false,rawUserTextHashVerified:false,reason,receipt:null});
  if(!challenge||!userTurn||!owner||!execPair||
    ![input?.startedAt,input?.completedAt,userTurn.at,execPair.calledAt].every(Number.isFinite)||
    input.exitCode!==0||input.completedAt<input.startedAt||userTurn.role!=='user'||userTurn.type!=='turn.done'||
    userTurn.pcIndex!==challenge.pcIndex||!userTurn.turnId||userTurn.at<input.startedAt||normalized(userTurn.text)!=='确认执行'||
    owner.voiceSessionId!==challenge.voiceSessionId||
    execPair.runId!==owner.backendRunId||execPair.sessionKey!==challenge.sessionKey||
    execPair.sourceExecutionTimingVerified!==true||confirmationArgsFingerprint(execPair.args)!==challenge.argsObservationSha256||
    owner.backendRunId===challenge.runId||owner.sourceRunIdSha256!==sha256(execPair.runId)||
    owner.delegationId===challenge.owner.delegationId)return missing('Missing exact challenged USER, new native owner, or unchanged actual exec parameters');
  const sourced=(rows??[]).filter(row=>row.source==='private-gateway-core-confirmation-trace'&&Number.isFinite(row.at));
  const eligible=sourced.filter(row=>row.stage==='eligible'&&row.confirmationId===challenge.confirmationId&&
    /^[a-f0-9]{64}$/u.test(row.scopeSha256??'')&&typeof row.fingerprint==='string'&&row.fingerprint.length>0&&
    /^[a-f0-9]{64}$/u.test(row.userTextSha256??'')&&
    [row.pendingCreatedAt,row.durableUserObservedAt,row.callerInputAcceptedAt].every(Number.isFinite)&&
    row.pendingCreatedAt>=challenge.calledAt&&row.pendingCreatedAt<=challenge.blockedAt&&
    row.durableUserObservedAt>row.pendingCreatedAt&&row.durableUserObservedAt>=input.startedAt&&
    row.durableUserObservedAt<=row.callerInputAcceptedAt&&row.callerInputAcceptedAt<=row.at&&
    execPair.calledAt>=row.callerInputAcceptedAt);
  const chains=[];
  for(const first of eligible) {
    const same=row=>row.scopeSha256===first.scopeSha256&&row.fingerprint===first.fingerprint&&
      row.runId===execPair.runId&&row.runIdSha256===owner.sourceRunIdSha256&&row.runIdSha256===sha256(row.runId);
    const bindings=sourced.filter(row=>row.stage==='bind'&&same(row)&&row.confirmationId===challenge.confirmationId&&
      row.at>=first.at&&row.at<=execPair.calledAt);
    for(const bind of bindings) {
      const consumed=sourced.filter(row=>row.stage==='consume'&&same(row)&&row.at>=bind.at&&row.at>=execPair.calledAt);
      for(const consume of consumed)chains.push({eligible:first,bind,consume});
    }
  }
  if(chains.length!==1)return missing('Missing or ambiguous actual eligible/bind/consume chain for this exact new exec run');
  const receipt=chains[0],canonicalText=durableUserMessage?textOf(durableUserMessage.event?.message):null;
  const rawUserTextHashVerified=durableUserMessage?.event?.message?.role==='user'&&
    Number.isFinite(durableUserMessage?.createdAt)&&durableUserMessage.createdAt>=input.startedAt&&
    typeof canonicalText==='string'&&normalized(canonicalText)==='确认执行'&&
    sha256(canonicalText)===receipt.eligible.userTextSha256;
  return {identityValid:true,rawUserTextHashVerified,receipt,
    rawUserTextHashSource:rawUserTextHashVerified?'actual-private-canonical-USER-text':null,
    reason:rawUserTextHashVerified?null:'Core durable USER hash is retained; its exact canonical raw USER text was not independently matched',
    serverFingerprintIsNotObserverArgsHash:true,callerInputAcceptedAt:receipt.eligible.callerInputAcceptedAt,
    actualArgsObservationSha256:confirmationArgsFingerprint(execPair.args)};
}
