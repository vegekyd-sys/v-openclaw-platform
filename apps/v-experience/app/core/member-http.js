// The vapp member endpoint: how a teammate's phone talks to V. It never touches
// the Gateway's operator API (which would show every session); it reaches the
// same vapp.* handlers the owner's phone calls, as that person.
//
//   GET  /vapp/login                 page the /app link opens; hands the code in its #fragment to the app
//   POST /vapp/member/claim          {invite, deviceName} -> {credential, userId, name}
//   GET  /vapp/member/events         server-sent events: plugin.vapp.* for this person
//   POST /vapp/member/rpc            {method, params} -> {ok, payload} | {ok:false, error}
//   GET  /vapp/member/media?source=  a file from this person's own chat (Range supported)
//
// Everything but the login page and claim needs "Authorization: Bearer <credential>".
import fs from "node:fs";
import path from "node:path";

export const ROUTE_PREFIX = "/vapp";
const MAX_BODY_BYTES = 3 * 1024 * 1024; // one upload piece is 512 KB, base64 in JSON
const HEARTBEAT_MS = 20_000; // under Cloudflare's 100 s idle cut
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024; // a stream this far behind is dropped; the app reconnects
const MAX_STREAMS_PER_DEVICE = 2;

const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
};

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
  return true;
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("请求太大"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("请求格式不对"), { status: 400 });
  }
}

/**
 * @param {object} deps
 * @param {object} deps.vapp      createVapp(...) result
 * @param {object} deps.members   createMembers(...) result
 * @param {(userId: string, token: string, opts: object) => Promise<void>} [deps.registerPush]
 * @param {(source: string) => string|undefined} [deps.resolveMediaPath]  V path or media:// ref -> file on disk
 */
