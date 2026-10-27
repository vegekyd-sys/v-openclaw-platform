import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {patchPrivateConversationContext} from './patch-feishu-phone-tabs.mjs';
const baseline=process.argv[2],out=resolve(process.argv[3]??'lab/release-files/feishu-private-direct');
if(!baseline)throw Error('Usage: node lab/build-feishu-private-direct.mjs BASELINE_MONITOR [OUTPUT]');
await mkdir(out,{recursive:true});
const source=await readFile(baseline,'utf8');
const files=[['monitor.account-WFdlCDhR.js',patchPrivateConversationContext(source)],
  ['v-feishu-phone-tabs.mjs',await readFile(new URL('./feishu-phone-tabs.mjs',import.meta.url),'utf8')],
  ['feishu-private-conversations.mjs',await readFile(new URL('./feishu-private-conversations.mjs',import.meta.url),'utf8')]];
const hashes=[];
for(const [name,bytes] of files){await writeFile(join(out,name),bytes);hashes.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(out,'files.json'),JSON.stringify({baselineMonitorSha256:createHash('sha256').update(source).digest('hex'),files:hashes},null,2)+'\n');
console.log(JSON.stringify({files:hashes.length,baselineMonitorSha256:createHash('sha256').update(source).digest('hex')}));
