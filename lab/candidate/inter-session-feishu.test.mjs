// Offline checks for the inter-session Feishu e2e candidates (lab/candidate/inter-session-feishu.mjs,
// inter-session-support.mjs): the plans carry exactly the R1 bytes with V's `before` sha256, and the
// owner-readback judge reads Feishu's message shapes the way the scenarios expect.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import os from "node:os";
import {spawnSync} from "node:child_process";

import { evalReadbackCheck, messageText, normalizeMessage, requesterTailMs, tailStats, SLEEP_RE, summaryProof, interjectionProof, requesterToolCalls, admissionBusyHookSource } from "./inter-session-support.mjs";
import {FakeFeishu} from "./feishu-fake-open-api.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "tests/fixtures/inter-session-v-bytes.json"), "utf8"));
const vSha = Object.fromEntries(fixture.files.map((f) => [f.file, f.sha256]));
const PLANS = ["inter-session-feishu-v-env", "inter-session-feishu-vlab-env", "inter-session-control-stock", "inter-session-control-fallback", "inter-session-crash", "inter-session-tail", "inter-session-taskroom"];
const R1 = ["sessions-spawn-tool-1FQMTkIo.js", "openclaw-tools-BODVdJQD.js", "get-reply-CqW1y05D.js", "agent-runner.runtime-CAdsMsQt.js", "dispatch-from-config-DOJq_7CI.js", "task-registry-activity-DSlVVJwD.js", "monitor.account-WFdlCDhR.js"];

function pluginFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "tests") walk(p); } else out.push(p);
    }
  };
  walk("apps/v-session-relay/plugin");
  return out.sort();
}

test("plans: every e2e plan runs the driver as lab-db91-parity and carries the shared inputs", () => {
  for (const name of PLANS) {
    const plan = JSON.parse(fs.readFileSync(path.join(HERE, `${name}.plan.json`), "utf8"));
    assert.deepEqual(plan.command.slice(1), ["lab/candidate/inter-session-feishu.mjs", "run"], name);
    assert.equal(plan.user, "lab-db91-parity", name);
    for (const f of ["lab/candidate/inter-session-feishu.mjs", "lab/candidate/inter-session-support.mjs", "tests/fixtures/inter-session-v-bytes.json", "lab/candidate/inter-session-workspace.mjs"]) assert(plan.support.includes(f), `${name} lacks ${f}`);
    for (const f of plan.support.filter((p) => !path.isAbsolute(p))) assert(fs.existsSync(path.join(REPO, f)), `${name}: ${f} does not exist`);
    assert.equal(plan.support.filter((p) => p.endsWith("inter-session-workspace.manifest.json")).length, 1, `${name}: exactly one workspace manifest`);
    assert(["full", "stock", "fallback"].includes(plan.env.ISC_VARIANT), name);
    assert.equal(plan.env.ISC_FEISHU_MODE, "mock", `${name}: live sends must be an explicit override`);
    for (const file of ["feishu-fake-open-api.mjs", "feishu-no-live.cjs"]) assert(plan.support.includes(`lab/candidate/${file}`));
  }
});

test("plans: R1 bytes with V's before sha256; the whole plugin (no tests) as new files", () => {
  const plugin = pluginFiles();
  for (const name of PLANS) {
    const plan = JSON.parse(fs.readFileSync(path.join(HERE, `${name}.plan.json`), "utf8"));
    if (plan.env.ISC_VARIANT === "stock") { assert.deepEqual(plan.files, [], `${name}: the control group runs V's bytes`); continue; }
    const byBase = new Map(plan.files.filter((f) => f.before).map((f) => [path.basename(f.target), f]));
    assert.deepEqual([...byBase.keys()].sort(), [...R1].sort(), name);
    for (const [base, f] of byBase) {
      assert.equal(f.before, vSha[base], `${name}: before of ${base}`);
      assert.equal(path.basename(f.source), base, `${name}: source of ${base}`);
      assert(fs.existsSync(path.join(REPO, f.source)), `${name}: ${f.source}`);
      assert.notEqual(fs.readFileSync(path.join(REPO, f.source)).length, 0);
    }
    const mapped = plan.files.filter((f) => f.before === null).map((f) => f.source).sort();
    assert.deepEqual(mapped, plugin, `${name}: plugin files`);
    for (const f of plan.files.filter((x) => x.before === null)) assert.equal(f.target, `extensions/v-session-relay/${f.source.slice("apps/v-session-relay/plugin/".length)}`);
  }
});

const msg = (o) => ({ id: "om_x", createMs: 1000, updateMs: 1000, type: "text", parentId: null, senderType: "app", text: "", updated: false, ...o });

