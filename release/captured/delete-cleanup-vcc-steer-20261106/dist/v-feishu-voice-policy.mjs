// The native Feishu ingress and routing functions are injected from its loaded
// module. No independent owner list, role model, or pairing state is introduced.
export function createFeishuVoicePolicy(d) {
  return async ({cfg,account,actor}) => {
    const api = d.api(account), path = `/open-apis/im/v1/chats/${actor.chatId}`;
    const info = await api('GET',path);
    const isGroup = info?.chat_mode === 'group';
    if (!isGroup && info?.chat_mode !== 'p2p') return {admitted:false};
    // GET members is also checked for DM: possession of an oc_ ID is not proof
    // that the OAuth subject participates in the app's private conversation.
    let pageToken, member = false;
    const seen = new Set();
    do {
      const query = new URLSearchParams({member_id_type:'open_id',page_size:'100',...(pageToken?{page_token:pageToken}:{})});
      const page = await api('GET',path+'/members?'+query);
      if (!Array.isArray(page?.items)) throw Error('feishu_members_unconfirmed');
      member ||= page.items.some(item => item.member_id === actor.openId);
      if (member || !page.has_more) break;
      if (!page.page_token || seen.has(page.page_token)) throw Error('feishu_members_unconfirmed');
      pageToken=page.page_token;seen.add(pageToken);
    } while (true);
    if (!member) return {admitted:false,reason:'conversation_membership_required'};
    const f = account.config, group = isGroup ? d.groupConfig({cfg:f,groupId:actor.chatId}) : null;
    let ingress, peerId = actor.openId;
    if (isGroup) {
      if (group?.enabled === false) return {admitted:false};
      const {groupPolicy} = d.groupPolicy({providerConfigPresent:true,groupPolicy:f.groupPolicy,defaultGroupPolicy:d.defaultGroupPolicy(cfg)});
      const conversation = await d.groupConversation({cfg,accountId:account.accountId,chatId:actor.chatId,groupPolicy,
        groupAllowFrom:f.groupAllowFrom ?? [],groupExplicitlyConfigured:d.explicitGroup({cfg:f,groupId:actor.chatId})});
      if (conversation.ingress.admission !== 'dispatch') return {admitted:false};
      ingress = await d.groupSender({cfg,accountId:account.accountId,chatId:actor.chatId,
        allowFrom:group?.allowFrom?.length ? group.allowFrom : f.groupSenderAllowFrom ?? [],
        senderOpenId:actor.openId,senderUserId:actor.userId,requireMention:false,mentionedBot:true});
      const session = d.groupSession({chatId:actor.chatId,senderOpenId:actor.openId,chatType:'group',groupConfig:group,feishuCfg:f});
      // A top-level tab carries no topic. Never silently use another topic.
      if (['group_topic','group_topic_sender'].includes(session.groupSessionScope)) return {admitted:false};
      peerId=session.peerId;
    } else {
      const pairing = d.pairing({core:{channel:d.runtime().channel},channel:'feishu',accountId:account.accountId});
      ingress = await d.dm({cfg,accountId:account.accountId,dmPolicy:f.dmPolicy ?? 'pairing',allowFrom:f.allowFrom ?? [],
        readAllowFromStore:pairing.readAllowFromStore,senderOpenId:actor.openId,senderUserId:actor.userId,
        conversationId:actor.openId,mayPair:false});
    }
    if (ingress.senderAccess.decision !== 'allow' || ingress.ingress.admission !== 'dispatch') return {admitted:false};
    let route = d.runtime().channel.routing.resolveAgentRoute({cfg,channel:'feishu',accountId:account.accountId,
      peer:{kind:isGroup?'group':'direct',id:peerId}});
    const conversation={channel:'feishu',accountId:account.accountId,conversationId:peerId,...(isGroup?{parentConversationId:actor.chatId}:{})};
    const configured=d.configuredRoute({cfg,route,conversation});
    // ACP initialization can have external side effects; Voice must not create
    // or adopt a new ACP runtime from a guessed telephone URL.
    if (configured.bindingResolution) return {admitted:false};
    route=d.runtimeRoute({route:configured.route,conversation}).route;
    // Never open a shared main/alias session to another caller. Text policy can
    // admit a user while its route is still configured for a personal owner.
    if(!route.sessionKey?.includes(':feishu:')||!route.sessionKey.endsWith(':'+peerId.toLowerCase()))return {admitted:false};
    const auth = d.commandAuthorization({cfg,commandAuthorized:ingress.commandAccess?.authorized === true,
      ctx:{Provider:'feishu',Surface:'feishu',OriginatingChannel:'feishu',AccountId:account.accountId,
        SenderId:actor.openId,From:`feishu:${actor.openId}`,To:isGroup?actor.chatId:actor.openId,
        ChatType:isGroup?'group':'direct',GatewayClientScopes:[]}});
    return {admitted:true,sessionKey:route.sessionKey,agentId:route.agentId,kind:isGroup?'group':'dm',
      senderIsOwner:auth.senderIsOwner,displayName:isGroup?'飞书群聊':'飞书单聊'};
  };
}
