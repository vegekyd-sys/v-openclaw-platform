// v-antigravity: the Antigravity CLI (agy) as an OpenClaw CLI harness, the way
// Claude Code is one (see backend.js for the mapping).
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildAntigravityCliBackend } from "./backend.js";

export default definePluginEntry({
  id: "v-antigravity",
  name: "V Antigravity CLI",
  description: "Runs agent turns on the Antigravity CLI with V's system prompt and OpenClaw's tools over MCP.",
  register(api) {
    api.registerCliBackend(buildAntigravityCliBackend(api.pluginConfig ?? {}));
  },
});
