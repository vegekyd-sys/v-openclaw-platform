// Carry only a trusted per-attempt preload hint, never executable registrations.
import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
function ids(value){return Array.isArray(value)&&value.length>0&&value.length<=256&&value.every(id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))?[...new Set(value)].sort():undefined;}
export function preparedScope(params){
  const snapshot=params?.preparedModelRuntime;
  if(!snapshot||snapshot.agentId!==params.agentId||!params.runId||!params.sessionKey||!params.sessionId)return;
  const pluginIds=ids(snapshot.pluginRegistry?.plugins?.filter(p=>p.status==='loaded').map(p=>p.id));
  if(!pluginIds)return;
  return {version:1,agentId:params.agentId,runId:params.runId,sessionKey:params.sessionKey,sessionId:params.sessionId,pluginIds};
}
export function withPreparedScope(message,fn){
  const hint=message?.nativePreparedScope;
  const valid=hint?.version===1&&['agentId','runId','sessionKey','sessionId'].every(k=>typeof message[k]==='string'&&message[k]===hint[k]);
  const pluginIds=valid?ids(hint.pluginIds):undefined;
  return scope.run(pluginIds,()=>{globalThis[Symbol.for('db91.hi.deep')]?.mark('prepared-scope',{hintAccepted:Boolean(pluginIds),basePluginCount:pluginIds?.length??0});return fn();});
}
globalThis[Symbol.for('db91.prepared.scope')]={get:()=>scope.getStore()};
