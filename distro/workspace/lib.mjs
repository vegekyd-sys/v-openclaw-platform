// Shared rules for the installable V workspace (distro/workspace/README.md).
//
// Three things live here so sync, build, render and the tests agree on them:
//   - the review lists (carry.txt / skip.txt / decide.txt),
//   - sanitising: what V-owned text from v-core is rewritten into before it can
//     reach a customer, and
//   - the leak scan: what must never be found in the payload or a built workspace.
// Nothing private is written in this file (the repository is public): the scan
// uses shapes (ids, hosts, paths), and per-person strings that cannot be written
// as a shape go in a private deny file passed with --deny-file / DISTRO_DENY_FILE.
import fs from "node:fs";
import path from "node:path";

// DISTRO_WORKSPACE_DIR points the tools at another copy (tests use a fixture).
export const here = process.env.DISTRO_WORKSPACE_DIR || path.dirname(new URL(import.meta.url).pathname);
export const payloadDir = path.join(here, "payload");

// ---------------------------------------------------------------- placeholders
// The payload is host-neutral; the installer renders these (render.mjs).
export const PLACEHOLDERS = {
  WORKSPACE: "absolute path of the agent workspace",
  AGENT_ID: "OpenClaw agent id of this V",
  STATE_DIR: "OpenClaw state directory (holds logs/, credentials, openclaw.json)",
  TIMEZONE: "owner's IANA timezone, e.g. Asia/Shanghai",
};
export const PLACEHOLDER_RE = /@@([A-Z_]+)@@/g;

