// Normalized code comparison between V's patched dist and a fork build of the
// same upstream version. Both sides are reprinted by the same esbuild, split
// into top-level units (functions, classes, declarators, statements), and every
// unit V changed relative to stock is compared with its counterpart in the fork
// build. Units the fork changed but V did not are reported too.
//
// usage: node scripts/normalized-dist-diff.mjs --capture <dir> --stock <dir> --fork <dir>
//          --files <list.txt> --out <dir> [--node-modules <fork checkout>]
//          [--exclude <dir>,<dir>]   fork subdirectories to leave out of the index,
//                                    e.g. worker (a 40 MB bundle that repeats every
//                                    core function and would be matched instead)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import os from "node:os";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const req = createRequire(path.join(args["node-modules"] ?? process.cwd(), "package.json"));
const esbuild = req("esbuild");
const acorn = req("acorn");

const HASH_RE = /-[A-Za-z0-9_-]{8}(?=\.(?:js|mjs|cjs)$)/;
const prefixOf = (rel) => rel.replace(HASH_RE, "");

function normalizeSource(code) {
  let out;
  try {
    out = esbuild.transformSync(code, { format: "esm", legalComments: "none", target: "esnext", loader: "js" }).code;
  } catch {
    return null;
  }
  return out;
}

// Bundler-only noise: collision suffixes, chunk hashes in specifiers.
function canon(text) {
  return text
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\$\d+\b/g, "$1")
    .replace(/(["'`]\.\.?\/[^"'`]*?)-[A-Za-z0-9_-]{8}(\.(?:js|mjs|cjs)["'`])/g, "$1$2");
}

const unitCache = new Map();
function units(file) {
  if (unitCache.has(file)) return unitCache.get(file);
  let result = null;
  if (fs.existsSync(file)) {
    const norm = normalizeSource(fs.readFileSync(file, "utf8"));
    if (norm !== null) {
      let ast = null;
      try {
        ast = acorn.parse(norm, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, allowAwaitOutsideFunction: true });
      } catch {}
      if (ast) {
        result = new Map();
        const add = (key, node, text) => {
          let k = key, n = 2;
          while (result.has(k)) k = `${key}#${n++}`;
          result.set(k, canon(text ?? norm.slice(node.start, node.end)));
        };
        for (const node of ast.body) {
          const decl = node.type.startsWith("Export") && node.declaration ? node.declaration : node;
          if (decl.type === "ImportDeclaration") continue;
          if (node.type === "ExportNamedDeclaration" && !node.declaration) {
            add("export{}", node);
            continue;
          }
          if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id) add(decl.id.name, decl);
          else if (decl.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              const name = d.id.type === "Identifier" ? d.id.name : `destructure@${canon(norm.slice(d.id.start, d.id.end)).slice(0, 40)}`;
              add(name, d, `${decl.kind} ${norm.slice(d.start, d.end)}`);
            }
          } else add(`stmt:${canon(norm.slice(node.start, Math.min(node.end, node.start + 60)))}`, node);
        }
      }
    }
  }
  unitCache.set(file, result);
  return result;
}

// name -> fork files whose top level declares it (cheap regex index).
function indexFork(root, exclude) {
  const idx = new Map();
  const DECL = /^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "control-ui" && e.name !== "node_modules" && !exclude.has(path.relative(root, p))) walk(p);
      } else if (/\.(?:js|mjs|cjs)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        for (const m of text.matchAll(DECL)) {
          const name = m[1].replace(/\$\d+$/, "");
          if (!idx.has(name)) idx.set(name, new Set());
          idx.get(name).add(p);
        }
      }
    }
  };
  walk(root);
  return idx;
}

const KEYWORDS = new Set("await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield async get set".split(" "));
// Formatting-free form: blocks, comments, constant spellings canonicalized.
const minCache = new Map();
function minified(text) {
  if (minCache.has(text)) return minCache.get(text);
  let out;
  try {
    out = esbuild.transformSync(text, { loader: "js", minifySyntax: true, minifyWhitespace: true, legalComments: "none", target: "esnext" }).code;
  } catch {
    out = text;
  }
  minCache.set(text, out);
  return out;
}
// Same code up to identifier names: every identifier becomes one placeholder.
const shape = (text) => text.replace(/[A-Za-z_$][\w$]*/g, (m) => (KEYWORDS.has(m) ? m : "ι"));

