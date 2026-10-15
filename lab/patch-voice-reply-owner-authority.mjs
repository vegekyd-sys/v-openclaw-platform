import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BEFORE='ecd0653c7e567130fe9fefe72a883695b2b4d69d3716553621577a218bf89540';
export function patchVoiceReplyOwnerAuthority(source){
 const marker='// voice-reply-owner-authority-v1';if(source.startsWith(marker))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),BEFORE,'Reply owner authority baseline drifted');
 const start=source.indexOf('function resolveActiveReplyRunOwnerForSignal(signal) {'),end=source.indexOf('\n/** Keep terminal state',start);
 assert(start>=0&&end>start,'Reply owner projection anchor drifted');
 const fragment=source.slice(start,end),anchor='\t\tsessionKey,\n\t\tabort:';
 assert.equal(fragment.split(anchor).length,2,'Reply owner result anchor drifted');
 const next=fragment.replace(anchor,'\t\tsessionKey,\n\t\ttoolAuthorityFingerprint: normalizeOptionalString(getAttachedBackend(operation)?.toolAuthorityFingerprint ?? operation.toolAuthorityFingerprint),\n\t\tsourceReplyDeliveryMode: getAttachedBackend(operation)?.sourceReplyDeliveryMode,\n\t\ttaskSuggestionDeliveryMode: getAttachedBackend(operation)?.taskSuggestionDeliveryMode,\n\t\tabort:');
 return marker+'\n'+source.slice(0,start)+next+source.slice(end);
}
