// Minimal Feishu Open API client for the handoff card. OpenClaw's own Feishu
// channel strips images, column layouts and header tags from cards, so the
// plugin sends and later patches this one card itself, as the same bot app.
import { execFile } from "node:child_process";
import fs from "node:fs";

const HOSTS = { feishu: "https://open.feishu.cn", lark: "https://open.larksuite.com" };

/** App credentials of the Feishu account the conversation runs on, from the Gateway config. */
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

/** "user:ou_x" | "chat:oc_x" | "ou_x" | "oc_x" -> Feishu receive id. */
export function feishuReceiver(target) {
  const raw = String(target ?? "").trim();
  const id = raw.replace(/^(user|chat|open_id|chat_id):/iu, "");
  if (/^ou_/u.test(id)) {
    return { receiveIdType: "open_id", receiveId: id };
  }
  if (/^oc_/u.test(id)) {
    return { receiveIdType: "chat_id", receiveId: id };
  }
  return null;
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

  async call(method, path, { json, form } = {}) {
    const token = await this.tenantToken();
    const res = await this.fetch(`${this.host}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(json ? { "content-type": "application/json; charset=utf-8" } : {}) },
      body: json ? JSON.stringify(json) : form,
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

  async uploadImage(bytes, filename = "image.jpg") {
    const form = new FormData();
    form.set("image_type", "message");
    form.set("image", new Blob([bytes], { type: filename.endsWith(".png") ? "image/png" : "image/jpeg" }), filename);
    return (await this.call("POST", "/open-apis/im/v1/images", { form })).image_key;
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
}

/** One JPEG of the host desktop (X display), or null. */
export function captureDesktop({ display = ":99", ffmpeg = "ffmpeg", timeoutMs = 8_000, runner = execFile } = {}) {
  return new Promise((resolve) => {
    runner(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-f", "x11grab", "-i", display, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", "-f", "mjpeg", "pipe:1"],
      { encoding: "buffer", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => resolve(!error && stdout?.length > 1000 ? Buffer.from(stdout) : null),
    );
  });
}

export async function loadCover(source, { fetchImpl = globalThis.fetch } = {}) {
  if (!source) {
    return null;
  }
  if (/^https?:\/\//u.test(source)) {
    const res = await fetchImpl(source, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  return fs.existsSync(source) ? fs.readFileSync(source) : null;
}
