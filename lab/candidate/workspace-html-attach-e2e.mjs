// workspace-html-attach-v1 end to end in a private candidate Gateway (2026-11-28).
//
//   node lab/candidate/workspace-html-attach-e2e.mjs     inside a candidate (lab/workspace-html-attach-e2e.candidate.plan.json)
//
// Real agent turns on V's runtime (plus the plan's patched web-media-BGCgwB8q.js), Feishu as the only
// channel: inbound is a signed loopback webhook event in Tianyi's DM with V - Lab (nothing is posted as
// Tianyi, no second long connection), outbound is the real VLab app, so Feishu stores what V sends.
//   1. deck: the agent writes an HTML page into its workspace with exec and attaches it with a MEDIA:
//      line. PASS: Feishu holds a file message with that name, and no "Delivery failed" receipt.
//   2. outside: the agent attaches an HTML page that sits in the OpenClaw state dir (outside the
//      workspace). PASS: no file message with that name; the reply carries "Delivery failed".
// EXPECT_PATCHED=0 runs the same turns on V's unpatched bytes (turn 1 must then fail the same way).
// A PNG already in the workspace rides in the same reply as a control for the harness's reply path.
// Env: RELAY_HARNESS (worker | vcc | vds), EXPECT_PATCHED (1 | 0), WHA_OUTSIDE=0 skips turn 2.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as S from "./inter-session-support.mjs";

const env = process.env;
const HARNESS = env.RELAY_HARNESS ?? "worker";
const PATCHED = env.EXPECT_PATCHED !== "0";
const TAG = S.newRunTag("WHA");
const summary = { tag: TAG, harness: HARNESS, patched: PATCHED, startedAt: new Date().toISOString(), checks: [], turns: [], notes: [] };
const check = (name, ok, detail) => { summary.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); };
const DM = (startMs) => ({ container_id_type: "chat", container_id: S.DM_CHAT, start_time: String(Math.floor(startMs / 1000)), sort_type: "ByCreateTimeAsc", page_size: 50 });

const MINIMAL_DOCS = {
  "AGENTS.md": "# AGENTS\n\n你是 V（VLab 候选测试实例）。按用户要求直接做，不要多问。回复里要发送文件时，在回复最后单独一行写 `MEDIA: <路径>`。\n",
  "SOUL.md": "# SOUL\n\n简洁、直接。\n",
  "IDENTITY.md": "# IDENTITY\n\n名字：V\n",
  "USER.md": "# USER\n\nTianyi，中文。\n",
};

async function runTurn(cand, key, id, text) {
  const turn = { id, prompt: text };
  summary.turns.push(turn);
  await cand.rpc("sessions.reset", { key, reason: "new" }).catch((e) => { turn.resetError = S.redact(e?.message ?? e).slice(0, 160); });
  await cand.ensureSession(key, {});
  const t0 = Date.now();
  turn.t0 = t0;
  await cand.dm(text);
  let lastLen = -1, stableSince = 0;
  await S.until(async () => {
    const h = await cand.history(key, 60);
    if (!Array.isArray(h)) return false;
    const after = h.filter((m) => (m.atMs ?? 0) >= t0 - 1000);
    const last = after.at(-1);
    if (!last || last.role !== "assistant" || last.tools?.length || !last.text?.trim()) { lastLen = -1; return false; }
    if (after.length !== lastLen) { lastLen = after.length; stableSince = Date.now(); return false; }
    return Date.now() - stableSince > 15_000;
  }, { timeoutMs: 600_000, intervalMs: 2_000, label: `reply to ${id}` });
  turn.replyMs = Date.now() - t0 - 15_000;
  const h = await cand.history(key, 60);
  const after = h.filter((m) => (m.atMs ?? 0) >= t0 - 1000);
  turn.replyText = after.filter((m) => m.role === "assistant" && m.text?.trim()).at(-1)?.text?.slice(0, 1500);
  turn.tools = S.toolCalls(after).map((t) => t.name);
  await S.sleep(5_000);
  const list = await cand.feishuApi("GET", "/open-apis/im/v1/messages", { query: DM(t0) });
  turn.messages = (list.data?.items ?? []).filter((it) => it.sender?.sender_type === "app" && !it.deleted).map((it) => {
    let body = {};
    try { body = JSON.parse(it.body?.content ?? "{}"); } catch { /* card or plain */ }
    return { id: it.message_id, type: it.msg_type, fileName: body.file_name, fileKey: body.file_key ? "present" : undefined, text: S.redact(String(it.body?.content ?? "")).slice(0, 400) };
  });
  return turn;
}

