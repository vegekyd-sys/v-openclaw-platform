// Property check for big-session-history-reads: the bounded branch summary must return exactly
// what V's summarizeSessionBranches returns, for random transcript trees with forks, leaf
// controls, resets, side appends, parentless rows, duplicate ids, forward/missing parents and
// cycles. Both function sets are cut from the real files (V's dist and the release file) and run
// on the real transcript-tree module; the tree input for the bounded side is the navigation
// skeleton the reset-boundary SQL projection selects (JS mirror; the SQL itself is covered by the
// handler A/B on real rows).
// Usage: node branch-summary-equivalence.mjs <v-dist> <release-file> [cases]
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const [distDir, releaseFile, casesArg] = process.argv.slice(2);
assert(distDir && releaseFile);
const CASES = Number(casesArg ?? 20000);
const tree = await import(pathToFileURL(path.join(distDir, "transcript-tree-BH69pMSi.js")).href);
const { a: asOptionalRecord } = await import(pathToFileURL(path.join(distDir, "record-coerce-DItp3I4t.js")).href);
const fn = (source, name) => {
  const body = source.match(new RegExp(`\\nfunction ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert(body, name);
  return body;
};
const vSource = fs.readFileSync(path.join(distDir, "session-accessor-K0XuW6ln.js"), "utf8");
const release = fs.readFileSync(releaseFile, "utf8");
assert(!vSource.includes("bounded-branch-list-v1") && release.includes("bounded-branch-list-v1"));
// Headline text is a stand-in with the real contract: user/assistant only, never "".
const extractHeadlineText = (message) => {
  const record = asOptionalRecord(message);
  if (record?.role !== "user" && record?.role !== "assistant") return;
  return typeof record.text === "string" ? record.text.replace(/\s+/g, " ").trim() || undefined : undefined;
};
const shared = ["sessionBranchTipNodes", "truncateBranchHeadline"].map((name) => fn(vSource, name)).join("\n");
const deps = { scanSessionTranscriptTree: tree.c, isSessionTranscriptLeafControl: tree.n, asOptionalRecord, extractHeadlineText, BRANCH_HEADLINE_MAX_CHARS: 120 };
const build = (source, names, entry) => new Function(...Object.keys(deps), `${shared}\n${names.map((name) => fn(source, name)).join("\n")}\nreturn ${entry};`)(...Object.values(deps));
const original = build(vSource, ["summarizeSessionBranches", "summarizeSessionBranch"], "summarizeSessionBranches");
const bounded = build(release, ["summarizeSessionBranchesBounded", "summarizeSessionBranchBounded", "resolveSessionBranchHeadline"], "summarizeSessionBranchesBounded");

// JS mirror of projectResetBoundaryNavigationSql for object rows.
const NAV = ["type", "id", "parentId", "targetId", "appendParentId", "appendMode", "timestamp", "firstKeptEntryId"];
const skeleton = (event) => {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  const out = {};
  for (const key of Object.keys(event)) if (NAV.includes(key)) out[key] = event[key];
  const message = event.message;
  out.message = { role: message && typeof message === "object" && !Array.isArray(message) && Object.hasOwn(message, "role") ? message.role : null };
  return out;
};

let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function randomTranscript() {
  const ids = [], events = [{ type: "session", id: "hdr", version: 3, timestamp: "2026-10-19T00:00:00Z" }];
  const n = 1 + Math.floor(rand() * 40);
  const ref = () => rand() < 0.08 ? null : rand() < 0.06 ? `missing-${Math.floor(rand() * 3)}` : rand() < 0.05 ? `e${ids.length + 1 + Math.floor(rand() * 3)}` : ids.length ? pick(ids) : null;
  for (let i = 0; i < n; i++) {
    const id = rand() < 0.05 && ids.length ? pick(ids) : `e${i}`;
    const r = rand();
    const ts = rand() < 0.9 ? `2026-10-19T00:${String(i).padStart(2, "0")}:00Z` : rand() < 0.5 ? 1792300000000 + i : " ";
    let event;
    if (r < 0.55) {
      const role = pick(["user", "assistant", "assistant", "toolResult", "system", undefined]);
      const text = pick(["hello world", "  ", "", "第二条\n消息", undefined, "x".repeat(150)]);
      event = { type: "message", id, parentId: ref(), timestamp: ts, message: role === undefined ? (rand() < 0.5 ? "plain" : { text }) : { role, text, content: [{ type: "text", text }] } };
    } else if (r < 0.65) event = { type: "leaf", id, parentId: ref(), targetId: ref(), ...rand() < 0.3 ? { appendParentId: ref() } : {}, ...rand() < 0.2 ? { appendMode: pick(["side", "main"]) } : {}, timestamp: ts };
    else if (r < 0.7) event = { type: "reset", id, parentId: ref(), timestamp: ts, ...rand() < 0.5 ? { firstKeptEntryId: ref() } : {} };
    else if (r < 0.78) event = { type: "compaction", id, parentId: ref(), summary: "s".repeat(50), firstKeptEntryId: ref(), timestamp: ts };
    else if (r < 0.86) event = { type: "custom", id, parentId: ref(), customType: "x", data: { big: "y".repeat(20) }, ...rand() < 0.3 ? { appendMode: "side" } : {} };
    else if (r < 0.92) event = { type: pick(["message", "custom_message", "label"]), id, timestamp: ts, message: { role: "user", text: "parentless" } }; // no parentId key
    else event = { type: pick(["unknown", "model_change", "thinking_level_change"]), id, parentId: ref(), timestamp: ts };
    events.push(event);
    if (!ids.includes(id)) ids.push(id);
  }
  return events;
}

let headlineReads = 0, totalMessages = 0, multiBranch = 0;
for (let i = 0; i < CASES; i++) {
  const events = randomTranscript();
  const expected = original(events);
  const actual = bounded(events.map(skeleton), (index) => { headlineReads++; return extractHeadlineText(events[index]?.message); });
  totalMessages += events.filter((e) => e.type === "message").length;
  if (expected.length > 1) multiBranch++;
  if (!isDeepStrictEqual(actual, expected)) {
    console.error(JSON.stringify({ case: i, events, expected, actual }, null, 1));
    assert.fail(`case ${i} differs`);
  }
}
console.log(JSON.stringify({ cases: CASES, multiBranch, totalMessages, headlineReads }));
