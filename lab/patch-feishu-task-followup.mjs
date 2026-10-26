const MARKER='v-task-followup-presentation-v1';
const once=(s,a,b)=>{const n=s.split(a).length-1;if(n!==1)throw Error('Followup presentation anchor drift: '+n+' '+a.slice(0,90));return s.replace(a,()=>b);};
export function patchFollowupPresentation(s){
 if(s.includes(MARKER))throw Error('Followup presentation already patched');
 s=once(s,'\t\t\tqueuedFollowupAdmitted = true;\n\t\t\tconst execution = await executeFollowupTurn({',
  '\t\t\tqueuedFollowupAdmitted = true;\n            await openFollowupPresentation(turn, defaults).catch(error => defaultRuntime.error?.(`followup presentation: ${String(error)}`));\n\t\t\tconst execution = await executeFollowupTurn({');
 s=once(s,'\tconst sourceOpts = defaults.opts;','\tconst sourceOpts = followupPresentationOptions(turn, defaults.opts);');
 const drop='\t\tlogVerbose(`followup queue: source delivery dropped (${sourceDisposition.reason})`);\n\t\treturn;\n\t}';
 s=once(s,drop,drop+'\n  if (await deliverFollowupPresentation(params, payloads)) return;');
 s=once(s,'\t\t\tif (queuedFollowupAdmitted) await settleQueuedFollowupPresentation(defaults);','\t\t\tif (queuedFollowupAdmitted) await settleFollowupPresentation(admittedRunId, disposition, operation);\n\t\t\tif (queuedFollowupAdmitted) await settleQueuedFollowupPresentation(defaults);');
 return `// ${MARKER}\nimport "./v-feishu-task-presentation-core-bridge.mjs";\nimport {openFollowupPresentation,followupPresentationOptions,deliverFollowupPresentation,settleFollowupPresentation} from "./v-feishu-task-presentation-followup.mjs";\n`+s;
}
