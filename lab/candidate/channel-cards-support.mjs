// Candidate support for the link-card scenarios on DingTalk and WeCom
// (`secret-link`, `handoff-card`): the services behind the links, next to a
// private Gateway.
//
//   secret-link   apps/v-secret-entry as its own process (the Gateway calls it
//                 through V_SECRET_ENTRY_ADMIN_URL), plus V's core secret-entry
//                 patch widened to the link channels, as on V.
//   handoff-card  apps/v-desktop-handoff/service in this process (no desktop:
//                 links are issued and claimed, nobody connects a viewer) and
//                 this branch's handoff plugin loaded by the Gateway.
//
// Plans using this file must list in `support`: this file,
// lab/release-files/feishu-secret-entry/patch-openclaw91-secret-entry.mjs and
// the apps/v-secret-entry/ files (secret-link), and the
// apps/v-desktop-handoff/{plugin,service} files (handoff-card).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

/** V's secret-entry core patch widened to the link channels (the runtime already carries v1, as V does). */
export async function widenCoreSecretEntry(dist) {
  const core = await import(pathToFileURL(path.resolve("lab/release-files/feishu-secret-entry/patch-openclaw91-secret-entry.mjs")).href);
  const report = fs.readdirSync(dist).filter((f) => /^(builtin-openclaw|dispatch-from-config)-[\w-]+\.js$/u.test(f)).map((file) => {
    const p = path.join(dist, file);
    const source = fs.readFileSync(p, "utf8");
    const entry = { file, v1: source.includes(core.MARKER), secretsPrompt: source.includes('if (toolName === "secrets") {') };
    if (file.startsWith("builtin-openclaw") && entry.secretsPrompt) {
      const result = core.patchSecretEntryChannelsSource(source);
      if (result.changed) fs.writeFileSync(p, result.source);
      entry.channels = result.changed ? "applied" : "already";
    }
    return entry;
  });
  assert(report.some((e) => e.channels), `no builtin chunk with the secrets prompt: ${JSON.stringify(report)}`);
  return report;
}

/**
 * Starts apps/v-secret-entry; returns the env the Gateway needs and helpers.
 * `publicBaseUrl` is only what the links say; the test reaches the page on loopback.
 */