// Bundler reprint (rolldown): `class X {}` printed as `var X = class {}`, and a
// name that collides in the chunk renamed with a bare numeric suffix (text ->
// text2, toolName -> toolName2). A suffixed name is folded back only when it
// never occurs on the other side and its base name does, in both directions.
// Statement-level `void` and shorthand properties are already folded by the
// minified comparison. Applied only to units that otherwise differ.
const IDENT = /[A-Za-z_$][\w$]*/g;
function identifiers(text) {
  return new Set(text.match(IDENT) ?? []);
}
function foldCollisionRenames(text, other) {
  const own = identifiers(text), theirs = identifiers(other);
  const map = new Map();
  for (const id of own) {
    const m = /^([A-Za-z_$][\w$]*?[A-Za-z_$])([2-9]|[1-9]\d)$/.exec(id);
    if (m && !theirs.has(id) && theirs.has(m[1])) map.set(id, m[1]);
  }
  return map.size ? text.replace(IDENT, (id) => map.get(id) ?? id) : text;
}
function reprintCanon(text) {
  return text.replace(/^(\s*)var ([A-Za-z_$][\w$]*) = class\b/m, "$1class $2");
}
function sameAfterReprint(vtext, ftext) {
  const v = reprintCanon(vtext), f = reprintCanon(ftext);
  return minified(foldCollisionRenames(v, f)) === minified(foldCollisionRenames(f, v));
}

