import assert from 'node:assert/strict';
import test from 'node:test';
import {buildHarnessAttemptResult, readNativeSessionMessages} from './harness-result.mjs';

const target = {agentId:'makaron', sessionKey:'agent:makaron:feishu:group:test', sessionId:'native-id'};
test('9.1 uses scoped native transcript despite absent legacy file and silent payload', async () => {
  const messages = [{role:'user', content:'test'}, {role:'assistant', content:[{type:'text',text:'NO_REPLY'}], stopReason:'stop'}];
  const result = await buildHarnessAttemptResult({payloads:[],meta:{agentMeta:{sessionId:'native-id'}}}, {
    transcriptTarget:target,
    readVisibleEntries: async scope => { assert.deepEqual(scope,target); return messages.map(message=>({message})); },
  });
  assert.deepEqual(result.messagesSnapshot,messages);
  assert.deepEqual(result.assistantTexts,['NO_REPLY']);
});
test('native projection read failure is not converted to an empty successful turn', async () => {
  await assert.rejects(buildHarnessAttemptResult({}, {transcriptTarget:target,readVisibleEntries:async()=>{throw new Error('projection unavailable');}}), /projection unavailable/);
});
test('native identity must be explicit and only projected messages are returned', async () => {
  await assert.rejects(readNativeSessionMessages({agentId:'makaron'}), /explicit session identity/);
  const projected = [{message:{role:'assistant',content:'current branch'}}];
  assert.deepEqual(await readNativeSessionMessages(target,{readVisibleEntries:async()=>projected}), projected.map(x=>x.message));
});

test('historical children are not reannounced but current children survive an internal user completion', async () => {
  const spawn = (time,runId) => ({role:'toolResult',timestamp:time,toolName:'sessions_spawn',content:[{type:'text',text:JSON.stringify({status:'accepted',runId,childSessionKey:`agent:makaron:subagent:${runId}`})}]});
  const messages=[spawn(100,'historical'),{role:'user',timestamp:200,content:'new task'},spawn(210,'current'),{role:'user',timestamp:220,content:'internal completion'},{role:'assistant',timestamp:230,content:'NO_REPLY',stopReason:'stop'}];
  const result=await buildHarnessAttemptResult({}, {transcriptTarget:target,attemptStartedAt:200,readVisibleEntries:async()=>messages.map(message=>({message}))});
  assert.deepEqual(result.acceptedSessionSpawns.map(x=>x.runId),['current']);
  assert.equal(result.currentAttemptAssistant.content,'NO_REPLY');
});
