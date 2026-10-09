// A stable shim: registrations never change; the implementation lives in
// releases/<release>/impl.mjs. A new path is a new ES module instance, so a
// new release directory always runs new code.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const shimLoadedAt = Date.now();
const loadImpl = (release) => import(pathToFileURL(path.join(root, "releases", release, "impl.mjs")).href)
  .then((module) => ({ release, module, at: Date.now() }));
export default {
  id: "hotprobe-shim",
  name: "Hot reload probe (shim)",
  description: "Test-only shim.",
  register(api) {
    let current = loadImpl(api.pluginConfig?.release ?? "r1");
    api.registerGatewayMethod("hotprobe.shim.version", async ({ respond }) => {
      const impl = await current;
      respond(true, { shimLoadedAt, release: impl.release, impl: impl.module.version(), swappedAt: impl.at });
    }, { scope: "operator.read" });
    // In-place swap: no plugin reload, no channel or service restart.
    api.registerGatewayMethod("hotprobe.shim.hotswap", async ({ params, respond }) => {
      try {
        const next = await loadImpl(String(params?.release));
        current = Promise.resolve(next);
        respond(true, { release: next.release, impl: next.module.version() });
      } catch (error) { respond(false, undefined, { code: "INVALID_REQUEST", message: String(error?.message ?? error) }); }
    }, { scope: "operator.write" });
  },
};
