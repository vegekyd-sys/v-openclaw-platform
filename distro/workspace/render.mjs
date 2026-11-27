#!/usr/bin/env node
// Fill the install-time placeholders of a seeded workspace (distro/workspace/README.md).
// Self-contained on purpose: the installer packs this one file and runs it once,
// right after copying the package's workspace/ into the agent workspace.
//
//   node render.mjs --dir <agent workspace> --set WORKSPACE=<dir> --set AGENT_ID=<id> \
//                   --set STATE_DIR=<dir> --set TIMEZONE=<IANA>
//   import { render } from "./render.mjs"; render(dir, { WORKSPACE, AGENT_ID, STATE_DIR, TIMEZONE })
//
// Every placeholder must get a value, and none may be left behind: a half-rendered
// workspace points scripts at paths that do not exist, so this fails instead.
import fs from "node:fs";
import path from "node:path";

export const REQUIRED = ["WORKSPACE", "AGENT_ID", "STATE_DIR", "TIMEZONE"];
const TOKEN = /@@([A-Z_]+)@@/g;

function* files(dir, rel = "") {
  for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
    if (name === ".git" || name === "node_modules") continue;
    const r = rel ? `${rel}/${name}` : name;
    const st = fs.lstatSync(path.join(dir, r));
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* files(dir, r);
    else if (st.isFile()) yield r;
  }
}

export function render(dir, values) {
  for (const k of REQUIRED) {
    if (typeof values[k] !== "string" || !values[k]) throw new Error(`render: missing value for ${k}`);
    if (/[\n\r]|@@/.test(values[k])) throw new Error(`render: bad value for ${k}`);
  }
  const changed = [];
  const unknown = new Set();
  for (const rel of files(dir)) {
    const p = path.join(dir, rel);
    const buf = fs.readFileSync(p);
    if (buf.includes(0) || !buf.includes("@@")) continue;
    const text = buf.toString("utf8");
    const out = text.replace(TOKEN, (m, k) => {
      if (k in values) return values[k];
      unknown.add(`${k} (${rel})`);
      return m;
    });
    if (out !== text) {
      const mode = fs.statSync(p).mode;
      fs.writeFileSync(p, out);
      fs.chmodSync(p, mode);
      changed.push(rel);
    }
  }
  if (unknown.size) throw new Error(`render: placeholders without a value: ${[...unknown].join(", ")}`);
  return changed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let dir = null;
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--dir") dir = args[++i];
    else if (args[i] === "--set") {
      const [k, ...v] = String(args[++i]).split("=");
      values[k] = v.join("=");
    } else throw new Error(`unknown argument ${args[i]}`);
  }
  if (!dir) { console.error("usage: node render.mjs --dir <workspace> --set KEY=VALUE ..."); process.exit(2); }
  const changed = render(dir, values);
  console.log(JSON.stringify({ ok: true, rendered: changed.length }));
}
