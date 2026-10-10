// Native OpenClaw functions this plugin calls in its own process: the browser control
// dispatcher the `browser` tool uses for the local host, and the secret store. The tool
// runs in a Worker for Worker turns and in the Gateway for Codex / claude-cli turns, so
// nothing here may assume which process it is in.
//
// Hashed dist modules are found by their semantic export names, never by minifier
// letters or file hashes (the way production-worker/runtime-path.mjs does it).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The OpenClaw dist directory of the running process. */
export function resolveOpenClawDist({ configured, env = process.env, argv = process.argv, exists = fs.existsSync } = {}) {
  const candidates = [];
  if (configured) candidates.push(configured);
  // Worker processes run production-worker/worker.mjs and point at the Agent runtime.
  if (env.VLAB_OPENCLAW_AGENT_RUNTIME) candidates.push(path.dirname(path.dirname(env.VLAB_OPENCLAW_AGENT_RUNTIME)));
  // The Gateway runs <core>/dist/index.js.
  const entry = argv[1] ?? "";
  const marker = `${path.sep}dist${path.sep}`;
  if (entry.includes(marker)) candidates.push(entry.slice(0, entry.lastIndexOf(marker) + marker.length - 1));
  const found = candidates.find((dir) => exists(path.join(dir, "local-dispatch.runtime.js")));
  if (!found) throw new Error("OpenClaw dist not found; set plugins.entries.v-browser-fill.config.openclawDist");
  return found;
}

export function exportBindings(source, names) {
  const exported = [...source.matchAll(/export\s*\{([^}]+)\}\s*;?/gsu)]
    .flatMap((m) => m[1].split(","))
    .map((v) => /^\s*([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/u.exec(v))
    .filter(Boolean);
  return Object.fromEntries(names.map((name) => {
    const hits = exported.filter((e) => e[1] === name);
    if (hits.length !== 1) throw new Error(`export ${name} must resolve exactly once`);
    return [name, hits[0][2] ?? name];
  }));
}

/**
 * Imports the single dist module matching `pattern` that defines and exports every name.
 * Re-export facades (`export { x as y } from "./real.js"`) also list the names, so the
 * module that defines the functions is the one taken.
 */
export async function loadNative(dist, pattern, names, { readDir = fs.readdirSync, readFile = (f) => fs.readFileSync(f, "utf8"), importer = (f) => import(pathToFileURL(f).href) } = {}) {
  const matches = readDir(dist).filter((n) => pattern.test(n)).flatMap((n) => {
    try {
      const source = readFile(path.join(dist, n));
      if (!names.every((name) => new RegExp(`function\\s+${name}\\s*\\(`, "u").test(source))) return [];
      return [{ file: path.join(dist, n), bindings: exportBindings(source, names) }];
    } catch { return []; }
  });
  if (matches.length !== 1) throw new Error(`native ${names.join("/")} must resolve to one module; found ${matches.length}`);
  const mod = await importer(matches[0].file);
  return Object.fromEntries(names.map((n) => {
    const fn = mod[matches[0].bindings[n]];
    if (typeof fn !== "function") throw new Error(`native ${n} is not a function`);
    return [n, fn];
  }));
}

function stateDir(env = process.env) {
  return env.OPENCLAW_STATE_DIR?.trim() || path.join(env.OPENCLAW_HOME?.trim() || os.homedir(), ".openclaw");
}

/** The deps of fillSecret, bound to the native modules of `dist`. */
export async function nativeDeps(dist) {
  const { dispatchBrowserControlRequest } = await import(pathToFileURL(path.join(dist, "local-dispatch.runtime.js")).href);
  if (typeof dispatchBrowserControlRequest !== "function") throw new Error("native browser dispatcher unavailable");
  const store = await loadNative(dist, /^secret-store-[\w-]+\.js$/u, ["listSecretStoreEntries", "readSecretStoreValue"]);
  const stateDb = await loadNative(dist, /^openclaw-state-db-[\w-]+\.js$/u, ["openOpenClawStateDatabase", "runOpenClawStateWriteTransaction"]);
  const unwrap = (result, name) => {
    if (result && result.ok === false) {
      if (result.error?.code === "SECRET_STORE_NOT_FOUND") return null;
      throw new Error(`secret store: ${result.error?.code ?? "error"} for ${name}`);
    }
    return result && "value" in result ? result.value : result;
  };
  return {
    dispatch: (req) => dispatchBrowserControlRequest(req),
    entry(name) {
      const list = unwrap(store.listSecretStoreEntries({}), name) ?? [];
      const row = (Array.isArray(list) ? list : list.entries ?? []).find((e) => e?.name === name);
      return row ? { kind: row.kind, allowedHosts: row.allowedHosts ?? [] } : null;
    },
    readValue(name) {
      const value = unwrap(store.readSecretStoreValue({ name }), name);
      if (typeof value !== "string" || !value) throw new Error(`secret store: ${name} has no value`);
      return value;
    },
    // A hard delete: the native delete only marks the row and keeps the value for 30
    // days. Runs in the native state write transaction (V's writer admission applies).
    remove(name) {
      const state = stateDb.openOpenClawStateDatabase();
      stateDb.runOpenClawStateWriteTransaction(({ db }) => {
        db.prepare("DELETE FROM secret_store_entries WHERE scope_kind = 'team' AND scope_id = '' AND name = ?").run(name);
      }, { database: state }, { operationLabel: "v.browser-fill.remove" });
      // V mirrors stored secrets to <state>/secrets/store/<NAME> (patch-openclaw91-secret-entry).
      fs.rmSync(path.join(stateDir(), "secrets", "store", name), { force: true });
    },
  };
}
