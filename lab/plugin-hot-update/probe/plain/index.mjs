import { LIB_VERSION } from "./lib.mjs";
const INDEX_VERSION = "v1";
const loadedAt = Date.now();
export default {
  id: "hotprobe-plain",
  name: "Hot reload probe (plain)",
  description: "Test-only: reports the code version it was loaded with.",
  register(api) {
    const registeredAt = Date.now();
    api.registerGatewayMethod("hotprobe.plain.version", async ({ respond }) => {
      respond(true, { index: INDEX_VERSION, lib: LIB_VERSION, rev: api.pluginConfig?.rev ?? null, loadedAt, registeredAt });
    }, { scope: "operator.read" });
  },
};