export async function startSecretEntry({ dir, dist, env, configPath, stateDir, publicBaseUrl }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const adminTokenFile = path.join(dir, "admin-token");
  fs.writeFileSync(adminTokenFile, `${crypto.randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  const [publicPort, adminPort] = [await freePort(), await freePort()];
  const config = {
    bind: "127.0.0.1", publicBind: "127.0.0.1", publicPort, adminPort,
    publicBaseUrl: publicBaseUrl ?? `http://127.0.0.1:${publicPort}`, pathPrefix: "/secret-entry",
    stateDir: path.join(dir, "state"), adminTokenFile, openclawDist: dist,
  };
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
  const lines = [];
  // The service calls the Gateway as its CLI does: same config, state and port.
  const child = spawn(process.execPath, [path.resolve("apps/v-secret-entry/server.mjs"), path.join(dir, "config.json")], {
    env: { ...env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir }, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [child.stdout, child.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push(line); });
  }
  const base = `http://127.0.0.1:${publicPort}/secret-entry`;
  const post = async (route, body) => {
    const r = await fetch(`${base}/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return {
    config, lines, process: child,
    gatewayEnv: { V_SECRET_ENTRY_ADMIN_URL: `http://127.0.0.1:${adminPort}`, V_SECRET_ENTRY_ADMIN_TOKEN_FILE: adminTokenFile },
    /** Opens the page and submits `value` with the link's token, like a person would; then tries the link again. */
    async use(token, value) {
      const page = await fetch(`${base}/`);
      const pageText = await page.text();
      const info = await post("info", { token });
      const submit = await post("submit", { token, value });
      return { pageStatus: page.status, pageHasPasswordInput: /type="password"/u.test(pageText), info: { status: info.status, name: info.body.name, reason: info.body.reason }, submit, reuse: async () => (await post("submit", { token, value: "second-use" })).status };
    },
    audit() {
      try { return fs.readFileSync(path.join(config.stateDir, "audit.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
    },
    stop: () => child.kill("SIGTERM"),
  };
}

/** The link token after `/secret-entry/#` or `/desktop-handoff/#` in a url (also inside a dingtalk:// wrapper). */
export function linkToken(url, prefix) {
  let target = String(url ?? "");
  if (target.startsWith("dingtalk://")) target = new URL(target).searchParams.get("url") ?? "";
  const m = new RegExp(`^https?://[^/]+${prefix}/#([\\w-]+)$`, "u").exec(target);
  return m ? { url: target, token: m[1] } : undefined;
}

/**
 * The real handoff service (admin + public API) without a desktop, and this
 * branch's handoff plugin wired into the private Gateway config. The tool runs
 * in a Worker, whose config the Gateway derives from this private config (as
 * on V), so `openclaw message send` there sees the fake channel, never VLab's.
 */
export async function startHandoff({ dir, config, runtime, dist, publicBaseUrl = "https://openclaw.example.test" }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const adminTokenFile = path.join(dir, "admin-token");
  fs.writeFileSync(adminTokenFile, `${crypto.randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  const { createService } = await import(pathToFileURL(path.resolve("apps/v-desktop-handoff/service/server.mjs")).href);
  const service = createService({
    bind: "127.0.0.1", publicPort: 0, adminPort: 0, publicBaseUrl, pathPrefix: "/desktop-handoff",
    novncDir: dir, stateDir: path.join(dir, "state"), adminTokenFile,
    vnc: { host: "127.0.0.1", port: 1, password: "candidate" }, limits: {},
  }, { log: { info() {}, warn() {}, error() {}, log() {} } });
  const ports = await service.listen();

  // This branch's plugin; typebox from the runtime, the SDK through the loader.
  const pluginDir = path.join(dir, "plugin");
  fs.cpSync(path.resolve("apps/v-desktop-handoff/plugin"), pluginDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}tests`) && !src.includes(`${path.sep}node_modules`) });
  fs.mkdirSync(path.join(pluginDir, "node_modules"), { recursive: true });
  fs.symlinkSync(path.join(runtime, "openclaw", "node_modules", "typebox"), path.join(pluginDir, "node_modules", "typebox"));
  config.plugins.load ??= {};
  config.plugins.load.paths = [...(config.plugins.load.paths ?? []).filter((p) => !/v-desktop-handoff/u.test(p)), pluginDir];
  if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("v-desktop-handoff")) config.plugins.allow.push("v-desktop-handoff");
  config.plugins.entries ??= {};
  // The card's picture: no desktop here (and VLab's own display must not leak into a test),
  // so the plugin uses its cover, a generated JPEG.
  const coverImage = path.join(dir, "cover.jpg");
  const made = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x3a6ea5:s=640x400", "-frames:v", "1", "-q:v", "6", coverImage], { timeout: 20_000 });
  if (made.status !== 0 || !fs.existsSync(coverImage)) fs.writeFileSync(coverImage, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(4000), Buffer.from([0xff, 0xd9])]));
  const cover = fs.readFileSync(coverImage);
  config.plugins.entries["v-desktop-handoff"] = {
    enabled: true,
    hooks: { allowConversationAccess: true },
    // As on V: control links in any conversation, posted in place.
    config: { adminUrl: `http://127.0.0.1:${ports.adminPort}`, adminTokenFile, controlAnywhere: true, sessionKeyActorFallback: true, openclawEntry: path.join(dist, "index.js"), blockBrowserWhileControlled: false, cardImage: "cover", coverImage },
  };
  const adminToken = fs.readFileSync(adminTokenFile, "utf8").trim();
  return {
    pluginDir, ports,
    cover: { bytes: cover.length, generatedBy: made.status === 0 ? "ffmpeg" : "fallback" },
    /** Claims a link on the public API, as opening the page does. */
    async claim(token) {
      const res = await fetch(`http://127.0.0.1:${ports.publicPort}/desktop-handoff/api/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      return res.status;
    },
    /** The handoff as the plugin sees it (admin API): ended, endReason, the recorded card state. */
    async status(id) {
      const res = await fetch(`http://127.0.0.1:${ports.adminPort}/v1/handoffs/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${adminToken}` } });
      return res.ok ? res.json() : null;
    },
    /** Fetches a card picture url (public base) over loopback, as WeCom's servers would. */
    async picture(url) {
      const local = String(url).replace(publicBaseUrl.replace(/\/+$/u, ""), `http://127.0.0.1:${ports.publicPort}`);
      const res = await fetch(local);
      const bytes = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type: res.headers.get("content-type"), bytes: bytes.length, sameAsCover: bytes.equals(cover) };
    },
    issued: () => (service.registry.exportHandoffs() ?? []).map((h) => ({ id: h.id, kind: h.kind, ownerId: h.ownerId, sessionKey: h.sessionKey, ended: Boolean(h.endedAt), endReason: h.endReason, cardState: h.card?.state ?? null, cardChannel: h.card?.channel ?? null })),
    close: () => Promise.race([service.close(), new Promise((resolve) => setTimeout(resolve, 2000))]),
  };
}
