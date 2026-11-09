// Decides whether one shell command (exec / Codex exec_command / process stdin) walks a
// whole data tree on V. Pure: no filesystem access, no process state; the hook in
// ../index.js feeds it the command text and the working directory.
//
// What counts (docs/incidents/2026-11-09-recursive-scan.md):
//   grep -r / -R / --recursive / -d recurse, rg, ag, ack, ugrep -r   over a protected path
//   find without -maxdepth <= findMaxDepth (4)                        over a protected path
//   du (it always walks the whole tree, -d / -s only shorten the output)
//   tree without -L <= findMaxDepth, ls -R                           over a protected path
//   a `**` glob, os.walk(...) or Path(...).rglob(...) rooted at a protected path, anywhere
//   in the text (heredoc scripts included)
//
// "Protected" is a configured root (default: V's home, state dir, Night Shift instances and
// the agent databases) or any ancestor of one (`/`, `/home`). A path below a root, such as
// one Night Shift instance or a workspace directory, is not protected: narrowing the search
// to it is the advice the block gives.

import path from "node:path";

export const DEFAULT_HOME = "/home/openclaw";

export const DEFAULT_PROTECTED_ROOTS = Object.freeze([
  "/home/openclaw",
  "/home/openclaw/.openclaw",
  "/home/openclaw/.openclaw/nightshift",
  "/home/openclaw/.openclaw/nightshift/instances",
  "/home/openclaw/.openclaw/agents",
  "/home/openclaw/.openclaw/agents/*",
  "/home/openclaw/.openclaw/agents/*/sessions",
  "/home/openclaw/.openclaw/agents/*/agent",
  "/home/openclaw/.openclaw/agents/*/agent/codex-home",
  "/home/openclaw/.openclaw/agents/*/agent/codex-home/sessions",
  "/home/openclaw/.openclaw/media",
  "/home/openclaw/.openclaw/npm",
]);

export const DEFAULT_FIND_MAX_DEPTH = 4;

const GREP_NAMES = new Set(["grep", "egrep", "fgrep", "zgrep", "ugrep", "ug"]);
const ALWAYS_RECURSIVE = new Set(["rg", "ripgrep", "ag", "ack", "ack-grep"]);
const WRAPPERS = new Set(["sudo", "env", "nice", "ionice", "timeout", "stdbuf", "command", "exec", "time", "nohup", "xargs", "builtin", "chrt", "taskset", "doas", "runuser"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

// Options that take a separate argument, per command (short letters and long names).
const GREP_ARG_SHORT = new Set(["e", "f", "m", "A", "B", "C", "d", "D"]);
const GREP_ARG_LONG = new Set(["regexp", "file", "max-count", "after-context", "before-context", "context", "directories", "devices", "include", "exclude", "exclude-dir", "exclude-from", "label", "binary-files", "group-separator"]);
const RG_ARG_SHORT = new Set(["e", "f", "g", "t", "T", "m", "A", "B", "C", "d", "j", "M", "E", "r"]);
const RG_ARG_LONG = new Set(["regexp", "file", "glob", "iglob", "type", "type-not", "type-add", "type-clear", "max-count", "after-context", "before-context", "context", "max-depth", "maxdepth", "threads", "max-columns", "encoding", "replace", "max-filesize", "sort", "sortr", "path-separator", "pre", "pre-glob", "ignore-file", "colors", "color", "context-separator", "field-match-separator", "field-context-separator", "engine", "dfa-size-limit", "regex-size-limit", "depth", "ignore-dir"]);
const DU_ARG_SHORT = new Set(["d", "B", "t", "X"]);
const DU_ARG_LONG = new Set(["max-depth", "block-size", "threshold", "exclude-from", "exclude", "time-style", "files0-from"]);
const TREE_ARG_SHORT = new Set(["L", "P", "I", "o", "H"]);
const SUDO_ARG_SHORT = new Set(["u", "g", "h", "p", "C", "D", "R", "T", "U", "r", "t"]);
const ENV_ARG_SHORT = new Set(["u", "C", "S"]);
const TIMEOUT_ARG_SHORT = new Set(["s", "k"]);
const IONICE_ARG_SHORT = new Set(["c", "n", "p", "P", "u"]);
const XARGS_ARG_SHORT = new Set(["a", "d", "E", "e", "I", "i", "L", "l", "n", "P", "s"]);

/** Normalize the configured roots once: absolute, no trailing slash, split into parts. */
export function compileRoots(roots = DEFAULT_PROTECTED_ROOTS) {
  return roots
    .filter((r) => typeof r === "string" && r.startsWith("/"))
    .map((r) => {
      const norm = path.posix.normalize(r).replace(/\/+$/u, "") || "/";
      return { root: norm, parts: norm === "/" ? [] : norm.slice(1).split("/") };
    });
}

function partsOf(abs) {
  const norm = path.posix.normalize(abs).replace(/\/+$/u, "") || "/";
  return norm === "/" ? [] : norm.slice(1).split("/");
}

const segMatch = (pattern, seg) => pattern === "*" ? seg.length > 0 : pattern === seg;

/**
 * The protected root an absolute directory is, or is an ancestor of. A directory below a
 * root is not protected. Returns the matched root text, or null.
 */
export function protectedRootFor(abs, compiled) {
  const parts = partsOf(abs);
  for (const { root, parts: rp } of compiled) {
    if (parts.length > rp.length) continue;
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) if (!segMatch(rp[i], parts[i])) { ok = false; break; }
    if (ok) return parts.length === rp.length ? root : `/${parts.join("/")}`;
  }
  return null;
}

// ------------------------------------------------------------------ lexing

const HEREDOC_RE = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/gu;

/** Remove heredoc bodies (they are data for another program, not shell). */
export function stripHeredocs(text) {
  const lines = String(text).split("\n");
  const out = [];
  let pending = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (pending.length) {
      const want = pending[0];
      const bare = want.dash ? line.replace(/^\t+/u, "") : line;
      if (bare === want.tag) pending.shift();
      continue;
    }
    out.push(line);
    for (const m of line.matchAll(HEREDOC_RE)) pending.push({ tag: m[2], dash: m[0].startsWith("<<-") });
  }
  return out.join("\n");
}

