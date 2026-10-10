// Loads apps/v-browser-fill's native bindings against the candidate runtime and reports
// what resolves (no model, no browser launch). Diagnostic for browser-fill-secret.mjs.
import path from "node:path";
import fs from "node:fs";
const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw", "dist");
const { nativeDeps, loadNative } = await import(path.resolve("apps/v-browser-fill/plugin/core/native.js"));
const out = {};
for (const [label, pattern, names] of [
  ["store", /^secret-store-[\w-]+\.js$/u, ["listSecretStoreEntries", "readSecretStoreValue"]],
  ["stateDb", /^openclaw-state-db-[\w-]+\.js$/u, ["openOpenClawStateDatabase", "runOpenClawStateWriteTransaction"]],
]) {
  try { await loadNative(dist, pattern, names); out[label] = "ok"; } catch (e) { out[label] = String(e.message); out[`${label}Candidates`] = fs.readdirSync(dist).filter((n) => pattern.test(n)); }
}
try { const d = await nativeDeps(dist); out.deps = Object.keys(d); out.entryMissing = d.entry("NO_SUCH_ENTRY_X"); } catch (e) { out.depsError = String(e.stack).slice(0, 1500); }
console.log(JSON.stringify(out, null, 1));
