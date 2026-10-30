import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fixtures } from "../apps/v-experience/schema/build-fixtures.mjs";
import * as vx from "../apps/v-experience/v-experience.mjs";

const dir = new URL("../apps/v-experience/schema/fixtures/", import.meta.url);
const ALLOWED = new Set(["markdown", "hr", "button", "column_set", "column", "img", "collapsible_panel"]);

const tags = (elements) => elements.flatMap((e) => [e.tag, ...tags(e.elements ?? []), ...tags((e.columns ?? []).flatMap((c) => c.elements ?? []))]);

test("v card fixtures are current", () => {
  for (const [name, card] of Object.entries(fixtures)) {
    const file = JSON.parse(fs.readFileSync(new URL(`${name}.json`, dir), "utf8"));
    assert.deepEqual(file, card, `${name}.json is stale: run node apps/v-experience/schema/build-fixtures.mjs`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.basename(f, ".json"));
  assert.deepEqual(files.sort(), Object.keys(fixtures).sort(), "every fixture file comes from the builder");
});

test("v cards stay inside the documented subset", () => {
  for (const [name, card] of Object.entries(fixtures)) {
    assert.equal(card.schema, "2.0", name);
    assert.equal(card.v_card, vx.V_CARD_VERSION, name);
    for (const tag of tags(card.body.elements)) assert.ok(ALLOWED.has(tag), `${name}: ${tag} is not in the V card subset`);
  }
});

test("work card: working shows the work view under a rule, done keeps only the answer and footer", () => {
  const working = fixtures["work-working"].body.elements;
  assert.equal(working[0].content, "先看一下上周的停顿记录，再按原因归类。");
  assert.equal(working[1].tag, "hr");
  assert.match(working[3].content, /▶️ \*\*按原因归类\*\*/);
  assert.match(working.at(-1).content, /^⏳ 后台 2 项/);

  const done = fixtures["work-done"].body.elements;
  assert.deepEqual(done.map((e) => e.text_size ?? "normal"), ["normal", "notation", "notation"]);
  assert.ok(!done.some((e) => e.tag === "hr"), "no work view once finished");

  assert.equal(fixtures["work-thinking"].body.elements[0].content, "💭 正在思考");
  assert.equal(fixtures["work-waiting"].body.elements.at(-1).content, "❓ 请在下方卡片中回答");
});

test("question card: options post the record id, staging adds 确认, answered collapses", () => {
  const multi = fixtures["question-multi"].body.elements.filter((e) => e.tag === "button");
  assert.deepEqual(multi.map((b) => b.text.content), ["火锅", "寿司", "面条", "确认"]);
  assert.deepEqual(multi[1].behaviors[0].value, { kind: "question", id: "q-meal", question: 0, option: "寿司" });
  assert.equal(multi[1].type, "primary_filled", "a staged choice is shown picked");
  assert.deepEqual(multi.at(-1).behaviors[0].value, { kind: "question", id: "q-meal", submit: true });

  const two = fixtures["question-two"].body.elements.filter((e) => e.tag === "button");
  assert.equal(two.at(-1).text.content, "确认", "two questions are confirmed together");

  assert.equal(fixtures["question-answered"].header.template, "grey");
  assert.equal(fixtures["question-answered"].body.elements[0].content, "✓ 已选择：火锅、寿司");
});

test("work view snapshot carries what compose() renders", () => {
  const view = vx.createWorkView({ sessionKey: "agent:main:vapp:direct:u1" });
  view.itemEvent({ kind: "preamble", itemId: "i1", progressText: "先查一下记录" });
  view.planUpdate({ steps: [{ step: "查记录", status: "in_progress" }] });
  view.toolStart({ name: "exec" });
  const snap = view.snapshot();
  assert.deepEqual(snap.commentary, ["先查一下记录"]);
  assert.deepEqual(snap.plan, [{ step: "查记录", status: "in_progress" }]);
  assert.ok(snap.status);
  const card = vx.workCard({ view: snap });
  assert.equal(card.body.elements[0].content, "先查一下记录");
  view.dispose();
});
