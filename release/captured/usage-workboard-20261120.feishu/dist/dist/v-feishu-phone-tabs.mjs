import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createPrivateConversationWriter} from './feishu-private-conversations.mjs';

const chatId = value => typeof value === 'string' && /^oc_[A-Za-z0-9]+$/u.test(value);
const openId = value => typeof value === 'string' && /^ou_[A-Za-z0-9]+$/u.test(value);
const appId = value => typeof value === 'string' && /^cli_[A-Za-z0-9]+$/u.test(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const NAME = '📞 打给 V';

// The file contains public login URLs and an explicit rollout audience, never
// tool credentials or a session mapping. Voice still authenticates every caller.
export async function readPhoneTabSettings(file, account) {
  if (!file) return null;
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 65536) throw Error('invalid_configuration');
    const config = JSON.parse(await handle.readFile('utf8'));
    if (config.version !== 1 || !own(config.accounts, account.accountId)) return null;
    const settings = config.accounts[account.accountId];
    if (settings.enabled !== true) return null;
    if (!appId(settings.appId) || settings.appId !== account.appId ||
        (settings.conversations !== true && (!Array.isArray(settings.allowedOpenIds) || !settings.allowedOpenIds.length ||
        settings.allowedOpenIds.some(value => !openId(value))))) throw Error('invalid_configuration');
    return {...settings, url: publicPhoneUrl(settings.url)};
  } finally { await handle.close(); }
}

export function publicPhoneUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('invalid_configuration');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !/^\/[A-Za-z0-9_-]+\/feishu$/u.test(url.pathname) ||
      [...url.searchParams.keys()].some(key => key !== 'phone') ||
      url.searchParams.getAll('phone').length > 1 ||
      url.searchParams.has('phone') && !/^[A-Za-z0-9_-]{1,407}$/u.test(url.searchParams.get('phone'))) {
    throw Error('invalid_configuration');
  }
  return url.href;
}

function eventIdentity(data, expectedAppId) {
  if (!data || typeof data !== 'object' ||
      data.header?.app_id && data.header.app_id !== expectedAppId ||
      data.header?.event_type && !['im.chat.access_event.bot_p2p_chat_entered_v1','im.chat.member.bot.added_v1','im.message.receive_v1'].includes(data.header.event_type)) return null;
  const event = data.event ?? data;
  if(data.header?.event_type === 'im.message.receive_v1') {
    const chat=event.message?.chat_id,operator=event.sender?.sender_id?.open_id;
    return chatId(chat)&&openId(operator)&&['p2p','group'].includes(event.message.chat_type)?{chat,operator}:null;
  }
  if (!chatId(event.chat_id) || !openId(event.operator_id?.open_id)) return null;
  return {chat: event.chat_id, operator: event.operator_id.open_id};
}

function sameTab(a, b) {
  // API readbacks can reorder object keys and enrich unrelated fields.
  const normalize = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(normalize)
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function conversationPhoneUrl(base, accountId, chat) {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(accountId ?? '') || !chatId(chat)) throw Error('invalid_configuration');
  const result = new URL(publicPhoneUrl(base));
  result.searchParams.set('phone','feishu_'+Buffer.from(JSON.stringify([accountId,chat])).toString('base64url'));
  return result.href;
}

const sidebarUrl = url => 'https://applink.feishu.cn/client/web_url/open?mode=sidebar-semi&url='+encodeURIComponent(url);
const decodePhone = phone => {
  try {
    if (!/^feishu_[A-Za-z0-9_-]{1,400}$/u.test(phone ?? '')) return null;
    const value = JSON.parse(Buffer.from(phone.slice(7),'base64url').toString());
    if (!Array.isArray(value) || value.length !== 2 || !/^[A-Za-z0-9_-]{1,128}$/u.test(value[0]) || !chatId(value[1]) ||
        'feishu_'+Buffer.from(JSON.stringify(value)).toString('base64url') !== phone) return null;
    return {account:value[0],chat:value[1]};
  } catch {return null;}
};