test("readback: message / count / replies / after / orphans / everText / reactions", () => {
  const msgs = [
    msg({ id: "om_anchor", createMs: 1000, text: "📨 来自「Tianyi 私聊」的请求 #7F3A\n—\n做一件事 IS1-F2" }),
    msg({ id: "om_card", createMs: 2000, type: "interactive", parentId: "om_anchor", text: "IS1-F2 完成" }),
    msg({ id: "om_human", createMs: 2500, senderType: "user", text: "插话" }),
    msg({ id: "om_back", createMs: 3000, text: "↩️「VLab 发布验收 B」交回了 #7F3A 的结果" }),
    msg({ id: "om_wake", createMs: 4000, type: "interactive", text: "汇报" }),
    msg({ id: "om_stray", createMs: 4500, type: "interactive", parentId: null, text: "孤儿卡" }),
  ];
  assert.equal(evalReadbackCheck({ kind: "message", messageId: "om_anchor", includesAll: ["📨", "#7F3A"], excludesAll: ["⏳"] }, msgs).ok, true);
  assert.equal(evalReadbackCheck({ kind: "message", messageId: "om_anchor", excludesAll: ["#7F3A"] }, msgs).ok, false);
  assert.equal(evalReadbackCheck({ kind: "message", messageId: "om_missing" }, msgs).ok, false);
  assert.equal(evalReadbackCheck({ kind: "count", from: 0, to: 9999, textRe: "#7F3A(\\D|$)", startsWithAny: ["📨", "❓"], equals: 1 }, msgs).ok, true);
  assert.equal(evalReadbackCheck({ kind: "count", from: 0, to: 9999, textRe: "^(↩️|⚠️|⏹).*#7F3A", equals: 1 }, msgs).ok, true);
  assert.equal(evalReadbackCheck({ kind: "count", from: 1001, to: 2999, senderType: "app", equals: 0 }, msgs).ok, false, "the card is inside the window");
  assert.equal(evalReadbackCheck({ kind: "count", from: 2001, to: 2999, senderType: "app", equals: 0 }, msgs).ok, true, "a human message is not a bot message");
  assert.equal(evalReadbackCheck({ kind: "replies", parentId: "om_anchor", senderType: "app", min: 1 }, msgs).ok, true);
  assert.equal(evalReadbackCheck({ kind: "replies", parentId: "om_anchor", senderType: "app", min: 1, createdAfter: 2000 }, msgs).ok, false);
  assert.equal(evalReadbackCheck({ kind: "after", afterId: "om_back", senderType: "app", types: ["interactive"], excludeTextRe: "^(↩️|📨)", min: 1, max: 1, to: 4200 }, msgs).ok, true);
  assert.equal(evalReadbackCheck({ kind: "after", afterId: "om_back", senderType: "app", types: ["interactive"], min: 1, max: 1 }, msgs).ok, false, "the stray card is a second one");
  assert.equal(evalReadbackCheck({ kind: "orphans", from: 0, to: 9999, allowedParents: ["om_anchor"] }, msgs).ok, false);
  assert.equal(evalReadbackCheck({ kind: "orphans", from: 0, to: 4400, allowedParents: ["om_anchor"] }, msgs.slice(0, 3)).ok, true);
  const watch = new Map([["oc_b", [{ ...msgs[0], text: `${msgs[0].text}\n⏳ 这里正在处理别的事`, seenAt: 1500 }]]]);
  assert.equal(evalReadbackCheck({ kind: "everText", chat: "oc_b", messageId: "om_anchor", includesAll: ["⏳"] }, msgs, watch).ok, true);
  assert.equal(evalReadbackCheck({ kind: "everText", chat: "oc_c", messageId: "om_anchor", includesAll: ["⏳"] }, msgs, watch).ok, null, "no snapshots: unknown, not pass");
  assert.equal(evalReadbackCheck({ kind: "reactions", messageId: "om_anchor", equals: 0 }, msgs, null, { readReactions: () => 0 }).ok, true);
  assert.equal(evalReadbackCheck({ kind: "reactions", messageId: "om_anchor", equals: 0 }, msgs, null, { readReactions: () => 1 }).ok, false);
  assert.equal(evalReadbackCheck({ kind: "reactions", messageId: "om_anchor", equals: 0 }, msgs, null, { readReactions: () => null }).ok, null);
});

