// Turns a code from tt.requestAccess into a Feishu user, server to server. Nothing
// the browser says about itself is trusted: only the code, exchanged with the app
// secret, names the person. Same exchange as Voice (lib/feishu-phone-login.mjs).
export class IdentityError extends Error {}

const HOSTS = { feishu: "https://open.feishu.cn", lark: "https://open.larksuite.com" };

function credentials(openclawConfig, accountId) {
  const channel = openclawConfig?.channels?.feishu ?? {};
  const account = accountId ? channel.accounts?.[accountId] : null;
  const pick = (key) => (typeof account?.[key] === "string" && account[key]) || (typeof channel[key] === "string" && channel[key]) || null;
  const appId = pick("appId");
  const appSecret = pick("appSecret");
  if (!appId || !appSecret) throw new IdentityError("no_credentials");
  const domain = pick("domain") ?? "feishu";
  return { appId, appSecret, host: HOSTS[domain] ?? domain };
}

export class FeishuIdentity {
  constructor({ openclawConfig, fetchImpl = globalThis.fetch, now = Date.now }) {
    this.config = openclawConfig;
    this.fetch = fetchImpl;
    this.now = now;
    this.tokens = new Map();
    this.members = new Map();
  }

  async json(url, init, label) {
    const res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    if (body.code !== 0) throw new IdentityError(`${label}:${body.code ?? res.status}`);
    return body;
  }

  async appToken(accountId) {
    const creds = credentials(this.config, accountId);
    const cached = this.tokens.get(creds.appId);
    if (cached && cached.expiresAt > this.now()) return { ...creds, token: cached.value };
    const body = await this.json(`${creds.host}/open-apis/auth/v3/app_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
    }, "app_token");
    const value = body.app_access_token;
    this.tokens.set(creds.appId, { value, expiresAt: this.now() + Math.max(60, (body.expire ?? 7200) - 300) * 1000 });
    return { ...creds, token: value };
  }

  async exchange(accountId, code) {
    const { host, token } = await this.appToken(accountId);
    const body = await this.json(`${host}/open-apis/authen/v1/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
      body: JSON.stringify({ grant_type: "authorization_code", code }),
    }, "code_exchange");
    const data = body.data ?? {};
    if (typeof data.open_id !== "string" || !data.open_id.startsWith("ou_")) throw new IdentityError("no_open_id");
    return { openId: data.open_id, name: typeof data.name === "string" && data.name ? data.name : "飞书用户", tenantKey: data.tenant_key ?? null };
  }

  /** A private chat's target is the person; a group's target is checked against its member list. */
  async isMember(accountId, chat, openId) {
    if (chat.startsWith("ou_")) return chat === openId;
    const cacheKey = `${chat}\n${openId}`;
    const cached = this.members.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const { host, token } = await this.appToken(accountId);
    let pageToken = "";
    let value = false;
    do {
      const qs = new URLSearchParams({ member_id_type: "open_id", page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) });
      const body = await this.json(`${host}/open-apis/im/v1/chats/${encodeURIComponent(chat)}/members?${qs}`, { headers: { authorization: `Bearer ${token}` } }, "members");
      value = (body.data?.items ?? []).some((item) => item.member_id === openId);
      pageToken = body.data?.has_more ? body.data.page_token : "";
    } while (!value && pageToken);
    this.members.set(cacheKey, { value, expiresAt: this.now() + 60_000 });
    return value;
  }
}
