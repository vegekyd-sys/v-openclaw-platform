import assert from 'node:assert/strict';
export function patchVoiceControlAuthority(source) {
 const marker='// voice-task-control-authority-v1';if(source.startsWith(marker))return source;
 const before='\t\tisInboundUserMessage: true,\n\t\ttaskSuggestionDeliveryMode: void 0';
 assert.equal(source.split(before).length-1,1,'Realtime control authority anchor drifted');
 return marker+'\n'+source.replace(before,'\t\tisInboundUserMessage: true,\n\t\t// Authority comes from the exact resolved run, never caller tool arguments.\n\t\ttoolAuthorityFingerprint: exactOwner?.toolAuthorityFingerprint,\n\t\tsourceReplyDeliveryMode: exactOwner?.sourceReplyDeliveryMode,\n\t\ttaskSuggestionDeliveryMode: exactOwner?.taskSuggestionDeliveryMode');
}
export function patchVoiceRunOwnerAuthority(source) {
 const marker='// voice-task-control-owner-authority-v1';if(source.startsWith(marker))return source;
 const before='\t\t...handle.startedAtMs === void 0 ? {} : { startedAtMs: handle.startedAtMs },';
 assert.equal(source.split(before).length-1,1,'Exact run owner projection anchor drifted');
 return marker+'\n'+source.replace(before,before+'\n\t\ttoolAuthorityFingerprint: normalizeOptionalString(handle.toolAuthorityFingerprint),\n\t\tsourceReplyDeliveryMode: handle.sourceReplyDeliveryMode,\n\t\ttaskSuggestionDeliveryMode: handle.taskSuggestionDeliveryMode,');
}
