import assert from 'node:assert/strict';
import {instrumentWorker} from './db91-prompt-trace-plan.mjs';
export {instrumentWorker};
export const version='jitter-diag.1';
export function instrumentPrompt(source) {
 const start='async function prepareEmbeddedAttemptSystemPrompt(params) {';
 const at=source.indexOf(start),end=source.indexOf('//#endregion',at);
 assert(at>=0&&end>at);let body=source.slice(at,end);
 const once=(a,b)=>{assert.equal(body.split(a).length,2,'unique jitter anchor: '+a);body=body.replace(a,b);};
 once(start,start+`
 const jitterEnabled = params.attempt.sessionKey?.includes('db91-');
 const jitterLog = (stage, started, outcome) => {
  if (!jitterEnabled) return;
  try { if (process.stderr.writableLength > 262144) return;
   console.error('[jitter-diag.1] '+JSON.stringify({runId:params.attempt.runId,pid:process.pid,stage,atMs:Date.now(),elapsedMs:performance.now()-started,outcome}));
  } catch {}
 };
 const jitterSync = (stage, fn) => {const started=performance.now();let outcome='error';try {const value=fn();outcome='ok';return value;} finally {jitterLog(stage,started,outcome);}};
 const jitterAsync = async (stage, fn) => {const started=performance.now();let outcome='error';try {const value=await fn();outcome='ok';return value;} finally {jitterLog(stage,started,outcome);}};
`);
 const wrap=(opening,closing,stage,async=true)=>{
  once(opening,(async?'await jitterAsync':'jitterSync')+'("'+stage+'", () => '+opening.replace(/^await /,''));
  once(closing,closing.replace('});','}));'));
 };
 wrap('await resolveAgentRuntimePrompt({','\t});\n\tconst promptMode','runtime-prompt');
 wrap('await resolveOpenClawReferencePaths({','\t});\n\tconst promptContributionContext','reference-paths');
 once('\tconst promptContribution = attempt.runtimePlan?', '\tconst promptContribution = jitterSync("provider-contribution", () => attempt.runtimePlan?');
 once('\t});\n\tconst includeMemorySection','\t}));\n\tconst includeMemorySection');
 once('await prepareAgentMemoryPrompt({','await jitterAsync("agent-memory", () => prepareAgentMemoryPrompt({');
 once('\t\t\t}),\n\t\t\tpreparedWatchedSessions:','\t\t\t})),\n\t\t\tpreparedWatchedSessions:');
 once('preparedWatchedSessions: prepareWatchedSessionsPrompt({','preparedWatchedSessions: jitterSync("watched-sessions", () => prepareWatchedSessionsPrompt({');
 once('\t\t\t})\n\t\t};','\t\t\t}))\n\t\t};');
 once('await prepareProjectMemoryBootstrap({','await jitterAsync("project-memory", () => prepareProjectMemoryBootstrap({');
 once('\t}) : [];','\t})) : [];');
 once('const attemptSystemPrompt = buildAttemptSystemPrompt(promptInputs);','const attemptSystemPrompt = jitterSync("prompt-assembly", () => buildAttemptSystemPrompt(promptInputs));');
 once('const systemPromptReport = buildSystemPromptReport(reportInputs);','const systemPromptReport = jitterSync("prompt-report", () => buildSystemPromptReport(reportInputs));');
 return source.slice(0,at)+body+source.slice(end);
}
