// Candidate A/B for the 2026-10-19 02:20 V stall: a Control UI opened a very large session, and
// chat.history (49.7 s) plus sessions.branches.list (49.7 s) held the Gateway main thread ~43 s
// (RSS 7.55 GiB, heap 4.24 GiB).
//
// Arm "v" is the candidate runtime untouched (asserted equal to V's live bytes for every file the
// patch replaces); arm "bounded" is a hard-linked copy with only the release files swapped in.
// Both arms run each operation in their own fresh process against the same private database that
// holds one session inflated to V's size. Reported per arm and operation: wall time, the longest
// event-loop block, peak RSS, and the reply digest; replies are compared field by field.
// PROFILE=1 adds a CPU profile per arm (top self/total time by function).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { buildBigSessionDatabase } from "./big-session-history-fixture.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && state && data && sharedState, "candidate runtime environment is required");
const env = (name, fallback) => process.env[name] ?? fallback;
// "history": no compaction, ~22k visible messages, ~265 MB -- V's 9e7ce112 (20,788 messages after
// its last boundary) and 2b21b4a0 (26,604 rows / 265 MB). "branches": 300+ branch tips from leaf
// controls and resets -- V's 7da00997 (22 leaf rows, 554 compactions).
const SESSIONS = JSON.parse(env("SESSIONS", JSON.stringify([
  { name: "history", sourceSession: "339059a5-8f51-41e2-acb9-efc305a3d406", inflate: 7, mediaRows: 45, mediaImagesPerRow: 5, mediaImageChars: 800_000 },
  { name: "branches", sourceSession: "83c2261f-fb4a-4644-92c4-e9054292327b", inflate: 4, mediaRows: 10, mediaImagesPerRow: 5, mediaImageChars: 800_000 },
])));
// ";" separates op groups; each group runs in its own fresh process (cold caches). The first op of
// a group warms the database open and config load on the other session.
const OPS = env("OPS", "branches/history:1,history/open:1000;branches/history:1,history/history:1000,history/history:1000,history/history:200,history/branches,history/branches;history/history:1,branches/branches,branches/branches,branches/history:1000");
const ROUNDS = Number(env("ROUNDS", 1));
const PROFILE = env("PROFILE", "0") === "1";
const ONLY_V = env("ONLY_V", "0") === "1";
const sha = (value) => createHash("sha256").update(value).digest("hex");

// Release files: { name: { before: V live sha256, source: release file } }.
const RELEASE = JSON.parse(env("RELEASE", "{}"));
const vDist = path.join(runtime, "openclaw", "dist");
for (const [name, { before }] of Object.entries(RELEASE)) assert.equal(sha(fs.readFileSync(path.join(vDist, name))), before, `candidate runtime ${name} is V's live bytes`);

const branchRelease = RELEASE["session-accessor-K0XuW6ln.js"];
if (branchRelease) console.log(execFileSync(process.execPath, [new URL("./branch-summary-equivalence.mjs", import.meta.url).pathname, vDist, new URL(`../../${branchRelease.source}`, import.meta.url).pathname, env("PROPERTY_CASES", "20000")], { encoding: "utf8" }).trim());
const timings = {};
let started = performance.now();
// The mirror disk is nearly full: the private database lives on the root disk, linked into state.
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const scratch = fs.mkdtempSync("/var/tmp/big-session-history-");
const link = path.join(state, dbRel);
fs.mkdirSync(path.dirname(link), { recursive: true });
assert(!fs.existsSync(link), "candidate state already has a makaron database");
fs.symlinkSync(path.join(scratch, "openclaw-agent.sqlite"), link);
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
// FIXTURE=inflate: the private sessions above. FIXTURE=backup: an online backup of the whole shared
// mirror database (every session entry, as the Gateway sees it), with BACKUP_SESSIONS by key.
const FIXTURE = env("FIXTURE", "inflate");
const fixture = FIXTURE === "backup" ? (() => {
  execFileSync("sqlite3", [path.join(sharedState, dbRel), `.backup '${path.join(scratch, "openclaw-agent.sqlite")}'`], { stdio: "inherit" });
  const named = Object.entries(JSON.parse(env("BACKUP_SESSIONS", '{"main":"agent:makaron:main"}'))).map(([name, sessionKey]) => ({ name, sessionKey }));
  // BRANCH_SAMPLE=N: the N largest current sessions plus every current session with leaf controls.
  const sample = Number(env("BRANCH_SAMPLE", 0));
  if (!sample) return named;
  const db = new DatabaseSync(path.join(scratch, "openclaw-agent.sqlite"), { readOnly: true });
  const keys = db.prepare(`SELECT session_key FROM (
      SELECT n.session_key, s.indexed_seq AS size FROM session_nodes n JOIN session_transcript_index_state s ON s.session_id = n.current_session_id ORDER BY s.indexed_seq DESC LIMIT ?)
    UNION SELECT n.session_key FROM session_nodes n WHERE EXISTS (SELECT 1 FROM transcript_event_identities i WHERE i.session_id = n.current_session_id AND i.event_type = 'leaf')`).all(sample).map((r) => r.session_key);
  db.close();
  return [...named, ...keys.map((sessionKey, i) => ({ name: `s${i}`, sessionKey }))];
})() : buildBigSessionDatabase({
  runtime, srcPath: path.join(sharedState, dbRel), dstPath: path.join(scratch, "openclaw-agent.sqlite"), sessions: SESSIONS,
}).map((session, i) => ({ name: SESSIONS[i].name, ...session }));
timings.fixtureMs = Math.round(performance.now() - started);
console.log(JSON.stringify({ fixture }));

