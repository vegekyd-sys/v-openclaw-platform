// The recap page behind a group's pinned link. Runs apart from the Gateway: it only reads
// the agent database, talks to Feishu with the bot's token, and asks the model.
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Feishu } from "./lib/feishu.mjs";
import { createGenerator } from "./lib/generate.mjs";
import { createLogin } from "./lib/login.mjs";
import { Busy, Recaps } from "./lib/recaps.mjs";
import { groupSessionKey, toLines, Transcripts } from "./lib/transcript.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHAT = /^oc_[A-Za-z0-9]{8,64}$/u;
const SECURITY = {
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https://*.feishu.cn https://*.larksuite.com",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

export function createRecapServer({ origin, basePath = "/recap", feishu, login, transcripts, generate, recaps, agentId, log = () => {}, now = Date.now }) {
  const assets = {
    [`${basePath}/page.css`]: ["text/css; charset=utf-8", readFileSync(path.join(here, "public/page.css"))],
    [`${basePath}/page.js`]: ["text/javascript; charset=utf-8", readFileSync(path.join(here, "public/page.js"))],
  };
  const shell = readFileSync(path.join(here, "public/page.html"), "utf8").replaceAll("__BASE__", basePath);

  const send = (res, status, type, body) => {
    res.writeHead(status, { ...SECURITY, "content-type": type });
    res.end(body);
  };
  const json = (res, status, body) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body));
  const notice = (res, status, text) => send(res, status, "text/html; charset=utf-8", shell.replace("__DATA__", "").replace("__NOTICE__", text));

  /** Is this person in this group? Anything but a clear yes is a no. */
  async function admitted(chat, person) {
    try { return (await feishu.groupMembers(chat)).has(person.openId); } catch (error) {
      log("members_failed", { chat, reason: error.message });
      return false;
    }
  }

  async function recapFor(chat, person, force) {
    const sessionKey = groupSessionKey(agentId, chat);
    const mark = transcripts.watermark(sessionKey);
    if (!mark) return { state: "empty" };
    const started = now();
    const result = await recaps.get({
      key: `${agentId}\n${sessionKey}`,
      mark: `${mark.sessionId}:${mark.seq}`,
      force,
      viewer: person.openId,
      make: async () => {
        const tail = transcripts.tail(sessionKey);
        const members = await feishu.groupMembers(chat);
        const lines = toLines(tail.rows, { names: members });
        if (!lines.length) return { recap: null, messages: 0, skipped: tail.skipped };
        const { recap, usage } = await generate(lines, await feishu.chatName(chat));
        log("generated", { chat, messages: lines.length, bytes: tail.bytes, skipped: tail.skipped, ms: now() - started, usage });
        return { recap, messages: lines.length, skipped: tail.skipped };
      },
    });
    if (!result.recap) return { state: "empty" };
    return {
      state: "ready",
      recap: result.recap,
      messages: result.messages,
      skipped: result.skipped,
      generatedAt: result.generatedAt,
      lastAt: mark.lastAt,
      running: mark.status === "running",
      cached: result.cached,
      stale: result.stale === true,
      viewer: person.name,
    };
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (req.method !== "GET") return send(res, 405, "text/plain", "method not allowed");
      if (url.pathname === "/healthz") return json(res, 200, { ok: true });
      const asset = assets[url.pathname];
      if (asset) return send(res, 200, asset[0], asset[1]);

      if (url.pathname === `${basePath}/callback`) {
        let chat;
        try { chat = await login.complete(req, res, url); } catch (error) {
          log("login_failed", { reason: error.message });
          return notice(res, 403, "没能确认你的飞书身份，请回到飞书重新点一次。");
        }
        res.writeHead(302, { ...SECURITY, location: `${basePath}?c=${encodeURIComponent(chat)}` });
        return res.end();
      }

      const chat = url.searchParams.get("c") ?? "";
      if (!CHAT.test(chat)) return notice(res, 404, "这个链接不对，请从群顶部的置顶重新打开。");
      const person = login.read(req);

      if (url.pathname === basePath) {
        if (!person) {
          res.writeHead(302, { ...SECURITY, location: login.begin(res, chat) });
          return res.end();
        }
        if (!(await admitted(chat, person))) return notice(res, 403, "你不在这个群里，看不了它的回顾。");
        const data = JSON.stringify({ chat, api: `${basePath}/api?c=${chat}`, back: `https://applink.feishu.cn/client/chat/open?openChatId=${chat}` });
        return send(res, 200, "text/html; charset=utf-8", shell.replace("__DATA__", Buffer.from(data).toString("base64url")).replace("__NOTICE__", ""));
      }

      if (url.pathname === `${basePath}/api`) {
        if (!person) return json(res, 401, { error: "login" });
        if (!(await admitted(chat, person))) return json(res, 403, { error: "not_member" });
        try {
          return json(res, 200, await recapFor(chat, person, url.searchParams.get("force") === "1"));
        } catch (error) {
          log("recap_failed", { chat, reason: error.message });
          return json(res, error instanceof Busy ? 429 : 502, { error: error instanceof Busy ? "busy" : "generate_failed" });
        }
      }
      return send(res, 404, "text/plain", "not found");
    } catch (error) {
      log("request_failed", { reason: error.message });
      if (!res.headersSent) send(res, 500, "text/plain", "error");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const config = JSON.parse(readFileSync(env.RECAP_OPENCLAW_CONFIG, "utf8"));
  const { appId, appSecret } = config.channels.feishu;
  const provider = config.models.providers.deepseek;
  const apiKey = provider.apiKey.replace(/^\$\{(\w+)\}$/u, (_, name) => env[name] ?? "");
  const origin = new URL(env.RECAP_ORIGIN).origin;
  const feishu = new Feishu({ appId, appSecret });
  const log = (event, fields) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
  const server = createRecapServer({
    origin,
    feishu,
    login: createLogin({ feishu, appId, appSecret, origin, basePath: "/recap" }),
    transcripts: new Transcripts(env.RECAP_AGENT_DB),
    generate: createGenerator({ baseUrl: provider.baseUrl, apiKey, model: env.RECAP_MODEL ?? "deepseek-v4-flash" }),
    recaps: new Recaps({ file: env.RECAP_CACHE_FILE }),
    agentId: env.RECAP_AGENT_ID ?? "makaron",
    log,
  });
  server.listen(Number(env.RECAP_PORT), "127.0.0.1", () => log("listening", { port: Number(env.RECAP_PORT), origin }));
}
