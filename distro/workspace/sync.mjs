#!/usr/bin/env node
// Bring V's evolution from v-core into payload/ without losing what the
// distro changed on top (distro/workspace/README.md, "Updating from V").
//
// Every carried file is merged three ways:
//   base   = v-core at the commit in V_CORE_COMMIT (what the payload last took)
//   theirs = v-core at --ref
//   ours   = the file in payload/
// base and theirs are sanitised the same way first (lib.mjs SANITISE), so
// earlier sanitising never shows up as a difference.
//
// Review gate: every skills/<name> and scripts/<entry> v-core changed since the
// base must be in carry.txt, skip.txt or decide.txt. Anything else stops the
// run with UNREVIEWED before a single file is written.
//
//   node sync.mjs --core ~/v-core [--ref origin/main] [--dry-run]
//   node sync.mjs --resolved            after fixing conflict markers
//   --base <rev>                        override V_CORE_COMMIT (repair only)
//   --deny-file <file>                  private literal strings that must not appear (or DISTRO_DENY_FILE)
//
// Exit codes: 0 synced, 1 conflicts left, 2 usage, 3 unreviewed, 4 private content found.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { here, payloadDir, lists, classify, carried, matches, topEntry, sanitise, isText, scanDir, loadDenyFile, walk } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const pendingFile = path.join(here, ".sync-pending");
const commitFile = path.join(here, "V_CORE_COMMIT");
const MARKER = /^(<<<<<<< distro|>>>>>>> v-core@)/m;

function markersLeft(l) {
  const hits = [];
  for (const rel of walk(payloadDir)) {
    if (!carried(l.carry, rel)) continue;
    const t = fs.readFileSync(path.join(payloadDir, rel), "latin1");
    if (MARKER.test(t)) hits.push(rel);
  }
  return hits;
}

if (flag("--resolved")) {
  if (!fs.existsSync(pendingFile)) { console.error("nothing pending (no .sync-pending)"); process.exit(2); }
  const left = markersLeft(lists());
  if (left.length) { console.error("conflict markers still present:\n  " + left.join("\n  ")); process.exit(1); }
  const leaks = scanDir(payloadDir, loadDenyFile(opt("--deny-file")));
  if (leaks.length) { console.error(`private content still present (${leaks.length}), e.g. ${leaks[0].file}:${leaks[0].line} [${leaks[0].label}]`); process.exit(4); }
  const [head] = fs.readFileSync(pendingFile, "utf8").split("\n");
  fs.writeFileSync(commitFile, head + "\n");
  fs.rmSync(pendingFile);
  console.log(`recorded v-core ${head}`);
  process.exit(0);
}

const core = opt("--core");
const ref = opt("--ref", "origin/main");
const dry = flag("--dry-run");
if (!core) { console.error("usage: node sync.mjs --core <v-core checkout> [--ref origin/main] [--dry-run]"); process.exit(2); }
if (fs.existsSync(pendingFile) && !dry) { console.error(".sync-pending exists: finish the last sync (--resolved) or delete it first"); process.exit(2); }

