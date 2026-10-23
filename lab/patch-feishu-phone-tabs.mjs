import assert from 'node:assert/strict';

const MARKER = '// v-feishu-auto-phone-tab-v1';
export function patchFeishuPhoneTabs(source) {
  const clientModule = source.match(/from "(\.\/client-[^"/]+\.js)"/u)?.[1];
  assert(clientModule, "Expected Feishu client import");
  if (source.includes(MARKER)) return source;
  const anchor = '\t\t"im.chat.access_event.bot_p2p_chat_entered_v1": async () => {},';
  assert.equal(source.split(anchor).length, 2, 'Expected the existing no-op private-chat entry handler');
  const register = 'function registerEventHandlers(eventDispatcher, context) {';
  assert.equal(source.split(register).length, 2, 'Expected one Feishu event registration function');
  const context = '\tconst { cfg, accountId, channelRuntime, runtime, chatHistories, fireAndForget, abortSignal } = context;';
  assert.equal(source.split(context).length, 2, 'Expected account-scoped event context');
  return `import {createFeishuPhoneTabClient as vCreatePhoneTabClient} from "${clientModule}";\nimport {createRuntimePhoneTabHandler as vCreatePhoneTabHandler} from "./v-feishu-phone-tabs.mjs";\n${MARKER}\n` + source
    .replace(context, context + '\n\tconst vPhoneTab = vCreatePhoneTabHandler({account:resolveFeishuAccount({cfg,accountId}),createClient:vCreatePhoneTabClient,runtime,abortSignal});')
    .replace(anchor, '\t\t"im.chat.access_event.bot_p2p_chat_entered_v1": data => vPhoneTab.schedule(data),');
}

export function patchFeishuPhoneTabClient(source) {
  const marker = '// v-feishu-phone-tab-quiet-client-v1';
  if (source.includes(marker)) return source;
  for (const name of ['feishuClientSdk','resolveSdkDomain','createFeishuHttpInstance','resolveConfiguredHttpTimeoutMs'])
    assert(source.includes(name), 'Missing expected client helper: '+name);
  return source + `
${marker}
export function createFeishuPhoneTabClient(creds) {
  if (!creds.appId || !creds.appSecret) throw Error('phone_tab_credentials_missing');
  const quiet = {error(){},warn(){},info(){},debug(){},trace(){}};
  return new feishuClientSdk.Client({
    appId:creds.appId, appSecret:creds.appSecret,
    appType:feishuClientSdk.AppType.SelfBuild, domain:resolveSdkDomain(creds.domain),
    httpInstance:createFeishuHttpInstance(resolveConfiguredHttpTimeoutMs(creds),creds.domain),
    logger:quiet,
  });
}
`;
}