// Only repair links for this exact conversation and configured service. A
// similarly named custom menu, another chat, another account, or credential URL
// must remain untouched. Non-derivable DM aliases come from private inventory.
export function managedPhoneUrl(value, {url,chat,accountAliases=[],legacyPhoneIds=[]}) {
  try {
    let old = new URL(value);
    if (old.origin === 'https://applink.feishu.cn' && old.pathname === '/client/web_url/open' &&
        !old.hash && old.searchParams.get('mode') === 'sidebar-semi' &&
        [...old.searchParams.keys()].length === 2 && old.searchParams.getAll('url').length === 1) old = new URL(old.searchParams.get('url'));
    const expected = new URL(publicPhoneUrl(url));
    publicPhoneUrl(old.href);
    if (old.origin !== expected.origin || old.pathname !== expected.pathname) return false;
    if (old.href === expected.href) return true;
    const target = decodePhone(expected.searchParams.get('phone'));
    if (!target || target.chat !== chat) return false;
    const previous = old.searchParams.get('phone'), decoded = decodePhone(previous);
    // The original owner DM pilot had no phone query. Only an exact private
    // inventory binding may establish which conversation that tab belongs to.
    if(previous===null&&legacyPhoneIds.some(id=>/^feishu-dm-[A-Za-z0-9_-]+$/u.test(id)))return true;
    if (decoded) return decoded.chat === chat && [target.account,...accountAliases].includes(decoded.account);
    return ['feishu-group-'+chat.slice(3),'feishu-group-'+chat,...legacyPhoneIds].includes(previous);
  } catch {return false;}
}

function groupLinks(url, previous={}) {
  return {...Object.fromEntries(Object.entries(previous).map(([key,value])=>[key,value?url:''])),common_url:url,pc_url:sidebarUrl(url)};
}

// Groups use Feishu's menu below the composer; private chats use a top tab.
async function ensureGroupPhoneMenu({api,path,url,chat,accountAliases,legacyPhoneIds}) {
  const read=async()=>{
    const data=await api('GET',path+'/menu_tree');
    if(!Array.isArray(data?.menu_tree?.chat_menu_top_levels))throw Error('unconfirmed_read');
    return data.menu_tree.chat_menu_top_levels;
  };
  const matches=row=>row.chat_menu_item?.name===NAME&&row.chat_menu_item?.action_type==='REDIRECT_LINK'
    &&row.chat_menu_item?.redirect_link?.common_url===url
    &&row.chat_menu_item?.redirect_link?.pc_url===sidebarUrl(url)
    &&['ios_url','android_url','web_url'].every(key=>!row.chat_menu_item.redirect_link[key]||row.chat_menu_item.redirect_link[key]===url);
  const before=await read(),existing=before.filter(matches);
  const named=before.filter(row=>row.chat_menu_item?.name===NAME);
  if(existing.length===1&&named.length===1)return {status:'verified',created:false,menuId:existing[0].chat_menu_top_level_id};
  if(named.length){
    const row=named[0],item=row.chat_menu_item,links=item?.redirect_link;
    if(named.length!==1||item?.action_type!=='REDIRECT_LINK'||row.children?.length||!links?.common_url||
        !Object.values(links).filter(Boolean).every(value=>managedPhoneUrl(value,{url,chat,accountAliases,legacyPhoneIds})))throw Error('menu_conflict');
    const expected=structuredClone(before),next=expected.find(value=>value.chat_menu_top_level_id===row.chat_menu_top_level_id);
    next.chat_menu_item.redirect_link=groupLinks(url,links);
    const payload=structuredClone(next.chat_menu_item);
    payload.redirect_link=Object.fromEntries(Object.entries(payload.redirect_link).filter(([,value])=>value));
    let unknownWrite=false;
    try{await api('PATCH',path+'/menu_items/'+row.chat_menu_top_level_id,{update_fields:['REDIRECT_LINK'],chat_menu_item:payload});}
    catch{unknownWrite=true;}
    const after=await read();
    if(!sameTab(after,expected))throw Error('unconfirmed_write');
    return {status:'verified',created:false,updated:true,menuId:row.chat_menu_top_level_id,recoveredUnknownWrite:unknownWrite};
  }
  if(before.length>=3)throw Error('menu_full');
  let unknownWrite=false;
  try {await api('POST',path+'/menu_tree',{menu_tree:{chat_menu_top_levels:[{chat_menu_item:{
    name:NAME,action_type:'REDIRECT_LINK',redirect_link:{common_url:url,pc_url:sidebarUrl(url)}},children:[]}]}});
  }catch{unknownWrite=true;}
  const after=await read(),added=after.filter(matches);
  if(added.length!==1||!before.every(old=>after.some(next=>sameTab(old,next))))throw Error('unconfirmed_write');
  return {status:'verified',created:true,menuId:added[0].chat_menu_top_level_id,recoveredUnknownWrite:unknownWrite};
}

