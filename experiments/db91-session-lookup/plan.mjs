import assert from 'node:assert/strict';
export const filename='server-worker-placement-startup-BvPREvpr.js';
export const beforeSha='f269ce90b01d8c8597c74ec982f2ebd0bacf6bedaeec3b41c82c990b03fc3ad9';
export function patchWorkspaceSessionLookup(source){
 const anchor='function resolveWorkerPlacementSessionTarget(params) {\n\tconst target = params.sessionRuntime.resolveGatewaySessionStoreTargetWithStore({\n\t\tcfg: params.config,\n\t\tkey: params.sessionKey,\n\t\tagentId: params.agentId,\n\t\tclone: false\n\t});';
 assert.equal(source.split(anchor).length,2,'unique native placement lookup');
 // Same native canonical-key discovery, duplicate validation and full entry.
 // Only replace whole-store materialization with indexed exact-key reads.
 return source.replace(anchor,anchor.replace('clone: false','clone: false,\n\t\texactRead: true'));
}