// ---------------------------------------------------------------- review lists
// One entry per line: <path or glob> [reason]. Globs use * (any run of
// characters, also across /) and match skills/<name>, scripts/<entry> or a file.
export function readList(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l && !/^\s*#/.test(l))
    .map((l) => {
      const m = l.match(/^(\S+)\s*(.*)$/);
      return { glob: m[1], reason: m[2].trim() };
    });
}
const globRe = (g) => new RegExp("^" + g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
export function matches(entries, p) {
  return entries.find((e) => globRe(e.glob).test(p));
}
export function lists(dir = here) {
  return {
    carry: readList(path.join(dir, "carry.txt")),
    skip: readList(path.join(dir, "skip.txt")),
    decide: readList(path.join(dir, "decide.txt")),
  };
}
// carry.txt holds exact paths (file or directory). Is p inside, or a parent of, a carried path?
export function carried(carry, p) {
  return carry.some((e) => e.glob === p || p.startsWith(e.glob + "/") || e.glob.startsWith(p + "/"));
}
// Every skills/<name> and scripts/<entry> must be carried, skipped or awaiting a decision.
export function classify(l, entry) {
  if (carried(l.carry, entry)) return "carry";
  if (matches(l.skip, entry)) return "skip";
  if (matches(l.decide, entry)) return "decide";
  return null;
}
export function topEntry(p) {
  const parts = p.split("/");
  return parts.length > 1 && (parts[0] === "skills" || parts[0] === "scripts") ? `${parts[0]}/${parts[1]}` : null;
}

// ---------------------------------------------------------------- sanitising
// Applied to every V-owned text file taken from v-core, on both sides of the
// three-way merge, so earlier sanitising never shows up as a difference.
const TEXT_EXT = /\.(md|py|sh|mjs|cjs|js|ts|json|jsonl|html|txt|yaml|yml|toml|css)$/i;
export const isText = (p) => TEXT_EXT.test(p) || !path.basename(p).includes(".");
export const SANITISE = [
  [/\/home\/openclaw\/makaron-openclaw\/\.openclaw-local\/workspace/g, "@@WORKSPACE@@"],
  [/\/vercel\/sandbox\/agent-data\/workspace/g, "@@WORKSPACE@@"],
  [/\/home\/openclaw\/\.openclaw/g, "@@STATE_DIR@@"],
  [/agent:makaron:/g, "agent:@@AGENT_ID@@:"],
  [/agent:mirror-v-full:/g, "agent:@@AGENT_ID@@:"],
  [/Tianyi's/g, "the owner's"],
  [/Tianyi/g, "the owner"],
  [/天翊|天懿/g, "主人"],
  [/https:\/\/[a-z0-9-]+\.(feishu\.cn|larksuite\.com)\/(docx|docs|wiki|base|sheets|file|drive|minutes|mindnotes)\/[A-Za-z0-9_?=&#-]+/g, "（V 内部飞书文档，未随附）"],
  [/\bou_[0-9a-f]{20,}\b/g, "ou_xxx"],
  [/\boc_[0-9a-f]{20,}\b/g, "oc_xxx"],
  [/\bom_[0-9a-z]{20,}\b/g, "om_xxx"],
  [/\bcli_[0-9a-f]{12,}\b/g, "cli_xxx"],
  [/^DEFAULT_REPORT_CHAT_ID = ".*"$/gm, 'DEFAULT_REPORT_CHAT_ID = ""'],
];
export function sanitise(text) {
  for (const [re, to] of SANITISE) text = text.replace(re, to);
  return text;
}

// ---------------------------------------------------------------- leak scan
// Shapes that must never reach a customer. Keep them as shapes, not as the
// private values themselves.
export const DENY = [
  ["V host path", /\/home\/openclaw\b/],
  ["Mirror sandbox path", /\/vercel\/sandbox\b/],
  ["developer machine path", /\/Users\/[a-z][a-z0-9._-]+\//],
  ["Feishu user open_id", /\bou_[0-9a-f]{20,}\b/],
  ["Feishu chat id", /\boc_[0-9a-f]{20,}\b/],
  ["Feishu union id", /\bon_[0-9a-f]{20,}\b/],
  ["Feishu message id", /\bom_[0-9a-z]{20,}\b/],
  ["Feishu app id", /\bcli_[0-9a-f]{12,}\b/],
  ["Feishu document link", /(feishu\.cn|larksuite\.com)\/(docx|docs|wiki|base|sheets|file|drive|minutes)\/[A-Za-z0-9]/],
  ["owner name", /\bTianyi\b|天翊|天懿|tianyicai/i],
  ["owner family", /Hsingyi|馨仪/],
  ["V private domain", /tianyi\.live|versa-ai\.|vegekyd|agentmail\.to/i],
  ["tailnet host", /(?<![a-z0-9-])[a-z0-9-]{1,63}\.(?:tail[0-9a-f]+|ts)\.net\b/],
  ["API key shape", /\b(sk-[A-Za-z0-9_-]{20,}|apify_api_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|AKID[A-Za-z0-9]{16,})/],
  ["mainland mobile number", /(?<![0-9])1[3-9][0-9]{9}(?![0-9])/],
  ["V business customer", /星擎|奥创|米奥|DealClaw|dealclaw|GeeLark|geelark|FCloud|fcloud/],
];
export function loadDenyFile(file) {
  file = file || process.env.DISTRO_DENY_FILE;
  if (!file) return [];
  // One literal string per line (case-insensitive); # comments. Kept outside every repository.
  return fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((s) => ["private deny list", new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]);
}
// Files whose job is to name the shapes (this library and its tests) are not scanned by callers.
export function scanText(text, extra = []) {
  const hits = [];
  const rules = [...DENY, ...extra];
  text.split("\n").forEach((line, i) => {
    for (const [label, re] of rules) if (re.test(line)) hits.push({ line: i + 1, label, text: line.trim().slice(0, 160) });
  });
  return hits;
}
export function walk(dir, prefix = "", out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === ".DS_Store" || name === "__pycache__" || name.endsWith(".pyc")) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) throw Error(`symlink not allowed: ${rel}`);
    if (st.isDirectory()) walk(full, rel, out);
    else out.push(rel);
  }
  return out;
}
export function scanDir(dir, extra = []) {
  const findings = [];
  for (const rel of walk(dir)) {
    const buf = fs.readFileSync(path.join(dir, rel));
    if (buf.includes(0)) continue; // binary
    // Vendored minified libraries are third-party code with long lines; scan them anyway, cap line length in the report.
    for (const h of scanText(buf.toString("utf8"), extra)) findings.push({ file: rel, ...h });
  }
  return findings;
}
