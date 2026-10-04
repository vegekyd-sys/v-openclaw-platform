// Secret-entry links: one link per credential question, usable once.
//
// A link is issued by a channel (through the admin API) for one pending
// question of the `secrets` tool. Its token is only ever kept hashed, in
// memory: a restart invalidates every open link, which is the safe outcome
// (the question then expires and the agent carries on). The value typed on the
// page goes straight to the Gateway's `question.resolve` and is never stored
// or logged here.
import crypto from "node:crypto";

const DEFAULT_LIMITS = Object.freeze({
  maxTtlMs: 15 * 60_000, // a link never outlives this, nor its question
  maxAttempts: 5, // failed submissions before the link closes
  maxValueLength: 16_384, // same limit as the Feishu secret-entry card
});

export const NAME_RE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const QUESTION_ID_RE = /^[\w:.-]{1,128}$/u;
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/u;

export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const cleanHosts = (hosts) => {
  if (hosts === undefined || hosts === null) return [];
  if (!Array.isArray(hosts) || hosts.length > 128) throw new TypeError("allowedHosts must be a list of at most 128 hosts");
  return hosts.map((host) => {
    if (typeof host !== "string" || !host.trim() || host.length > 253) throw new TypeError("allowedHosts entries must be host names");
    return host.trim();
  });
};

/** Why a submission was refused, for the page; never includes the value. */
export class LinkError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class LinkRegistry {
  constructor({ now = Date.now, randomToken = () => crypto.randomBytes(32).toString("base64url"), limits = {}, onAudit = () => {} } = {}) {
    this.now = now;
    this.randomToken = randomToken;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.onAudit = onAudit;
    this.links = new Map(); // id -> link
    this.byTokenHash = new Map(); // tokenHash -> id
  }

  audit(event, link, data = {}) {
    this.onAudit({ at: this.now(), event, id: link.id, questionId: link.questionId, name: link.name, channel: link.channel, askerId: link.askerId, ...data });
  }

  /** Admin: a new link for a pending question; an older link for the same question is closed. */
  issue({ questionId, answerKey = "secret_value", name, reason, allowedHosts, channel, askerId, expiresAtMs } = {}) {
    if (typeof questionId !== "string" || !QUESTION_ID_RE.test(questionId)) throw new TypeError("questionId is required");
    if (typeof answerKey !== "string" || !QUESTION_ID_RE.test(answerKey)) throw new TypeError("answerKey is invalid");
    if (typeof name !== "string" || !NAME_RE.test(name)) throw new TypeError("name must be an upper-case secret name");
    if (typeof channel !== "string" || !CHANNEL_RE.test(channel)) throw new TypeError("channel is required");
    if (typeof askerId !== "string" || !askerId.trim() || askerId.length > 128) throw new TypeError("askerId is required");
    if (reason !== undefined && reason !== null && typeof reason !== "string") throw new TypeError("reason must be text");
    const hosts = cleanHosts(allowedHosts);
    const now = this.now();
    const cap = now + this.limits.maxTtlMs;
    const expires = Number.isFinite(expiresAtMs) ? Math.min(expiresAtMs, cap) : cap;
    if (expires <= now + 5_000) throw new TypeError("the question has already expired");
    for (const old of this.links.values()) {
      if (old.questionId === questionId && old.state === "pending") this.close(old, "replaced");
    }
    const token = this.randomToken();
    const link = {
      id: `sl_${crypto.randomBytes(6).toString("hex")}`,
      tokenHash: hashToken(token),
      questionId,
      answerKey,
      name,
      reason: reason?.trim() ? reason.trim().slice(0, 500) : undefined,
      allowedHosts: hosts,
      channel,
      askerId: askerId.trim(),
      createdAtMs: now,
      expiresAtMs: expires,
      state: "pending", // pending -> submitting -> used | closed
      attempts: 0,
    };
    this.links.set(link.id, link);
    this.byTokenHash.set(link.tokenHash, link.id);
    this.audit("issued", link, { expiresAtMs: expires });
    return { link, token };
  }

  close(link, reason) {
    if (link.state === "used" || link.state === "closed") return false;
    link.state = "closed";
    link.closedReason = reason;
    this.audit("closed", link, { reason });
    return true;
  }

  revoke(id, reason = "revoked") {
    const link = this.links.get(id);
    return link ? this.close(link, reason) : false;
  }

  /** The link a page token names, or a LinkError saying why it cannot be used. */
  lookup(token) {
    const id = typeof token === "string" && token.length >= 20 && token.length <= 128 ? this.byTokenHash.get(hashToken(token)) : undefined;
    const link = id ? this.links.get(id) : undefined;
    if (!link) throw new LinkError("invalid", 404, "链接无效。");
    if (link.state === "pending" && this.now() >= link.expiresAtMs) this.close(link, "expired");
    if (link.state === "used") throw new LinkError("used", 410, "这个链接已经用过了。");
    if (link.state === "closed") throw new LinkError(link.closedReason === "expired" ? "expired" : "closed", 410, link.closedReason === "expired" ? "链接已过期，请让 V 重新索取。" : "这个请求已经结束了。");
    return link;
  }

  /** What the page shows. */
  describe(token) {
    const link = this.lookup(token);
    return { name: link.name, reason: link.reason, allowedHosts: link.allowedHosts, expiresAtMs: link.expiresAtMs, busy: link.state === "submitting" };
  }

  /**
   * Hands the value to `resolve(link, value)` (the Gateway call) once.
   * `resolve` throws `{gone: true}` when the question already ended.
   */
  async submit(token, value, resolve, meta = {}) {
    const link = this.lookup(token);
    if (link.state === "submitting") throw new LinkError("busy", 409, "正在保存，请稍候。");
    if (typeof value !== "string" || !value.trim()) throw new LinkError("empty", 400, "请先填写再提交。");
    if (value.length > this.limits.maxValueLength) throw new LinkError("too-long", 400, "内容太长，无法保存。");
    link.state = "submitting";
    try {
      await resolve(link, value);
    } catch (error) {
      if (error?.gone) {
        link.state = "pending";
        this.close(link, "question-ended");
        throw new LinkError("closed", 410, "这个请求已经结束了。");
      }
      link.attempts += 1;
      link.state = "pending";
      this.audit("failed", link, { attempt: link.attempts, reason: String(error?.reason ?? "error").slice(0, 80), ...meta });
      if (link.attempts >= this.limits.maxAttempts) this.close(link, "too-many-attempts");
      throw new LinkError("failed", 502, "保存失败，请稍后再试。");
    }
    link.state = "used";
    link.usedAtMs = this.now();
    this.audit("used", link, meta);
    return { name: link.name };
  }

  /** Drops links that ended an hour ago. */
  tick() {
    const now = this.now();
    for (const link of this.links.values()) {
      if (link.state === "pending" && now >= link.expiresAtMs) this.close(link, "expired");
      if ((link.state === "used" || link.state === "closed") && now - link.expiresAtMs > 3600_000) {
        this.links.delete(link.id);
        this.byTokenHash.delete(link.tokenHash);
      }
    }
  }

  list() {
    return [...this.links.values()].map(({ tokenHash, ...rest }) => rest);
  }
}
