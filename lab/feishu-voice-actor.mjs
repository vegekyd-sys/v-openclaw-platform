import {createHmac, timingSafeEqual} from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const METHODS = new Set(['voice.feishu.resolve','sessions.resolve','sessions.describe','chat.history','tools.catalog','tools.invoke','talk.client.create',
  'talk.client.close','talk.client.toolCall','talk.client.steer','voice.product.task.start','voice.product.task.read',
  'voice.product.task.lookup','voice.product.task.control','voice.product.task.cancel','voice.product.task-result','voice.product.control','send','agent.wait']);
const canonical = value => JSON.stringify(value === undefined ? null : value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v)))
    : Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const fail = () => {throw Error('feishu_voice_not_authorized');};

// This assertion is created ONLY by the server after OAuth. It authenticates a
// request, not a permission profile. Gateway re-evaluates text-chat policy.
export function signVoiceActor({secret, actor, method, params, now = Date.now()}) {
  const proof = {version:1, actor, method, params:canonical(params), issuedAt:now};
  return {...proof, signature:createHmac('sha256',secret).update(canonical(proof)).digest('base64url')};
}

export async function authorizeVoiceActor({proof, method, params, client, cfg, resolveAccount, resolvePolicy, now = Date.now()}) {
  if (!METHODS.has(method) || !client?.connect?.scopes?.includes('operator.admin') ||
      !client?.connect?.caps?.includes('voice-feishu-actor-v1')) fail();
  const a = proof?.actor;
  if (proof?.version !== 1 || !a || !['accountId','appId','tenantKey','openId','chatId'].every(k => ID.test(a[k] ?? '')) ||
      !/^ou_[A-Za-z0-9]+$/u.test(a.openId) || !/^oc_[A-Za-z0-9]+$/u.test(a.chatId) ||
      a.userId !== undefined && !ID.test(a.userId) || proof.method !== method || proof.params !== canonical(params) ||
      !Number.isSafeInteger(proof.issuedAt) || proof.issuedAt > now+5000 || proof.issuedAt < now-30000) fail();
  const account = await resolveAccount(cfg,a.accountId);
  if (!account?.enabled || account.accountId !== a.accountId || account.appId !== a.appId || !account.appSecret) fail();
  const {signature,...payload} = proof;
  const expected = createHmac('sha256',account.appSecret).update(canonical(payload)).digest();
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(signature)) fail();
  const actual = Buffer.from(signature,'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) fail();
  const policy = await resolvePolicy({cfg,account,actor:a});
  if (!policy?.admitted || !policy.sessionKey || !policy.agentId || typeof policy.senderIsOwner !== 'boolean') fail();
  // Never accept a caller-selected alias, another account, or another agent.
  if (method !== 'voice.feishu.resolve' && (['sessions.resolve','sessions.describe'].includes(method) ? params?.key : params?.sessionKey) !== policy.sessionKey ||
      params?.agentId !== undefined && params.agentId !== policy.agentId ||
      params?.accountId !== undefined && params.accountId !== a.accountId) fail();
  return Object.freeze({...policy,accountId:a.accountId,openId:a.openId,chatId:a.chatId});
}

export function actorClient(client,actor) {
  // Preserve transport connection ownership, remove its administrator identity.
  return {...client, authenticatedUserProfile:undefined,
    connect:{...client.connect,scopes:['operator.read','operator.write']},
    internal:{voiceActor:actor,voiceTransportClient:client}};
}

export function createVoiceActorMiddleware({resolveAccount,resolvePolicy,now}) {
  const resources = new Map();
  const resourceKeys = ['runId','taskId','voiceSessionId','clientSecret'];
  return async function prepare(opts) {
    const {voiceActor,...params} = opts.req.params ?? {};
    if (voiceActor === undefined) return opts;
    const actor=await authorizeVoiceActor({proof:voiceActor,method:opts.req.method,params,client:opts.client,
      cfg:opts.context.getRuntimeConfig(),resolveAccount,resolvePolicy,...(now?{now:now()}:{})});
    const owner=JSON.stringify([opts.client.connId,actor.accountId,actor.openId,actor.sessionKey]);
    const time=now?.() ?? Date.now();
    for (const [key,row] of resources) if (row.expiresAt < time) resources.delete(key);
    const visit=(value,fn)=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){
      if(resourceKeys.includes(key)&&typeof item==='string')fn(key,item);
      else if(item&&typeof item==='object')visit(item,fn);
    }};
    if (opts.req.method !== 'voice.feishu.resolve') {
      // IDs are connection-local in native Voice, but this connection hosts
      // several humans. Bind returned capabilities to this caller+conversation.
      for (const key of resourceKeys) if (typeof params[key] === 'string' &&
        !(opts.req.method === 'voice.product.task.start' && key === 'voiceSessionId') &&
        !(opts.req.method === 'voice.product.task-result' && key === 'runId' && resources.get('clientSecret:'+params.clientSecret)?.owner === owner) &&
        resources.get(key+':'+params[key])?.owner !== owner) fail();
      if(opts.req.method === 'voice.product.task.start' && typeof params.voiceSessionId==='string') {
        const key='voiceSessionId:'+params.voiceSessionId;
        if(resources.has(key)&&resources.get(key).owner!==owner)fail();
        resources.set(key,{owner,expiresAt:time+24*60*60*1000});
      }
      if (opts.req.method === 'send' && (params.channel !== 'feishu' || params.accountId !== actor.accountId ||
        ![actor.chatId,actor.kind==='dm'?actor.openId:null].filter(Boolean).includes(params.to))) fail();
    }
    if (opts.req.method === 'voice.feishu.resolve') {
      opts.respond(true,{sessionKey:actor.sessionKey,agentId:actor.agentId,accountId:actor.accountId,kind:actor.kind,displayName:actor.displayName});
      return null;
    }
    // These native schemas address a resource instead of a conversation. The
    // authenticated wrapper's session is consumed here, before schema checks.
    if (['tools.catalog','agent.wait','voice.product.task-result','voice.product.control'].includes(opts.req.method)) delete params.sessionKey;
    const respond=(ok,result,error,...rest)=>{
      if(ok)visit(result,(key,id)=>resources.set(key+':'+id,{owner,expiresAt:time+24*60*60*1000}));
      return opts.respond(ok,result,error,...rest);
    };
    return {...opts,req:{...opts.req,params},client:actorClient(opts.client,actor),respond};
  };
}

export function actorToolContext(actor) {
  return {senderIsOwner:actor.senderIsOwner,messageChannel:'feishu',accountId:actor.accountId,
    agentTo:actor.kind === 'group' ? actor.chatId : actor.openId,
    groupId:actor.kind === 'group' ? actor.chatId : undefined,
    channelContext:{channel:'feishu',accountId:actor.accountId,
      conversation:{kind:actor.kind === 'group' ? 'group' : 'direct',id:actor.kind === 'group' ? actor.chatId : actor.openId},
      sender:{id:actor.openId}}};
}
