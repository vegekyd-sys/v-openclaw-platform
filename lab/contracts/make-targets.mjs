#!/usr/bin/env node
// Assembles the runtimes the black-box contracts run against. Nothing here reads
// production; V's bytes come from the capture checked into release/captured.
//
//   stock    the published v2026.9.1 dist and official Feishu/Codex packages (the reverse control)
//   v        stock with V's captured core, Feishu and Codex files on top
//   fork     the fork's own build, as it comes out of `pnpm build`
//   fork-c5  fork build with stock Control UI plus the RTC overlay (what C5 ships)
//
// usage: make-targets.mjs --out <dir> --stock <dir holding the published dist> --modules <worktree with node_modules> --fork <worktree> --capture <release/captured/name> --feishu <official package> --codex <official package>
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  },
});
for (const k of ["out", "stock", "modules", "fork", "capture", "feishu", "codex"]) {
  if (!a[k]) throw new Error(`--${k} is required`);
}

function target(name, distFrom) {
  const root = path.join(a.out, name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  cpSync(path.join(distFrom, "dist"), path.join(root, "dist"), { recursive: true, verbatimSymlinks: true });
  for (const f of ["package.json", "openclaw.mjs"]) cpSync(path.join(a.modules, f), path.join(root, f));
  for (const d of ["skills", "docs/reference/templates"]) {
    if (existsSync(path.join(a.modules, d))) cpSync(path.join(a.modules, d), path.join(root, d), { recursive: true });
  }
  symlinkSync(path.join(a.modules, "node_modules"), path.join(root, "node_modules"));
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
const stock = target("stock", a.stock);
plugins(stock);

const v = target("v", a.stock);
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

target("fork", a.fork);

const c5 = target("fork-c5", a.fork);
rmSync(path.join(c5, "dist", "control-ui"), { recursive: true });
cpSync(path.join(stock, "dist", "control-ui"), path.join(c5, "dist", "control-ui"), { recursive: true });
const overlay = path.join(a.fork, "versa", "overlay-control-ui-assets.mjs");
execFileSync(process.execPath, [overlay, path.join(c5, "dist", "control-ui")], { stdio: "inherit" });
execFileSync(process.execPath, [overlay, "--check", path.join(c5, "dist", "control-ui")], { stdio: "inherit" });

writeFileSync(path.join(a.out, "targets.json"), JSON.stringify({ stock: a.stock, fork: a.fork, capture: a.capture }, null, 2) + "\n");
