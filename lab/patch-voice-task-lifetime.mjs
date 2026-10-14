import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export function patchVoiceTaskLifetime(source) {
  const marker='// voice-independent-task-lifetime-v1';
  if(source.startsWith(marker))return source;
  const replace=(before,after)=>{assert.equal(source.split(before).length-1,1,'Voice task lifetime anchor drift: '+before.slice(0,70));source=source.replace(before,after);};
  replace('const continuationContext = continuationIdentity ? {',`const taskLifetime = createVoiceTaskLifetime({ enabled: params.providerId === "v-voice-gpt-live", callSignal: signal, consultSignal, isCallClosing: () => Boolean(closing) });
\t\t\ttry {
\t\t\tconst continuationContext = continuationIdentity ? {`);
  replace('onCanceled, onRunStarted,\n\t\t\t\tisCurrent: () => { owner.assertOpen(); return owners.get(params.voiceSessionId) === owner; }',`onCanceled, onRunStarted: value => { taskLifetime.accepted(); if (params.providerId === "v-voice-gpt-live" && typeof value.runId === "string") harness.emit({ type: "tool.progress", callId: continuationIdentity.delegationItemId, turnId: harness.ensureTurn(), payload: { name: "openclaw_background_task", runId: value.runId, ...talkPayload() }, final: false }); onRunStarted?.(value); },
\t\t\t\tisCurrent: () => { if (taskLifetime.detached) return true; owner.assertOpen(); return owners.get(params.voiceSessionId) === owner; }`);
  replace('return await params.runAgentConsult({ question: buildGptLiveBackendCallControlQuestion(prompt, boundCallControl),', 'return await params.runAgentConsult({ question: buildGptLiveBackendCallControlQuestion(prompt, boundCallControl),');
  replace('}, AbortSignal.any([consultSignal, signal]), onProgress, continuationContext);','}, taskLifetime.signal, onProgress, continuationContext); } finally { taskLifetime.dispose(); }');
  return marker+'\nimport {createVoiceTaskLifetime} from "./voice-task-lifetime.js";\n'+source;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node patch-voice-task-lifetime.mjs <existing talk.js> <artifact talk.js>');
  await writeFile(output,patchVoiceTaskLifetime(await readFile(input,'utf8')));
  await copyFile(new URL('./voice-task-lifetime.mjs',import.meta.url),join(dirname(output),'voice-task-lifetime.js'));
}
