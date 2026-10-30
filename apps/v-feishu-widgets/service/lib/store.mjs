// One directory per widget: meta.json plus the wrapped document, 0600. The id in
// the URL is the read capability; only its hash names the directory, so a leaked
// state directory does not leak working links.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class WidgetStore {
  constructor({ stateDir, now = Date.now, ttlMs = DEFAULT_TTL_MS }) {
    this.root = path.join(stateDir, "widgets");
    this.now = now;
    this.ttlMs = ttlMs;
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    // id by session + title, so showing the same title again updates that widget.
    this.byIdentity = new Map();
    for (const name of fs.readdirSync(this.root)) {
      const meta = this.readMeta(name);
      if (meta) this.byIdentity.set(meta.identity, meta);
    }
  }

  readMeta(dirName) {
    try { return JSON.parse(fs.readFileSync(path.join(this.root, dirName, "meta.json"), "utf8")); }
    catch { return null; }
  }

  writeMeta(meta) {
    const file = path.join(this.root, meta.dir, "meta.json");
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(meta), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
  }

  upsert({ html, title, chat, chatType, sessionKey, appId, accountId }) {
    const identity = digest(`${sessionKey}\n${title}`);
    const existing = this.byIdentity.get(identity);
    const live = existing && existing.expiresAt > this.now() ? existing : null;
    const id = live?.id ?? crypto.randomBytes(24).toString("base64url");
    const dir = live?.dir ?? digest(id);
    fs.mkdirSync(path.join(this.root, dir), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.root, dir, "index.html"), html, { mode: 0o600 });
    const meta = {
      ...(live ?? {}),
      id, dir, identity, title, chat, chatType: chatType ?? "group", sessionKey, appId, accountId: accountId ?? null,
      version: (live?.version ?? 0) + 1,
      expiresAt: this.now() + this.ttlMs,
    };
    this.writeMeta(meta);
    this.byIdentity.set(identity, meta);
    return meta;
  }

  setMessage(id, messageId) {
    const widget = this.get(id);
    if (!widget) throw Object.assign(new Error("gone"), { status: 404 });
    widget.messageId = messageId;
    const { html: _html, ...meta } = widget;
    this.writeMeta(meta);
    this.byIdentity.set(meta.identity, meta);
  }

  get(id) {
    if (!/^[A-Za-z0-9_-]{32,64}$/u.test(id)) return null;
    const dir = digest(id);
    const meta = this.readMeta(dir);
    if (!meta || meta.id !== id || meta.expiresAt <= this.now()) return null;
    return { ...meta, html: fs.readFileSync(path.join(this.root, dir, "index.html"), "utf8") };
  }
}
