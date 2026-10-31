// Everything this service asks of Feishu, with the bot's own token. No long connection:
// a second connection with the same appId steals the Gateway's events.
export class FeishuError extends Error {
  constructor(label, code) { super(`${label}:${code}`); this.label = label; this.code = code; }
}

export class Feishu {
  constructor({ appId, appSecret, fetchImpl = globalThis.fetch, now = Date.now, membersTtlMs = 60_000 }) {
    Object.assign(this, { appId, appSecret, fetch: fetchImpl, now, membersTtlMs });
    this.token = null;
    this.members = new Map();
  }

  async json(label, path, init = {}) {
    const res = await this.fetch(`https://open.feishu.cn/open-apis${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    if (body.code !== 0) throw new FeishuError(label, body.code ?? res.status);
    return body;
  }

  async bearer() {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    const body = await this.json("tenant_token", "/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });
    this.token = { value: body.tenant_access_token, expiresAt: this.now() + Math.max(60, (body.expire ?? 7200) - 300) * 1000 };
    return this.token.value;
  }

  async call(label, method, path, payload) {
    return this.json(label, path, {
      method,
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${await this.bearer()}` },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }

  /** The code is the only thing that names a person; the browser's word counts for nothing. */
  async exchangeCode({ code, redirectUri, verifier }) {
    const body = await this.fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: this.appId, client_secret: this.appSecret, code, redirect_uri: redirectUri, code_verifier: verifier }),
    }).then((res) => res.json());
    if (body.code !== 0 || typeof body.access_token !== "string") throw new FeishuError("oauth_token", body.code ?? "no_token");
    const info = await this.fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${body.access_token}` },
    }).then((res) => res.json());
    const openId = info.data?.open_id;
    if (info.code !== 0 || typeof openId !== "string" || !openId.startsWith("ou_")) throw new FeishuError("user_info", info.code ?? "no_open_id");
    return { openId, name: info.data.name || "飞书用户" };
  }

  /** The whole member list of a group, cached a minute. Null when the bot cannot read it. */
  async groupMembers(chatId) {
    const cached = this.members.get(chatId);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const value = new Map();
    let pageToken = "";
    do {
      const qs = new URLSearchParams({ member_id_type: "open_id", page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) });
      const body = await this.call("members", "GET", `/im/v1/chats/${encodeURIComponent(chatId)}/members?${qs}`);
      for (const item of body.data?.items ?? []) value.set(item.member_id, item.name || "群成员");
      pageToken = body.data?.has_more ? body.data.page_token : "";
    } while (pageToken);
    if (this.members.size >= 512) this.members.clear();
    this.members.set(chatId, { value, expiresAt: this.now() + this.membersTtlMs });
    return value;
  }

  async chatName(chatId) {
    const body = await this.call("chat", "GET", `/im/v1/chats/${encodeURIComponent(chatId)}`);
    return body.data?.name || "群聊";
  }
}