/**
 * Split shell text into simple commands (arrays of words, quotes removed). Command
 * substitutions `$(...)` and backticks become commands of their own; `(`, `)`, `{`, `}`
 * and control words are dropped. Good enough for deciding; it is not a shell.
 */
export function splitCommands(text) {
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  const endWord = () => { if (inWord) { words.push(word); word = ""; inWord = false; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      if (s[i + 1] === "\n") { i += 1; continue; }
      word += s[i + 1]; inWord = true; i += 1; continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      const end = j === -1 ? s.length : j;
      word += s.slice(i + 1, end); inWord = true; i = end; continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length && '"\\$`'.includes(s[j + 1])) { buf += s[j + 1]; j += 2; continue; }
        buf += s[j]; j += 1;
      }
      // A command substitution inside double quotes is a command too.
      for (const sub of substitutions(buf)) commands.push(...splitCommands(sub));
      word += buf; inWord = true; i = j; continue;
    }
    if (c === "$" && s[i + 1] === "(" && s[i + 2] !== "(") {
      endCommand();
      i += 1; continue; // the "(" is a separator below
    }
    if (c === "#" && !inWord) {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl - 1; continue;
    }
    if (";&|\n()`{}<>".includes(c)) {
      if (c === "<" || c === ">") {
        // Redirection: the next word is a file, not an argument; `2>` names a descriptor.
        if (inWord && /^\d+$/u.test(word)) { word = ""; inWord = false; }
        endWord();
        let j = i + 1;
        while (j < s.length && "<>&|".includes(s[j])) j += 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t")) j += 1;
        let k = j;
        while (k < s.length && !" \t\n;&|()<>".includes(s[k])) k += 1;
        i = k - 1; continue;
      }
      if ((c === "{" || c === "}") && inWord) { word += c; continue; }
      endCommand(); continue;
    }
    if (c === " " || c === "\t") { endWord(); continue; }
    word += c; inWord = true;
  }
  endCommand();
  const CONTROL = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "in", "case", "esac", "!", "{", "}", "function", "select"]);
  return commands
    .map((w) => {
      // `for f in $(…); do` leaves "for f in" — not a command.
      if (w[0] === "for" || w[0] === "select" || w[0] === "case") return [];
      let k = 0;
      while (k < w.length && CONTROL.has(w[k])) k += 1;
      return w.slice(k);
    })
    .filter((w) => w.length);
}

