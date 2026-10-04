#!/usr/bin/env node
// v-desktop-handoff: a shareable, one-time link onto the Gateway host's desktop.
//
//   node server.mjs /etc/v-desktop-handoff/config.json
//
// Public side (behind cloudflared, path prefix): viewer page, claim/control
// API, RFB-over-WebSocket. Admin side (loopback only, bearer token): issue and
// revoke handoffs, read state and audit. See ../README.md.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HandoffRegistry, CLOSE_CODES } from "./lib/registry.mjs";
import { acceptWebSocket, isWebSocketUpgrade, rejectUpgrade } from "./lib/ws.mjs";
import { connectVnc, bridgeViewer } from "./lib/rfb-proxy.mjs";
import { createDisplayLayout } from "./lib/display-layout.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const config = {
    bind: "127.0.0.1",
    publicPort: 23950,
    adminPort: 23951,
    publicBaseUrl: "http://127.0.0.1:23950",
    pathPrefix: "/desktop-handoff",
    novncDir: "/usr/share/novnc",
    title: "V 的桌面",
    limits: {},
    ...raw,
    vnc: { host: "127.0.0.1", port: 5900, ...(raw.vnc ?? {}) },
    layout: { enabled: true, display: ":99", base: "1280x800", ...(raw.layout ?? {}) },
  };
  for (const key of ["stateDir", "adminTokenFile"]) {
    if (typeof config[key] !== "string" || !config[key]) {
      throw new Error(`config.${key} is required`);
    }
  }
  if (!config.vnc.passwordFile && typeof config.vnc.password !== "string") {
    throw new Error("config.vnc.passwordFile (plain text) or config.vnc.password is required");
  }
  config.pathPrefix = config.pathPrefix.replace(/\/+$/u, "");
  return config;
}

function readSecretFile(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/u)[0].trim();
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readJsonBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, root, relative) {
  const target = path.resolve(root, `.${path.posix.normalize(`/${relative}`)}`);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.resolve(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const type = MIME[path.extname(target).toLowerCase()];
  if (!type) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": type, "content-length": stat.size, "cache-control": "no-cache" });
  fs.createReadStream(target).pipe(res);
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) {
    return cf.trim();
  }
  return req.socket?.remoteAddress ?? null;
}