test("readback: the text of text, post and interactive bodies; ms server times; parent ids", () => {
  assert.equal(messageText("text", JSON.stringify({ text: "📨 来自" })), "📨 来自");
  const post = { title: "", content: [[{ tag: "text", text: "↩️「B」交回了 #7F3A 的结果" }]], content_v2: [[{ tag: "md", text: "↩️「B」交回了 #7F3A 的结果" }]] };
  assert.equal(messageText("post", JSON.stringify(post)), "↩️「B」交回了 #7F3A 的结果");
  const card = { title: "V", elements: [[{ tag: "text", text: "第一段" }], [{ tag: "markdown", content: "⏳ 后台 3 项进行中 · 会话请求 3" }]] };
  assert.match(messageText("interactive", JSON.stringify(card)), /第一段[\s\S]*会话请求 3/u);
  const n = normalizeMessage({ message_id: "om_1", chat_id: "oc_1", msg_type: "text", create_time: "1792477282828", update_time: "1792477282999", parent_id: "om_0", updated: true, sender: { sender_type: "app", id: "cli_x" }, body: { content: JSON.stringify({ text: "x" }) } });
  assert.deepEqual([n.createMs, n.updateMs, n.parentId, n.senderType, n.updated, n.text], [1792477282828, 1792477282999, "om_0", "app", true, "x"]);
});

test("requester_tail_ms: batch sealed at the requester run's end minus the send's acceptance", () => {
  assert.equal(requesterTailMs({ createdAt: 1_000 }, { sealedAt: 31_000 }), 30_000);
  assert.equal(requesterTailMs({ createdAt: 1_000 }, { sealedAt: null }), null);
  const s = tailStats([70_000, 12_000, 30_000, null, 45_000, 61_000]);
  assert.deepEqual([s.n, s.min, s.max, s.under60s, s.p50], [5, 12_000, 70_000, 3, 45_000]);
  assert.match("sleep 75 && date", SLEEP_RE);
  assert.match("timeout 120 bash -c x", SLEEP_RE);
  assert.match("while true; do sleep 5; done", SLEEP_RE);
  assert.doesNotMatch("date && echo done", SLEEP_RE);
});

test("claude-cli transcripts: toolcall blocks named mcp__openclaw__* and embedded tool_result blocks", async () => {
  const S = await import("./inter-session-support.mjs");
  const call = { role: "assistant", timestamp: 1000, content: [{ type: "toolcall", id: "tu1", name: "mcp__openclaw__sessions_send", arguments: { sessionKey: "agent:makaron:feishu:group:oc_x", timeoutSeconds: 120, message: "hi" } }] };
  const result = { role: "user", timestamp: 2000, content: [{ type: "tool_result", tool_use_id: "tu1", name: "mcp__openclaw__sessions_send", content: [{ type: "text", text: "{\"status\":\"ok\",\"reply\":\"TAG-1\"}" }] }] };
  const [c] = S.reduceMessages(call);
  assert.equal(c.tools[0].name, "sessions_send");
  assert.equal(c.tools[0].timeoutSeconds, 120);
  const out = S.reduceMessages(result);
  assert.equal(out.length, 2);
  assert.equal(out[1].role, "toolResult");
  assert.equal(out[1].toolName, "sessions_send");
  assert.match(out[1].text, /TAG-1/u);
  // a native toolResult message stays one entry
  assert.equal(S.reduceMessages({ role: "toolResult", toolName: "sessions_send", content: [{ type: "text", text: "x" }] }).length, 1);
});

test("codex transcripts: a toolResult message whose content is a toolResult block keeps its text", async () => {
  const S = await import("./inter-session-support.mjs");
  const [m] = S.reduceMessages({ role: "toolResult", toolName: "sessions_send", timestamp: 1, content: [{ type: "toolResult", content: [{ type: "text", text: "{\"status\":\"ok\",\"reply\":\"TAG-2\"}" }] }] });
  assert.match(m.text, /TAG-2/u);
});

test("summary proof rejects early, missing, partial and numerically wrong results", () => {
  const rooms = ['T-a=323', 'T-b=667', 'T-c=1792580000'].map(text => ({result: {text}}));
  const args = {tag: 'T', wakeRunId: 'wake-1', rooms, result: {fromRunId: 'wake-1', text: 'T-a=323; T-b=667; T-c=1792580000'}};
  assert.equal(summaryProof(args).ok, true);
  assert.equal(summaryProof({...args, result: {...args.result, fromRunId: 'initial'}}).ok, false);
  assert.equal(summaryProof({...args, result: {...args.result, text: '已开工，同一个操作执行一次'}}).ok, false);
  assert.equal(summaryProof({...args, result: {...args.result, text: 'T-a=323; T-b=667'}}).ok, false);
  assert.equal(summaryProof({...args, result: {...args.result, text: 'T-a=3230; T-b=667; T-c=1792580000'}}).ok, false);
  assert.equal(summaryProof({...args, rooms: [{result: {text: 'T-a=324'}}, ...rooms.slice(1)]}).ok, false);
});

