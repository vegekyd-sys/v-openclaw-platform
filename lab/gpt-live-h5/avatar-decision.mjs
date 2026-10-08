import { createJevEvaluator } from '../voice-decision-router.mjs';

const expressions = {focused:'Concentrated, purposeful working posture.',curious:'Curious, thoughtful head tilt while investigating.',bright:'Energetic, engaged working expression.',calm:'Calm, patient and attentive posture.'};
// Presentation only. No user text, tool arguments, result, permission or route.
export function createAvatarExpressionSelector({evaluate,now=Date.now,audit=()=>{}} = {}) {
  const owners = new Map();
  return {
    async select({owner,callId,activity,isCurrent=()=>true}) {
      if (!evaluate || !['memory','web','calendar','background'].includes(activity) || !owner || !callId) return null;
      const old = owners.get(owner);
      if (old && (old.busy || now()-old.at < 15000 || old.count >= 12)) return null;
      const row={at:now(),busy:true,count:(old?.count??0)+1};owners.set(owner,row);
      if (owners.size > 64) owners.delete(owners.keys().next().value);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),1500);timer.unref?.();
      try {
        const raw=await evaluate({activity,purpose:'Choose only an avatar performance style for an already executing task. Never choose a tool or influence its execution.'},{expression:{type:'choice',criteria:expressions}},controller.signal);
        const value=raw?.answers?.expression;
        if (controller.signal.aborted || !isCurrent() || value?.type!=='choice' || !Object.hasOwn(expressions,value.choice) || !Number.isFinite(value.confidence) || value.confidence<.5 || value.confidence>1) return null;
        audit({type:'avatar.decision',activity,expression:value.choice,model:raw.model,durationMs:now()-row.at});
        return value.choice;
      } catch { return null; } finally {clearTimeout(timer);row.busy=false;}
    },
  };
}
export function avatarEvaluatorFromEnv(env=process.env) {
  const provider=env.VOICE_AVATAR_DECISION_PROVIDER;
  if(!['jev','openai_decisions'].includes(provider))return null;
  const apiKey=env.VOICE_JEV_API_KEY??env.OPENROUTER_API_KEY;
  if(!apiKey)return null;
  return createJevEvaluator({apiKey,model:provider==='jev'?(env.VOICE_JEV_MODEL??'typesafe/jev-1.13'):(env.VOICE_OPENAI_DECISIONS_MODEL??'openai/gpt-6-luna-decisions'),timeoutMs:1400});
}