export function createService(config, { log = console, layout: layoutOverride } = {}) {
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const adminToken = readSecretFile(config.adminTokenFile);
  if (adminToken.length < 16) {
    throw new Error("admin token is too short");
  }
  const vncPassword = () => (config.vnc.passwordFile ? readSecretFile(config.vnc.passwordFile) : config.vnc.password);
  const auditFile = path.join(config.stateDir, "audit.jsonl");
  const stateFile = path.join(config.stateDir, "handoffs.json");
  let layout = null;
  const registry = new HandoffRegistry({
    limits: config.limits,
    onAudit: (entry) => {
      fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      scheduleSave();
      syncLayout();
    },
  });
  // loadConfig turns the phone layout on by default; a bare config (tests) leaves it off.
  layout =
    layoutOverride ?? (config.layout?.enabled ? createDisplayLayout({ display: config.layout.display, base: config.layout.base, log }) : null);
  // The phone layout exists only while the viewer that asked for it is still the controller.
  // Every control change is audited, so checking here (and on the timer) covers release,
  // hand-back, idle demotion, disconnect, takeover and the end of the handoff.
  function syncLayout() {
    const owner = layout?.state.owner;
    if (owner && registry.controllerSecret !== owner) {
      layout.restore("controller-changed").catch((error) => log.error?.(`layout restore failed: ${error.message}`));
    }
  }
  try {
    registry.importHandoffs(JSON.parse(fs.readFileSync(stateFile, "utf8")));
  } catch {
    /* fresh state */
  }
  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) {
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const tmp = `${stateFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(registry.exportHandoffs()), { mode: 0o600 });
      fs.renameSync(tmp, stateFile);
    }, 200);
    saveTimer.unref?.();
  }

  const prefix = config.pathPrefix;
  const linkFor = (token) => `${config.publicBaseUrl.replace(/\/+$/u, "")}${prefix}/#${token}`;

  // ---------------- public ----------------
  const publicServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let route = url.pathname;
    if (prefix && (route === prefix || route.startsWith(`${prefix}/`))) {
      route = route.slice(prefix.length) || "/";
    } else if (prefix) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    try {
      if (req.method === "GET" && route === "/") {
        serveStatic(res, PUBLIC_DIR, "index.html");
      } else if (req.method === "GET" && route === "/healthz") {
        json(res, 200, { ok: true, viewers: registry.activeViewerCount() });
      } else if (req.method === "GET" && route.startsWith("/novnc/")) {
        serveStatic(res, config.novncDir, route.slice("/novnc/".length));
      } else if (req.method === "GET" && /^\/[\w.-]+\.(?:js|css|svg|png|ico)$/u.test(route)) {
        serveStatic(res, PUBLIC_DIR, route.slice(1));
      } else if (req.method === "POST" && route === "/api/claim") {
        const body = await readJsonBody(req);
        const result = registry.claim(typeof body.token === "string" ? body.token : "", {
          ip: clientIp(req),
          userAgent: req.headers["user-agent"],
        });
        if (result.error) {
          json(res, 403, { error: result.error });
          return;
        }
        json(res, 200, { ...result, title: config.title, wsPath: `${prefix}/ws` });
      } else if (req.method === "GET" && route === "/api/session") {
        const status = registry.viewerStatus(url.searchParams.get("viewer") ?? "");
        if (!status) {
          json(res, 404, { error: "unknown_viewer" });
          return;
        }
        const lay = layout?.state;
        json(res, 200, { ...status, now: Date.now(), layout: lay ? { mode: lay.owner === url.searchParams.get("viewer") ? lay.mode : "desktop", width: lay.width, height: lay.height } : null });
      } else if (req.method === "POST" && route === "/api/control") {
        const body = await readJsonBody(req);
        const secret = typeof body.viewer === "string" ? body.viewer : "";
        const result = body.take ? registry.takeControl(secret) : registry.releaseControl(secret);
        json(res, result.error ? 403 : 200, result);
      } else if (req.method === "POST" && route === "/api/layout") {
        const body = await readJsonBody(req);
        const secret = typeof body.viewer === "string" ? body.viewer : "";
        if (!layout) {
          json(res, 409, { error: "layout_disabled" });
          return;
        }
        if (!registry.isController(secret)) {
          json(res, 403, { error: "not_controller" });
          return;
        }
        try {
          const state = body.mode === "phone" ? await layout.phone(secret, body.width, body.height) : await layout.restore("viewer-asked");
          if (!registry.isController(secret)) {
            syncLayout(); // lost control while resizing
          }
          registry.audit("layout", { viewer: secret.slice(0, 6), mode: state.mode, size: `${state.width}x${state.height}` });
          json(res, 200, { mode: state.mode, width: state.width, height: state.height });
        } catch (error) {
          log.error?.(`layout ${body.mode} failed: ${error.message}`);
          json(res, 500, { error: "layout_failed" });
        }
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    } catch (error) {
      log.error?.(`public request failed: ${error.message}`);
      if (!res.headersSent) {
        json(res, 400, { error: "bad_request" });
      } else {
        res.end();
      }
    }
  });

  publicServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== `${prefix}/ws` || !isWebSocketUpgrade(req)) {
      rejectUpgrade(socket, 404, "not found");
      return;
    }
    const secret = url.searchParams.get("viewer") ?? "";
    const known = registry.viewers.get(secret);
    if (!known) {
      rejectUpgrade(socket, 403, "unknown viewer");
      return;
    }
    const ws = acceptWebSocket(req, socket, head, { protocols: ["binary"] });
    let bridge = null;
    const link = {
      close(code, reason) {
        if (bridge) {
          bridge.close(code, reason);
        } else {
          ws.close(code, reason);
        }
      },
    };
    const attached = registry.attachViewer(secret, link);
    if (attached.error) {
      ws.close(attached.error === "expired" ? CLOSE_CODES.sessionExpired : CLOSE_CODES.revoked, attached.error);
      return;
    }
    let vnc;
    try {
      vnc = await connectVnc({ host: config.vnc.host, port: config.vnc.port, password: vncPassword() });
    } catch (error) {
      log.error?.(`VNC connect failed: ${error.message}`);
      registry.audit("desktop_unavailable", { viewer: secret.slice(0, 6), error: error.message });
      registry.viewerDisconnected(secret);
      ws.close(CLOSE_CODES.desktopUnavailable, "desktop-unavailable");
      return;
    }
    if (ws.closed) {
      vnc.socket.destroy();
      registry.viewerDisconnected(secret);
      return;
    }
    bridge = await bridgeViewer({
      ws,
      vnc: vnc.socket,
      serverInit: vnc.serverInit,
      leftover: vnc.leftover,
      policy: {
        allowInput: () => registry.isController(secret),
        onInput: () => registry.noteInput(secret),
        serverSideCursor: config.serverSideCursor !== false,
      },
      onClose: () => {
        if (registry.viewers.get(secret)?.link === link) {
          registry.viewerDisconnected(secret);
        }
      },
    });
  });

  // ---------------- admin ----------------
  const adminServer = http.createServer(async (req, res) => {
    const auth = String(req.headers.authorization ?? "");
    if (auth !== `Bearer ${adminToken}`) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/^\/v1\/handoffs\/([\w-]+)$/u);
    const handBackMatch = url.pathname.match(/^\/v1\/handoffs\/([\w-]+)\/handback$/u);
    const cardMatch = url.pathname.match(/^\/v1\/handoffs\/([\w-]+)\/card$/u);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true, ...registry.state() });
      } else if (req.method === "GET" && url.pathname === "/v1/state") {
        json(res, 200, registry.state());
      } else if (req.method === "POST" && url.pathname === "/v1/handoffs") {
        const body = await readJsonBody(req);
        const issued = registry.issue({
          kind: body.kind,
          ownerId: body.ownerId,
          sessionKey: typeof body.sessionKey === "string" ? body.sessionKey : null,
          reason: body.reason,
          claimTtlMs: body.claimTtlMs,
          sessionTtlMs: body.sessionTtlMs,
        });
        json(res, 201, { id: issued.id, kind: issued.kind, url: linkFor(issued.token), claimExpiresAt: issued.claimExpiresAt, sessionTtlMs: issued.sessionTtlMs });
      } else if (req.method === "GET" && url.pathname === "/v1/handoffs" && url.searchParams.get("sessionKey")) {
        const status = registry.latestHandoffForSession(url.searchParams.get("sessionKey"));
        json(res, status ? 200 : 404, status ?? { error: "not_found" });
      } else if (req.method === "GET" && match) {
        const status = registry.handoffStatus(match[1]);
        json(res, status ? 200 : 404, status ?? { error: "not_found" });
      } else if (req.method === "PUT" && cardMatch) {
        const body = await readJsonBody(req, 20 * 1024);
        const result = registry.setCard(cardMatch[1], body.card);
        json(res, result ? 200 : 404, result ?? { error: "not_found" });
      } else if (req.method === "POST" && handBackMatch) {
        const result = registry.handBack(handBackMatch[1]);
        json(res, result ? 200 : 404, result ?? { error: "not_found" });
      } else if (req.method === "DELETE" && match) {
        json(res, registry.revoke(match[1], "revoked_by_agent") ? 200 : 404, { ok: true });
      } else if (req.method === "GET" && url.pathname === "/v1/audit") {
        const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 1000);
        let lines = [];
        try {
          lines = fs.readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean);
        } catch {
          /* no audit yet */
        }
        json(res, 200, { entries: lines.slice(-limit).map((line) => JSON.parse(line)) });
      } else {
        json(res, 404, { error: "not_found" });
      }
    } catch (error) {
      json(res, 400, { error: error.message });
    }
  });

  const timer = setInterval(() => {
    registry.tick();
    syncLayout();
  }, 5_000);
  timer.unref();
  layout?.recover().catch((error) => log.error?.(`layout recover failed: ${error.message}`));

  return {
    registry,
    linkFor,
    async listen() {
      await new Promise((resolve, reject) => {
        publicServer.once("error", reject);
        publicServer.listen(config.publicPort, config.bind, resolve);
      });
      await new Promise((resolve, reject) => {
        adminServer.once("error", reject);
        adminServer.listen(config.adminPort, config.bind, resolve);
      });
      return { publicPort: publicServer.address().port, adminPort: adminServer.address().port };
    },
    layout,
    async close() {
      clearInterval(timer);
      for (const [secret] of registry.viewers) {
        registry.detachViewer(secret, 1001, "service-stopping");
      }
      await layout?.restore("service-stopping").catch(() => {});
      await Promise.all([
        new Promise((resolve) => publicServer.close(() => resolve())),
        new Promise((resolve) => adminServer.close(() => resolve())),
      ]);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? process.env.V_DESKTOP_HANDOFF_CONFIG;
  if (!file) {
    console.error("usage: server.mjs <config.json>");
    process.exit(2);
  }
  const config = loadConfig(file);
  const service = createService(config);
  const ports = await service.listen();
  console.log(JSON.stringify({ event: "listening", ...ports, prefix: config.pathPrefix, vnc: `${config.vnc.host}:${config.vnc.port}` }));
  const stop = async () => {
    await service.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
