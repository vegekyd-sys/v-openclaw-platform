import assert from "node:assert/strict";
import { test } from "node:test";
import { handoffCard } from "../core/card.js";
import { cardNote, handoffPresentation, nativeCardInstruction } from "../core/channel-cards.js";
import { joinSubject, nativeHandoffCard } from "../core/native-card.js";

test("joinSubject spaces Latin subjects only", () => {
  assert.equal(joinSubject("你在操作"), "你在操作 V 的电脑");
  assert.equal(joinSubject("你在操作", "你的 Mac"), "你在操作你的 Mac");
});

test("V's desktop keeps its wording", () => {
  const card = nativeHandoffCard({ state: "active", reason: "r", url: "u", handoffId: "h_1" });
  assert.equal(card.header.title.content, "电脑");
  assert.match(card.body.elements[0].content, /你在操作 V 的电脑。做完点「我完成了」/u);
  assert.equal(handoffCard({ kind: "watch", url: "u", openWithinMinutes: 10, sessionMinutes: 30 }).presentation.title, "V 的桌面 · 只看");
  assert.match(nativeCardInstruction("feishu"), /^A card titled 电脑 .*takes over V's desktop/u);
});

test("another machine is named on every card", () => {
  const view = { kind: "control", purpose: "login", reason: "解锁", url: "u", handoffId: "h_2", subject: "你的 Mac", cardTitle: "Mac", openWithinMinutes: 10 };
  const card = nativeHandoffCard({ ...view, state: "active" });
  assert.equal(card.header.title.content, "Mac");
  assert.match(card.body.elements[0].content, /你在操作你的 Mac。/u);
  assert.equal(cardNote(view, "pending"), "点「接管」打开你的 Mac 直接操作，做完点「完成」，V 接着做；不需要就点「跳过」。10 分钟内打开有效。");
  assert.equal(handoffPresentation(view, "pending").presentation.title, "Mac · 需要操作");
  assert.match(JSON.stringify(handoffCard({ ...view, sessionMinutes: 30, subject: "你的 Mac" })), /需要你接管你的 Mac/u);
  assert.match(nativeCardInstruction("feishu", { cardTitle: "Mac", machine: "Tianyi's own Mac" }), /^A card titled Mac .*takes over Tianyi's own Mac/u);
});