function tokens(text) {
  return new Set(text.match(/[A-Za-z_$][\w$]{2,}|"[^"]{3,40}"|'[^']{3,40}'/g) ?? []);
}
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(1, A.size + B.size - inter);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "normdiff-"));
function lineDiff(a, b) {
  const fa = path.join(tmp, "a.js"), fb = path.join(tmp, "b.js");
  fs.writeFileSync(fa, a.endsWith("\n") ? a : a + "\n");
  fs.writeFileSync(fb, b.endsWith("\n") ? b : b + "\n");
  const r = spawnSync("diff", ["-U2", fa, fb], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.stdout.split("\n").slice(2).join("\n");
}
const changedLines = (d) => d.split("\n").filter((l) => /^[+-]/.test(l)).length;

const capture = args.capture, stock = args.stock, fork = args.fork;
const files = fs.readFileSync(args.files, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(args.out, { recursive: true });
console.error("indexing fork build...");
const forkIdx = indexFork(fork, new Set((args.exclude ?? "").split(",").filter(Boolean)));
const forkFilesByPrefix = new Map();
for (const set of forkIdx.values())
  for (const f of set) {
    const rel = path.relative(fork, f), k = prefixOf(rel);
    if (!forkFilesByPrefix.has(k)) forkFilesByPrefix.set(k, new Set());
    forkFilesByPrefix.get(k).add(f);
  }

const report = [];
for (const rel of files) {
  const vu = units(path.join(capture, rel));
  const su = units(path.join(stock, rel)) ?? new Map();
  const entry = { file: rel, units: [], forkOnly: [] };
  if (!vu) {
    entry.error = "V file not parseable";
    report.push(entry);
    continue;
  }
  const sameName = [...(forkFilesByPrefix.get(prefixOf(rel)) ?? [])];
  const candidatesFor = (name) => {
    const set = new Set(sameName);
    for (const f of forkIdx.get(name.replace(/#\d+$/, "")) ?? []) set.add(f);
    return [...set];
  };
  for (const [key, vtext] of vu) {
    const stext = su.get(key);
    if (stext === vtext) continue; // unchanged by V
    const kind = stext === undefined ? "added" : "modified";
    let best = null;
    for (const f of candidatesFor(key)) {
      const fu = units(f);
      if (!fu) continue;
      if (fu.has(key)) {
        const ft = fu.get(key);
        const score = ft === vtext ? 2 : 1 + similarity(vtext, ft);
        if (!best || score > best.score) best = { score, file: f, key, text: ft };
      }
    }
    if (!best || best.score < 2) {
      // look for a renamed counterpart in the same-name chunks and by shared identifiers
      const pool = new Set(sameName);
      for (const t of [...tokens(vtext)].filter((t) => /^[A-Za-z_$]/.test(t)).slice(0, 40))
        for (const f of forkIdx.get(t) ?? []) if (pool.size < 25) pool.add(f);
      for (const f of pool) {
        const fu = units(f);
        if (!fu) continue;
        for (const [k, ft] of fu) {
          if (ft === vtext) { best = { score: 2, file: f, key: k, text: ft }; break; }
          const s = similarity(vtext, ft);
          if (s >= 0.5 && (!best || s + 0.5 > best.score)) best = { score: s + 0.5, file: f, key: k, text: ft };
        }
        if (best?.score === 2) break;
      }
    }
    const u = { key, kind };
    if (!best) u.status = "missing";
    else {
      u.forkFile = path.relative(fork, best.file);
      u.forkKey = best.key;
      if (best.text === vtext) u.status = best.key.replace(/#\d+$/, "") === key.replace(/#\d+$/, "") ? "identical" : "identical-renamed";
      else {
        u.diff = lineDiff(vtext, best.text);
        u.changed = changedLines(u.diff);
        const mv = minified(vtext), mf = minified(best.text);
        u.status = mv === mf ? "format-only" : shape(mv) === shape(mf) ? "renamed-only" : sameAfterReprint(vtext, best.text) ? "reprint-only" : "differs";
      }
    }
    entry.units.push(u);
  }
  // V removed a stock unit: the fork must not still carry it.
  for (const [key, stext] of su) {
    if (vu.has(key)) continue;
    const kept = sameName.some((f) => units(f)?.get(key) === stext);
    entry.units.push({ key, kind: "removed", status: kept ? "fork-kept" : "identical" });
  }
  // The fork changed a unit V left as stock.
  for (const f of sameName) {
    const fu = units(f);
    if (!fu) continue;
    for (const [key, ft] of fu) {
      const stext = su.get(key);
      if (stext !== undefined && vu.get(key) === stext && ft !== stext && minified(ft) !== minified(stext) && !sameAfterReprint(stext, ft)) {
        const d = lineDiff(stext, ft);
        entry.forkOnly.push({ key, forkFile: path.relative(fork, f), changed: changedLines(d), diff: d });
      }
    }
  }
  report.push(entry);
}

const tally = {};
for (const e of report) for (const u of e.units) tally[u.status] = (tally[u.status] ?? 0) + 1;
const forkOnly = report.reduce((n, e) => n + e.forkOnly.length, 0);
fs.writeFileSync(path.join(args.out, "report.json"), JSON.stringify(report, null, 1));
const md = [];
for (const e of report) {
  const bad = e.units.filter((u) => !["identical", "identical-renamed", "format-only", "renamed-only", "reprint-only"].includes(u.status));
  if (!bad.length && !e.forkOnly.length && !e.error) continue;
  md.push(`## ${e.file}${e.error ? ` (${e.error})` : ""}`);
  for (const u of bad) {
    md.push(`### ${u.key} — ${u.kind}, ${u.status}${u.forkKey && u.forkKey !== u.key ? ` → ${u.forkKey}` : ""}${u.forkFile ? ` (${u.forkFile})` : ""}`);
    if (u.diff) md.push("```diff", u.diff.trimEnd(), "```");
  }
  for (const u of e.forkOnly) md.push(`### ${u.key} — fork-only change (${u.forkFile})`, "```diff", u.diff.trimEnd(), "```");
}
fs.writeFileSync(path.join(args.out, "report.md"), md.join("\n") + "\n");
console.log(JSON.stringify({ files: report.length, units: tally, forkOnly }, null, 1));
