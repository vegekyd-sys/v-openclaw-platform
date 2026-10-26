const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Task progress identity anchor drift: '+a.slice(0,80));return s.replace(a,()=>b);};
export function patchProgressToolIdentity(s){
 s=once(s,'createProgressCardTool({ agentSessionKey: options?.runSessionKey ?? options?.agentSessionKey })','createProgressCardTool({ agentSessionKey: options?.runSessionKey ?? options?.agentSessionKey, runId: options?.runId })');
 return once(s,'const result = await gatewayCall("progressCard.put", {\n\t\t\t\tsessionKey,','const result = await gatewayCall("progressCard.put", {\n\t\t\t\tsessionKey,\n                ...options.runId ? {runId:options.runId} : {},');
}
export function patchProgressProtocolIdentity(s){return once(s,'const ProgressCardPutParamsSchema = closedObject({\n\tsessionKey: NonEmptyString,','const ProgressCardPutParamsSchema = closedObject({\n\tsessionKey: NonEmptyString,\n    runId: Type.Optional(NonEmptyString),');}
export function patchProgressEventIdentity(s){
 s=once(s,'function vProgressCardNotifyChanged(sessionKey, card) {','function vProgressCardNotifyChanged(sessionKey, card, runId) {');
 s=once(s,'listener({ sessionKey, card })','listener({ sessionKey, card, runId })');
 return once(s,'vProgressCardNotifyChanged(sessionKey, result.card ?? null);','vProgressCardNotifyChanged(sessionKey, result.card ?? null, params.runId);');
}
export function patchProgressRendererIdentity(s){
 s=once(s,'each(event.card ?? null);','each(event.card ?? null, event);');
 return once(s,'vProgressSubscribe(params.sessionKey, (card) => {',`vProgressSubscribe(params.sessionKey, (card, event) => {
      // Unknown and stale run updates must never enter another task's card.
      const ownerRunId = params.boundTaskPresentation?.runId?.() ?? vFirsttextE2e.runId;
      if (params.boundTaskPresentation ? !event?.runId || event.runId !== ownerRunId : event?.runId && event.runId !== ownerRunId) return;`);
}
