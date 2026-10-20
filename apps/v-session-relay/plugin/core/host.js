// Plugin wiring (design §3.10 index.js, amended by §13.1–§13.2). One host per process, kept on
// globalThis so the three register() calls of one Gateway (probe F-b), or a re-evaluated module,
// share one engine, one ledger LOCK, one event subscription and one poll guard.
//
//   Gateway process: 5 vrelay.* methods, the before_tool_call poll guard, and a service that
//                    opens the ledger, starts the engine, follows lifecycle events, publishes
//                    task rows and runs restart recovery in the background.
//   Worker child (VLAB_WORKER_CHILD=1): nothing, or only the guard when config.workerGuard.

import path from "node:path";

import { METHODS, METHOD_SCOPES, isWorkerChildProcess, resolvePluginConfig } from "./contracts.js";
import { Engine } from "./engine.js";
import { createPollGuard } from "./guard.js";
import { Ledger, LedgerLockedError } from "./ledger.js";
import { recover } from "./recovery.js";
import { createRoutes } from "./routes.js";
import { createTaskSource } from "./tasks.js";
import { createAgentTransport } from "./transports/agent.js";
import { createBridgeTransport } from "./transports/bridge.js";

export const HOST_KEY = Symbol.for("openclaw.v.sessionRelay.host");
export const SERVICE_ID = "v-session-relay";

const bad = (respond, message) => respond(false, undefined, { code: "INVALID_REQUEST", message });

export function ledgerDirFor(config, stateDir, env = process.env) {
  if (config.ledgerDir) return config.ledgerDir;
  const base = stateDir || env.OPENCLAW_STATE_DIR;
  if (!base) throw new Error("v-session-relay: no ledgerDir and no state dir");
  return path.join(base, "v-session-relay", "v2");
}

export class Host {
  constructor({ sdk = {}, env = process.env, timing, recoverOnStart = true } = {}) {
    this.sdk = sdk;
    this.env = env;
    this.timing = timing;
    this.recoverOnStart = recoverOnStart;
    this.engine = null;
    this.ledger = null;
    this.tasks = null;
    this.starting = null;
    this.refs = 0;
    this.unsubscribe = null;
    this.guard = createPollGuard();
    this.registrations = 0;
    this.recovery = null;
    this.logger = undefined;
  }

  get inWorker() { return isWorkerChildProcess(this.env); }

  /** Called from the plugin entry's register(api); safe to call any number of times. */
  register(api) {
    this.registrations += 1;
    const config = resolvePluginConfig(api?.pluginConfig ?? {});
    this.logger ??= api?.logger;
    if (this.inWorker) {
      if (config.workerGuard) api.on?.("before_tool_call", this.guard, { priority: 50, timeoutMs: 2_000 });
      return { role: "worker", guard: config.workerGuard };
    }
    api.on?.("before_tool_call", this.guard, { priority: 50, timeoutMs: 2_000 });
    if (typeof api.registerGatewayMethod === "function") {
      for (const method of Object.values(METHODS)) {
        api.registerGatewayMethod(method, (opts) => this.handle(method, opts), { scope: METHOD_SCOPES[method] });
      }
    }
    api.registerService?.({
      id: SERVICE_ID,
      start: (ctx) => this.start(ctx, api),
      stop: () => this.stop(),
    });
    return { role: "gateway" };
  }

  /** Gateway method dispatch. Returns the result (the host's adapter responds with it). */
  async handle(method, { params, respond } = {}) {
    const p = params && typeof params === "object" ? params : {};
    const engine = this.engine;
    switch (method) {
      case METHODS.send:
        if (!engine) return { status: "fallback", reason: "disabled" };
        return engine.send(p);
      case METHODS.wait:
        if (typeof p.sendId !== "string" || !p.sendId) return bad(respond, "sendId required");
        if (!engine) return { status: "expired", code: null, note: "" };
        return engine.wait({ sendId: p.sendId, timeoutMs: Number(p.timeoutMs) });
      case METHODS.get:
        if (!engine) return { found: false };
        return engine.get({ sendId: p.sendId, code: p.code });
      case METHODS.list:
        if (!engine) return { items: [], counts: { running: 0, queued: 0, awaiting: 0 } };
        return engine.list({ sessionKey: p.sessionKey, active: p.active === true, limit: Number.isSafeInteger(p.limit) ? p.limit : undefined });
      case METHODS.cancel:
        if (typeof p.sendId !== "string" || !p.sendId) return bad(respond, "sendId required");
        if (!engine) return { ok: false, error: "engine not running" };
        return engine.cancel({ sendId: p.sendId, reason: p.reason });
      default:
        return bad(respond, `unknown method ${method}`);
    }
  }

