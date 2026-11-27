#!/usr/bin/env node
// Produce a distributable workspace from payload/ (distro/workspace/README.md).
//
//   node build.mjs --out <dir>                       placeholders kept (what a package ships)
//   node build.mjs --out <dir> --set KEY=VALUE ...   also rendered, e.g. for a local test or a sandbox
//   --deny-file <file>                               private literal strings (or DISTRO_DENY_FILE)
//
// Writes <dir>/.v/workspace-manifest.json: every file with its sha256, the v-core
// commit the payload was synced from, and the placeholders an installer must fill.
// Refuses to build while a sync is unfinished, while conflict markers remain, or
// when the leak scan finds anything in the output.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { here, payloadDir, PLACEHOLDERS, scanDir, loadDenyFile, walk } from "./lib.mjs";
import { render } from "./render.mjs";

export function build(out, { values = null, denyFile = null } = {}) {
  if (fs.existsSync(path.join(here, ".sync-pending"))) throw Error("sync.mjs is unfinished: resolve it, then run sync.mjs --resolved");
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw Error(`output directory is not empty: ${out}`);
  const files = walk(payloadDir);
  for (const rel of files) {
    const src = path.join(payloadDir, rel), dst = path.join(out, rel);
    const buf = fs.readFileSync(src);
    if (/^(<<<<<<< |>>>>>>> )/m.test(buf.toString("latin1"))) throw Error(`merge conflict markers in ${rel}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
    fs.chmodSync(dst, fs.statSync(src).mode & 0o111 ? 0o755 : 0o644);
  }
  if (values) render(out, values);
  const leaks = scanDir(out, loadDenyFile(denyFile));
  if (leaks.length) {
    const sample = leaks.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.label}]`).join("\n  ");
    throw Error(`private content in the built workspace (${leaks.length}):\n  ${sample}`);
  }
  const manifest = {
    schema: "v-distro-workspace/1",
    vCoreCommit: fs.readFileSync(path.join(here, "V_CORE_COMMIT"), "utf8").trim(),
    rendered: !!values,
    placeholders: values ? {} : PLACEHOLDERS,
    files: files.map((rel) => ({ path: rel, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(out, rel))).digest("hex") })),
  };
  fs.mkdirSync(path.join(out, ".v"), { recursive: true });
  fs.writeFileSync(path.join(out, ".v", "workspace-manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let out = null, denyFile = null, values = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out") out = args[++i];
    else if (args[i] === "--deny-file") denyFile = args[++i];
    else if (args[i] === "--set") { const [k, ...v] = String(args[++i]).split("="); (values ??= {})[k] = v.join("="); }
    else { console.error(`unknown argument ${args[i]}`); process.exit(2); }
  }
  if (!out) { console.error("usage: node build.mjs --out <dir> [--set KEY=VALUE ...] [--deny-file <file>]"); process.exit(2); }
  try {
    const m = build(path.resolve(out), { values, denyFile });
    console.log(JSON.stringify({ ok: true, out: path.resolve(out), files: m.files.length, vCoreCommit: m.vCoreCommit, rendered: m.rendered }));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
