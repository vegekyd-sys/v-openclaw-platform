#!/usr/bin/env node
// Assembles the runtimes the black-box contracts run against. Nothing here reads
// production; V's bytes come from the capture checked into release/captured.
//
//   stock    the published v2026.9.1 dist, official @openclaw/ai, Feishu and Codex (the reverse control)
//   v        stock with V's captured core, Feishu and Codex files and V's @openclaw/ai
//   fork     the fork's own build, as it comes out of `pnpm build`
//   fork-c5  fork build as C5 ships it: published file set, stock Control UI, RTC overlay
//
// usage: make-targets.mjs --out <dir> --stock <dir holding the published dist> --modules <worktree with node_modules> --fork <worktree> --capture <release/captured/name> --feishu <official package> --codex <official package> --ai-official <official @openclaw/ai> --ai-v <V's @openclaw/ai>
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    out: { type: "string" },
    stock: { type: "string" },
    modules: { type: "string" },
    fork: { type: "string" },
    capture: { type: "string" },
    feishu: { type: "string" },
    codex: { type: "string" },
    "ai-official": { type: "string" },
    "ai-v": { type: "string" },
  },
});
for (const k of ["out", "stock", "modules", "fork", "capture", "feishu", "codex", "ai-official", "ai-v"]) {
  if (!a[k]) throw new Error(`--${k} is required`);
}

// @openclaw/ai is a separate package in the published layout and V patches it, so each
// target needs its own copy; everything else resolves through the fork's install.
function linkModules(root, aiFrom) {
  const modules = path.join(a.modules, "node_modules");
  mkdirSync(path.join(root, "node_modules", "@openclaw"), { recursive: true });
  for (const entry of readdirSync(modules)) {
    if (entry !== "@openclaw") symlinkSync(path.join(modules, entry), path.join(root, "node_modules", entry));
  }
  for (const entry of readdirSync(path.join(modules, "@openclaw"))) {
    if (entry !== "ai") symlinkSync(realpathSync(path.join(modules, "@openclaw", entry)), path.join(root, "node_modules", "@openclaw", entry));
  }
  const ai = path.join(root, "node_modules", "@openclaw", "ai");
  cpSync(aiFrom, ai, { recursive: true, verbatimSymlinks: true, filter: (f) => !f.includes("/node_modules") });
  symlinkSync(path.join(a.modules, "packages", "ai", "node_modules"), path.join(ai, "node_modules"));
}

function target(name, distFrom, aiFrom) {
  const root = path.join(a.out, name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  cpSync(path.join(distFrom, "dist"), path.join(root, "dist"), { recursive: true, verbatimSymlinks: true });
  for (const f of ["package.json", "openclaw.mjs"]) cpSync(path.join(a.modules, f), path.join(root, f));
  for (const d of ["skills", "docs/reference/templates"]) {
    if (existsSync(path.join(a.modules, d))) cpSync(path.join(a.modules, d), path.join(root, d), { recursive: true });
  }
  linkModules(root, aiFrom);
  return root;
}

// 9.1 does not bundle these two; on V they are installed packages. Channel ingress
// is only open to trusted plugins, so they sit in the bundled directory here. Their
// bytes are what V has; only the location differs.
function plugins(root) {
  // Plugins import the host as `openclaw`; on V their node_modules links to the runtime.
  mkdirSync(path.join(root, "dist", "extensions", "node_modules"), { recursive: true });
  symlinkSync(root, path.join(root, "dist", "extensions", "node_modules", "openclaw"));
  for (const id of ["feishu", "codex"]) {
    const dest = path.join(root, "dist", "extensions", id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(a[id], dest, { recursive: true, verbatimSymlinks: true });
    rmSync(path.join(dest, "node_modules", "openclaw"), { recursive: true, force: true });
    if (!existsSync(path.join(dest, "node_modules"))) {
      symlinkSync(path.join(a.fork, "extensions", id, "node_modules"), path.join(dest, "node_modules"));
    }
  }
}

rmSync(path.join(a.out, "npm"), { recursive: true, force: true });
const stock = target("stock", a.stock, a["ai-official"]);
plugins(stock);

const v = target("v", a.stock, a["ai-v"]);
cpSync(path.join(a.capture, "dist"), path.join(v, "dist"), { recursive: true });
plugins(v);
cpSync(path.join(`${a.capture}.feishu`, "dist", "dist"), path.join(v, "dist", "extensions", "feishu", "dist"), { recursive: true });
cpSync(path.join(`${a.capture}.codex`, "dist", "dist"), path.join(v, "dist", "extensions", "codex", "dist"), { recursive: true });

// V's voice runtime imports the Feishu plugin through the install path it has on V.
const NPM_PROJECT = /openclaw-feishu-[0-9a-f]+__openclaw-generation__g-[0-9a-f]+/g;
const voice = readFileSync(path.join(v, "dist", "v-feishu-voice-runtime.mjs"), "utf8");
for (const project of new Set(voice.match(NPM_PROJECT) ?? [])) {
  const link = path.join(a.out, "npm", "projects", project, "node_modules", "@openclaw", "feishu");
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(path.join(v, "dist", "extensions", "feishu"), link);
}

target("fork", a.fork, path.join(a.fork, "packages", "ai"));

const c5 = target("fork-c5", a.fork, path.join(a.fork, "packages", "ai"));
// `pnpm build` emits every extension; the published package drops most of them through
// the `files` list. Keep what V actually has: published set plus its two installed plugins.
const files = JSON.parse(readFileSync(path.join(a.fork, "package.json"), "utf8")).files;
for (const entry of files) {
  const id = entry.match(/^!dist\/extensions\/([^/]+)\/\*\*$/)?.[1];
  if (id && id !== "feishu" && id !== "codex") rmSync(path.join(c5, "dist", "extensions", id), { recursive: true, force: true });
}
rmSync(path.join(c5, "dist", "control-ui"), { recursive: true });
cpSync(path.join(stock, "dist", "control-ui"), path.join(c5, "dist", "control-ui"), { recursive: true });
const overlay = path.join(a.fork, "versa", "overlay-control-ui-assets.mjs");
execFileSync(process.execPath, [overlay, path.join(c5, "dist", "control-ui")], { stdio: "inherit" });
execFileSync(process.execPath, [overlay, "--check", path.join(c5, "dist", "control-ui")], { stdio: "inherit" });

writeFileSync(path.join(a.out, "targets.json"), JSON.stringify({ stock: a.stock, fork: a.fork, capture: a.capture }, null, 2) + "\n");
