import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {voiceDirectExecAdmissionRuntimeSource} from './voice-direct-exec-admission.mjs';

function replaceOnce(source,anchor,replacement) {
  if(source.split(anchor).length!==2)throw Error('Voice admission runtime anchor changed: '+anchor.slice(0,70));
  return source.replace(anchor,replacement);
}
export function patchVoiceDirectInvoke(source) {
  if(source.includes('// v-voice-direct-exec-admission-v1'))return source;
  source=`// v-voice-direct-exec-admission-v1\nimport {withVoiceDirectExecAdmission} from './voice-direct-exec-admission.js';\n`+source;
  const start='\tconst resolveTools = (disablePluginTools) => resolveGatewayScopedTools({';
  source=replaceOnce(source,start,`\treturn await withVoiceDirectExecAdmission({
\t\tenabled: directCodingTool && toolName === "exec",
\t\tcfg: params.cfg, agentId: selectedAgentId, signal: params.signal
\t}, async (voiceExecution) => {
${start}`);
  source=replaceOnce(source,'\t\tmediatedToolNames: directCodingTool ? [toolName] : [],',
    '\t\tmediatedToolNames: directCodingTool ? [toolName] : [],\n\t\tvoiceDirectExecution: voiceExecution,');
  const end='\n}\n/** Resolves, authorizes, and invokes one gateway-visible core/plugin/channel tool. */';
  return replaceOnce(source,end,'\n\t});'+end);
}
export function patchVoiceDirectResolution(source) {
  if(source.includes('// v-voice-direct-exec-admission-v1'))return source;
  // This host-only field is populated after session authorization in invokeGatewayTool.
  const anchor='\t\trunId: params.runId,\n\t\tworkspaceDir,';
  source=replaceOnce(source,anchor,'\t\t// v-voice-direct-exec-admission-v1\n\t\trunId: params.voiceDirectExecution?.runId ?? params.runId,\n\t\toperationalRunInstance: params.voiceDirectExecution?.operationalRunInstance,\n\t\tworkspaceDir,');
  return replaceOnce(source,'\t\t\thost: execDefaults.host,',
    '\t\t\t// Host-only foreground binding: admission must outlive the subprocess and its secret proxy.\n\t\t\t...(params.voiceDirectExecution ? {voiceDirectForeground: true} : {}),\n\t\t\thost: execDefaults.host,');
}
export function patchVoiceDirectExec(source) {
  if(source.includes('// v-voice-direct-exec-admission-v1'))return source;
  const anchor='\tconst configuredAllowBackground = defaults?.processToolAvailabilityRef?.value ?? defaults?.allowBackground ?? true;';
  return replaceOnce(source,anchor,
    '\t// v-voice-direct-exec-admission-v1: internal constructor field, never an RPC tool argument.\n\tconst configuredAllowBackground = defaults?.voiceDirectForeground === true ? false : defaults?.processToolAvailabilityRef?.value ?? defaults?.allowBackground ?? true;');
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [runtime,output]=process.argv.slice(2);
  if(!runtime||!output)throw Error('Runtime dist and output directory required');
  fs.mkdirSync(output,{recursive:true});
  for(const [name,patch] of [['tools-invoke-shared-CjpflNGO.js',patchVoiceDirectInvoke],['tool-resolution-Con11qMn.js',patchVoiceDirectResolution],['bash-tools-DiAfkLAC.js',patchVoiceDirectExec]])
    fs.writeFileSync(output+'/'+name,patch(fs.readFileSync(runtime+'/'+name,'utf8')));
  fs.writeFileSync(output+'/voice-direct-exec-admission.js',voiceDirectExecAdmissionRuntimeSource());
}