export function createMemberHttp({ vapp, members, registerPush, resolveMediaPath = (source) => (path.isAbsolute(source) ? source : undefined), log = () => {} }) {
  const streams = new Map(); // connId -> {res, deviceId, userId, heartbeat}
  let seq = 0;

  // The vapp methods a member may call, as themselves. Owner-only work (approvals,
  // the full session list, commands) is refused inside the handlers for non-owners.
  const methods = {
    "vapp.hello": vapp.hello,
    "vapp.send": vapp.send,
    "vapp.upload": vapp.upload,
    "vapp.action": vapp.action,
    "vapp.stop": vapp.stop,
    "vapp.history": vapp.history,
    "vapp.react": vapp.userReact,
    "vapp.sessions": vapp.sessions,
    "vapp.push": async ({ params, client }) => {
      await registerPush?.(client.vappUser.id, String(params?.token ?? ""), { sandbox: params?.sandbox === true });
      return { ok: true };
    },
  };

  /** Delivers one event to a member stream; false when that stream is gone. */
  function sink(connId, event, payload) {
    const stream = streams.get(connId);
    if (!stream) return false;
    if (stream.res.writableLength > MAX_BUFFERED_BYTES) {
      log(`vapp member: stream ${connId} too far behind, closed`);
      stream.res.end();
      return false;
    }
    stream.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  }

  async function authenticate(req) {
    const header = String(req.headers.authorization ?? "");
    const credential = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    return credential ? members.authenticate(credential) : null;
  }

  const memberUser = (who) => ({ id: who.userId, name: who.name || who.userId, owner: false, deviceId: who.deviceId });
  const memberClient = (who, connId) => ({ connId, vappUser: memberUser(who), connect: { device: { id: who.deviceId } } });

  function openStream(req, res, who) {
    const connId = `m:${who.deviceId}:${++seq}`;
    // One phone, one or two streams (a reconnect overlapping the old one); older ones go.
    const mine = [...streams.entries()].filter(([, s]) => s.deviceId === who.deviceId);
    for (const [, old] of mine.slice(0, Math.max(0, mine.length - MAX_STREAMS_PER_DEVICE + 1))) old.res.end();
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ connId })}\n\n`);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();
    streams.set(connId, { res, deviceId: who.deviceId, userId: who.userId, heartbeat });
    vapp.attachStream(memberUser(who), connId);
    const close = () => {
      clearInterval(heartbeat);
      streams.delete(connId);
      vapp.detachStream(who.userId, connId);
    };
    req.on("close", close);
    res.on("close", close);
  }

  async function sendMedia(req, res, who, source) {
    if (!source || !(await vapp.ownsMedia(who.userId, source))) return json(res, 404, { error: { message: "没有这个文件" } });
    const file = resolveMediaPath(source);
    const stat = file ? await fs.promises.stat(file).catch(() => undefined) : undefined;
    if (!stat?.isFile()) return json(res, 404, { error: { message: "文件已不在 V 上" } });
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=86400");
    const range = /^bytes=(\d*)-(\d*)$/u.exec(String(req.headers.range ?? ""));
    let start = 0;
    let end = stat.size - 1;
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${stat.size}`);
        res.end();
        return true;
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    } else {
      res.statusCode = 200;
    }
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") { res.end(); return true; }
    fs.createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
    return true;
  }

  /** The plugin HTTP route handler for everything under /vapp. */
  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://vapp.local");
    const route = url.pathname.replace(/\/+$/u, "");
    try {
      if (route === `${ROUTE_PREFIX}/login` && req.method === "GET") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        // No default-src 'none': WebKit then refuses the system Chinese font and draws boxes.
        res.setHeader("Content-Security-Policy", "script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        res.end(LOGIN_PAGE);
        return true;
      }
      if (route === `${ROUTE_PREFIX}/member/claim` && req.method === "POST") {
        const body = await readJson(req);
        const claimed = await members.claim(String(body.invite ?? ""), { deviceName: body.deviceName });
        if (!claimed) return json(res, 403, { error: { code: "INVITE_INVALID", message: "登录链接无效或已过期，请在飞书私聊 V 发 /app 重新获取" } });
        log(`vapp member: ${claimed.userId} logged in a phone (${claimed.deviceId})`);
        return json(res, 200, { credential: claimed.credential, userId: claimed.userId, name: claimed.name });
      }
      if (!route.startsWith(`${ROUTE_PREFIX}/member/`)) return false;
      const who = await authenticate(req);
      if (!who) return json(res, 401, { error: { code: "AUTH", message: "这台手机的登录已失效，请重新获取登录链接" } });
      if (route === `${ROUTE_PREFIX}/member/events` && req.method === "GET") {
        openStream(req, res, who);
        return true;
      }
      if (route === `${ROUTE_PREFIX}/member/media` && (req.method === "GET" || req.method === "HEAD")) {
        return await sendMedia(req, res, who, url.searchParams.get("source") ?? "");
      }
      if (route === `${ROUTE_PREFIX}/member/rpc` && req.method === "POST") {
        const body = await readJson(req);
        const handler = methods[String(body.method ?? "")];
        if (!handler) return json(res, 200, { ok: false, error: { code: "UNAVAILABLE", message: `不支持 ${String(body.method ?? "")}` } });
        try {
          const payload = await handler({ params: body.params ?? {}, client: memberClient(who, undefined), context: undefined });
          return json(res, 200, { ok: true, payload: payload ?? null });
        } catch (error) {
          return json(res, 200, { ok: false, error: { code: error?.code ?? "ERROR", message: String(error?.message ?? error) } });
        }
      }
      return json(res, 404, { error: { message: "没有这个接口" } });
    } catch (error) {
      if (res.headersSent) { res.destroy(); return true; }
      return json(res, error?.status ?? 500, { error: { message: String(error?.message ?? error) } });
    }
  }

  function closeAll() {
    for (const { res } of streams.values()) res.end();
  }

  return { handle, sink, closeAll, streamCount: () => streams.size };
}

// The /app link lands here. The code stays in the #fragment, which browsers never
// send to a server, and goes to the app through its oc-pair:// scheme.
const LOGIN_PAGE = `<!doctype html>
<html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 V</title>
<style>
:root{color-scheme:light dark;--ink:#1d1a22;--muted:#7a7484;--page:#f5f3f7;--accent:#6b4d8f}
@media (prefers-color-scheme:dark){:root{--ink:#f1edf5;--muted:#a49cae;--page:#16141a;--accent:#b79ae0}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--page);color:var(--ink);font:17px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:22rem;padding:0 24px;text-align:center}
h1{font:600 64px/1 ui-serif,Georgia,serif;margin:0 0 28px}
a.open{display:block;padding:15px;border-radius:14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
p{color:var(--muted);font-size:15px;margin:18px 0 0}
</style></head>
<body><main><h1>V</h1><a class="open" id="open" href="#">在 V App 中打开</a><p id="note">在装了 V App 的手机上打开这个链接。</p></main>
<script>
var code=location.hash.slice(1);var open=document.getElementById("open");
if(!/^[A-Za-z0-9_-]{20,}$/.test(code)){open.style.display="none";document.getElementById("note").textContent="这个链接不完整。请在飞书私聊 V 发送 /app 重新获取。";}
else{open.href="oc-pair://"+code;history.replaceState(null,"",location.pathname);setTimeout(function(){location.href=open.href},300);}
</script></body></html>`;
