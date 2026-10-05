// Minimal Feishu Open API client (same shape as the desktop-handoff plugin's).
// The relay posts and patches its thread cards itself, as the conversation's own
// bot app, and looks up chat names so people see 「群名」 instead of session keys.
const HOSTS = { feishu: "https://open.feishu.cn", lark: "https://open.larksuite.com" };

/** App credentials of a Feishu account from the Gateway config (plain strings only). */
export function feishuCredentials(config, accountId) {
  const channel = config?.channels?.feishu;
  if (!channel || typeof channel !== "object") {
    return null;
  }
  const account = accountId && channel.accounts && typeof channel.accounts === "object" ? channel.accounts[accountId] : null;
  const pick = (key) => (typeof account?.[key] === "string" && account[key]) || (typeof channel[key] === "string" && channel[key]) || null;
  const appId = pick("appId");
  const appSecret = pick("appSecret");
  if (!appId || !appSecret) {
    return null;
  }
  const domain = pick("domain") ?? "feishu";
  return { appId, appSecret, host: HOSTS[domain] ?? (String(domain).startsWith("https://") ? domain : HOSTS.feishu) };
}

export class FeishuApi {
  constructor({ appId, appSecret, host, fetchImpl = globalThis.fetch, now = Date.now }) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.host = host;
    this.fetch = fetchImpl;
    this.now = now;
    this.token = null;
  }

  async call(method, path, { json } = {}) {
    const token = await this.tenantToken();
    const res = await this.fetch(`${this.host}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(json ? { "content-type": "application/json; charset=utf-8" } : {}) },
      body: json ? JSON.stringify(json) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.code !== 0) {
      throw new Error(`feishu ${method} ${path.split("?")[0]} failed: ${body.code ?? res.status} ${body.msg ?? ""}`.trim());
    }
    return body.data ?? {};
  }

  async tenantToken() {
    if (this.token && this.now() < this.token.expiresAt) {
      return this.token.value;
    }
    const res = await this.fetch(`${this.host}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new Error(`feishu token failed: ${body.code ?? res.status} ${body.msg ?? ""}`.trim());
    }
    this.token = { value: body.tenant_access_token, expiresAt: this.now() + Math.max(60, (body.expire ?? 7200) - 300) * 1000 };
    return this.token.value;
  }

  async sendCard({ receiveIdType, receiveId }, card) {
    const data = await this.call("POST", `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      json: { receive_id: receiveId, msg_type: "interactive", content: JSON.stringify(card) },
    });
    return data.message_id;
  }

  async patchCard(messageId, card) {
    await this.call("PATCH", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, { json: { content: JSON.stringify(card) } });
  }

  async chatName(chatId) {
    const data = await this.call("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`);
    return typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
  }
}

/** One FeishuApi per app, reused across calls. */
export function feishuClients() {
  const byApp = new Map();
  return (cfg, accountId) => {
    const creds = feishuCredentials(cfg, accountId);
    if (!creds) {
      return null;
    }
    let api = byApp.get(creds.appId);
    if (!api) {
      api = new FeishuApi(creds);
      byApp.set(creds.appId, api);
    }
    return api;
  };
}