  async start(ctx = {}, api = {}) {
    this.refs += 1;
    if (this.engine || this.starting) return this.starting;
    this.starting = this.#start(ctx, api).finally(() => { this.starting = null; });
    return this.starting;
  }

  async #start(ctx, api) {
    const logger = ctx.logger ?? api.logger ?? this.logger;
    const config = resolvePluginConfig(api.pluginConfig ?? {});
    const getConfig = () => ctx.config ?? api.config ?? {};
    let ledger;
    try {
      ledger = await Ledger.open(ledgerDirFor(config, ctx.stateDir, this.env), { logger });
    } catch (err) {
      if (err instanceof LedgerLockedError) logger?.error?.(`v-session-relay: not starting: ${err.message}`);
      else logger?.error?.(`v-session-relay: ledger failed to open: ${err?.stack ?? err}`);
      return null;
    }
    const runtime = api.runtime ?? {};
    const bridge = createBridgeTransport({ logger });
    const routes = createRoutes({
      getSessionEntry: typeof runtime.agent?.session?.getSessionEntry === "function" ? (p) => runtime.agent.session.getSessionEntry(p) : undefined,
      getConfig, bridges: bridge.bridges, ownerName: config.ownerName, agentNames: config.agentNames, logger,
    });
    const callGateway = (method, params, { scopes, timeoutMs } = {}) => {
      if (typeof this.sdk.callGatewayFromCli !== "function") throw new Error("callGatewayFromCli unavailable");
      return this.sdk.callGatewayFromCli(method, { config: getConfig() }, params, { scopes, progress: false, timeoutMs });
    };
    const agent = createAgentTransport({
      callGateway,
      loadOutboundAdapter: typeof runtime.channel?.outbound?.loadAdapter === "function" ? (ch) => runtime.channel.outbound.loadAdapter(ch) : undefined,
      getConfig, logger, runTimeoutMs: config.limits.runTimeoutMs,
    });
    const tasks = createTaskSource({ ledger, logger });
    const engine = new Engine({
      ledger, config, routes, bridge, agent, logger, timing: this.timing, env: this.env,
      sdk: { resolveActiveEmbeddedRunSessionId: this.sdk.resolveActiveEmbeddedRunSessionId },
      runtime: { getSessionMessages: typeof runtime.subagent?.getSessionMessages === "function" ? (p) => runtime.subagent.getSessionMessages(p) : undefined },
      onSendChange: (rec) => tasks.changed(rec),
    });
    engine.start();
    tasks.install();
    if (typeof this.sdk.onAgentEvent === "function") this.unsubscribe = this.sdk.onAgentEvent((evt) => engine.onAgentEvent(evt));
    this.ledger = ledger;
    this.tasks = tasks;
    this.engine = engine;
    logger?.info?.(`v-session-relay 2.0 started (ledger ${ledger.dir})`);
    if (this.recoverOnStart) {
      this.recovery = recover(engine).catch((err) => logger?.error?.(`v-session-relay: recovery failed: ${err?.stack ?? err}`));
    }
    return engine;
  }

  async stop() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs > 0) return;
    if (this.starting) await this.starting;
    const engine = this.engine;
    if (!engine) return;
    this.engine = null;
    try { this.unsubscribe?.(); } catch { /* ignore */ }
    this.unsubscribe = null;
    this.tasks?.uninstall();
    await engine.stop();
    await this.ledger?.close();
    this.ledger = null;
  }
}

/** The process-wide host (created on first use). */
export function getHost(options) {
  globalThis[HOST_KEY] ??= new Host(options);
  return globalThis[HOST_KEY];
}
