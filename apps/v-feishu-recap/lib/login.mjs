// Feishu sign-in for the page: OAuth with PKCE, no scopes, no token kept. What survives is
// a sealed cookie naming the person; membership is checked afresh on every request.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const LOGIN = "v_recap_login";
const STATE = "v_recap_state";
export const LOGIN_TTL_MS = 12 * 60 * 60 * 1000;

const readCookie = (req, name) => String(req.headers.cookie ?? "").split(/;\s*/u).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const sameText = (a, b) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b ?? "");
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createLogin({ feishu, appId, appSecret, origin, basePath, now = Date.now }) {
  const key = Buffer.from(hkdfSync("sha256", appSecret, "v-feishu-recap", "login-cookie-v1", 32));
  const callback = `${origin}${basePath}/callback`;
  const states = new Map();
  const sweep = () => { for (const [id, value] of states) if (value.expiresAt <= now()) states.delete(id); };
  const cookie = (name, value, age) => `${name}=${value}; Path=${basePath}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

  const seal = (person) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify({ ...person, expiresAt: now() + LOGIN_TTL_MS })), cipher.final()]);
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
  };

  return {
    /** The signed-in person, or null. */
    read(req) {
      try {
        const bytes = Buffer.from(readCookie(req, LOGIN) ?? "", "base64url");
        if (bytes.length < 29) return null;
        const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(-16));
        const person = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
        return person.expiresAt > now() ? { openId: person.openId, name: person.name } : null;
      } catch { return null; }
    },

    /** Sets the state cookie and returns where to send the browser. */
    begin(res, returnChat) {
      sweep();
      if (states.size >= 512) throw new Error("too_many_logins");
      const state = randomBytes(32).toString("base64url");
      const browser = randomBytes(32).toString("base64url");
      const verifier = randomBytes(48).toString("base64url");
      states.set(state, { browser, verifier, returnChat, expiresAt: now() + 300_000 });
      res.setHeader("set-cookie", cookie(STATE, browser, 300));
      const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
      for (const [name, value] of Object.entries({
        client_id: appId,
        response_type: "code",
        redirect_uri: callback,
        state,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      })) url.searchParams.set(name, value);
      return url.href;
    },

    /** Finishes the exchange, sets the login cookie, returns the chat to go back to. */
    async complete(req, res, url) {
      sweep();
      const pending = states.get(url.searchParams.get("state"));
      if (!pending || !sameText(readCookie(req, STATE), pending.browser)) throw new Error("invalid_state");
      states.delete(url.searchParams.get("state"));
      const code = url.searchParams.get("code");
      if (!code || !/^[A-Za-z0-9_-]{1,512}$/u.test(code)) throw new Error("login_declined");
      const person = await feishu.exchangeCode({ code, redirectUri: callback, verifier: pending.verifier });
      res.setHeader("set-cookie", [cookie(LOGIN, seal(person), LOGIN_TTL_MS / 1000), cookie(STATE, "", 0)]);
      return pending.returnChat;
    },
  };
}
