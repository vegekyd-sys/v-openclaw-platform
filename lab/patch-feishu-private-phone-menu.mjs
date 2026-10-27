import assert from 'node:assert/strict';
export function patchPrivatePhoneMenu(source) {
  const marker='// v-feishu-private-phone-menu-v1';
  if(source.includes(marker))return source;
  assert(source.includes('import {createFeishuPhoneTabClient as vCreatePhoneTabClient}'),'Missing quiet Feishu client');
  const init='\tconst { cfg, accountId, runtime, chatHistories, fireAndForget } = params;';
  const action='\t\t\tconst event = parseFeishuBotMenuEvent(data);';
  assert.equal(source.split(init).length,2,'Bot menu context drifted');
  assert.equal(source.split(action).length,2,'Bot menu dispatch drifted');
  return 'import {createRuntimePrivatePhoneMenu as vCreatePrivatePhoneMenu} from "./v-feishu-private-phone-menu.mjs";\n'+marker+'\n'+source
    .replace(init,init+'\n\tconst vPrivatePhoneMenu=vCreatePrivatePhoneMenu({account:resolveFeishuRuntimeAccount({cfg,accountId}),createClient:vCreatePhoneTabClient,runtime});')
    .replace(action,'\t\t\tif(vPrivatePhoneMenu.handles(data)){vPrivatePhoneMenu.schedule(data);return;}\n'+action);
}