function substitutions(s) {
  const out = [];
  for (let i = s.indexOf("$("); i !== -1; i = s.indexOf("$(", i + 2)) {
    let depth = 1;
    let j = i + 2;
    for (; j < s.length && depth; j += 1) { if (s[j] === "(") depth += 1; else if (s[j] === ")") depth -= 1; }
    out.push(s.slice(i + 2, j - 1));
  }
  for (const m of s.matchAll(/`([^`]*)`/gu)) out.push(m[1]);
  return out;
}

// ------------------------------------------------------------------ paths

function expandHome(word, home) {
  if (word === "~" || word === "~openclaw") return home;
  if (word.startsWith("~/")) return home + word.slice(1);
  if (word.startsWith("~openclaw/")) return home + word.slice("~openclaw".length);
  return word
    .replace(/^\$\{?HOME\}?(?=\/|$)/u, home)
    .replace(/^\$\{?OPENCLAW_HOME\}?(?=\/|$)/u, home)
    .replace(/^\$\{?OPENCLAW_STATE_DIR\}?(?=\/|$)/u, `${home}/.openclaw`);
}

const GLOB_RE = /[*?[]/u;

/**
 * Classify one path operand of a recursive command. Returns the protected root it reaches
 * (as text), or null. A glob reaches its static prefix when its first wildcard component is
 * a directory pattern (`instances/*`, `instances/*\/content-items`, `**`); a glob whose last
 * component names files (`*.json`, `run-state.json`) only lists those files.
 */
export function reachedRoot(operand, { cwd, home, compiled }) {
  if (typeof operand !== "string" || operand === "") return null;
  let p = expandHome(operand, home);
  if (p.startsWith("$")) return null; // an unknown variable: cannot judge
  if (!p.startsWith("/")) {
    if (!cwd) return null;
    p = path.posix.join(cwd, p);
  }
  const parts = path.posix.normalize(p).split("/").filter(Boolean);
  const firstGlob = parts.findIndex((seg) => GLOB_RE.test(seg));
  if (firstGlob === -1) return protectedRootFor(`/${parts.join("/")}`, compiled);
  const rest = parts.slice(firstGlob);
  // `…/*/run-state.json`, `…/*.json`: the glob lists files; reading them is not a walk.
  const namesFiles = !rest.some((seg) => seg.includes("**")) && /\.[A-Za-z0-9]{1,8}$/u.test(rest[rest.length - 1]);
  if (namesFiles) return null;
  // `instances/*`, `instances/*/produce`, `**`: every directory below the static prefix.
  // A component with literal text (`config*`, `DL-1109-*`) picks some children: judge the
  // path as if it named one of them (a `*` root such as agents/* still matches it).
  const wide = (seg) => seg.includes("**") || !/[^*?[\]]/u.test(seg) || /^\[[^\]]*\]$/u.test(seg);
  const firstWide = parts.findIndex((seg) => GLOB_RE.test(seg) && wide(seg));
  const upTo = firstWide === -1 ? parts.length : firstWide;
  const concrete = parts.slice(0, upTo).map((seg) => (GLOB_RE.test(seg) ? "\u0000glob" : seg));
  return protectedRootFor(`/${concrete.join("/")}`, compiled);
}

// ------------------------------------------------------------------ commands

function baseName(word) {
  return word.includes("/") ? word.slice(word.lastIndexOf("/") + 1) : word;
}

/**
 * Parse argv into options and operands. `shortArg` / `longArg` are the options that take
 * a separate value. Returns { flags: Set of short letters, long: Map name->value|true,
 * operands: [] , values: Map letter->[values] }.
 */
function parseArgv(argv, { shortArg = new Set(), longArg = new Set(), stopAtFirstOperand = false } = {}) {
  const flags = new Set();
  const values = new Map();
  const long = new Map();
  const operands = [];
  let endOpts = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (endOpts || a === "-" || !a.startsWith("-")) {
      operands.push(a);
      if (stopAtFirstOperand) { operands.push(...argv.slice(i + 1)); break; }
      continue;
    }
    if (a === "--") { endOpts = true; continue; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) long.set(name, a.slice(eq + 1));
      else if (longArg.has(name)) { long.set(name, argv[i + 1] ?? ""); i += 1; }
      else long.set(name, true);
      continue;
    }
    for (let k = 1; k < a.length; k += 1) {
      const ch = a[k];
      if (shortArg.has(ch)) {
        const v = k + 1 < a.length ? a.slice(k + 1) : argv[(i += 1)] ?? "";
        if (!values.has(ch)) values.set(ch, []);
        values.get(ch).push(v);
        break;
      }
      flags.add(ch);
    }
  }
  return { flags, values, long, operands };
}

