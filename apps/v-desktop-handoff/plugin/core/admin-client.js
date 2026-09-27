import fs from "node:fs";

export class HandoffAdminClient {
  constructor({ baseUrl = "http://127.0.0.1:23951", adminTokenFile, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    if (typeof adminTokenFile !== "string" || !adminTokenFile) {
      throw new TypeError("adminTokenFile is required");
    }
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
    this.adminTokenFile = adminTokenFile;
    this.fetch = fetchImpl;
    this.now = now;
    this.stateCache = { at: 0, value: null };
  }

  token() {
    return fs.readFileSync(this.adminTokenFile, "utf8").split(/\r?\n/u)[0].trim();
  }

  async request(method, route, body, { signal, timeoutMs = 5_000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const res = await this.fetch(`${this.baseUrl}${route}`, {
        method,
        headers: { authorization: `Bearer ${this.token()}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`desktop handoff service ${res.status}: ${json.error ?? "error"}`);
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  issue({ kind, ownerId, sessionKey, reason, claimTtlMs, sessionTtlMs }, options) {
    return this.request("POST", "/v1/handoffs", { kind, ownerId, sessionKey, reason, claimTtlMs, sessionTtlMs }, options);
  }

  latestForSession(sessionKey, options) {
    return this.request("GET", `/v1/handoffs?sessionKey=${encodeURIComponent(sessionKey)}`, undefined, options);
  }

  status(id, options) {
    return this.request("GET", `/v1/handoffs/${encodeURIComponent(id)}`, undefined, options);
  }

  revoke(id, options) {
    return this.request("DELETE", `/v1/handoffs/${encodeURIComponent(id)}`, undefined, options);
  }

  /** Cached for 2 s: before_tool_call runs on every tool call. */
  async state() {
    if (this.now() - this.stateCache.at < 2_000 && this.stateCache.value) {
      return this.stateCache.value;
    }
    const value = await this.request("GET", "/v1/state", undefined, { timeoutMs: 2_000 });
    this.stateCache = { at: this.now(), value };
    return value;
  }
}
