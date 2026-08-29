import fs from "node:fs";
import http from "node:http";

// A 1 MB stdout plus a 1 MB stderr can expand substantially when JSON escapes
// control characters. Keep the transport bound finite while allowing every
// response that the Broker's validated public API can legitimately produce.
const MAX_RESPONSE_BYTES = 15_000_000;

export class BrokerClient {
  constructor(config = {}) {
    this.socketPath = config.socketPath ?? "/srv/vlab/state/sandbox-broker/broker.sock";
    this.brokerUrl = config.brokerUrl ? String(config.brokerUrl).replace(/\/$/, "") : null;
    this.tokenEnv = config.tokenEnv ?? "VLAB_SANDBOX_BROKER_TOKEN";
    this.tokenFile = config.tokenFile;
    if (this.brokerUrl && !this.brokerUrl.startsWith("https://") && !isLoopbackUrl(this.brokerUrl)) {
      throw new Error("Remote Project Sandbox Broker URLs must use HTTPS");
    }
  }

  request(path, { method = "GET", body, signal } = {}) {
    if (this.brokerUrl) return this.requestUrl(path, { method, body, signal });
    return this.requestSocket(path, { method, body, signal });
  }

  async requestUrl(path, { method, body, signal }) {
    const token = this.readToken();
    const response = await fetch(`${this.brokerUrl}${path}`, {
      method,
      signal,
      headers: {
        ...(body == null ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("Project Sandbox Broker response exceeds 5 MB");
    const value = parseJson(text, response.status);
    if (!response.ok) throw brokerError(value, response.status);
    return value;
  }

  requestSocket(path, { method, body, signal }) {
    return new Promise((resolve, reject) => {
      const data = body == null ? null : Buffer.from(JSON.stringify(body));
      const request = http.request({
        socketPath: this.socketPath,
        path,
        method,
        headers: data ? { "content-type": "application/json", "content-length": data.length } : {},
      }, (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) request.destroy(new Error("Project Sandbox Broker response exceeds 5 MB"));
          else chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            const value = parseJson(Buffer.concat(chunks).toString("utf8"), response.statusCode);
            if ((response.statusCode ?? 500) >= 400) reject(brokerError(value, response.statusCode));
            else resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      });
      request.on("error", reject);
      const abort = () => request.destroy(signal?.reason instanceof Error ? signal.reason : new Error("Project Sandbox request aborted"));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      request.on("close", () => signal?.removeEventListener("abort", abort));
      if (data) request.end(data); else request.end();
    });
  }

  readToken() {
    if (this.tokenFile) return fs.readFileSync(this.tokenFile, "utf8").trim();
    return process.env[this.tokenEnv]?.trim() ?? "";
  }
}

function parseJson(text, status) {
  try { return JSON.parse(text || "{}"); } catch { throw new Error(`Project Sandbox Broker returned invalid JSON (HTTP ${status ?? "unknown"})`); }
}

function brokerError(value, status) {
  const error = new Error(value?.error || value?.message || `Project Sandbox Broker HTTP ${status}`);
  error.status = status;
  return error;
}

function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}
