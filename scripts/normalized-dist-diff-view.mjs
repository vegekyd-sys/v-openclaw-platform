// Reading aid for normalized-dist-diff items that still differ: takes both
// sides of each unit from the V capture and the fork build, applies the V->fork
// top-level renames the report found, minifies (locals renamed by frequency)
// and reprints both the same way, then diffs. What is left is a token-level
// difference, not layout or naming. The rename map comes from the tool's own
// pairing, which can be wrong, so a verdict still has to be checked in source.
//
// usage: node scripts/normalized-dist-diff-view.mjs <report.json> <capture dir> <fork dir>
//          <file substring> [unit prefix ...] [--summary] [--node-modules <fork checkout>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const summary = argv.includes("--summary");
const nmAt = argv.indexOf("--node-modules");
const nodeModules = nmAt >= 0 ? argv[nmAt + 1] : process.cwd();
const req = createRequire(path.join(nodeModules, "package.json"));
const esbuild = req("esbuild");
const [rep, captureDir, forkDir, sub, ...keys] = argv.filter((a, i) => a !== "--summary" && i !== nmAt && i !== nmAt + 1);
const acorn = req("acorn");

// Same unit split as scripts/normalized-dist-diff.mjs, keeping raw unit text.
const unitCache = new Map();
function units(file) {
  if (unitCache.has(file)) return unitCache.get(file);
  const result = new Map();
  try {
    const norm = esbuild.transformSync(fs.readFileSync(file, "utf8"), { format: "esm", legalComments: "none", target: "esnext", loader: "js" }).code;
    const ast = acorn.parse(norm, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, allowAwaitOutsideFunction: true });
    const add = (key, text) => {
      let k = key, n = 2;
      while (result.has(k)) k = `${key}#${n++}`;
      result.set(k, text);
    };
    for (const node of ast.body) {
      const decl = node.type.startsWith("Export") && node.declaration ? node.declaration : node;
      if (decl.type === "ImportDeclaration") continue;
      if (node.type === "ExportNamedDeclaration" && !node.declaration) add("export{}", norm.slice(node.start, node.end));
      else if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id) add(decl.id.name, norm.slice(decl.start, decl.end));
      else if (decl.type === "VariableDeclaration")
        for (const d of decl.declarations) if (d.id.type === "Identifier") add(d.id.name, `${decl.kind} ${norm.slice(d.start, d.end)}`);
    }
  } catch {}
  unitCache.set(file, result);
  return result;
}
const report = JSON.parse(fs.readFileSync(rep, "utf8"));

const renames = new Map();
for (const f of report)
  for (const u of f.units) {
    const fk = (u.forkKey ?? "").replace(/\$\d+$/, "");
    if (fk && fk !== u.key && /^[\w$]+$/.test(u.key) && /^[\w$]+$/.test(fk)) renames.set(u.key, fk);
  }

const side = (diff, keep) =>
  diff
    .split("\n")
    .filter((l) => !l.startsWith("@@") && (l.startsWith(" ") || l.startsWith(keep)))
    .map((l) => l.slice(1))
    .join("\n");

function canon(code, renameV, name) {
  let src = code;
  if (renameV) for (const [a, b] of renames) src = src.replace(new RegExp(`(?<![\\w$.])${a.replace(/\$/g, "\\$")}(?![\\w$])`, "g"), b);
  // strip collision suffixes the bundler adds (text2, isRecord$4)
  src = src.replace(/\b([A-Za-z_]+[A-Za-z_])\$\d+\b/g, "$1");
  // Wrap the unit in an exported function that returns it: the unit stays
  // live (no dead-code removal), and minify renames every local, the unit's
  // own name included, by frequency, so equal bodies get equal names.
  const ref = name && /^[\w$]+$/.test(name) ? name.replace(/\$\d+$/, "") : "void 0";
  src = `export function __unit() {\n${src}\nreturn ${ref};\n}`;
  try {
    // Top level of an ES module: transform keeps unused declarations and their
    // names, and renames only locals (no dead-code removal of the unit itself).
    const min = esbuild.transformSync(src, { minify: true, format: "esm", loader: "js" }).code;
    return esbuild.transformSync(min, { format: "esm", loader: "js" }).code;
  } catch {
    return null;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "semshow-"));
for (const f of report) {
  if (!f.file.includes(sub)) continue;
  for (const u of f.units) {
    if (u.status !== "differs") continue;
    if (keys.length && !keys.some((k) => u.key.split("\n")[0].startsWith(k))) continue;
    const vText = units(path.join(captureDir, f.file)).get(u.key);
    const fText = u.forkFile ? units(path.join(forkDir, u.forkFile)).get(u.forkKey) : undefined;
    const a = canon(vText ?? side(u.diff ?? "", "-"), true, renames.get(u.key) ?? u.key);
    const b = canon(fText ?? side(u.diff ?? "", "+"), false, u.forkKey);
    const head = `### ${u.key.split("\n")[0].slice(0, 70)} -> ${u.forkKey ?? ""}`;
    if (a == null || b == null) {
      console.log(`${head}  [could not reprint; read the raw diff]`);
      continue;
    }
    if (a === b) {
      console.log(`${head}  [SAME after canonicalization]`);
      continue;
    }
    fs.writeFileSync(path.join(tmp, "a.js"), a);
    fs.writeFileSync(path.join(tmp, "b.js"), b);
    const d = spawnSync("diff", ["-U1", path.join(tmp, "a.js"), path.join(tmp, "b.js")], { encoding: "utf8" }).stdout;
    const body = d.split("\n").slice(2).filter((l) => !l.startsWith("@@"));
    const changed = body.filter((l) => /^[+-]/.test(l)).length;
    console.log(`${head}  [${changed} lines]`);
    if (!summary) console.log(body.join("\n"));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