const git = (...a) => execFileSync("git", ["-C", core, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
const rev = (r) => git("rev-parse", "--verify", `${r}^{commit}`).trim();
let base;
try { base = rev(opt("--base") || fs.readFileSync(commitFile, "utf8").trim()); }
catch { console.error("base commit not found in v-core; fetch it, or repair with --base <rev>"); process.exit(2); }
const head = rev(ref);
const l = lists();
console.log(`v-core ${base.slice(0, 12)} -> ${head.slice(0, 12)} (${ref})`);

// ---- gate
const changed = git("-c", "core.quotepath=off", "diff", "--name-only", base, head, "--", "skills", "scripts").split("\n").filter(Boolean);
const entries = [...new Set(changed.map(topEntry).filter(Boolean))].sort();
const unreviewed = entries.filter((e) => !classify(l, e));
if (unreviewed.length) {
  console.log(`UNREVIEWED (${unreviewed.length}) — add each to carry.txt, skip.txt or decide.txt with a reason:`);
  for (const e of unreviewed) console.log("  " + e);
  if (!dry) process.exit(3);
}

// ---- extract base and theirs for carried paths
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "distro-sync-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const carryPaths = l.carry.map((e) => e.glob);
function extract(r, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = git("-c", "core.quotepath=off", "ls-tree", "-r", "--name-only", r, "--", ...carryPaths).split("\n").filter(Boolean);
  for (const f of files) {
    const out = path.join(dir, f);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let buf = execFileSync("git", ["-C", core, "show", `${r}:${f}`], { maxBuffer: 1 << 28 });
    if (isText(f) && !buf.includes(0)) buf = Buffer.from(sanitise(buf.toString("utf8")));
    fs.writeFileSync(out, buf);
  }
  return files;
}
extract(base, path.join(tmp, "base"));
const theirsFiles = extract(head, path.join(tmp, "theirs"));

const res = { added: [], updated: [], merged: [], conflicts: [], removed: [], excluded: [] };
const fileSkipped = (rel) => matches(l.skip, rel) || matches(l.decide, rel);
for (const rel of theirsFiles) {
  if (fileSkipped(rel)) { res.excluded.push(rel); continue; }
  const theirs = path.join(tmp, "theirs", rel), b = path.join(tmp, "base", rel), ours = path.join(payloadDir, rel);
  const same = (x, y) => fs.existsSync(x) && fs.existsSync(y) && fs.readFileSync(x).equals(fs.readFileSync(y));
  if (!fs.existsSync(ours)) {
    res.added.push(rel);
    if (!dry) { fs.mkdirSync(path.dirname(ours), { recursive: true }); fs.copyFileSync(theirs, ours); }
    continue;
  }
  if (same(theirs, ours)) continue;
  if (same(b, ours)) { res.updated.push(rel); if (!dry) fs.copyFileSync(theirs, ours); continue; }
  if (same(b, theirs)) continue; // only the distro changed it
  if (!isText(rel)) { res.conflicts.push(rel + " (binary: pick one by hand)"); continue; }
  const out = path.join(tmp, "merge.out");
  fs.copyFileSync(ours, out);
  const r = spawnSync("git", ["merge-file", "-L", "distro", "-L", `v-core@${base.slice(0, 8)}`, "-L", `v-core@${head.slice(0, 8)}`,
    out, fs.existsSync(b) ? b : "/dev/null", theirs]);
  (r.status === 0 ? res.merged : res.conflicts).push(rel);
  if (!dry) fs.copyFileSync(out, ours);
}
// files v-core deleted that the payload still ships unchanged from the base
for (const rel of walk(path.join(tmp, "base"))) {
  if (fs.existsSync(path.join(tmp, "theirs", rel))) continue;
  const ours = path.join(payloadDir, rel);
  if (fs.existsSync(ours) && fs.readFileSync(ours).equals(fs.readFileSync(path.join(tmp, "base", rel)))) {
    res.removed.push(rel);
    if (!dry) fs.rmSync(ours);
  }
}

const show = (t, xs) => { if (xs.length) console.log(`${t} (${xs.length}):\n  ` + xs.join("\n  ")); };
show("added", res.added); show("updated (distro unchanged)", res.updated); show("merged", res.merged);
show("removed", res.removed); show("not taken (file-level skip/decide)", res.excluded); show("CONFLICTS", res.conflicts);

// ---- carried skills must not call scripts the payload does not ship
const missing = new Set();
const scanRoot = dry ? path.join(tmp, "theirs") : payloadDir;
// Skills only: carried code already probes for V-only scripts and stays quiet when they are absent.
const exists = (p) => [payloadDir, path.join(tmp, "theirs")].some((d) => fs.existsSync(path.join(d, p)));
for (const rel of walk(scanRoot)) {
  if (!rel.startsWith("skills/") || !carried(l.carry, rel) || !isText(rel) || fileSkipped(rel)) continue;
  const skillDir = rel.split("/").slice(0, 2).join("/");
  const t = fs.readFileSync(path.join(scanRoot, rel), "utf8");
  for (const m of t.matchAll(/(?<![\w/.-])scripts\/([\w.-]+(?:\/[\w.-]+)*\.(?:py|sh|mjs|cjs|js))\b/g)) {
    if (!exists(`scripts/${m[1]}`) && !exists(`${skillDir}/scripts/${m[1]}`)) missing.add(`scripts/${m[1]}  <- ${rel}`);
  }
}
show("MISSING DEPENDENCY (carried text names a script the payload lacks; carry it or reword)", [...missing].sort());

if (dry) { console.log("(dry run, nothing written)"); process.exit(unreviewed.length ? 3 : 0); }

// ---- leak scan over the whole payload
const leaks = scanDir(payloadDir, loadDenyFile(opt("--deny-file")));
if (leaks.length) {
  console.log(`PRIVATE CONTENT (${leaks.length}) — sanitise or drop before release:`);
  for (const h of leaks.slice(0, 40)) console.log(`  ${h.file}:${h.line} [${h.label}] ${h.text}`);
}
if (res.conflicts.length || leaks.length) {
  // Not recorded as synced until a person has fixed it; --resolved re-checks markers.
  fs.writeFileSync(pendingFile, `${head}\n${base}\n`);
  console.log("fix the conflicts / private content above, then run: node sync.mjs --resolved");
  process.exit(res.conflicts.length ? 1 : 4);
}
fs.writeFileSync(commitFile, head + "\n");
console.log(`synced from v-core ${head}`);