/** Strip wrappers (sudo, env, nice, timeout, xargs, VAR=…) and return the real argv. */
export function unwrap(words) {
  let w = words.slice();
  let viaXargs = false;
  for (let guard = 0; guard < 12 && w.length; guard += 1) {
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(w[0])) w = w.slice(1);
    if (!w.length) break;
    const name = baseName(w[0]);
    if (!WRAPPERS.has(name)) break;
    if (name === "xargs") viaXargs = true;
    const shortArg = name === "sudo" || name === "doas" || name === "runuser" ? SUDO_ARG_SHORT
      : name === "env" ? ENV_ARG_SHORT
      : name === "timeout" ? TIMEOUT_ARG_SHORT
      : name === "ionice" ? IONICE_ARG_SHORT
      : name === "xargs" ? XARGS_ARG_SHORT
      : name === "nice" ? new Set(["n"])
      : name === "chrt" || name === "taskset" ? new Set()
      : new Set();
    const longArg = name === "sudo" ? new Set(["user", "group", "host", "prompt", "chdir"]) : new Set(["signal", "kill-after", "unset", "chdir", "max-args", "max-procs", "delimiter", "replace", "arg-file"]);
    const parsed = parseArgv(w.slice(1), { shortArg, longArg, stopAtFirstOperand: true });
    let rest = parsed.operands;
    if (name === "nice") rest = rest.filter((x, i) => !(i === 0 && /^-?\d+$/u.test(x)));
    if (name === "timeout" && rest.length) rest = rest.slice(1); // DURATION
    if ((name === "chrt" || name === "taskset") && rest.length) rest = rest.slice(1);
    if (name === "env") while (rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(rest[0])) rest = rest.slice(1);
    w = rest;
  }
  return { argv: w, viaXargs };
}

function depthWithin(value, limit) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= limit;
}

/**
 * One simple command → the scan it performs, if any: { tool, operands, bounded, viaXargs }.
 * `operands` are the directories it walks (may be empty = the working directory).
 */
export function describeScan(words, { findMaxDepth = DEFAULT_FIND_MAX_DEPTH } = {}) {
  const { argv, viaXargs } = unwrap(words);
  if (!argv.length) return null;
  const name = baseName(argv[0]);
  const args = argv.slice(1);
  if (GREP_NAMES.has(name)) {
    const p = parseArgv(args, { shortArg: GREP_ARG_SHORT, longArg: GREP_ARG_LONG });
    const dirAction = [...(p.values.get("d") ?? []), p.long.get("directories")].filter(Boolean);
    const recursive = p.flags.has("r") || p.flags.has("R") || p.long.has("recursive") || p.long.has("dereference-recursive") || dirAction.includes("recurse");
    if (!recursive) return null;
    const hasPatternOption = p.values.has("e") || p.values.has("f") || p.long.has("regexp") || p.long.has("file");
    const operands = hasPatternOption ? p.operands : p.operands.slice(1);
    return { tool: `${name} -r`, operands, bounded: false, viaXargs };
  }
  if (ALWAYS_RECURSIVE.has(name)) {
    const p = parseArgv(args, { shortArg: RG_ARG_SHORT, longArg: RG_ARG_LONG });
    const hasPatternOption = p.values.has("e") || p.values.has("f") || p.long.has("regexp") || p.long.has("file");
    const filesMode = p.long.has("files") || p.long.has("type-list");
    const operands = hasPatternOption || filesMode ? p.operands : p.operands.slice(1);
    const depth = name === "ag" ? p.long.get("depth") : (p.values.get("d") ?? [])[0] ?? p.long.get("max-depth") ?? p.long.get("maxdepth");
    return { tool: name, operands, bounded: depth !== undefined && depthWithin(depth, findMaxDepth), viaXargs };
  }
  if (name === "find") {
    // find [-H|-L|-P] [-D x] [-Olevel] [path...] [expression]
    let i = 0;
    while (i < args.length && /^-(H|L|P|O\d*)$/u.test(args[i])) i += 1;
    if (args[i] === "-D") i += 2;
    const operands = [];
    while (i < args.length && !args[i].startsWith("-") && args[i] !== "(" && args[i] !== "!" && args[i] !== "\\(") { operands.push(args[i]); i += 1; }
    const md = args.indexOf("-maxdepth");
    const bounded = md !== -1 && depthWithin(args[md + 1], findMaxDepth);
    return { tool: "find", operands, bounded, viaXargs };
  }
  if (name === "du") {
    const p = parseArgv(args, { shortArg: DU_ARG_SHORT, longArg: DU_ARG_LONG });
    return { tool: "du", operands: p.operands, bounded: false, viaXargs };
  }
  if (name === "tree") {
    const p = parseArgv(args, { shortArg: TREE_ARG_SHORT, longArg: new Set() });
    const level = (p.values.get("L") ?? [])[0];
    return { tool: "tree", operands: p.operands, bounded: level !== undefined && depthWithin(level, findMaxDepth), viaXargs };
  }
  if (name === "ls") {
    const p = parseArgv(args, {});
    if (!(p.flags.has("R") || p.long.has("recursive"))) return null;
    return { tool: "ls -R", operands: p.operands, bounded: false, viaXargs };
  }
  return null;
}

