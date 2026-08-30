#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));

const distDir = args.get("--dist") ? resolve(args.get("--dist")) : null;
const rootDir = args.get("--root") ? resolve(args.get("--root")) : null;
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");
const allowMissing = args.has("--allow-missing");

if (Boolean(distDir) === Boolean(rootDir)) {
  throw new Error("Specify exactly one of --dist=/path/to/dist or --root=/path/to/npm/projects");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findBundles() {
  const distDirs = [];
  if (distDir) {
    distDirs.push(distDir);
  } else if (existsSync(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(rootDir, entry.name, "node_modules", "@openclaw", "feishu", "dist");
      if (existsSync(candidate)) distDirs.push(candidate);
    }
  }

  return distDirs.flatMap((candidateDist) => readdirSync(candidateDist)
    .filter((name) => /^monitor\.account-.*\.js$/.test(name))
    .map((name) => join(candidateDist, name)));
}

const bundles = findBundles();
if (bundles.length === 0 && allowMissing) {
  process.stdout.write(JSON.stringify({ changed: false, status: "plugin-not-installed" }) + "\n");
  process.exit(0);
}
if (bundles.length !== 1) {
  throw new Error(`Expected exactly one Feishu monitor bundle, found ${bundles.length}`);
}

const file = bundles[0];
const source = readFileSync(file, "utf8");
const patchedMarkers = [
  "const FEISHU_RUNTIME_FOOTER_V1 = true",
  "function resolveConfiguredCardRuntime(cfg, agentId, prefixCtx)",
  "parts.push(`Runtime: ${prefixCtx.agentRuntime}`)",
  "prefixContext.prefixContext.agentRuntime = resolveConfiguredCardRuntime(cfg, agentId, prefixContext.prefixContext)",
];

if (patchedMarkers.every((marker) => source.includes(marker))) {
  process.stdout.write(JSON.stringify({
    changed: false,
    file,
    sha256: sha256(source),
    status: "already-patched",
  }) + "\n");
  process.exit(0);
}

const footerBefore = `/** Build a card note footer from agent identity and model context. */
function resolveCardNote(agentId, identity, prefixCtx) {
\tconst parts = [\`Agent: \${identity?.name?.trim() || agentId}\`];
\tif (prefixCtx.model) parts.push(\`Model: \${prefixCtx.model}\`);
\tif (prefixCtx.provider) parts.push(\`Provider: \${prefixCtx.provider}\`);
\treturn parts.join(" | ");
}`;

const footerAfter = `const FEISHU_RUNTIME_FOOTER_V1 = true;
function normalizeCardRuntimeId(value) {
\tconst normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
\treturn normalized || void 0;
}
function resolveConfiguredCardRuntime(cfg, agentId, prefixCtx) {
\tconst modelFull = typeof prefixCtx?.modelFull === "string" ? prefixCtx.modelFull.trim() : "";
\tconst slashIndex = modelFull.indexOf("/");
\tif (slashIndex <= 0) return;
\tconst provider = modelFull.slice(0, slashIndex).trim().toLowerCase();
\tconst model = modelFull.slice(slashIndex + 1).trim();
\tif (!provider || !model) return;
\tconst normalizedAgentId = String(agentId ?? "").trim().toLowerCase();
\tconst agentEntry = (cfg?.agents?.list ?? []).find((entry) => String(entry?.id ?? "").trim().toLowerCase() === normalizedAgentId);
\tconst modelMaps = [agentEntry?.models, cfg?.agents?.defaults?.models];
\tconst exactKey = \`\${provider}/\${model}\`;
\tconst wildcardKey = \`\${provider}/*\`;
\tconst readMapPolicy = (models, key) => {
\t\tif (!models || typeof models !== "object") return;
\t\tfor (const [candidateKey, entry] of Object.entries(models)) {
\t\t\tif (candidateKey.trim().toLowerCase() !== key.toLowerCase()) continue;
\t\t\tconst runtime = normalizeCardRuntimeId(entry?.agentRuntime?.id);
\t\t\tif (runtime) return runtime;
\t\t}
\t};
\tfor (const models of modelMaps) {
\t\tconst runtime = readMapPolicy(models, exactKey);
\t\tif (runtime) return runtime === "auto" || runtime === "default" ? provider === "openai" && cfg?.plugins?.entries?.codex?.enabled === true ? "codex" : "openclaw" : runtime;
\t}
\tconst providerEntry = Object.entries(cfg?.models?.providers ?? {}).find(([candidate]) => candidate.trim().toLowerCase() === provider)?.[1];
\tconst providerModel = Array.isArray(providerEntry?.models) ? providerEntry.models.find((entry) => {
\t\tconst id = String(entry?.id ?? "").trim().toLowerCase();
\t\treturn id === model.toLowerCase() || id === exactKey.toLowerCase();
\t}) : void 0;
\tconst providerModelRuntime = normalizeCardRuntimeId(providerModel?.agentRuntime?.id);
\tif (providerModelRuntime) return providerModelRuntime === "auto" || providerModelRuntime === "default" ? provider === "openai" && cfg?.plugins?.entries?.codex?.enabled === true ? "codex" : "openclaw" : providerModelRuntime;
\tfor (const models of modelMaps) {
\t\tconst runtime = readMapPolicy(models, wildcardKey);
\t\tif (runtime) return runtime === "auto" || runtime === "default" ? provider === "openai" && cfg?.plugins?.entries?.codex?.enabled === true ? "codex" : "openclaw" : runtime;
\t}
\tconst providerRuntime = normalizeCardRuntimeId(providerEntry?.agentRuntime?.id);
\tif (providerRuntime && providerRuntime !== "auto" && providerRuntime !== "default") return providerRuntime;
\tif (provider === "openai" && cfg?.plugins?.entries?.codex?.enabled === true) return "codex";
\treturn "openclaw";
}
/** Build a card note footer from agent identity and the actual model selection. */
function resolveCardNote(agentId, identity, prefixCtx) {
\tconst parts = [\`Agent: \${identity?.name?.trim() || agentId}\`];
\tif (prefixCtx.model) parts.push(\`Model: \${prefixCtx.model}\`);
\tif (prefixCtx.provider) parts.push(\`Provider: \${prefixCtx.provider}\`);
\tif (prefixCtx.agentRuntime) parts.push(\`Runtime: \${prefixCtx.agentRuntime}\`);
\treturn parts.join(" | ");
}`;

if (!source.includes(footerBefore) || source.indexOf(footerBefore) !== source.lastIndexOf(footerBefore)) {
  throw new Error(`Card footer signature changed; refusing to patch ${file}`);
}

const modelSelectedBefore = `\t\t\tonModelSelected: prefixContext.onModelSelected,`;
const modelSelectedAfter = `\t\t\tonModelSelected: (selection) => {
\t\t\t\tprefixContext.onModelSelected(selection);
\t\t\t\tprefixContext.prefixContext.agentRuntime = resolveConfiguredCardRuntime(cfg, agentId, prefixContext.prefixContext);
\t\t\t},`;

if (!source.includes(modelSelectedBefore) || source.indexOf(modelSelectedBefore) !== source.lastIndexOf(modelSelectedBefore)) {
  throw new Error(`Model selection signature changed; refusing to patch ${file}`);
}

const patched = source
  .replace(footerBefore, footerAfter)
  .replace(modelSelectedBefore, modelSelectedAfter);

if (patched === source || !patchedMarkers.every((marker) => patched.includes(marker))) {
  throw new Error(`Runtime footer patch was incomplete for ${file}`);
}

const beforeSha256 = sha256(source);
const afterSha256 = sha256(patched);

if (!dryRun) {
  if (backupDir) {
    mkdirSync(backupDir, { recursive: true });
    const backupFile = join(backupDir, `${basename(file)}.${beforeSha256}.before`);
    if (!existsSync(backupFile)) copyFileSync(file, backupFile);
  }
  writeFileSync(file, patched);
}

process.stdout.write(JSON.stringify({
  changed: true,
  dryRun,
  file,
  beforeSha256,
  afterSha256,
  status: dryRun ? "would-patch" : "patched",
}) + "\n");
