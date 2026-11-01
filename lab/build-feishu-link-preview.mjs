import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {patchFeishuLinkPreview} from './patch-feishu-link-preview.mjs';
const [baseline,dest]=process.argv.slice(2);
if(!baseline||!dest)throw Error('Usage: node lab/build-feishu-link-preview.mjs BASELINE_MONITOR OUTPUT_DIRECTORY');
const output=resolve(dest);await mkdir(output,{recursive:true});
const path='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const hash=v=>createHash('sha256').update(v).digest('hex');
const original=await readFile(baseline,'utf8'),files=[];
for(const [name,bytes,before] of [
 ['monitor.account-WFdlCDhR.js',patchFeishuLinkPreview(original),hash(original)],
 ['v-feishu-link-preview.mjs',await readFile(new URL('./feishu-link-preview.mjs',import.meta.url),'utf8'),null],
]){await writeFile(output+'/'+name,bytes);files.push({source:relative(process.cwd(),output+'/'+name),target:path+name,before,sha256:hash(bytes)});}
await writeFile(output+'/candidate-files.json',JSON.stringify({files},null,2)+'\n');console.log(JSON.stringify({files:files.length,output}));
