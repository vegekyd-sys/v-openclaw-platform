// Lab-only timing observer. No prompts, SQL, credentials or message contents.
import assert from 'node:assert/strict';
export function instrumentPrompt(source) {
 const start='async function prepareEmbeddedAttemptSystemPrompt(params) {';
 const end='//#endregion';
 const at=source.indexOf(start),until=source.indexOf(end,at);
 assert(at>=0&&until>at);
 let body=source.slice(at,until);
 const once=(anchor,value)=>{assert.equal(body.split(anchor).length,2,'unique anchor: '+anchor);body=body.replace(anchor,value);};
 once(start,start+`
 let db91Previous = performance.now();
 const db91Phase = (phase) => {
  const now = performance.now();
  if (params.attempt.sessionKey?.includes("db91-")) console.error("[db91-prompt-phase] " + JSON.stringify({runId:params.attempt.runId,pid:process.pid,phase,elapsedMs:Math.round((now-db91Previous)*10)/10}));
  db91Previous = now;
 };
`);
 const marks=[
  ['\tconst toolSchemaDirectoryPrompt = resolveToolSchemaDirectoryPrompt();','tool-schema-directory'],
  ['\tconst promptMode = attempt.promptMode','runtime-prompt'],
  ['\tconst promptContributionContext = {','reference-paths'],
  ['\tconst includeMemorySection =','provider-contribution'],
  ['\t\treturn {\n\t\t\tpreparedMemoryPrompt: await prepareAgentMemoryPrompt({','memory-start'],
  ['\tconst activeProjectKeys =','memory-and-watched-sessions'],
  ['\tconst projectMemoryWriteInstruction =','project-memory'],
  ['\tconst reportInputs = {','build-system-prompt'],
 ];
 for(const [anchor,phase] of marks){
  if(phase==='tool-schema-directory')once(anchor,anchor+'\n\tdb91Phase("'+phase+'");');
  else once(anchor,'\tdb91Phase("'+phase+'");\n'+anchor);
 }
 return source.slice(0,at)+body+source.slice(until);
}
