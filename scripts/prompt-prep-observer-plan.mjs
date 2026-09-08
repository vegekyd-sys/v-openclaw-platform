import assert from 'node:assert/strict';
import {instrumentPrompt} from './jitter-diag-plan.mjs';
export const version='prompt-prep-observer.1';
export function observePrompt(source) {
 let result=instrumentPrompt(source);
 const start='async function prepareEmbeddedAttemptSystemPrompt(params) {';
 const at=result.indexOf(start),end=result.indexOf('//#endregion',at);
 let body=result.slice(at,end);
 const once=(a,b)=>{assert.equal(body.split(a).length,2,'unique prompt observer anchor: '+a);body=body.replace(a,b);};
 once("const jitterEnabled = params.attempt.sessionKey?.includes('db91-');","const jitterEnabled = true; let jitterClosed = false, jitterCount = 0;");
 once('if (!jitterEnabled) return;','if (!jitterEnabled || jitterClosed || jitterCount++ >= 32) return;');
 once("'[jitter-diag.1] '","'[prompt-prep-observer.1] '");
 once('\tconst { attempt } = params;',` const jitterStarted = performance.now(); let jitterFailed = false;
 jitterLog('start', jitterStarted, 'start');
 try {
\tconst { attempt } = params;`);
 once('\tconst toolSchemaDirectoryPrompt = resolveToolSchemaDirectoryPrompt();','\tjitterLog("prelude", jitterStarted, "ok");\n\tconst toolSchemaDirectoryPrompt = jitterSync("tool-schema-directory", () => resolveToolSchemaDirectoryPrompt());');
 const last=body.lastIndexOf('\n}');assert(last>0);assert.equal(body.slice(last).trim(),'}');
 body=body.slice(0,last)+`\n } catch (error) { jitterFailed = true; throw error; }
 finally { jitterLog('total', jitterStarted, jitterFailed ? 'error' : 'ok'); jitterClosed = true; }
}`+body.slice(last+2);
 return result.slice(0,at)+body+result.slice(end);
}
