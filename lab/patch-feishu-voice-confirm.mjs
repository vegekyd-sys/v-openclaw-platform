import assert from 'node:assert/strict';
export function patchFeishuVoiceConfirmation(source) {
  const marker='// v-feishu-voice-card-confirm-v1';
  if(source.includes(marker))return source;
  const anchor='"card.action.trigger": async (data) => {';
  assert.equal(source.split(anchor).length,2,'Feishu confirmation callback anchor drifted');
  return 'import {runtimeVoiceCardConfirmation as vVoiceCardConfirmation} from "./v-feishu-voice-confirm.mjs";\n'+marker+'\n'+source.replace(anchor,anchor+`\n      const vVoiceConfirmation = await vVoiceCardConfirmation(data, {account:resolveFeishuRuntimeAccount({cfg,accountId})});
      if (vVoiceConfirmation) return vVoiceConfirmation;`);
}
