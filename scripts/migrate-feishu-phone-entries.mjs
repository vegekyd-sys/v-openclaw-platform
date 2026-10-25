// Run with server-private input files. Never prints credentials or chat contents.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve,join} from 'node:path';
import {ensurePhoneTab,conversationPhoneUrl} from '../lab/feishu-phone-tabs.mjs';
const {values:o}=parseArgs({options:{login:{type:'string'},inventory:{type:'string'},output:{type:'string'},base:{type:'string'},account:{type:'string'},only:{type:'string'},apply:{type:'boolean',default:false}}});
for(const key of ['login','inventory','output','base','account'])if(!o[key])throw Error('missing_'+key);
process.umask(0o077);
const config=JSON.parse(await readFile(o.login,'utf8')),inventory=JSON.parse(await readFile(o.inventory,'utf8'));
const output=resolve(o.output);await mkdir(output,{mode:0o700});
let token;
const call=async(method,path,body)=>{
 const r=await fetch('https://open.feishu.cn'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const result=await r.json();if(result.code!==0)throw Error('feishu_'+result.code);
 return result;
};
token=(await call('POST','/open-apis/auth/v3/tenant_access_token/internal',{app_id:config.appId,app_secret:config.appSecret})).tenant_access_token;
const chats=new Map();
const add=(chat,source,aliases=[])=>{
 if(!/^oc_[A-Za-z0-9]+$/u.test(chat))throw Error('invalid_inventory');
 const row=chats.get(chat)??{chat,sources:[],aliases:[]};
 row.sources=[...new Set([...row.sources,source])];row.aliases=[...new Set([...row.aliases,...aliases])];chats.set(chat,row);
};
let page='',pages=0;const tokens=new Set();
do{
 const query=new URLSearchParams({page_size:'100',...(page?{page_token:page}:{})});
 const data=(await call('GET','/open-apis/im/v1/chats?'+query)).data;
 if(!Array.isArray(data.items))throw Error('invalid_group_list');
 for(const row of data.items)add(row.chat_id,'bot_group_list');
 pages++;if(!data.has_more)break;
 page=data.page_token;if(!page||tokens.has(page)||pages>=1000)throw Error('incomplete_group_list');tokens.add(page);
}while(true);
for(const row of inventory.chats)add(row.chat,row.source,row.legacyPhoneIds??[]);
if(o.only){
 const selected=new Set(o.only.split(','));
 if([...selected].some(chat=>!chats.has(chat)))throw Error('unknown_selected_chat');
 for(const chat of chats.keys())if(!selected.has(chat))chats.delete(chat);
}
await writeFile(join(output,'inventory.json'),JSON.stringify({pages,rows:[...chats.values()]},null,2));
const queue=[...chats.values()],results=[];
async function worker(){
 while(queue.length){
  const row=queue.shift(),reads={},writes=[];
  const persist=()=>writeFile(join(output,row.chat+'.json'),JSON.stringify({row,reads,writes},null,2));
  const api=async(method,path,body)=>{
   if(method==='GET'){
    const data=(await call(method,path)).data;
    (reads[path]??=[]).push(data);return data;
   }
   writes.push({method,path,body});await persist();
   if(!o.apply)throw Error('dry_run');
   try{return (await call(method,path,body)).data;}
   catch(error){writes.at(-1).error=/^feishu_\d+$/u.test(error.message)?error.message:'request_failed';await persist();throw error;}
  };
  let result;
  try{result=await ensurePhoneTab({api,chat:row.chat,url:conversationPhoneUrl(o.base,o.account,row.chat),allowGroup:true,accountAliases:[config.appId],legacyPhoneIds:row.aliases});}
  catch(error){result={status:!o.apply&&writes.length?'planned':/^(feishu_\d+|menu_conflict|tab_conflict|menu_full|unconfirmed_read|unconfirmed_write)$/u.test(error.message)?error.message:'request_failed'};}
  await persist();results.push({chat:row.chat,sources:row.sources,...result});
  if(results.length%25===0)console.log(JSON.stringify({processed:results.length,total:chats.size}));
 }
}
await Promise.all([worker(),worker()]);
const counts={};for(const r of results){const key=r.status==='verified'?(r.created?'created':r.updated?'updated':'already_correct'):r.status;counts[key]=(counts[key]??0)+1;}
const summary={apply:o.apply,total:chats.size,pages,counts,results};
await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({apply:o.apply,total:chats.size,pages,counts,output}));
