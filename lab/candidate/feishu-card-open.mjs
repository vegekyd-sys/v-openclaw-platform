// Feishu cards V writes itself (lab/feishu-card-open.md), end to end in a private candidate Gateway.
//
//   node lab/candidate/feishu-card-open.mjs run     inside a candidate (lab/feishu-card-open.candidate.plan.json)
//
// 1. Module: the runtime's reply-delivery-result is the open-card build; rich cards survive, mentions
//    go first in v1 and v2 cards, the envelope still applies.
// 2. Feishu accepts every component the AGENTS.md section shows (one demo card, VLab 测试｜房间 1), and
//    a card Feishu rejects reaches the room as text through sendCardFeishu.
// 3. Model: V's own boot documents (hash-pinned plan inputs, never in git) plus the AGENTS.md section;
//    Tianyi's DM with V - Lab gets one prompt at a time (signed loopback events, nothing posted as
//    Tianyi), each in a fresh session. The readback is what Feishu stored for each reply.
//
// Env: FCO_PROMPTS (JSON array of {id, text, expect: card|text|any}), FCO_AGENTS (on|off),
//      FCO_WORKSPACE (comma list of basename:sha256 for V's boot documents), RELAY_HARNESS.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as S from "./inter-session-support.mjs";
import { PATTERNS } from "../feishu-card-ui-patterns.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ROOM = S.ROOMS[0];

const DEFAULT_PROMPTS = [
  { id: "trend", expect: "card", text: "我今年 5 到 10 月的跑量是 42、55、38、61、70、66 公里，帮我看看趋势，下个月怎么安排" },
  { id: "spend", expect: "card", text: "这周花了：餐饮 820、交通 260、购物 1150，预算是 2000，帮我看看" },
  { id: "compare", expect: "card", text: "帮我对比下 iPhone 17 Pro、Pixel 10 Pro 和三星 S26 Ultra，主要看屏幕、影像、续航和起售价，我该买哪个" },
  { id: "duo", expect: "card", text: "查下 iPhone duo 跟竞品的比较" },
  { id: "plan", expect: "card", text: "周六想带爸妈在上海玩一天，老人腿脚一般，帮我排个行程" },
  { id: "table", expect: "text", text: "把北京、上海、广州、深圳、杭州的电话区号列一下" },
  { id: "chat", expect: "text", text: "今天好累啊，下午连着开了四个会" },
  { id: "fact", expect: "text", text: "1 英里等于多少公里" },
];
// Components markdown cannot draw: what makes a card worth sending.
const UI_TAGS = ["chart", "column_set", "collapsible_panel", "button", "text_tag", "img"];

// The components the AGENTS.md section teaches, in one card. Feishu must accept it as is.
export const DEMO_CARD = {
  schema: "2.0",
  config: { width_mode: "fill" },
  header: { title: { tag: "plain_text", content: "【测试】卡片组件自检" }, template: "blue" },
  body: { elements: [
    { tag: "markdown", content: "**粗体**、[链接](https://open.feishu.cn)、<font color='red'>彩色字</font>、<text_tag color='green'>标签</text_tag>" },
    { tag: "hr" },
    { tag: "table", page_size: 10, header_style: { bold: true, background_style: "grey" }, columns: [{ name: "n", display_name: "名称", data_type: "text" }, { name: "p", display_name: "价格", data_type: "number", format: { symbol: "¥", precision: 0 } }], rows: [{ n: "A", p: 99 }, { n: "B", p: 129 }] },
    { tag: "column_set", columns: [{ tag: "column", width: "weighted", weight: 1, elements: [{ tag: "markdown", content: "左栏" }] }, { tag: "column", width: "weighted", weight: 1, elements: [{ tag: "markdown", content: "右栏" }] }] },
    { tag: "chart", aspect_ratio: "16:9", chart_spec: { type: "line", data: { values: [{ x: "1月", y: 3 }, { x: "2月", y: 5 }, { x: "3月", y: 4 }] }, xField: "x", yField: "y" } },
    { tag: "collapsible_panel", expanded: false, header: { title: { tag: "markdown", content: "展开详情" } }, elements: [{ tag: "markdown", content: "折叠的内容" }] },
    { tag: "button", text: { tag: "plain_text", content: "打开" }, type: "primary", behaviors: [{ type: "open_url", default_url: "https://open.feishu.cn" }] },
  ] },
};

