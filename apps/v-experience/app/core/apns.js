// Apple push for the V app. Configured with `channels.vapp.apns`
// {keyFile, keyId, teamId, bundleId}; without it, nothing is sent. The key file
// stays on the host, outside the configuration and this repository.
//
// Every note is pushed: whether the app is really in the foreground cannot be
// known from here (a dead socket looks alive for minutes), so the app itself
// hides the banner while it shows that chat.
import crypto from "node:crypto";
import http2 from "node:http2";

const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" };
const JWT_TTL_MS = 50 * 60 * 1000; // Apple refuses tokens older than an hour
const MAX_TOKENS_PER_USER = 6;
const MAX_BODY = 180;

const base64url = (value) => Buffer.from(value).toString("base64url");

export function providerToken({ key, keyId, teamId, now = Date.now() }) {
  const unsigned = `${base64url(JSON.stringify({ alg: "ES256", kid: keyId }))}.${base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }))}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** Answers `send(host, token, headers, body)` with `{status, reason}`. */
function http2Send(host, deviceToken, headers, body) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(host);
    client.on("error", reject);
    const request = client.request({ ":method": "POST", ":path": `/3/device/${deviceToken}`, ...headers });
    let status = 0;
    let answer = "";
    request.setEncoding("utf8");
    request.setTimeout(15_000, () => request.close(http2.constants.NGHTTP2_CANCEL));
    request.on("response", (h) => { status = h[":status"]; });
    request.on("data", (chunk) => { answer += chunk; });
    request.on("end", () => {
      client.close();
      let reason = "";
      try { reason = JSON.parse(answer).reason ?? ""; } catch { /* empty on success */ }
      resolve({ status, reason });
    });
    request.on("error", (error) => { client.close(); reject(error); });
    request.end(body);
  });
}

export function createApns({ getConfig, readFile, loadTokens, saveTokens, send = http2Send, log = () => {}, now = () => Date.now() }) {
  let tokens; // userId -> [{token, sandbox}]
  let signing; // {keyFile, key, jwt, at}
  const ensure = async () => { tokens ??= (await loadTokens()) ?? {}; return tokens; };

  const jwtFor = async (config) => {
    if (signing?.keyFile !== config.keyFile || !signing.key) signing = { keyFile: config.keyFile, key: await readFile(config.keyFile) };
    if (!signing.jwt || now() - signing.at > JWT_TTL_MS) {
      signing.jwt = providerToken({ key: signing.key, keyId: config.keyId, teamId: config.teamId, now: now() });
      signing.at = now();
    }
    return signing.jwt;
  };

  return {
    async register(userId, token, { sandbox = false } = {}) {
      if (!/^[0-9a-f]{32,200}$/iu.test(token)) throw Object.assign(new Error("无效的推送令牌"), { code: "INVALID_REQUEST" });
      const all = await ensure();
      all[userId] = [{ token, sandbox }, ...(all[userId] ?? []).filter((t) => t.token !== token)].slice(0, MAX_TOKENS_PER_USER);
      await saveTokens(all);
    },
    /** Fire and forget: a failed push must never affect the reply. */
    async notify(userId, { sessionKey, body }) {
      try {
        const config = getConfig();
        if (!config?.keyFile || !config.keyId || !config.teamId || !config.bundleId) return;
        const all = await ensure();
        const devices = all[userId] ?? [];
        if (!devices.length) return;
        const jwt = await jwtFor(config);
        const text = String(body ?? "").replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim().slice(0, MAX_BODY);
        const payload = JSON.stringify({ aps: { alert: { title: "V", body: text || "V 有新消息" }, sound: "default", "thread-id": sessionKey }, sessionKey });
        const headers = { authorization: `bearer ${jwt}`, "apns-topic": config.bundleId, "apns-push-type": "alert", "apns-priority": "10" };
        let changed = false;
        for (const device of devices) {
          const result = await send(device.sandbox ? HOSTS.sandbox : HOSTS.production, device.token, headers, payload);
          if (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
            all[userId] = all[userId].filter((t) => t.token !== device.token);
            changed = true;
          } else if (result.status !== 200) {
            log(`vapp: push refused ${result.status} ${result.reason}`);
          }
        }
        if (changed) await saveTokens(all);
      } catch (error) {
        log(`vapp: push failed: ${String(error?.code ?? error?.message ?? error)}`);
      }
    },
  };
}
