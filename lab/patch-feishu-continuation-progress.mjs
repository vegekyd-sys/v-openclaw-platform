const MARKER='v-feishu-cron-continuation-progress-v1';
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Cron presentation anchor drift: '+a.slice(0,100));return s.replace(a,()=>b);};
export function patchCronExecution(s){
 if(s.includes(MARKER))throw Error('Already patched');
 s=once(s,'\tlet preparedRuntimeLease = prepared.context.preparedModelRuntimeLease;',
  '\tconst taskPresentation = await openCronPresentation(prepared.context);\n\tlet presentationResult;\n\tlet preparedRuntimeLease = prepared.context.preparedModelRuntimeLease;');
 s=once(s,'\t\texecutionStarted = true;', '\t\texecutionStarted = true;\n\t\tstartCronPresentation(taskPresentation, info);');
 s=once(s,'\t\tif (finalized.status === "error") {','\t\tpresentationResult = finalized;\n\t\tif (finalized.status === "error") {');
 s=once(s,'\t} finally {\n\t\treleasePreparedRuntime();','\t} finally {\n\t\tawait settleCronPresentation(taskPresentation, presentationResult, outcomeError).catch(() => {});\n\t\treleasePreparedRuntime();');
 return `// ${MARKER}\nimport {openCronPresentation,startCronPresentation,settleCronPresentation} from "./v-feishu-task-presentation-cron.mjs";\n`+s;
}
export function patchCronDelivery(s){
 if(s.includes(MARKER))throw Error('Already patched');
 s=once(s,'\t\t\t\tconst send = await sendDurableMessageBatchCore({','\t\t\t\tconst send = await sendPresentedCronBatch({');
 s=once(s,'\t\t\tconst runDelivery = async () => {','\t\t\tconst sendPresentedCronBatch = batch => deliverCronPresentation(params, batch, sendDurableMessageBatchCore);\n\t\t\tconst runDelivery = async () => {');
 return `// ${MARKER}\nimport "./v-feishu-task-presentation-core-bridge.mjs";\nimport {deliverCronPresentation} from "./v-feishu-task-presentation-cron.mjs";\n`+s;
}