/** `bash -c SCRIPT` / `sh -lc SCRIPT` → SCRIPT, else null. */
function shellScript(words) {
  const { argv } = unwrap(words);
  if (!argv.length || !SHELLS.has(baseName(argv[0]))) return null;
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (/^-[A-Za-z]*c[A-Za-z]*$/u.test(a)) return argv[i + 1] ?? null;
    if (!a.startsWith("-")) return null;
  }
  return null;
}

const RAW_PATTERNS = [
  // A `**` glob rooted at a home-ish path: zsh/bash globstar, python glob, node fs.glob.
  { re: /((?:~|\$\{?HOME\}?|\$\{?OPENCLAW_HOME\}?|\/home)[^\s'"`]*?)\/\*\*/gu, tool: "** glob" },
  // os.walk("<dir>") / os.scandir walks / Path("<dir>").rglob(...)
  { re: /os\.walk\(\s*(?:[rbuf]*)['"]([^'"]+)['"]/gu, tool: "os.walk" },
  { re: /Path\(\s*(?:[rbuf]*)['"]([^'"]+)['"]\s*\)\s*\.rglob\(/gu, tool: "rglob" },
  // fs.readdirSync/readdir/opendir(..., { recursive: true }) on a literal path
  { re: /readdir(?:Sync)?\(\s*['"]([^'"]+)['"]\s*,\s*\{[^}]*recursive\s*:\s*true/gu, tool: "readdir recursive" },
];

/**
 * The decision for one command text. Returns null when it may run, else
 * { tool, root, operand } describing the first offending scan.
 */
export function findForbiddenScan(text, options = {}) {
  const home = options.home ?? DEFAULT_HOME;
  const compiled = options.compiled ?? compileRoots(options.protectedRoots);
  const findMaxDepth = options.findMaxDepth ?? DEFAULT_FIND_MAX_DEPTH;
  const src = String(text ?? "");
  if (!src.trim()) return null;
  if (!/grep|\brg\b|ripgrep|\bag\b|\back\b|\bug\b|find|\bdu\b|tree|\bls\b|\*\*|walk|rglob|readdir/u.test(src)) return null;

  for (const { re, tool } of RAW_PATTERNS) {
    for (const m of src.matchAll(re)) {
      const raw = m[1];
      const root = reachedRoot(tool === "** glob" ? `${raw}/**` : raw, { cwd: options.cwd, home, compiled });
      if (root) return { tool, root, operand: tool === "** glob" ? `${raw}/**` : raw };
    }
  }
  return scanShell(src, { home, compiled, findMaxDepth, cwd: options.cwd }, 0);
}

function scanShell(text, ctx, depth) {
  if (depth > 3) return null;
  let cwd = ctx.cwd;
  for (const words of splitCommands(stripHeredocs(text))) {
    const { argv } = unwrap(words);
    const head = argv.length ? baseName(argv[0]) : "";
    if (head === "cd" || head === "pushd") {
      const target = argv.slice(1).find((a) => !a.startsWith("-")) ?? ctx.home;
      const expanded = expandHome(target, ctx.home);
      if (expanded.startsWith("/")) cwd = path.posix.normalize(expanded);
      else if (cwd && !expanded.startsWith("$")) cwd = path.posix.join(cwd, expanded);
      else cwd = undefined;
      continue;
    }
    const script = shellScript(words);
    if (script !== null) {
      const hit = findForbiddenScan(script, { ...ctx, cwd });
      if (hit) return hit;
      continue;
    }
    const scan = describeScan(words, { findMaxDepth: ctx.findMaxDepth });
    if (!scan || scan.bounded) continue;
    const operands = scan.operands.length ? scan.operands : scan.viaXargs ? [] : ["."];
    for (const operand of operands) {
      const root = reachedRoot(operand, { cwd, home: ctx.home, compiled: ctx.compiled });
      if (root) return { tool: scan.tool, root, operand };
    }
  }
  return null;
}
