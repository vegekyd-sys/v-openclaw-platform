import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const BEFORE='8cd70a869960ca8a789bacea12ed92e14dee8085f1b95f82479382fdad7a3f1a';
export function patchVoiceResumeProjection(source){
 const marker='// voice-resume-projection-v1';
 if(source.startsWith(marker))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),BEFORE,'Voice resume baseline drifted');
 const anchor='\t\tconst agentParams = voice?.prepareResumeInput?.(params.agentParams) ?? params.agentParams;';
 assert.equal(source.split(anchor).length,2,'Voice resume anchor drifted');
 const wait=`\t\tif (voice) {
\t\t\t// A child can finish while another Worker rebuilds the parent transcript.
\t\t\t// Wait for the canonical projection before dispatch, never replay the task.
\t\t\tconst loaded = loadRequesterSessionEntry(params.agentParams.sessionKey, params.agentParams.agentId);
\t\t\tconst sessionId = loaded.entry?.sessionId;
\t\t\tvoice.assertCurrent({ sessionKey: params.agentParams.sessionKey, sessionId });
\t\t\tif (!sessionId || !loaded.agentId || !loaded.storePath) throw new Error("Voice resume requires its canonical transcript target");
\t\t\tconst { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
\t\t\tawait waitForSessionTranscriptProjection({ sessionId, agentId: loaded.agentId, storePath: loaded.storePath, sessionKey: params.agentParams.sessionKey }, signal, {
\t\t\t\tassertActive: () => { signal.throwIfAborted(); assertVoiceCurrent(); if (!params.isExecutionAllowed()) throw new SourceOwnerChangedError(); }
\t\t\t});
\t\t\tassertVoiceCurrent();
\t\t}
`;
 return marker+'\n'+source.replace(anchor,wait+anchor);
}
