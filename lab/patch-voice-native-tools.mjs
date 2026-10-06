import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export function patchVoiceNativeTools(source){
 if(source.includes('// v-voice-direct-coding-tools-v1'))return source;
 const needle='\tconst resolveTools = (disablePluginTools) => resolveGatewayScopedTools({';
 if(source.split(needle).length!==2)throw Error('Native Gateway tool resolver changed');
 source=source.replace(needle,`\t// v-voice-direct-coding-tools-v1: a server-owned voice client explicitly
\t// opts into mediated coding tools under the same effective agent policies.
\t// Unprivileged clients and the normal RPC/HTTP surface remain unchanged.
\tconst directCodingTool = params.senderIsOwner === true &&
\t\tparams.clientCaps?.includes("voice-direct-tools") === true &&
\t\t["read", "write", "edit", "apply_patch", "exec", "process"].includes(toolName);
${needle}`);
 const surface='\t\tsurface: "http",';
 if(source.split(surface).length!==2)throw Error('Gateway surface anchor changed');
 return source.replace(surface,'\t\tsurface: directCodingTool ? "loopback" : "http",\n\t\tmediatedToolNames: directCodingTool ? [toolName] : [],');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Input and output required');
 fs.writeFileSync(output,patchVoiceNativeTools(fs.readFileSync(input,'utf8')));
}
