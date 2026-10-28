// Bridge transport (design §2.a, §3.10): the channel inbound bridges the dist patches register
// in `globalThis[BRIDGES]`. A bridge posts the visible anchors and starts the synthetic inbound
// turn that gets the channel's full card experience.

import { getBridgeRegistry, validateBridge } from "../contracts.js";

export function createBridgeTransport({ registry = getBridgeRegistry(), logger } = {}) {
  const warned = new Set();

  function get(key) {
    const bridge = key ? registry.bridges.get(key) : undefined;
    if (!bridge) return undefined;
    const check = validateBridge(bridge);
    if (!check.ok) {
      if (!warned.has(key)) {
        warned.add(key);
        logger?.warn?.(`v-session-relay: bridge ${key} is invalid (${check.errors.join("; ")}); using the agent transport`);
      }
      return undefined;
    }
    return bridge;
  }

  /** Resolves the bridge for `key` once registered, or null after `timeoutMs`. */
  function waitFor(key, timeoutMs) {
    const now = get(key);
    if (now || !key) return Promise.resolve(now ?? null);
    return new Promise((resolve) => {
      let timer;
      const listener = (k, b) => {
        if (k !== key || !b) return;
        const ok = get(key);
        if (!ok) return;
        clearTimeout(timer);
        registry.listeners.delete(listener);
        resolve(ok);
      };
      registry.listeners.add(listener);
      timer = setTimeout(() => { registry.listeners.delete(listener); resolve(null); }, Math.max(0, timeoutMs));
      timer.unref?.();
    });
  }

  function need(key) {
    const bridge = get(key);
    if (!bridge) {
      const err = new Error(`bridge ${key} is not registered`);
      err.code = "NO_BRIDGE";
      throw err;
    }
    return bridge;
  }

  return {
    kind: "bridge",
    registry,
    get,
    waitFor,
    /** A map-like view for routes.js. */
    bridges: { get },
    caps: (key) => get(key)?.caps,
    post: (key, p) => need(key).post(p),
    async edit(key, p) {
      const bridge = get(key);
      if (!bridge?.caps?.editPost || typeof bridge.edit !== "function") return false;
      try { await bridge.edit(p); return true; } catch (err) {
        logger?.warn?.(`v-session-relay: ${key} edit failed: ${err?.message ?? err}`);
        return false;
      }
    },
    start: (key, req) => need(key).start(req),
  };
}
