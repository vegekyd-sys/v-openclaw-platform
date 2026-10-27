import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {patchPrivatePhoneMenu} from './patch-feishu-private-phone-menu.mjs';
const [baseline,destination,confirmationBaseline]=process.argv.slice(2);
if(!baseline||!destination||!confirmationBaseline)throw Error('Expected baseline monitor, output directory and baseline confirmation module');
const out=resolve(destination);await mkdir(out,{recursive:true});
const prefix='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const hash=v=>createHash('sha256').update(v).digest('hex');
const original=await readFile(baseline,'utf8');
const files=[];
for(const [name,content,before] of [
 ['monitor.account-WFdlCDhR.js',patchPrivatePhoneMenu(original),hash(original)],
 ['v-feishu-private-phone-menu.mjs',(await readFile(new URL('./feishu-private-phone-menu.mjs',import.meta.url),'utf8')).replace("from './feishu-phone-tabs.mjs'","from './v-feishu-phone-tabs.mjs'"),null],
 ['v-feishu-voice-confirm.mjs',(await readFile(new URL('./feishu-voice-confirm.mjs',import.meta.url),'utf8')).replace("from './feishu-phone-tabs.mjs'","from './v-feishu-phone-tabs.mjs'"),hash(await readFile(confirmationBaseline))],
]){
 await writeFile(out+'/'+name,content);
 files.push({source:relative(process.cwd(),out+'/'+name),target:prefix+name,before,sha256:hash(content)});
}
await writeFile(out+'/candidate-files.json',JSON.stringify({files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,baselineSha:hash(original)}));