const arms = { v: vDist };
if (!ONLY_V) {
  const root = path.join(runtime, "openclaw-bounded");
  fs.rmSync(root, { recursive: true, force: true });
  execFileSync("cp", ["-al", path.join(runtime, "openclaw"), root]);
  for (const [name, { source, after }] of Object.entries(RELEASE)) {
    const target = path.join(root, "dist", name);
    fs.rmSync(target);
    fs.copyFileSync(new URL(`../../${source}`, import.meta.url), target);
    assert.equal(sha(fs.readFileSync(target)), after, `${name} release bytes`);
    assert.equal(sha(fs.readFileSync(path.join(vDist, name))), RELEASE[name].before, "arm v untouched");
  }
  arms.bounded = path.join(root, "dist");
}

const work = path.join(data, "big-session-history");
const runArm = (arm, round, group, ops) => {
  const outDir = path.join(work, `${arm}-${round}-${group}`);
  const profDir = path.join(work, `prof-${arm}-${round}-${group}`);
  const args = [...PROFILE ? ["--cpu-prof", `--cpu-prof-dir=${profDir}`, "--cpu-prof-interval=500"] : [],
    new URL("./big-session-history-arm.mjs", import.meta.url).pathname, arms[arm], outDir, fixture.map((s) => `${s.name}=${s.sessionKey}`).join(","), ops];
  const output = execFileSync(process.execPath, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 1_800_000, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=12288" } });
  const lines = output.trim().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  for (const line of lines) console.log(JSON.stringify({ arm, round, group, ...line, file: undefined }));
  if (PROFILE) summarizeProfile(arm, profDir);
  return lines;
};

function summarizeProfile(arm, dir) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".cpuprofile"))) {
    const profile = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    const parent = new Map();
    for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
    const selfUs = new Map();
    profile.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
    const label = (node) => `${node.callFrame.functionName || "(anon)"} ${path.basename(node.callFrame.url || "")}:${node.callFrame.lineNumber + 1}`;
    const self = new Map(), total = new Map();
    for (const [id, us] of selfUs) {
      const node = byId.get(id);
      self.set(label(node), (self.get(label(node)) ?? 0) + us);
      const seen = new Set();
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const l = label(byId.get(cur));
        if (seen.has(l)) continue;
        seen.add(l);
        total.set(l, (total.get(l) ?? 0) + us);
      }
    }
    const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, us]) => `${Math.round(us / 1000)}ms ${name}`);
    console.log(JSON.stringify({ arm, profile: file, self: top(self, 30), total: top(total, 60).filter((l) => !/\(root\)|\(program\)|processTicksAndRejections|runMicrotasks/u.test(l)) }, null, 1));
  }
}

const results = {};
started = performance.now();
const groups = (env("BRANCH_SAMPLE", "0") !== "0" ? fixture.filter((s) => /^s\d+$/u.test(s.name)).map((s) => `${s.name}/branches`).join(",") : OPS).split(";");
console.log(JSON.stringify({ groups: groups.map((g) => g.split(",").length) }));
for (let round = 0; round < ROUNDS; round++) for (const [group, ops] of groups.entries()) for (const arm of (round + group) % 2 ? Object.keys(arms).reverse() : Object.keys(arms)) results[`${arm}-${round}-${group}`] = runArm(arm, round, group, ops);
timings.armsMs = Math.round(performance.now() - started);

if (!ONLY_V) {
  // Field-by-field: every reply of every op must equal arm v's reply in the same round.
  const diffs = [];
  const walk = (a, b, at) => {
    if (isDeepStrictEqual(a, b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${at}.${key}`);
      return;
    }
    diffs.push({ at, v: JSON.stringify(a)?.slice(0, 200), bounded: JSON.stringify(b)?.slice(0, 200) });
  };
  let compared = 0;
  for (let round = 0; round < ROUNDS; round++) for (const group of groups.keys()) {
    const v = results[`v-${round}-${group}`], b = results[`bounded-${round}-${group}`];
    v.forEach((line, i) => {
      walk(JSON.parse(fs.readFileSync(line.file, "utf8")), JSON.parse(fs.readFileSync(b[i].file, "utf8")), `round${round}.group${group}.${line.op}#${i}`);
      compared++;
    });
  }
  console.log(JSON.stringify({ compared, differences: diffs.length, diffs: diffs.slice(0, 40) }, null, 1));
  assert.equal(diffs.length, 0, "bounded replies differ from V's");
}
console.log(JSON.stringify({ timings }));
fs.rmSync(work, { recursive: true, force: true });
fs.rmSync(path.join(runtime, "openclaw-bounded"), { recursive: true, force: true });
fs.rmSync(link, { force: true });
