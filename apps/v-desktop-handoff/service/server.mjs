#!/usr/bin/env node
// v-desktop-handoff: a shareable, one-time link onto the Gateway host's desktop.
//
//   node server.mjs /etc/v-desktop-handoff/config.json
//
// Public side (behind cloudflared, path prefix): viewer page, claim/control
// API, RFB-over-WebSocket, desktop pictures for chat cards. Admin side
// (loopback only, bearer token): issue and revoke handoffs, store a card's
// picture, read state and audit. See ../README.md.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HandoffRegistry, CLOSE_CODES } from "./lib/registry.mjs";
import { acceptWebSocket, isWebSocketUpgrade, rejectUpgrade } from "./lib/ws.mjs";
import { connectVnc, bridgeViewer } from "./lib/rfb-proxy.mjs";
import { createDisplayLayout } from "./lib/display-layout.mjs";
import { createInputReset } from "./lib/input-reset.mjs";

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

function readRawBody(req, limit) {
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
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** "image/jpeg" | "image/png" from the first bytes, or null. */
export function imageType(bytes) {
  if (bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes?.length > 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return "image/png";
  }
  return null;
}

/**
 * Desktop pictures for chat cards whose platform fetches images by url (WeCom
 * template cards). Each picture gets its own random token, lives in memory
 * only and expires; the token never reaches the audit log.
 */
export class SnapshotStore {
  constructor({ ttlMs = 60 * 60_000, maxEntries = 50, maxBytes = 4 * 1024 * 1024, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.now = now;
    this.entries = new Map(); // token -> {handoffId, bytes, type, expiresAt}
  }

  put(handoffId, bytes) {
    const type = imageType(bytes);
    if (!type) {
      throw new Error("snapshot must be a JPEG or PNG image");
    }
    if (bytes.length > this.maxBytes) {
      throw new Error("snapshot too large");
    }
    this.prune();
    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(token, { handoffId, bytes: Buffer.from(bytes), type, expiresAt });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
    return { token, type, expiresAt, extension: type === "image/png" ? "png" : "jpg" };
  }

  get(token) {
    const entry = this.entries.get(token);
    if (!entry) {
      return null;
    }
    if (this.now() > entry.expiresAt) {
      this.entries.delete(token);
      return null;
    }
    return entry;
  }

  prune() {
    for (const [token, entry] of this.entries) {
      if (this.now() > entry.expiresAt) {
        this.entries.delete(token);
      }
    }
  }
}

function serveStatic(res, root, relative, { immutable = false } = {}) {
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
  // Versioned assets (?v=<content hash>, stamped by build-viewer.mjs) never change: cache them for good.
  const cache = immutable ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": type, "content-length": stat.size, "cache-control": cache });
  fs.createReadStream(target).pipe(res);
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) {
    return cf.trim();
  }
  return req.socket?.remoteAddress ?? null;
}

export function createService(config, { log = console, layout: layoutOverride, inputReset: inputResetOverride } = {}) {
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
  // Same desktop as the layout: clear input V's computer use left pressed before a person takes over.
  const inputReset = inputResetOverride ?? (config.layout?.enabled ? createInputReset({ display: config.layout.display, log }) : null);
  // The phone layout exists only while the viewer that asked for it is still the controller.
  // Every control change is audited, so checking here (and on the timer) covers release,
  // hand-back, idle demotion, disconnect, takeover and the end of the handoff.
  function syncLayout() {
    const owner = layout?.state.owner;
    if (owner && registry.controllerSecret !== owner) {
      return layout.restore("controller-changed").catch((error) => log.error?.(`layout restore failed: ${error.message}`));
    }
    return Promise.resolve();
  }
  /** Answers only once the desktop is back to its own size, so V resumes on the screen it knows. */
  const layoutSettled = () => syncLayout();
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
  const snapshots = new SnapshotStore({ ttlMs: config.snapshotTtlMs });
  const snapshotUrlFor = (token, extension) => `${config.publicBaseUrl.replace(/\/+$/u, "")}${prefix}/snapshot/${token}.${extension}`;

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
      } else if (req.method === "GET" && /^\/snapshot\/[\w-]{32}\.(?:jpg|png)$/u.test(route)) {
        const entry = snapshots.get(route.slice("/snapshot/".length).replace(/\.\w+$/u, ""));
        if (!entry) {
          res.writeHead(404, { "cache-control": "no-store" });
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": entry.type,
          "content-length": entry.bytes.length,
          "cache-control": `private, max-age=${Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000))}`,
          "x-content-type-options": "nosniff",
        });
        res.end(entry.bytes);
      } else if (req.method === "GET" && route.startsWith("/novnc/")) {
        serveStatic(res, config.novncDir, route.slice("/novnc/".length));
      } else if (req.method === "GET" && /^\/[\w.-]+\.(?:js|css|svg|png|ico)$/u.test(route)) {
        serveStatic(res, PUBLIC_DIR, route.slice(1), { immutable: url.searchParams.has("v") });
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
        json(res, 200, { ...result, title: config.title, subject: config.subject ?? "V 的电脑", wsPath: `${prefix}/ws` });
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
        if (body.take && registry.viewers.get(secret)?.canControl) {
          await inputReset?.releaseStuck();
        }
        const result = body.take ? registry.takeControl(secret) : body.handBack ? registry.handBackFromPage(secret) : registry.releaseControl(secret);
        await layoutSettled();
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
    const snapshotMatch = url.pathname.match(/^\/v1\/handoffs\/([\w-]+)\/snapshot$/u);
    const wakeMatch = url.pathname.match(/^\/v1\/handoffs\/([\w-]+)\/wake$/u);
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
          origin: body.origin,
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
      } else if (req.method === "PUT" && snapshotMatch) {
        // A chat card's desktop picture (raw JPEG/PNG body), served publicly under a fresh token.
        if (!registry.handoffs.has(snapshotMatch[1])) {
          json(res, 404, { error: "not_found" });
          return;
        }
        const stored = snapshots.put(snapshotMatch[1], await readRawBody(req, snapshots.maxBytes + 1));
        registry.audit("snapshot_stored", { id: snapshotMatch[1], type: stored.type });
        json(res, 201, { url: snapshotUrlFor(stored.token, stored.extension), type: stored.type, expiresAt: stored.expiresAt });
      } else if (req.method === "POST" && wakeMatch) {
        const body = await readJsonBody(req);
        json(res, 200, registry.claimWake(wakeMatch[1], typeof body.origin === "string" ? body.origin : null));
      } else if (req.method === "POST" && handBackMatch) {
        const result = registry.handBack(handBackMatch[1]);
        await layoutSettled();
        json(res, result ? 200 : 404, result ?? { error: "not_found" });
      } else if (req.method === "DELETE" && match) {
        const revoked = registry.revoke(match[1], "revoked_by_agent");
        await layoutSettled();
        json(res, revoked ? 200 : 404, { ok: true });
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
    snapshots,
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