export async function ensurePhoneTab({api, chat, url, allowGroup=false,accountAliases=[],legacyPhoneIds=[]}) {
  if (!chatId(chat)) throw Error('invalid_event');
  url = publicPhoneUrl(url);
  const path = `/open-apis/im/v1/chats/${chat}`;
  const info = await api('GET', path);
  if(allowGroup&&info?.chat_mode==='group')return ensureGroupPhoneMenu({api,path,url,chat,accountAliases,legacyPhoneIds});
  if (info?.chat_mode !== 'p2p' && !(allowGroup&&info?.chat_mode==='group')) return {status:'ignored_non_p2p'};
  const read = async () => {
    const result = await api('GET', path + '/chat_tabs/list_tabs');
    if (!Array.isArray(result?.chat_tabs)) throw Error('unconfirmed_read');
    return result.chat_tabs;
  };
  const matches = tab => tab.tab_name === NAME && tab.tab_type === 'url' &&
    tab.tab_content?.url === url && tab.tab_config?.is_built_in === true;
  const before = await read(), existing = before.filter(matches);
  const named=before.filter(tab=>tab.tab_name===NAME);
  if (existing.length === 1&&named.length===1) return {status:'verified', created:false, tabId:existing[0].tab_id};
  if(named.length){
    const tab=named[0];
    if(named.length!==1||tab.tab_type!=='url'||!managedPhoneUrl(tab.tab_content?.url,{url,chat,accountAliases,legacyPhoneIds}))throw Error('tab_conflict');
    const expected=structuredClone(before),next=expected.find(value=>value.tab_id===tab.tab_id);
    next.tab_content={...next.tab_content,url};next.tab_config={...next.tab_config,is_built_in:true};
    let unknownWrite=false;
    try{await api('POST',path+'/chat_tabs/update_tabs',{chat_tabs:[{tab_id:tab.tab_id,tab_name:tab.tab_name,tab_type:'url',tab_content:next.tab_content,tab_config:next.tab_config}]});}
    catch{unknownWrite=true;}
    const after=await read();
    if(!sameTab(after,expected))throw Error('unconfirmed_write');
    return {status:'verified',created:false,updated:true,tabId:tab.tab_id,recoveredUnknownWrite:unknownWrite};
  }
  let unknownWrite = false;
  try {
    await api('POST', path + '/chat_tabs', {chat_tabs:[{
      tab_name:NAME, tab_type:'url', tab_content:{url}, tab_config:{is_built_in:true},
    }]});
  } catch { unknownWrite = true; }
  // A lost POST response must not produce another tab. Always read the outcome.
  const after = await read(), added = after.filter(matches);
  if (added.length !== 1 || !before.every(tab => after.some(next => next.tab_id === tab.tab_id && sameTab(tab, next)))) {
    throw Error('unconfirmed_write');
  }
  return {status:'verified', created:true, tabId:added[0].tab_id, recoveredUnknownWrite:unknownWrite};
}

