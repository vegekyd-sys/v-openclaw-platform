// Gateway access through OpenClaw's own GatewayClient (from the running dist).
//
// Scopes are operator.read + operator.write, deliberately WITHOUT operator.admin:
// on 2026.9.1 an admin-scoped `sessions.patch {model}` may also persist the model
// as the agent's configured primary (sticky model selection, scope "effective").
// Without admin the selection stays on the session.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const CONTROLLER_SCOPES = ["operator.read", "operator.write"];

/** Find the dist directory the Gateway unit is actually running. */
export function detectGatewayDist(unit = "openclaw-gateway.service") {
  const pid = execFileSync("systemctl", ["show", unit, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
  if (!pid || pid === "0") throw new Error(`${unit} is not running`);
  const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
  const entry = argv.find((a) => a.endsWith("/dist/index.js"));
  if (!entry) throw new Error(`cannot find dist/index.js in ${unit} command line`);
  return path.dirname(entry);
}

export function resolveGatewayToken(config, env = process.env) {
  const raw = config.gateway?.auth?.token;
  if (!raw) throw new Error("gateway.auth.token is not set");
  return raw.replace(/\$\{([^}]+)\}/g, (_, name) => {
    if (!env[name]) throw new Error(`gateway token references unset env ${name}`);
    return env[name];
  });
}

export async function connectGateway({ dist, url, token, timeoutMs = 20_000, scopes = CONTROLLER_SCOPES }) {
  const { GatewayClient } = await import(path.join(dist, "plugin-sdk", "gateway-runtime.js"));
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client?.stop(); reject(new Error("Gateway connect timeout")); }, timeoutMs);
    client = new GatewayClient({
      url, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes,
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: (error) => { clearTimeout(timer); reject(error); },
    });
    client.start();
  });
  return {
    call: (method, params = {}, callTimeoutMs = 30_000) => client.request(method, params, { timeoutMs: callTimeoutMs }),
    stop: () => client.stop(),
  };
}

/** Bounded session listing: recently active rows of one agent, no message bodies. */
export async function listSessions(gw, { agentId, activeMinutes, limit }) {
  const result = await gw.call("sessions.list", { agentId, activeMinutes, limit, includeLastMessage: false, includeDerivedTitles: false });
  return { rows: result.sessions ?? [], defaults: result.defaults ?? {} };
}

/**
 * Switch one session's model. `model: null` clears the override (back to the agent
 * default). Returns the model ref the Gateway reports afterwards.
 */
export async function patchSessionModel(gw, { key, model }) {
  const result = await gw.call("sessions.patch", { key, model });
  const entry = result?.entry ?? {};
  const resolved = result?.resolved ?? {};
  const provider = resolved.modelProvider ?? entry.modelProvider ?? entry.providerOverride;
  const id = resolved.model ?? entry.model ?? entry.modelOverride;
  return { ok: result?.ok !== false, modelRef: provider && id ? `${provider}/${id}` : id ?? null, overrideSource: entry.modelOverrideSource ?? null };
}
