// Feishu's own pictures for the app's session list: group avatars from the bot's
// chat list, people's from the contact API when the app may read them. The
// addresses are public CDN links, so the phone loads them directly, not through V.
// Everything here is best effort: without a picture the app draws an initial.

const CHATS_TTL_MS = 6 * 3600 * 1000;
const FAILED_RETRY_MS = 15 * 60 * 1000;
const MAX_CHAT_PAGES = 30;
const CDN_HOST = /(^|\.)(feishucdn\.com|larksuitecdn\.com|feishu\.cn|larksuite\.com)$/u;

/** Twice the size Feishu's link asks for, so it stays sharp on a phone. */
export function sharpAvatar(url) {
  try {
    const parsed = new URL(url);
    // Feishu's generated placeholder says less than the app's own initial.
    if (parsed.pathname.includes("/default-avatar")) return undefined;
    if (parsed.protocol !== "https:" || !CDN_HOST.test(parsed.hostname)) return undefined;
    if (parsed.searchParams.has("image_size")) parsed.searchParams.set("image_size", "240x240");
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function createFeishuAvatars({ getConfig, fetchImpl = globalThis.fetch, log = () => {}, now = () => Date.now() }) {
  let token; // {value, until}
  let chats; // {at, ok, byId: Map}
  let loading;
  const people = new Map(); // open_id -> {at, url}

  const account = () => {
    const feishu = getConfig()?.channels?.feishu;
    if (!feishu?.enabled && feishu?.enabled !== undefined) return undefined;
    if (typeof feishu?.appId !== "string" || typeof feishu?.appSecret !== "string") return undefined;
    return { appId: feishu.appId, appSecret: feishu.appSecret, base: feishu.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn" };
  };

  const api = async (cred, path, init = {}) => {
    const response = await fetchImpl(`${cred.base}/open-apis${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    if (body.code !== 0) throw new Error(`feishu ${body.code}`);
    return body;
  };

  const tenantToken = async (cred) => {
    if (token && token.until > now()) return token.value;
    const body = await api(cred, "/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: cred.appId, app_secret: cred.appSecret }),
    });
    token = { value: body.tenant_access_token, until: now() + (Number(body.expire) - 300) * 1000 };
    return token.value;
  };

  const loadChats = async (cred) => {
    const headers = { authorization: `Bearer ${await tenantToken(cred)}` };
    const byId = new Map();
    let pageToken = "";
    for (let page = 0; page < MAX_CHAT_PAGES; page += 1) {
      const query = new URLSearchParams({ page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) });
      const { data } = await api(cred, `/im/v1/chats?${query}`, { headers });
      for (const chat of data?.items ?? []) {
        const url = chat.avatar && sharpAvatar(chat.avatar);
        if (url) byId.set(chat.chat_id, url);
      }
      if (!data?.has_more || !data.page_token) break;
      pageToken = data.page_token;
    }
    return byId;
  };

  const refresh = () => {
    if (loading) return loading;
    const cred = account();
    if (!cred) return Promise.resolve();
    loading = loadChats(cred)
      .then((byId) => { chats = { at: now(), ok: true, byId }; })
      .catch((error) => {
        chats = { at: now(), ok: false, byId: chats?.byId ?? new Map() };
        log(`vapp: Feishu group avatars unavailable: ${String(error?.message ?? error)}`);
      })
      .finally(() => { loading = undefined; });
    return loading;
  };

  const loadPerson = async (openId) => {
    const cred = account();
    if (!cred) return;
    people.set(openId, { at: now() });
    try {
      const headers = { authorization: `Bearer ${await tenantToken(cred)}` };
      const { data } = await api(cred, `/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`, { headers });
      const url = sharpAvatar(data?.user?.avatar?.avatar_240 ?? data?.user?.avatar?.avatar_72 ?? "");
      people.set(openId, { at: now(), url });
    } catch {
      // No contact permission, or someone outside the tenant: the initial stays.
    }
  };

  return {
    /** The picture for a session key, if known. Fills itself in the background. */
    lookup(key) {
      const group = /:feishu:group:(oc_[\w-]+)/iu.exec(key);
      if (group) {
        const stale = !chats || now() - chats.at > (chats.ok ? CHATS_TTL_MS : FAILED_RETRY_MS);
        if (stale) void refresh();
        return chats?.byId.get(group[1]);
      }
      const direct = /:feishu:direct:(ou_[\w-]+)/iu.exec(key);
      if (direct) {
        const known = people.get(direct[1]);
        if (!known || (!known.url && now() - known.at > CHATS_TTL_MS)) void loadPerson(direct[1]);
        return known?.url;
      }
      return undefined;
    },
    /** Waits a moment for the first chat list, so the first screen already has pictures. */
    async ready(ms = 2500) {
      if (chats) return;
      await Promise.race([refresh(), new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); })]);
    },
  };
}
