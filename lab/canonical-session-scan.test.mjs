import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";

const source = fs.readFileSync(new URL("./release-files/session-accessor.sqlite-transcript-state-Cz9g7S9v.js", import.meta.url), "utf8");
const block = source.match(/\t\/\/ Validation needs identity[\s\S]*?: "session_nodes\.entry_json";\n/)?.[0];
assert(block);
const projection = block.match(/sql`([\s\S]*?)`\.as\("entry_json"\)/)?.[1]; assert(projection);
const baseline = source.replace(block, "").replace('"session_nodes.current_session_id",\n\t\tentryJson,', '"session_nodes.current_session_id",\n\t\t"session_nodes.entry_json",');

function readProjected(entry, valid = 1) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE session_nodes(entry_json, entry_valid INTEGER)");
    db.prepare("INSERT INTO session_nodes VALUES (?, ?)").run(entry, valid);
    return db.prepare(`SELECT ${projection} AS result FROM session_nodes`).get().result;
  } finally {db.close();}
}
test("only the canonical validation SELECT projection differs from the pinned native file", () => {
  assert.equal(createHash("sha256").update(baseline).digest("hex"), "686ae2059ab36a85f9c93a9de9fdc8c75212b5fc978ebcb780c6abca1bd595e5");
  assert(block.includes('visit === void 0'));
  assert(block.includes('OPENCLAW_CANONICAL_SCAN_LEAN !== "0"'));
  assert.equal((source.match(/const entryJson = visit === void 0/g) ?? []).length, 1);
});
test("only the two existing native metadata payload fields are omitted", () => {
  const input = {sessionId: "one", updatedAt: 1, parentSessionKey: "agent:makaron:main",
    spawnedBy: "agent:makaron:main", forkSource: {sessionKey: "agent:makaron:main"},
    delivery: {lastContext: {channel: "feishu", to: "chat:AbCd", threadId: "OpaqueCase"}},
    origin: {channel: "feishu", to: "chat:AbCd"}, owner: {type: "human", id: "fixture"},
    skillsSnapshot: {prompt: "large".repeat(1000)}, systemPromptReport: {tools: "large".repeat(1000)},
    compactionCheckpoints: [{state: "keep"}], unknownFutureField: {nested: true}};
  const {skillsSnapshot, systemPromptReport, ...expected} = input;
  assert.deepEqual(JSON.parse(readProjected(JSON.stringify(input))), expected);
});
test("invalid JSON inside either omitted field is still returned for native rejection", () => {
  for (const field of ["skillsSnapshot", "systemPromptReport"]) {
    const bad = `{"sessionId":"one","updatedAt":1,"${field}":[}`;
    assert.equal(readProjected(bad), bad); assert.throws(() => JSON.parse(readProjected(bad)));
  }
});
test("invalid and retained-window sentinel rows retain exact bytes", () => {
  for (const valid of [-1, 0, 2]) for (const entry of ["{}", " { } ", '{"skillsSnapshot":123}', "not json"]) {
    assert.equal(readProjected(entry, valid), entry);
  }
});
test("duplicate identity, lineage and delivery keys keep JSON.parse last-key semantics", () => {
  for (const pair of ['"sessionId":"bad","sessionId":"good"', '"sessionId":"good","sessionId":null',
    '"updatedAt":1,"updatedAt":2', '"parentSessionKey":"a","parentSessionKey":"b"',
    '"delivery":{"lastContext":{"to":"one"}},"delivery":{"lastContext":{"to":"two"}}']) {
    const entry = `{${pair},"skillsSnapshot":{"s":"discard"},"systemPromptReport":{"p":"discard"}}`;
    const original = JSON.parse(entry); delete original.skillsSnapshot; delete original.systemPromptReport;
    assert.deepEqual(JSON.parse(readProjected(entry)), original);
  }
});
test("JSON numbers, escapes and non-object identities are not normalized into valid identities", () => {
  for (const entry of ['{"sessionId":"one","updatedAt":1e999}', '{"sessionId":"one","updatedAt":-0}',
    '{"sessionId":"\\ud800","updatedAt":1}', '{"sessionId":"one","updatedAt":null}',
    '{"sessionId":1,"updatedAt":1}', "null", "[]", '"plain"', "2"]) {
    assert.deepEqual(JSON.parse(readProjected(entry)), JSON.parse(entry));
  }
});
test("JSON5 remains invalid to the native strict JSON parser", () => {
  for (const entry of ["{sessionId:'one',updatedAt:1}", '{"sessionId":"one","updatedAt":1,}',
    '{"sessionId":"one","updatedAt":NaN}']) {
    assert.equal(readProjected(entry), entry); assert.throws(() => JSON.parse(readProjected(entry)));
  }
});
test("non-text SQLite values do not gain JSON text validity", () => {
  for (const entry of [null, 42, new Uint8Array(Buffer.from('{"sessionId":"one","updatedAt":1}'))]) {
    assert.deepEqual(readProjected(entry), entry);
  }
});
test("unknown large nested fields and similarly named keys are preserved", () => {
  const entry = {sessionId: "one", updatedAt: 1, SkillsSnapshot: {x: "keep"},
    nested: {skillsSnapshot: "keep", systemPromptReport: "keep"},
    "skillsSnapshot.extra": "keep", "__proto__": null, future: [null, "\\\"", {a: 1}]};
  assert.deepEqual(JSON.parse(readProjected(JSON.stringify(entry))), JSON.parse(JSON.stringify(entry)));
});
