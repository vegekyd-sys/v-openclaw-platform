#!/usr/bin/env node
// /vds (Codex harness + DeepSeek) on OpenClaw 2026.9.1 (V): give the DeepSeek app-server
// DeepSeek's real context window instead of Codex's 272,000-token fallback.
//
//   node patch-codex-ds-window.mjs --codex <.../node_modules/@openclaw/codex> [--check]
//
// Why (README.md): Codex does not know deepseek-flash and uses fallback metadata: window
// 272,000, usable 258,400, auto-compaction at 244,800. Every new /vds thread whose replay is
// larger than that compacts on its first request, and long threads compact every few turns.
// The window can only be raised through a model catalog (model_context_window is clamped to
// the catalog's max_context_window), and the app-server reads the catalog once per process.
// DeepSeek threads already run in their own app-server process (API-key auth, not the ChatGPT
// login), so the DeepSeek start options get two extra launch arguments:
//
//   -c model_catalog_json=<dist>/v-deepseek-model-catalog.json      window 1,000,000
//   -c instructions=<text of dist/v-deepseek-base-instructions.md>
//
// The second keeps the base prompt byte-identical: with any catalog configured Codex no longer
// removes the update_plan guidance, and a resumed thread would reuse the unstripped prompt
// stored in its session_meta. It is passed as text, not model_instructions_file: Codex trims a
// file's contents, and the prompt DeepSeek receives today ends in two newlines. GPT app-servers and bounded/private Codex turns are unchanged.
// With compaction moved from 244,800 to 900,000 tokens, images stay in a DeepSeek thread far
// longer, and DeepSeek refuses request bodies over 48 MiB (413). A DeepSeek thread whose rollout
// reaches 40 MiB (OPENCLAW_V_CODEX_DS_MAX_TRANSCRIPT_BYTES) therefore starts a fresh thread before
// the turn, through the existing native-transcript byte guard; compaction.maxActiveTranscriptBytes,
// when configured, still wins. Text-only rollouts on V are about 3 MB at 45万 tokens.
// OPENCLAW_V_CODEX_DS_WINDOW=0 in the Gateway environment turns both off.
//
// Idempotent: a replacement that is already present is left alone; otherwise its anchor must
// match exactly once. Copies the two sidecar files from ./dist next to the patched module.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const checkOnly = args.includes("--check");
assert(codexRoot, "usage: patch-codex-ds-window.mjs --codex <@openclaw/codex dir> [--check]");
const MARK = "v-codex-ds-window-v2";
const here = path.dirname(new URL(import.meta.url).pathname);
const SIDECARS = ["v-deepseek-model-catalog.json", "v-deepseek-base-instructions.md"];

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const codexDist = path.join(codexRoot, "dist");

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const runAttempt = moduleIn(codexDist, /^run-attempt-.*\.js$/u, "const resolveFinalAppServer = (configured, selection) => {");
const PATCHES = [
  ["\tconst maxBytes = parseCodexAppServerByteLimit(readCompactionConfig(params.config)?.maxActiveTranscriptBytes);\n",
    `\tconst maxBytes = parseCodexAppServerByteLimit(readCompactionConfig(params.config)?.maxActiveTranscriptBytes) ?? resolveCodexDeepSeekTranscriptByteLimit(binding); // ${MARK}\n`],
  ['import fs from "node:fs/promises";\n',
    'import fs from "node:fs/promises";\n'
    + `import { existsSync as existsSyncDeepSeekWindow, readFileSync as readFileSyncDeepSeekWindow } from "node:fs"; // ${MARK}\n`
    + `import { fileURLToPath as fileURLToPathDeepSeekWindow } from "node:url"; // ${MARK}\n`],
  ["\t\treturn {\n\t\t\tsession,\n\t\t\tappServer: withPreparedProcessEnv(trusted)\n\t\t};\n\t};\n",
    "\t\treturn {\n\t\t\tsession,\n\t\t\tappServer: withPreparedProcessEnv(withCodexDeepSeekModelWindow(trusted, selection))\n\t\t};\n\t};\n"],
  ["//#region extensions/codex/src/app-server/run-attempt-client-prewarm.ts\n",
    `// ${MARK}: DeepSeek app-servers start with DeepSeek's context window (patch-codex-ds-window.mjs).\n`
    + "const CODEX_DEEPSEEK_WINDOW_FILES = [\"v-deepseek-model-catalog.json\", \"v-deepseek-base-instructions.md\"].map((name) => fileURLToPathDeepSeekWindow(new URL(`./${name}`, import.meta.url)));\n"
    + "let codexDeepSeekWindowLogged = false;\n"
    + "let codexDeepSeekBaseInstructions;\n"
    + "function resolveCodexDeepSeekTranscriptByteLimit(binding) {\n"
    + "\tif (process.env.OPENCLAW_V_CODEX_DS_WINDOW === \"0\") return;\n"
    + "\tconst deepSeek = String(binding?.modelProvider ?? \"\").trim().toLowerCase() === \"deepseek\" || /deepseek/iu.test(String(binding?.model ?? \"\"));\n"
    + "\treturn deepSeek ? parseCodexAppServerByteLimit(process.env.OPENCLAW_V_CODEX_DS_MAX_TRANSCRIPT_BYTES ?? \"40mb\") : void 0;\n"
    + "}\n"
    + "function withCodexDeepSeekModelWindow(appServer, selection) {\n"
    + "\tconst provider = String(selection?.modelProvider ?? \"\").trim().toLowerCase();\n"
    + "\tconst deepSeek = provider === \"deepseek\" || !provider && /^deepseek/iu.test(String(selection?.model ?? \"\"));\n"
    + "\tif (!deepSeek || process.env.OPENCLAW_V_CODEX_DS_WINDOW === \"0\" || appServer.start.transport !== \"stdio\") return appServer;\n"
    + "\tconst [catalog, instructions] = CODEX_DEEPSEEK_WINDOW_FILES;\n"
    + "\tif (!CODEX_DEEPSEEK_WINDOW_FILES.every((file) => existsSyncDeepSeekWindow(file))) {\n"
    + "\t\tif (!codexDeepSeekWindowLogged) embeddedAgentLog.warn(\"codex app-server DeepSeek window files missing; using Codex fallback metadata\", { catalog, instructions });\n"
    + "\t\tcodexDeepSeekWindowLogged = true;\n"
    + "\t\treturn appServer;\n"
    + "\t}\n"
    + "\tif (!codexDeepSeekWindowLogged) embeddedAgentLog.info(\"codex app-server DeepSeek threads use the DeepSeek model catalog\", { catalog });\n"
    + "\tcodexDeepSeekWindowLogged = true;\n"
    + "\treturn {\n"
    + "\t\t...appServer,\n"
    + "\t\tstart: {\n"
    + "\t\t\t...appServer.start,\n"
    + "\t\t\targs: [\n"
    + "\t\t\t\t...appServer.start.args ?? [],\n"
    + "\t\t\t\t\"-c\",\n"
    + "\t\t\t\t`model_catalog_json=${JSON.stringify(catalog)}`,\n"
    + "\t\t\t\t\"-c\",\n"
    + "\t\t\t\t`instructions=${JSON.stringify(codexDeepSeekBaseInstructions ??= readFileSyncDeepSeekWindow(instructions, \"utf8\"))}`\n"
    + "\t\t\t]\n"
    + "\t\t}\n"
    + "\t};\n"
    + "}\n"
    + "//#endregion\n"
    + "//#region extensions/codex/src/app-server/run-attempt-client-prewarm.ts\n"],
];

