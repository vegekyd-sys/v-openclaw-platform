import assert from 'node:assert/strict';
export function patchVoiceDeviceContextSdk(source){
 const line='export { registerRealtimeVoiceDeviceContext } from "../voice-device-context.mjs";';
 return source.includes(line)?source:source+'\n'+line+'\n';
}
export function patchVoiceDeviceContextTalk(source){
 const marker='// voice-device-context-v1: admission-owned call ID';if(source.includes(marker))return source;
 const before='\t\t\t\t...launchOptions\n\t\t\t};\n\t\t\tconst assertCommitAllowed';
 assert.equal(source.split(before).length-1,1,'Expected exactly one browser request admission anchor');
 return source.replace(before,'\t\t\t\t...launchOptions,\n\t\t\t\t'+marker+'\n\t\t\t\tvoiceSessionId: activeVoiceSessionId\n\t\t\t};\n\t\t\tconst assertCommitAllowed');
}
