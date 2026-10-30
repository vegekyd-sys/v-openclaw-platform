import assert from 'node:assert/strict';
export function patchFeishuLinkPreview(source) {
  const marker='// v-feishu-link-preview-v1';
  if(source.includes(marker))return source;
  const anchor='"card.action.trigger": async (data) => {';
  assert.equal(source.split(anchor).length,2,'Feishu callback registration anchor drifted');
  return 'import {feishuLinkPreview as vFeishuLinkPreview} from "./v-feishu-link-preview.mjs";\n'+marker+'\n'+
    source.replace(anchor,'"url.preview.get": (data) => vFeishuLinkPreview(data, { log: runtime?.log ?? console.log }),\n\t\t'+anchor);
}