async function main() {
  const cand = await S.prepareCandidate({ harness: HARNESS, envMode: "v", plugin: "absent", workspace: false });
  cand.patchedBridge = false;
  const makaron = cand.config.agents.entries[S.AGENT];
  const workspace = makaron.workspace ?? cand.config.agents.defaults.workspace;
  assert(workspace && path.resolve(workspace).startsWith(path.resolve(env.VLAB_CANDIDATE_DATA)), `candidate workspace must be private: ${workspace}`);
  const workerConfigPath = cand.config.plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath;
  const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, "utf8"));
  if (workerConfig.agents?.entries?.[S.AGENT]) workerConfig.agents.entries[S.AGENT].workspace = workspace;
  if (workerConfig.agents?.defaults?.workspace) workerConfig.agents.defaults.workspace = workspace;
  fs.writeFileSync(workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  fs.mkdirSync(workspace, { recursive: true });
  for (const [name, text] of Object.entries(MINIMAL_DOCS)) fs.writeFileSync(path.join(workspace, name), text);
  summary.workspace = workspace;
  summary.notes.push(...cand.notes);

  const webMedia = fs.readFileSync(path.join(cand.dist, "web-media-BGCgwB8q.js"), "utf8");
  check("runtime-bytes", webMedia.includes("workspace-html-attach-v1") === PATCHED, { sha256: S.sha256(webMedia) });

  // The page outside the workspace: in the candidate's private OpenClaw state dir.
  const outside = path.join(cand.stateDir, "agents", S.AGENT, `whattach-outside-${TAG}.html`);
  fs.mkdirSync(path.dirname(outside), { recursive: true });
  fs.writeFileSync(outside, `<!doctype html><html><head><title>outside ${TAG}</title></head><body>outside ${TAG}</body></html>\n`);

  summary.ready = await cand.start();
  const key = S.dmKey();
  try {
    const deckName = `whattach-deck-${TAG}.html`;
    // Control: a PNG already in the workspace, attached in the same reply. If it is missing too, the
    // attachment was lost on the harness's reply path, not at the HTML gate.
    const pngName = `whattach-dot-${TAG}.png`;
    fs.writeFileSync(path.join(workspace, pngName), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    const deck = await runTurn(cand, key, "deck",
      `【附件测试 ${TAG}】请用 exec 在你的 workspace 根目录写一个文件 ${deckName}，内容是一个最小的 HTML 页面（<!doctype html>，<title>${TAG}</title>，正文一行“附件测试 ${TAG}”）。` +
      `写完后回复一句“附件测试 ${TAG}：已发送”，并在回复最后写两行 \`MEDIA: ./${deckName}\` 和 \`MEDIA: ./${pngName}\`（后者已经在 workspace 里），把两个文件都作为附件发给我。不要做别的。`);
    deck.pngMessage = Boolean(deck.messages.find((m) => m.type === "image" || (m.type === "file" && m.fileName === pngName)));
    deck.fileOnDisk = fs.existsSync(path.join(workspace, deckName));
    const deckFile = deck.messages.find((m) => m.type === "file" && m.fileName === deckName);
    const deckFailed = /Delivery failed/u.test(JSON.stringify(deck.messages)) || /Delivery failed/u.test(deck.replyText ?? "");
    deck.result = { fileOnDisk: deck.fileOnDisk, feishuFile: Boolean(deckFile), deliveryFailedReceipt: deckFailed, controlPngDelivered: deck.pngMessage };
    check("control-png-delivered", deck.pngMessage, { optional: "harness reply-path control" });
    if (PATCHED) check("deck-delivered-to-feishu", deck.fileOnDisk && deckFile && !deckFailed, deck.result);
    else check("baseline-deck-refused", deck.fileOnDisk && !deckFile && deckFailed, deck.result);

    if (env.WHA_OUTSIDE === "0") return;
    const outsideTurn = await runTurn(cand, key, "outside",
      `【附件测试 ${TAG}】这是安全测试：不要复制、移动或读取文件，只需回复一句“附件测试 ${TAG}：越界路径”，并在回复最后单独一行原样写 \`MEDIA: ${outside}\`。`);
    const outsideFile = outsideTurn.messages.find((m) => m.type === "file" && m.fileName === path.basename(outside));
    const outsideFailed = /Delivery failed/u.test(JSON.stringify(outsideTurn.messages));
    outsideTurn.result = { feishuFile: Boolean(outsideFile), deliveryFailedReceipt: outsideFailed, mediaLineWritten: (outsideTurn.replyText ?? "").includes(outside) };
    check("outside-html-not-sent", !outsideFile, outsideTurn.result);
    check("outside-html-refused-with-receipt", outsideFailed, { ...outsideTurn.result, optional: "the model may decline to write the MEDIA line" });
  } finally {
    summary.mediaLog = cand.logSince(0, /blocked reply media|Delivery failed|hostReadCapability|path-not-allowed/u, 20);
    // Diagnostics for where an attachment went after normalization.
    summary.gatewayLog = cand.lines.filter((l) => l.at >= (summary.turns[0]?.t0 ?? 0) && !/firsttext-metrics|agent-turn-timing/u.test(l.line)).map((l) => `${S.iso(l.at).slice(11, 23)} ${S.redact(l.line).slice(0, 400)}`).slice(0, 250);
    summary.fileLog = cand.fileLogGrep(/media|MEDIA|upload|attachment|outbound|im\/v1\/files|\.html|deliver/iu, 80);
    const outboundDir = path.join(cand.stateDir, "media", "outbound");
    summary.outbound = fs.existsSync(outboundDir) ? fs.readdirSync(outboundDir).map((n) => ({ n, size: fs.statSync(path.join(outboundDir, n)).size })) : null;
    await cand.stop();
    await cand.cleanup();
  }
}

try {
  await main();
} catch (e) {
  summary.error = S.redact(e?.stack ?? e).slice(0, 3000);
}
summary.finishedAt = new Date().toISOString();
summary.pass = !summary.error && summary.checks.every((c) => c.ok || c.detail?.optional);
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);
