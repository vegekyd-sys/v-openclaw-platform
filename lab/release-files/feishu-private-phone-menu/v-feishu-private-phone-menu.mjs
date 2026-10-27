import {createHash} from 'node:crypto';
import {readPhoneTabSettings,conversationPhoneUrl,publicPhoneUrl} from './v-feishu-phone-tabs.mjs';

export const PRIVATE_PHONE_MENU_KEY='v.voice.phone.v1';
const openId=v=>typeof v==='string'&&/^ou_[A-Za-z0-9]+$/u.test(v);
const chatId=v=>typeof v==='string'&&/^oc_[A-Za-z0-9]+$/u.test(v);
const messageId=v=>typeof v==='string'&&/^om_[A-Za-z0-9]+$/u.test(v);
const digest=v=>createHash('sha256').update(v).digest('hex');

export function privatePhoneCard(url) {
  return {schema:'2.0',config:{update_multi:true,width_mode:'compact',summary:{content:'打给 V'}},
    header:{title:{tag:'plain_text',content:'打给 V'},template:'violet'},
    body:{vertical_spacing:'12px',elements:[
      {tag:'column_set',flex_mode:'none',columns:[{tag:'column',width:'weighted',weight:1,
        background_style:'purple-50',padding:'12px',elements:[
          {tag:'markdown',content:url?'沿用你与 V 的当前私聊。':'正在准备你的私聊电话入口…',text_size:'normal'},
        ]}]},
      ...(url?[{tag:'button',text:{tag:'plain_text',content:'打开电话'},type:'primary_filled',width:'fill',
        behaviors:[{type:'open_url',default_url:url,pc_url:'https://applink.feishu.cn/client/web_url/open?mode=sidebar-semi&url='+encodeURIComponent(url),ios_url:url,android_url:url}]}]:[]),
      {tag:'markdown',content:'<font color="grey">打开后再拨号，不会自动接通。</font>',text_size:'notation'},
    ]}};
}

// Only invoke from the native SDK's authenticated application.bot.menu_v6
// handler. The menu never issues an identity grant or changes a group menu.
export function createPrivatePhoneMenu({account,getSettings,api,now=Date.now,log=()=>{}}) {
  const pending=new Map(),seen=new Map(),rate=new Map();let active=0;
  const handles=data=>(data?.event??data)?.event_key===PRIVATE_PHONE_MENU_KEY;
  const run=async data=>{
    if(!handles(data))return {status:'ignored'};
    const event=data.event??data,operator=event.operator?.operator_id?.open_id;
    const raw=Number(event.timestamp),timestamp=raw<1e12?raw*1000:raw;
    if(data.header?.app_id&&data.header.app_id!==account.appId||!openId(operator)||!Number.isSafeInteger(timestamp)||
      timestamp<now()-300000||timestamp>now()+30000)return {status:'invalid_event'};
    const key=digest(JSON.stringify([account.appId,account.accountId,operator,event.timestamp]));
    for(const [k,until] of seen)if(until<=now())seen.delete(k);
    if(pending.has(key))return pending.get(key);
    if(seen.has(key))return {status:'duplicate'};
    if(active>=2||seen.size>=1024)return {status:'busy'};
    const work=Promise.resolve().then(async()=>{
      const settings=await getSettings();
      if(!settings||settings.privateMenu?.enabled!==true||settings.appId!==account.appId)return {status:'disabled'};
      const base=publicPhoneUrl(settings.privateMenu.url);
      const hits=(rate.get(operator)??[]).filter(t=>t>now()-60000);
      if(hits.length>=3)return {status:'rate_limited'};
      rate.set(operator,[...hits,now()]);
      for(const [id,times] of rate)if(times.every(t=>t<=now()-60000))rate.delete(id);
      if(rate.size>1024)rate.delete(rate.keys().next().value);
      // A native menu event has no chat_id. Sending to its verified operator
      // yields the real bot DM, including the first request from a new caller.
      // This card carries no authorization or private identity bearer.
      seen.set(key,now()+3600000);
      const sent=await api('POST','/open-apis/im/v1/messages?receive_id_type=open_id',{
        receive_id:operator,msg_type:'interactive',content:JSON.stringify(privatePhoneCard()),uuid:'voice-menu-'+key.slice(0,39),
      });
      if(!messageId(sent?.message_id)||!chatId(sent?.chat_id))throw Error('unconfirmed_message');
      const path='/open-apis/im/v1/chats/'+sent.chat_id;
      if((await api('GET',path))?.chat_mode!=='p2p')throw Error('not_private_chat');
      const members=await api('GET',path+'/members?member_id_type=open_id&page_size=100');
      if(!Array.isArray(members?.items)||!members.items.some(m=>m.member_id===operator))throw Error('private_recipient_mismatch');
      const url=conversationPhoneUrl(base,account.accountId,sent.chat_id);
      await api('PATCH','/open-apis/im/v1/messages/'+sent.message_id,{content:JSON.stringify(privatePhoneCard(url))});
      return {status:'ready'};
    }).catch(()=>({status:'failed'})).finally(()=>{active--;pending.delete(key);});
    active++;pending.set(key,work);return work;
  };
  return {handles,run,schedule(data){void run(data).then(result=>{
    try{log(JSON.stringify({type:'voice.private-phone-menu',status:result.status}));}catch{}
  });},async drain(){await Promise.all([...pending.values()]);}};
}

export function createRuntimePrivatePhoneMenu({account,createClient,runtime}) {
  let client;
  return createPrivatePhoneMenu({account,getSettings:()=>readPhoneTabSettings(process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE,account),
    log:runtime?.log,api:async(method,url,data)=>{
      client??=createClient(account);
      const result=await client.request({method,url,data:data??{},timeout:8000});
      if(result?.code!==0)throw Error('api_unconfirmed');return result.data;
    }});
}
