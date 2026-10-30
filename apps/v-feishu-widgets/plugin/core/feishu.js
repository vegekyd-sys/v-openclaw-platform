// Minimal Feishu Open API client: OpenClaw's Feishu channel strips images and the 2.0 button
// behaviors from cards, so this plugin sends and patches its one card itself, as the same bot.
const HOSTS = { feishu: "https://open.feishu.cn", lark: "https://open.larksuite.com" };

export function feishuCredentials(config, accountId) {
  const channel = config?.channels?.feishu;
  if (!channel || typeof channel !== "object" || channel.enabled === false) return null;
  const account = accountId && channel.accounts && typeof channel.accounts === "object" ? channel.accounts[accountId] : null;
  const pick = (key) => (typeof account?.[key] === "string" && account[key]) || (typeof channel[key] === "string" && channel[key]) || null;
  const appId = pick("appId");
  const appSecret = pick("appSecret");
  if (!appId || !appSecret) return null;
  const domain = pick("domain") ?? "feishu";
  return { appId, appSecret, host: HOSTS[domain] ?? (String(domain).startsWith("https://") ? domain : HOSTS.feishu) };
}

/** "user:ou_x" | "chat:oc_x" | "ou_x" | "oc_x" -> where the card goes and what the session's chat is. */
export function feishuTarget(raw) {
  const id = String(raw ?? "").trim().replace(/^feishu:/iu, "").replace(/^(user|chat|open_id|chat_id|group|dm):/iu, "");
  if (/^ou_/u.test(id)) return { receiveIdType: "open_id", receiveId: id, chatType: "p2p" };
  if (/^oc_/u.test(id)) return { receiveIdType: "chat_id", receiveId: id, chatType: "group" };
  return null;
}

export class FeishuApi {
  constructor({ appId, appSecret, host, fetchImpl = globalThis.fetch, now = Date.now }) {
    Object.assign(this, { appId, appSecret, host, fetch: fetchImpl, now, token: null });
  }

  async call(method, path, { json, form } = {}) {
    const token = await this.tenantToken();
    const res = await this.fetch(`${this.host}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(json ? { "content-type": "application/json; charset=utf-8" } : {}) },
      body: json ? JSON.stringify(json) : form,
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.code !== 0) throw new Error(`feishu ${method} ${path.split("?")[0]} failed: ${body.code ?? res.status} ${body.msg ?? ""}`.trim());
    return body.data ?? {};
  }

  async tenantToken() {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value;
    const res = await this.fetch(`${this.host}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (body.code !== 0 || !body.tenant_access_token) throw new Error(`feishu token failed: ${body.code ?? res.status}`);
    this.token = { value: body.tenant_access_token, expiresAt: this.now() + Math.max(60, (body.expire ?? 7200) - 300) * 1000 };
    return this.token.value;
  }

  async uploadImage(bytes, filename = "widget.png") {
    const form = new FormData();
    form.set("image_type", "message");
    form.set("image", new Blob([bytes], { type: "image/png" }), filename);
    return (await this.call("POST", "/open-apis/im/v1/images", { form })).image_key;
  }

  async sendCard({ receiveIdType, receiveId }, card) {
    return (await this.call("POST", `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      json: { receive_id: receiveId, msg_type: "interactive", content: JSON.stringify(card) },
    })).message_id;
  }

  async patchCard(messageId, card) {
    await this.call("PATCH", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, { json: { content: JSON.stringify(card) } });
  }

  /** Reply under the widget's card when there is one, otherwise a plain message in the chat. */
  async sendEcho({ receiveIdType, receiveId, cardMessageId, text }) {
    const content = JSON.stringify({ text });
    if (cardMessageId) {
      return (await this.call("POST", `/open-apis/im/v1/messages/${encodeURIComponent(cardMessageId)}/reply`, { json: { msg_type: "text", content } })).message_id;
    }
    return (await this.call("POST", `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, { json: { receive_id: receiveId, msg_type: "text", content } })).message_id;
  }
}
