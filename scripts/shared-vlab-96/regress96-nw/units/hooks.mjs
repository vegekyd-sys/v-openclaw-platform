// Registers loader.mjs (async load hook). module.register rather than
// registerHooks: registerHooks crashed on Node 24 with these chunks.
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
globalThis.__regress96HooksRegistered = true;
