export function createVoiceLoginGateway({phoneLoginChallenges,resolveAccount,resolvePolicy,api,prepareActor}) {
return async function prepareVoiceActor(opts) {
  const method=opts.req.method;
  if(!['voice.feishu.login.begin','voice.feishu.login.status'].includes(method))return prepareActor(opts);
  if(!opts.client?.connect?.scopes?.includes('operator.admin')||!opts.client?.connect?.caps?.includes('voice-feishu-actor-v1')||!opts.client.connId)throw Error('phone_login_unavailable');
  const cfg=opts.context.getRuntimeConfig(),params=opts.req.params??{};
  if(method==='voice.feishu.login.begin') {
    if(typeof params.accountId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/u.test(params.accountId)||!/^oc_[A-Za-z0-9]+$/u.test(params.chatId??''))throw Error('phone_login_unavailable');
    const account=resolveAccount(cfg,params.accountId);
    if(!account?.enabled||account.accountId!==params.accountId)throw Error('phone_login_unavailable');
    const pending=phoneLoginChallenges.begin({accountId:account.accountId,appId:account.appId,chatId:params.chatId,clientId:opts.client.connId});
    const info=await api(account)('GET','/open-apis/im/v1/chats/'+params.chatId);
    if(!['p2p','group'].includes(info?.chat_mode))throw Error('phone_login_unavailable');
    opts.respond(true,pending);
    return null;
  }
  const row=phoneLoginChallenges.take({ticket:params.ticket,clientId:opts.client.connId});
  if(row.status==='pending'){opts.respond(true,{status:'pending'});return null;}
  const account=resolveAccount(cfg,row.accountId);
  if(!account?.enabled||account.appId!==row.appId)throw Error('phone_login_unavailable');
  const actor={...row.identity,appId:account.appId,accountId:account.accountId,chatId:row.chatId};
  const policy=await resolvePolicy({cfg,account,actor});
  if(!policy?.admitted||policy.kind==='dm'&&row.sourceChatId!==row.chatId)throw Error('phone_login_unavailable');
  opts.respond(true,{status:'verified',identity:row.identity});return null;
};
}
