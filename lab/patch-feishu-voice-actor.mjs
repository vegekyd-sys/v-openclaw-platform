import assert from 'node:assert/strict';
const once = (source,before,after) => {
  assert.equal(source.split(before).length,2,'Voice actor patch anchor drifted: '+before.slice(0,100));
  return source.replace(before,after);
};

export function patchActorDispatcher(source) {
  const marker='// v-feishu-voice-actor-dispatch-v1';
  if(source.includes(marker))return source;
  source=once(source,'async function handleGatewayRequest(opts) {',`async function handleGatewayRequest(opts) {
  try {
    opts = await vPrepareVoiceActor(opts);
    if (!opts) return;
  } catch {
    opts.respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "Feishu voice identity or conversation was not authorized"));
    return;
  }`);
  return `import {prepareVoiceActor as vPrepareVoiceActor} from "./v-feishu-voice-runtime.mjs";\n${marker}\n`+source;
}

export function patchActorToolInvoke(source) {
  const marker='// v-feishu-voice-actor-tools-v1';
  if(source.includes(marker))return source;
  source=once(source,'\t\tsenderIsOwner: client?.connect?.scopes?.includes("operator.admin"),',
    '\t\tsenderIsOwner: client?.internal?.voiceActor?.senderIsOwner ?? client?.connect?.scopes?.includes("operator.admin"),\n\t\t...(client?.internal?.voiceActor ? vActorToolContext(client.internal.voiceActor) : {}),');
  source=once(source,'conversationReadOrigin: resolveGatewayConversationReadOrigin({',
    'conversationReadOrigin: client?.internal?.voiceActor ? "delegated" : resolveGatewayConversationReadOrigin({');
  return `import {actorToolContext as vActorToolContext} from "./v-feishu-voice-actor.mjs";\n${marker}\n`+source;
}

export function patchActorToolResolver(source) {
  const marker='// v-feishu-voice-actor-tool-policy-v1';
  if(source.includes(marker))return source;
  source=once(source,'\t\tmessageProvider: params.messageChannel,','\t\tmessageProvider: params.messageChannel,\n\t\tchannelContext: params.channelContext,\n\t\tgroupId: params.groupId,');
  return marker+'\n'+source;
}

export function patchActorTalk(source) {
  const marker='// v-feishu-voice-actor-talk-v1';
  if(source.includes(marker))return source;
  source=once(source,'function resolveTalkAgentConsultAuthority(scopes) {',`function resolveTalkAgentConsultAuthority(scopes, actor) {
  if (actor) return {senderId:actor.openId,senderIsOwner:actor.senderIsOwner,
    messageProvider:"feishu",voiceActor:actor};`);
  // Includes both initial creation and later consultation/control paths.
  source=source.replaceAll('resolveTalkAgentConsultAuthority(client?.connect?.scopes)',
    'resolveTalkAgentConsultAuthority(client?.connect?.scopes,client?.internal?.voiceActor)');
  source=source.replaceAll('resolveTalkAgentConsultAuthority(request.client?.connect?.scopes)',
    'resolveTalkAgentConsultAuthority(request.client?.connect?.scopes,request.client?.internal?.voiceActor)');
  source=once(source,'\tconst idempotencyKey = `talk-${params.callId}-${randomUUID()}`;',
    '\tif (request.client?.internal?.voiceActor) throw new Error("Feishu voice requires the actor-aware native consult provider");\n\tconst idempotencyKey = `talk-${params.callId}-${randomUUID()}`;');
  source=once(source,'\t\t\t...authority,','\t\t\t...authority,\n\t\t\tvoiceActor: authority.voiceActor,');
  source=source.replaceAll('(candidate) => candidate === client','(candidate) => candidate === (client?.internal?.voiceTransportClient ?? client)');
  return marker+'\n'+source;
}

export function patchActorConsult(source) {
  const marker='// v-feishu-voice-actor-consult-v1';
  if(source.includes(marker))return source;
  source=once(source,'const consultDeliveryContext = resolvedDeliveryContext ?? deliveryContextFromSession(sessionEntry);',
    `const consultDeliveryContext = params.voiceActor ? {channel:"feishu",accountId:params.voiceActor.accountId,
        to:params.voiceActor.kind === "group" ? params.voiceActor.chatId : params.voiceActor.openId}
      : resolvedDeliveryContext ?? deliveryContextFromSession(sessionEntry);`);
  return marker+'\n'+source;
}

export function patchActorFeishuPolicy(source) {
  const marker='// v-feishu-voice-native-policy-v1';
  if(source.includes(marker))return source;
  return source+`\n${marker}
export function resolveVoiceFeishuAccount(cfg,accountId) { return resolveFeishuRuntimeAccount({cfg,accountId}); }
export function voiceFeishuPolicyDependencies({api,commandAuthorization}) {
  return {api,commandAuthorization,runtime:getFeishuRuntime,pairing:createChannelPairingController,
    groupConfig:resolveFeishuGroupConfig,groupPolicy:resolveOpenProviderRuntimeGroupPolicy,
    defaultGroupPolicy:resolveDefaultGroupPolicy,explicitGroup:hasExplicitFeishuGroupConfig,
    groupConversation:resolveFeishuGroupConversationIngressAccess,groupSender:resolveFeishuGroupSenderActivationIngressAccess,
    groupSession:resolveFeishuGroupSession,dm:resolveFeishuDmIngressAccess,
    configuredRoute:resolveConfiguredBindingRoute,runtimeRoute:resolveRuntimeConversationBindingRoute};
}\n`;
}

export function actorRuntimeModule({feishuMonitor,feishuClient,commandAuth}) {
  return `import {createVoiceActorMiddleware} from "./v-feishu-voice-actor.mjs";
import {createFeishuVoicePolicy} from "./v-feishu-voice-policy.mjs";
import {resolveVoiceFeishuAccount,voiceFeishuPolicyDependencies} from ${JSON.stringify(feishuMonitor)};
import {createFeishuPhoneTabClient} from ${JSON.stringify(feishuClient)};
import {n as commandAuthorization} from ${JSON.stringify(commandAuth)};
export const prepareVoiceActor=createVoiceActorMiddleware({resolveAccount:resolveVoiceFeishuAccount,
  resolvePolicy:createFeishuVoicePolicy(voiceFeishuPolicyDependencies({commandAuthorization,
    api:account=>{const client=createFeishuPhoneTabClient(account);return async(method,url)=>{
      const result=await client.request({method,url,timeout:8000});
      if(result?.code!==0)throw Error("feishu_members_unconfirmed");
      return result.data;
    }}}))});\n`;
}