let src = fs.readFileSync(runAttempt, "utf8");
// v1 (PR #361, never deployed) had no byte guard; patch V's bytes, not a v1 file.
assert(!src.includes("v-codex-ds-window-v1"), `${path.basename(runAttempt)} carries the v1 patch; start from the unpatched module`);
let changed = 0;
for (const [anchor, replacement] of PATCHES) {
  if (src.includes(replacement)) continue;
  assert.equal(src.split(anchor).length, 2, `anchor must match once in ${path.basename(runAttempt)}: ${JSON.stringify(anchor.slice(0, 80))}`);
  src = src.replace(anchor, replacement);
  changed += 1;
}
const sidecarsCurrent = SIDECARS.every((name) => fs.existsSync(path.join(codexDist, name))
  && fs.readFileSync(path.join(codexDist, name)).equals(fs.readFileSync(path.join(here, "dist", name))));
if (checkOnly) {
  console.log(JSON.stringify({ file: path.basename(runAttempt), pending: changed, sidecarsCurrent }));
  process.exit(changed === 0 && sidecarsCurrent ? 0 : 1);
}
if (changed) fs.writeFileSync(runAttempt, src);
for (const name of SIDECARS) fs.copyFileSync(path.join(here, "dist", name), path.join(codexDist, name));
console.log(JSON.stringify({ file: path.basename(runAttempt), applied: changed, sidecars: SIDECARS }));