test("owner steering can be committed without another user row; non-owner influence still fails", () => {
  const owner = interjectionProof({owner:true,resultText:'插话已收到，原任务完成',endedAt:100});
  assert.equal(owner.handled, true); assert.equal(owner.steered, true);
  const intruder = interjectionProof({owner:false,user:{atMs:200},userAfterResult:true,resultText:'插话已收到'});
  assert.equal(intruder.nonOwnerIsolated, false);
  const queued = interjectionProof({owner:false,user:{atMs:50},userAfterResult:true,resultText:'原任务完成'});
  assert.equal(queued.handled && queued.nonOwnerIsolated, true);
  assert.equal(interjectionProof({owner:false,user:{atMs:200},resultText:'原任务完成'}).nonOwnerIsolated, false, 'missing committed ordering is not evidence of isolation');
  assert.equal(interjectionProof({owner:true,resultText:'原任务完成',endedAt:100}).handled, false);
});

test("requester polling checks exclude the result wake even when it follows immediately", () => {
  const hist = [
    {atMs:1000,tools:[{name:'sessions_send'}]},
    {atMs:1800,provenance:{kind:'inter_session',originSessionId:'chain:wake:b'}},
    {atMs:1900,tools:[{name:'sessions_history'}]},
  ];
  assert.deepEqual(requesterToolCalls(hist,1000,2000).map(x=>x.name),['sessions_send']);
  assert.deepEqual(requesterToolCalls([{atMs:1000,tools:[{name:'exec',command:'sleep 75'}]}],1000,2000).map(x=>x.command),['sleep 75']);
});

test("BUSY fixture really enters the barrier with the bundled admission context shape", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isc-admission-'));
  try {
    const gate = path.join(dir,'admission-busy-barrier');
    fs.writeFileSync(gate+'.release','release');
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const hook = new AsyncFunction('context','process',admissionBusyHookSource());
    const proc = {env:{ISC_FORCE_ADMISSION_BUSY:'1',VLAB_CANDIDATE_DATA:dir}};
    await hook({params:{opts:{vInterSession:{kind:'request'}}}},proc);
    assert.equal(fs.readFileSync(gate,'utf8'),'entered-admission');
    fs.rmSync(gate);
    await hook({params:{opts:{}}},proc);
    assert.equal(fs.existsSync(gate),false,'ordinary turns must not stop at the test barrier');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test("mock Feishu preserves reply parents, dedupe and earlier edited anchor snapshots", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'isc-mock-'));
  const fake = new FakeFeishu({directory, owner: 'owner', dmChat: 'dm', chats: {room: 'Room'}});
  try {
    await fake.start();
    const anchor = fake.handle('POST', '/open-apis/im/v1/messages', {receive_id: 'room', msg_type: 'text', content: '{"text":"📨 #A ⏳"}', uuid: 'one'}).data;
    assert.equal(fake.handle('POST', '/open-apis/im/v1/messages', {uuid: 'one'}).data.message_id, anchor.message_id);
    const card = fake.handle('POST', '/open-apis/cardkit/v1/cards', {data: '{"body":{"elements":[]}}'}).data.card_id;
    fake.handle('POST', `/open-apis/im/v1/messages/${anchor.message_id}/reply`, {msg_type: 'interactive', content: JSON.stringify({type: 'card', data: {card_id: card}})});
    fake.handle('PATCH', `/open-apis/im/v1/messages/${anchor.message_id}`, {content: '{"text":"📨 #A"}'});
    fake.handle('POST', `/open-apis/cardkit/v1/cards/${card}/elements`, {elements: '[{"content":"结果"}]'});
    const msgs = fake.list('room').map(normalizeMessage);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].parentId, anchor.message_id);
    assert.match(msgs[1].text, /结果/);
    assert.doesNotMatch(msgs[0].text, /⏳/);
    assert(fake.snapshots.some(s => s.message.body.content.includes('⏳')));
    assert.equal(fake.handle('GET', '/unimplemented', {}).code, 404, 'unknown API shapes must fail');
  } finally { await fake.close(); fs.rmSync(directory, {recursive: true, force: true}); }
});

test("candidate preload blocks real Feishu through Node fetch and HTTPS before opening a socket", () => {
  const guard = path.join(HERE, 'feishu-no-live.cjs');
  for (const code of ["require('node:https').request('https://open.feishu.cn/open-apis/im/v1/messages')", "fetch('https://open.feishu.cn/open-apis/im/v1/messages')"]) {
    const r = spawnSync(process.execPath, ['--require', guard, '-e', code], {encoding: 'utf8'});
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ISC_NO_LIVE_FEISHU/);
  }
});
