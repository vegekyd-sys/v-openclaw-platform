import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// Extend admission in the existing Voice SDK task controller. Execution,
// cancellation, replay and connection ownership continue through that controller.
export function patchPublicTask(source){
 const before="const match=/^agent:([^:]+):feishu:(?:group|direct|dm):(?:oc_|ou_)[A-Za-z0-9]+$/.exec(params.sessionKey??'');";
 const after="const match=/^agent:([^:]+):(?:feishu:(?:group|direct|dm):(?:oc_|ou_)[A-Za-z0-9]+|voice:public:[a-f0-9]{64})$/.exec(params.sessionKey??'');";
 if(source.includes(after))return source;
 if(!source.includes(before))throw Error('Voice task source changed; review Public admission patch');
 return source.replace(before,after).replace('Voice task requires its bound Feishu session','Voice task requires its bound session');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];if(!file)throw Error('Pass the installed Voice plugin tasks.mjs path');
 await writeFile(file,patchPublicTask(await readFile(file,'utf8')));
}
