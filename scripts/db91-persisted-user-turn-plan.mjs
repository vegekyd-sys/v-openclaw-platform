import assert from 'node:assert/strict';
export function patchPersistedUserTurnFile(name, original, helperSource) {
  let result=original;
  const once=(anchor,replacement)=>{
    assert.equal(result.split(anchor).length,2,'unique persisted-user-turn anchor: '+anchor);
    result=result.replace(anchor,replacement);
  };
  if(name==='index.mjs') {
    assert(!result.includes('snapshotPersistedUserTurn'));
    once('  acknowledgeWorkerUserTurn,','  acknowledgeWorkerUserTurn,\n  snapshotPersistedUserTurn,');
    const anchor='      const workerShouldPersistUserTurn = shouldWorkerPersistUserTurn(\n        params.userTurnTranscriptRecorder,\n      );';
    once(anchor,anchor+`\n      const nativePersistedUserTurn = snapshotPersistedUserTurn(params.userTurnTranscriptRecorder, {
        runId: params.runId, sessionId: params.sessionId, sessionKey,
        agentId: params.agentId ?? 'makaron',
      });`);
    once('                nativeHarnessData,',`                nativeHarnessData,
                // A rollover gets a new transcript owner; never carry the old
                // session's durable message acknowledgement into that owner.
                nativePersistedUserTurn: session.sessionId === params.sessionId ? nativePersistedUserTurn : undefined,`);
  } else if(name==='native-attempt-bridge.mjs') {
    assert(!result.includes('acknowledgeGatewayPersistedUserTurn'));
    const imp="import { isBridgedHarnessEventCallback } from './harness-event-contract.mjs';";
    once(imp,imp+"\nimport { acknowledgeGatewayPersistedUserTurn } from './user-turn-ownership.mjs';");
    const anchor='        throw new Error("Worker native attempt identity mismatch");\n      }';
    once(anchor,anchor+'\n      const gatewayUserTurnPersisted = acknowledgeGatewayPersistedUserTurn(input, c.message);');
    const apply=result.includes('        ...applyNativeHarnessData(input, c.message.nativeHarnessData),')
      ? '        ...applyNativeHarnessData(input, c.message.nativeHarnessData),'
      : '        ...prepared,'; // Shared 9.2 keeps its process-local tool authority.
    once(apply,apply+`\n        // This is a derived handoff invariant, not an ordinary request option.
        // Keep the admitted row and suppress exactly one native replay append.
        ...(gatewayUserTurnPersisted ? {suppressNextUserMessagePersistence:true} : {}),`);
  } else if(name==='user-turn-ownership.mjs') {
    assert(result.startsWith('function messageText(message) {'));
    const at=helperSource.indexOf('function messageText(message) {');assert(at>0);
    assert(helperSource.slice(0,at).includes('export function acknowledgeGatewayPersistedUserTurn'));
    result=helperSource.slice(0,at)+result;
  } else throw new Error('Unreviewed persisted-user-turn file: '+name);
  return result;
}