const tagsOf = (value, out = new Set()) => {
  if (Array.isArray(value)) { for (const v of value) tagsOf(v, out); return out; }
  if (!value || typeof value !== "object") return out;
  if (typeof value.tag === "string") out.add(value.tag);
  for (const v of Object.values(value)) tagsOf(v, out);
  return out;
};

// raw_card_content returns {"json_card":"<card as Feishu stores it>"}; tags sit under "tag".
function rawCard(content) {
  try { const outer = JSON.parse(content ?? ""); return typeof outer.json_card === "string" ? JSON.parse(outer.json_card) : outer; } catch { return null; }
}

function findInputs(spec) {
  const want = new Map(spec.split(",").filter(Boolean).map((s) => { const [name, sha] = s.split(":"); return [name, sha]; }));
  const found = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") walk(p); }
      else if (want.has(e.name) && S.sha256(fs.readFileSync(p)) === want.get(e.name)) found.set(e.name, p);
    }
  };
  walk(REPO);
  for (const name of want.keys()) assert(found.has(name), `workspace input ${name} not found under ${REPO}`);
  return found;
}

async function runInCandidate() {
  const env = process.env;
  const T0 = Date.now();
  const RUN_TAG = env.RUN_TAG ?? S.newRunTag("FCO");
  const HARNESS = env.RELAY_HARNESS ?? "worker";
  const AGENTS_ON = (env.FCO_AGENTS ?? "on") === "on";
  const prompts = env.FCO_PROMPTS ? JSON.parse(env.FCO_PROMPTS) : DEFAULT_PROMPTS;
  const summary = { kind: "feishu-card-open", v: 1, runTag: RUN_TAG, harness: HARNESS, agentsSection: AGENTS_ON, candidateId: env.VLAB_CANDIDATE_ID ?? null, startedAt: S.iso(T0), checks: [], turns: [], notes: [] };
  const check = (id, ok, detail) => { summary.checks.push({ id, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); return Boolean(ok); };
  const step = (msg, extra) => console.error(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${msg}${extra ? ` ${S.redact(JSON.stringify(extra)).slice(0, 600)}` : ""}`);

  const cfg0 = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
  const feishuDist = path.join(cfg0.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu")), "dist");
  const replyFile = path.join(feishuDist, "reply-delivery-result-CEFTDA3f.js");
  const monitorFile = path.join(feishuDist, "monitor.account-WFdlCDhR.js");
  summary.bytes = { reply: S.sha256(fs.readFileSync(replyFile)), monitor: S.sha256(fs.readFileSync(monitorFile)) };
  check("bytes-open-card", fs.readFileSync(replyFile, "utf8").includes("v-feishu-card-open-v1") && fs.readFileSync(monitorFile, "utf8").includes("v-feishu-card-open-v1"), summary.bytes);

  // ---- 1. module
  const mod = await import(pathToFileURL(replyFile).href);
  const readCard = mod.it, buildPayloadCard = mod.s, sendCard = mod.E;
  {
    const parsed = readCard(JSON.stringify(DEMO_CARD));
    check("module-rich-card-kept", parsed && ["table", "chart", "column_set", "collapsible_panel", "button"].every((t) => tagsOf(parsed).has(t)), parsed ? [...tagsOf(parsed)] : null);
    check("module-markdown-unescaped", parsed?.body?.elements?.[0]?.content === DEMO_CARD.body.elements[0].content);
    check("module-interactive-wrapper", readCard(JSON.stringify({ type: "interactive", card: DEMO_CARD }))?.header?.title?.content === DEMO_CARD.header.title.content);
    check("module-plain-json-not-card", readCard('{"a":1}') === undefined && readCard("我觉得 {不是卡片}") === undefined);
    const v1 = { config: { wide_screen_mode: true }, elements: [{ tag: "div", text: { tag: "lark_md", content: "v1" } }] };
    const mentions = [{ openId: S.OWNER, name: "Tianyi", key: "@_user_1" }];
    const m2 = buildPayloadCard({ payload: { text: JSON.stringify(DEMO_CARD) }, mentions });
    const m1 = buildPayloadCard({ payload: { text: JSON.stringify(v1) }, mentions });
    check("module-mention-v2", m2?.body?.elements?.[0]?.tag === "markdown" && m2.body.elements.length === DEMO_CARD.body.elements.length + 1);
    check("module-mention-v1", m1?.elements?.[0]?.tag === "markdown" && m1.elements.length === 2);
    const huge = { schema: "2.0", body: { elements: Array.from({ length: 220 }, (_, i) => ({ tag: "markdown", content: `第 ${i} 行` })) } };
    let refused = false;
    try { buildPayloadCard({ payload: { text: JSON.stringify(huge) } }); } catch (e) { refused = /200-element/.test(e.message); }
    check("module-envelope-kept", refused);
  }

  // ---- prepare (workspace and config) and start
  const cand = await S.prepareCandidate({ harness: HARNESS, envMode: "v", plugin: "absent", workspace: false });
  const makaron = cand.config.agents.entries[S.AGENT];
  const workspace = makaron.workspace ?? cand.config.agents.defaults.workspace;
  assert(workspace && path.resolve(workspace).startsWith(path.resolve(env.VLAB_CANDIDATE_DATA)), `candidate workspace must be private: ${workspace}`);
  const workerConfigPath = cand.config.plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath;
  const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, "utf8"));
  // The Worker's config copy still names shared VLab's workspace; it must read this run's documents.
  const sharedWorkerWorkspace = workerConfig.agents?.entries?.[S.AGENT]?.workspace ?? workerConfig.agents?.defaults?.workspace;
  if (workerConfig.agents?.entries?.[S.AGENT]) workerConfig.agents.entries[S.AGENT].workspace = workspace;
  if (workerConfig.agents?.defaults?.workspace) workerConfig.agents.defaults.workspace = workspace;
  fs.writeFileSync(workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  const workerWorkspace = workerConfig.agents?.entries?.[S.AGENT]?.workspace ?? workerConfig.agents?.defaults?.workspace;
  summary.workspace = { gateway: workspace, worker: workerWorkspace, workerWas: sharedWorkerWorkspace };
  assert.equal(path.resolve(workerWorkspace), path.resolve(workspace), "Worker and Gateway must read the same candidate workspace");
  // V renders replies as cards only when they need it (renderMode auto), shared VLab says card.
  cand.config.channels.feishu.renderMode = "auto";
  fs.writeFileSync(cand.configPath, `${JSON.stringify(cand.config, null, 2)}\n`, { mode: 0o600 });
  fs.mkdirSync(workspace, { recursive: true });
  const inputs = findInputs(env.FCO_WORKSPACE ?? "");
  const section = fs.readFileSync(path.join(REPO, "lab/feishu-card-open.agents-section.md"), "utf8");
  for (const [name, file] of inputs) {
    let text = fs.readFileSync(file, "utf8");
    if (name === "AGENTS.md" && AGENTS_ON) {
      const anchor = "### Makaron Group Service Trigger";
      text = text.includes(anchor) ? text.replace(anchor, `${section.trimEnd()}\n\n${anchor}`) : `${text.trimEnd()}\n\n${section}`;
    }
    fs.writeFileSync(path.join(workspace, name), text);
  }
  if (AGENTS_ON) {
    fs.mkdirSync(path.join(workspace, "skills/feishu-card-ui"), { recursive: true });
    fs.copyFileSync(path.join(REPO, "lab/feishu-card-ui/SKILL.md"), path.join(workspace, "skills/feishu-card-ui/SKILL.md"));
  }
  summary.workspace.files = [...inputs.keys(), ...(AGENTS_ON ? ["skills/feishu-card-ui/SKILL.md"] : [])];
  summary.workspace.agentsSha256 = S.sha256(fs.readFileSync(path.join(workspace, "AGENTS.md")));
  summary.notes.push(...cand.notes);
  const ready = await cand.start();
  step("gateway ready", ready);
  summary.gatewayReadyMs = ready.readyMs;

  try {
    // ---- 2. Feishu accepts the taught components; a rejected card still arrives as text
    if (env.FCO_SKIP_PLATFORM !== "1") {
      const r = await cand.feishuApi("POST", "/open-apis/im/v1/messages", { query: { receive_id_type: "chat_id" }, body: { receive_id: ROOM, msg_type: "interactive", content: JSON.stringify(DEMO_CARD), uuid: `fco-demo-${crypto.randomBytes(8).toString("hex")}` } });
      check("feishu-accepts-demo-card", r.code === 0, { code: r.code, msg: r.msg, messageId: r.data?.message_id });
      for (const [name, card] of Object.entries(PATTERNS)) {
        const p = await cand.feishuApi("POST", "/open-apis/im/v1/messages", { query: { receive_id_type: "chat_id" }, body: { receive_id: ROOM, msg_type: "interactive", content: JSON.stringify(card), uuid: `fco-${name}-${crypto.randomBytes(8).toString("hex")}` } });
        check(`feishu-accepts-pattern-${name}`, p.code === 0, { code: p.code, msg: p.msg });
      }
      const bad = readCard(JSON.stringify({ schema: "2.0", header: { title: { tag: "plain_text", content: "【测试】被拒卡片回退" } }, body: { elements: [{ tag: "markdown", content: "飞书拒收这张卡时，这段文字仍应送达。" }, { tag: "no_such_component", content: "x" }] } }));
      const mark = cand.mark();
      let sent = null, error = null;
      try { sent = await sendCard({ cfg: cand.config, to: `chat:${ROOM}`, card: bad }); } catch (e) { error = S.redact(e?.message ?? e).slice(0, 300); }
      const stored = sent?.messageId ? await cand.feishuApi("GET", `/open-apis/im/v1/messages/${sent.messageId}`, { query: { card_msg_content_type: "raw_card_content" } }) : null;
      const storedText = stored?.data?.items?.[0]?.body?.content ?? "";
      check("rejected-card-falls-back-to-text", sent?.messageId && storedText.includes("这段文字仍应送达") && !storedText.includes("no_such_component"), { error, messageId: sent?.messageId, stored: storedText.slice(0, 300) });
      summary.fallbackLog = cand.logSince(mark, /model card rejected/u, 5);
    }

    // ---- 3. model turns in Tianyi's DM
    const key = S.dmKey();
    for (const p of prompts) {
      const turn = { id: p.id, expect: p.expect, prompt: p.text };
      summary.turns.push(turn);
      try {
        await cand.rpc("sessions.reset", { key, reason: "new" }).catch((e) => { turn.resetError = S.redact(e?.message ?? e).slice(0, 160); });
        await cand.ensureSession(key, {});
        const t0 = Date.now();
        await cand.dm(`${p.text}`);
        // Done when the last transcript entry is an assistant message without tool calls and nothing new arrives for 20 s.
        let lastLen = -1, stableSince = 0;
        turn.timeline = [];
        const seen = new Map();
        await S.until(async () => {
          // What Tianyi sees, every poll: each bot message's visible text length (streaming shows as growth).
          const live = await cand.feishuApi("GET", "/open-apis/im/v1/messages", { query: { container_id_type: "chat", container_id: S.DM_CHAT, start_time: String(Math.floor(t0 / 1000)), sort_type: "ByCreateTimeAsc", page_size: 50, card_msg_content_type: "raw_card_content" } }).catch(() => null);
          for (const it of live?.data?.items ?? []) {
            if (it.sender?.sender_type !== "app") continue;
            const card = rawCard(it.body?.content);
            const texts = [];
            (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "content" && typeof x === "string") texts.push(x); else walk(x); } })(card);
            const text = texts.join("");
            const state = `${it.deleted ? "deleted" : "live"}:${text.length}`;
            if (seen.get(it.message_id) !== state) { seen.set(it.message_id, state); turn.timeline.push({ s: +((Date.now() - t0) / 1000).toFixed(1), id: it.message_id.slice(-6), deleted: Boolean(it.deleted), chars: text.length, head: text.slice(0, 60) }); }
          }
          const h = await cand.history(key, 60);
          if (!Array.isArray(h)) return false;
          const after = h.filter((m) => (m.atMs ?? 0) >= t0 - 1000);
          const last = after.at(-1);
          if (!last || last.role !== "assistant" || last.tools?.length || !last.text?.trim()) { lastLen = -1; return false; }
          if (after.length !== lastLen) { lastLen = after.length; stableSince = Date.now(); return false; }
          return Date.now() - stableSince > 20_000;
        }, { timeoutMs: 600_000, intervalMs: 2_000, label: `reply to ${p.id}` });
        turn.replyMs = Date.now() - t0 - 20_000;
        const h = await cand.history(key, 60);
        const final = h.filter((m) => (m.atMs ?? 0) >= t0 - 1000 && m.role === "assistant" && m.text?.trim()).at(-1);
        turn.replyText = final?.text?.slice(0, 1500);
        const calls = S.toolCalls(h.filter((m) => (m.atMs ?? 0) >= t0 - 1000));
        turn.tools = calls.map((t) => t.name);
        turn.toolCommands = calls.map((t) => t.command ?? "").filter(Boolean);
        await S.sleep(3_000);
        const list = await cand.feishuApi("GET", "/open-apis/im/v1/messages", { query: { container_id_type: "chat", container_id: S.DM_CHAT, start_time: String(Math.floor(t0 / 1000)), sort_type: "ByCreateTimeAsc", page_size: 50, card_msg_content_type: "raw_card_content" } });
        const bot = (list.data?.items ?? []).filter((it) => it.sender?.sender_type === "app" && !it.deleted);
        turn.messages = bot.map((it) => {
          const card = rawCard(it.body?.content);
          const tags = card ? [...tagsOf(card), ...(/text_?[tT]ag/.test(JSON.stringify(card)) ? ["text_tag"] : [])] : [];
          // V's streaming reply card always ends in the grey "Agent: … | Model: …" note; a card V wrote has none.
          const streamed = JSON.stringify(card ?? "").includes("Agent: V");
          const texts = [];
          (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "content" && typeof x === "string") texts.push(x); else walk(x); } })(card ?? it.body?.content);
          return { id: it.message_id, type: it.msg_type, tags, modelCard: Boolean(card) && !streamed, showsJson: texts.some((t) => /"schema"|"elements"\s*:/.test(t)), preview: S.redact(String(it.body?.content ?? "")).slice(0, 400) };
        });
        const modelCard = /^\s*\{/.test(turn.replyText ?? "");
        const sent = turn.messages.filter((m) => m.modelCard);
        turn.result = { modelWroteCard: modelCard, delivered: turn.messages.length > 0, modelCards: sent.length, components: [...new Set(sent.flatMap((m) => m.tags))], ui: [...new Set(sent.flatMap((m) => m.tags.filter((t) => UI_TAGS.includes(t))))], readSkill: (turn.tools ?? []).includes("read") || (turn.toolCommands ?? []).some((c) => c.includes("feishu-card-ui")), rawJsonVisible: turn.messages.some((m) => m.showsJson) };
        check(`turn-${p.id}-delivered`, turn.result.delivered && !turn.result.rawJsonVisible, turn.result);
        if (p.expect === "card") check(`turn-${p.id}-model-chose-card`, modelCard, { optional: true });
        if (p.expect === "text") check(`turn-${p.id}-model-chose-text`, !modelCard, { optional: true });
      } catch (e) {
        turn.error = S.redact(e?.stack ?? e).slice(0, 1500);
        check(`turn-${p.id}-delivered`, false, turn.error.slice(0, 300));
      }
    }
    summary.cardLog = cand.logSince(0, /model card rejected|Feishu card (send|reply) failed|card/u, 40);
    summary.ok = summary.checks.filter((c) => !c.detail?.optional).every((c) => c.ok);
  } catch (e) {
    summary.ok = false;
    summary.error = S.redact(e?.stack ?? e).slice(0, 3000);
  } finally {
    summary.endedAt = S.iso(Date.now());
    summary.totalMs = Date.now() - T0;
    summary.gatewayTail = cand.lines.slice(-40).map((l) => `${S.iso(l.at).slice(11, 23)} ${S.redact(l.line).slice(0, 300)}`);
    console.log(JSON.stringify(summary));
    await cand.stop();
    await cand.cleanup();
    if (!summary.ok) process.exitCode = 1;
  }
}

if (process.argv[2] === "run") await runInCandidate();