// Acknowledge the channel event immediately. API latency cannot stall ingress
// or trigger Feishu's event-redelivery timer. Work is coalesced per conversation,
// bounded across conversations, and never creates an agent/model turn.
export function createPhoneTabHandler({account, getSettings, api, log = () => {},
  now = Date.now, signal, concurrency = 2, maxPending = 128, cacheMs = 60000, retryMs = 30000, recordPrivateConversation}) {
  const pending = new Map(), cache = new Map(), queue = [];
  let active = 0, closed = signal?.aborted === true;
  const report = result => {
    // No chat/user IDs, URLs, SDK errors, headers, or provider response bodies.
    try { log(JSON.stringify({type:'voice.phone-tab',status:result.status,
      ...(typeof result.created === 'boolean' ? {created:result.created} : {})})); } catch {}
  };
  const execute = async ({identity,privateEntry}) => {
    const settings = await getSettings();
    if(privateEntry&&recordPrivateConversation&&settings?.privateConversationsFile&&settings.appId===account.appId){
      try {
        const path='/open-apis/im/v1/chats/'+identity.chat;
        if((await api('GET',path))?.chat_mode==='p2p'){
          const members=await api('GET',path+'/members?member_id_type=open_id&page_size=100');
          if(members?.items?.some(r=>r.member_id===identity.operator))await recordPrivateConversation({appId:account.appId,openId:identity.operator,chatId:identity.chat},settings);
        }
      }catch{report({status:'private_directory_unavailable'});}
    }
    if (!settings || settings.appId !== account.appId || settings.conversations!==true&&!settings.allowedOpenIds?.includes(identity.operator)) return {status:'ignored_audience'};
    const target=new URL(publicPhoneUrl(settings.url));
    if(settings.conversations===true)target.href=conversationPhoneUrl(target.href,account.accountId,identity.chat);
    const url=target.href, key = identity.chat;
    const hit = cache.get(key);
    if (hit?.url === url && hit.until > now()) return {status:'cached'};
    try {
      if (closed) return {status:'stopped'};
      const result = await ensurePhoneTab({api, chat:identity.chat, url,allowGroup:settings.conversations===true,accountAliases:[account.appId]});
      cache.delete(key); cache.set(key, {url,until:now()+cacheMs});
      if (cache.size > 512) cache.delete(cache.keys().next().value);
      return result;
    } catch (error) {
      cache.delete(key); cache.set(key, {url,until:now()+retryMs});
      if (cache.size > 512) cache.delete(cache.keys().next().value);
      throw error;
    }
  };
  const pump = () => {
    while (!closed && active < concurrency && queue.length) {
      const item = queue.shift(); active++;
      Promise.resolve().then(() => execute(item)).catch(error => ({status:[
        'invalid_configuration','tab_conflict','menu_conflict','menu_full','unconfirmed_read','unconfirmed_write',
      ].includes(error?.message) ? error.message : 'api_failed'})).then(result => {
        active--; pending.delete(item.key); report(result); item.resolve(result); pump();
      });
    }
  };
  const run = data => {
    const identity = eventIdentity(data, account.appId);
    if (!identity || closed) return Promise.resolve({status:closed ? 'stopped' : 'ignored_event'});
    const key = identity.chat;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) {report({status:'queue_full'});return Promise.resolve({status:'queue_full'});}
    const privateEntry=data.header?.event_type==='im.chat.access_event.bot_p2p_chat_entered_v1'||data.header?.event_type==='im.message.receive_v1'&&(data.event??data).message?.chat_type==='p2p';
    const deferred = Promise.withResolvers();
    pending.set(key, deferred.promise); queue.push({identity,privateEntry,key,resolve:deferred.resolve});pump();
    return deferred.promise;
  };
  const stop = () => {
    closed = true;
    for (const item of queue.splice(0)) {pending.delete(item.key);item.resolve({status:'stopped'});}
  };
  signal?.addEventListener('abort', stop, {once:true});
  return {run, schedule(data) {void run(data);}, stop, async drain() {await Promise.all([...pending.values()]);}};
}

export function createRuntimePhoneTabHandler({account, createClient, runtime, abortSignal}) {
  let client,writer,file;
  return createPhoneTabHandler({account, signal:abortSignal,
    recordPrivateConversation:(row,settings)=>{
      const next=settings.privateConversationsFile;
      if(typeof next!=='string'||!next.startsWith('/')||next.length>1024)throw Error('invalid_private_directory');
      if(file!==next){file=next;writer=createPrivateConversationWriter({file});}
      return writer(row);
    },
    getSettings:() => readPhoneTabSettings(process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE, account),
    log:runtime?.log,
    api:async (method, url, data) => {
      if (abortSignal?.aborted) throw Error('stopped');
      client ??= createClient(account);
      const result = await client.request({method,url,data:data ?? {},timeout:8000,signal:abortSignal});
      if (result?.code !== 0) throw Error('api_failed');
      return result.data;
    },
  });
}
