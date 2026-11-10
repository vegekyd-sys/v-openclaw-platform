import {constants} from 'node:fs';
import {open} from 'node:fs/promises';

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
        !Array.isArray(settings.allowedOpenIds) || !settings.allowedOpenIds.length ||
        settings.allowedOpenIds.some(value => !openId(value))) throw Error('invalid_configuration');
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
      url.searchParams.has('phone') && !/^[A-Za-z0-9_-]{1,128}$/u.test(url.searchParams.get('phone'))) {
    throw Error('invalid_configuration');
  }
  return url.href;
}

function eventIdentity(data, expectedAppId) {
  if (!data || typeof data !== 'object' ||
      data.header?.app_id && data.header.app_id !== expectedAppId ||
      data.header?.event_type && data.header.event_type !== 'im.chat.access_event.bot_p2p_chat_entered_v1') return null;
  const event = data.event ?? data;
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

export async function ensurePhoneTab({api, chat, url}) {
  if (!chatId(chat)) throw Error('invalid_event');
  url = publicPhoneUrl(url);
  const path = `/open-apis/im/v1/chats/${chat}`;
  const info = await api('GET', path);
  if (info?.chat_mode !== 'p2p') return {status:'ignored_non_p2p'};
  const read = async () => {
    const result = await api('GET', path + '/chat_tabs/list_tabs');
    if (!Array.isArray(result?.chat_tabs)) throw Error('unconfirmed_read');
    return result.chat_tabs;
  };
  const matches = tab => tab.tab_name === NAME && tab.tab_type === 'url' &&
    tab.tab_content?.url === url && tab.tab_config?.is_built_in === false;
  const before = await read(), existing = before.filter(matches);
  if (existing.length === 1) return {status:'verified', created:false, tabId:existing[0].tab_id};
  if (existing.length || before.some(tab => tab.tab_name === NAME)) throw Error('tab_conflict');
  let unknownWrite = false;
  try {
    await api('POST', path + '/chat_tabs', {chat_tabs:[{
      tab_name:NAME, tab_type:'url', tab_content:{url}, tab_config:{is_built_in:false},
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
  now = Date.now, signal, concurrency = 2, maxPending = 128, cacheMs = 60000, retryMs = 30000}) {
  const pending = new Map(), cache = new Map(), queue = [];
  let active = 0, closed = signal?.aborted === true;
  const report = result => {
    // No chat/user IDs, URLs, SDK errors, headers, or provider response bodies.
    try { log(JSON.stringify({type:'voice.phone-tab',status:result.status,
      ...(typeof result.created === 'boolean' ? {created:result.created} : {})})); } catch {}
  };
  const execute = async ({identity}) => {
    const settings = await getSettings();
    if (!settings || settings.appId !== account.appId || !settings.allowedOpenIds?.includes(identity.operator)) return {status:'ignored_audience'};
    const url = publicPhoneUrl(settings.url), key = identity.chat + ':' + identity.operator;
    const hit = cache.get(key);
    if (hit?.url === url && hit.until > now()) return {status:'cached'};
    try {
      if (closed) return {status:'stopped'};
      const result = await ensurePhoneTab({api, chat:identity.chat, url});
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
        'invalid_configuration','tab_conflict','unconfirmed_read','unconfirmed_write',
      ].includes(error?.message) ? error.message : 'api_failed'})).then(result => {
        active--; pending.delete(item.key); report(result); item.resolve(result); pump();
      });
    }
  };
  const run = data => {
    const identity = eventIdentity(data, account.appId);
    if (!identity || closed) return Promise.resolve({status:closed ? 'stopped' : 'ignored_event'});
    const key = identity.chat + ':' + identity.operator;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) {report({status:'queue_full'});return Promise.resolve({status:'queue_full'});}
    const deferred = Promise.withResolvers();
    pending.set(key, deferred.promise); queue.push({identity,key,resolve:deferred.resolve});pump();
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
  let client;
  return createPhoneTabHandler({account, signal:abortSignal,
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
