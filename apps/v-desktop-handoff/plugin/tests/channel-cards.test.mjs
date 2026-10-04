import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cardButtons, handoffPresentation, isPublicImageUrl, telegramHandoffCard } from "../core/channel-cards.js";
import { TelegramApi, telegramChat, telegramCredentials } from "../core/telegram-api.js";
import { inPlaceTarget } from "../core/card.js";

const VIEW = { kind: "control", purpose: "login", reason: "需要你登录测试站点", url: "https://openclaw.example.test/desktop-handoff/#tok", handoffId: "h_1a2b", openWithinMinutes: 10 };

test("channel card: 接管 / 我完成了 / 跳过 while pending, 我完成了 + 回到电脑 while active, nothing once over", () => {
  assert.deepEqual(cardButtons(VIEW, "pending"), [
    { label: "接管", url: VIEW.url },
    { label: "我完成了", command: "/v-handback h_1a2b" },
    { label: "跳过", command: "/v-skip h_1a2b" },
  ]);
  assert.deepEqual(cardButtons(VIEW, "active"), [{ label: "我完成了", command: "/v-handback h_1a2b" }, { label: "回到电脑", url: VIEW.url }]);
  for (const state of ["done", "skipped", "ended"]) assert.deepEqual(cardButtons(VIEW, state), []);
  assert.deepEqual(cardButtons({ ...VIEW, kind: "watch" }, "pending"), [{ label: "观看", url: VIEW.url }]);
  assert.equal(cardButtons({ ...VIEW, purpose: "payment" }, "pending")[0].label, "付款");
});

test("channel card as a presentation: title with state, reason as text, note, picture line, buttons", () => {
  const { presentation, text } = handoffPresentation(VIEW, "pending", { imageRef: "file:///tmp/v-desktop-handoff-h_1a2b-00.jpg" });
  assert.equal(text, "需要你登录测试站点");
  assert.equal(presentation.title, "电脑 · 需要操作");
  assert.deepEqual(presentation.blocks.map((b) => b.type), ["context", "text", "buttons"]);
  assert.match(presentation.blocks[0].text, /^点「接管」打开 V 的电脑直接操作，做完点「我完成了」，V 接着做；不需要就点「跳过」。10 分钟内打开有效。$/u);
  assert.equal(presentation.blocks[1].text, "![V 的电脑](file:///tmp/v-desktop-handoff-h_1a2b-00.jpg)");
  assert.deepEqual(presentation.blocks[2].buttons, [
    { label: "接管", url: VIEW.url, style: "primary" },
    { label: "我完成了", value: "/v-handback h_1a2b" },
    { label: "跳过", value: "/v-skip h_1a2b" },
  ]);
  const done = handoffPresentation(VIEW, "done");
  assert.equal(done.presentation.title, "电脑 · 已完成");
  assert.deepEqual(done.presentation.blocks, [{ type: "context", text: "已交还给 V，V 接着做。" }]);
  const pay = handoffPresentation({ ...VIEW, purpose: "payment", payment: { item: "会员", amount: "129.00", currency: "CNY", merchant: "测试店" } }, "pending");
  assert.equal(pay.presentation.title, "付款 · 需要操作");
  assert.equal(pay.presentation.blocks[0].text, "会员 · 129.00 CNY · 测试店");
});

test("telegram card: caption and one row of buttons; a refused link moves into the caption", () => {
  const card = telegramHandoffCard(VIEW, "pending");
  assert.match(card.caption, /^<b>电脑<\/b> · 需要操作\n\n需要你登录测试站点\n\n<i>点「接管」/u);
  assert.deepEqual(card.replyMarkup, { inline_keyboard: [[{ text: "接管", url: VIEW.url }, { text: "我完成了", callback_data: "/v-handback h_1a2b" }, { text: "跳过", callback_data: "/v-skip h_1a2b" }]] });
  for (const b of card.replyMarkup.inline_keyboard[0]) if (b.callback_data) assert(Buffer.byteLength(b.callback_data) <= 64);
  const noLink = telegramHandoffCard(VIEW, "pending", { urlButtons: false });
  assert.deepEqual(noLink.replyMarkup.inline_keyboard[0].map((b) => b.text), ["我完成了", "跳过"]);
  assert.match(noLink.caption, /\n\n接管：https:\/\/openclaw\.example\.test\/desktop-handoff\/#tok$/u);
  const done = telegramHandoffCard(VIEW, "done");
  assert.deepEqual(done.replyMarkup, { inline_keyboard: [] });
  assert.match(done.caption, /^<b>电脑<\/b> · 已完成\n\n需要你登录测试站点\n\n<i>已交还给 V，V 接着做。<\/i>$/u);
  assert.match(telegramHandoffCard({ ...VIEW, reason: "<b>x</b> & y" }, "pending").caption, /&lt;b&gt;x&lt;\/b&gt; &amp; y/u, "reason is escaped");
});

test("public picture urls: https hostnames only (VLab's tailnet address is not reachable by WeCom)", () => {
  assert.equal(isPublicImageUrl("https://openclaw.tianyi.live/desktop-handoff/snapshot/x.jpg"), true);
  assert.equal(isPublicImageUrl("http://openclaw.tianyi.live/x.jpg"), false);
  assert.equal(isPublicImageUrl("http://[fd7a:115c:a1e0::1]:23950/desktop-handoff/snapshot/x.jpg"), false);
  assert.equal(isPublicImageUrl("https://[fd7a:115c:a1e0::1]/x.jpg"), false);
  assert.equal(isPublicImageUrl("https://100.64.0.1/x.jpg"), false);
  assert.equal(isPublicImageUrl("https://localhost/x.jpg"), false);
  assert.equal(isPublicImageUrl("not a url"), false);
});

test("in-place target carries a Telegram topic", () => {
  assert.deepEqual(inPlaceTarget({ messageChannel: "telegram", deliveryContext: { to: "telegram:-100123", threadId: 7 } }), { channel: "telegram", target: "telegram:-100123", accountId: undefined, threadId: 7 });
  assert.deepEqual(inPlaceTarget({ messageChannel: "telegram", deliveryContext: { to: "telegram:70000001" } }), { channel: "telegram", target: "telegram:70000001", accountId: undefined });
});

test("telegram credentials and targets", () => {
  assert.deepEqual(telegramCredentials({ channels: { telegram: { botToken: "1:abc", apiRoot: "http://127.0.0.1:9/" } } }), { token: "1:abc", apiRoot: "http://127.0.0.1:9" });
  assert.deepEqual(telegramCredentials({ channels: { telegram: { botToken: "1:abc", accounts: { work: { botToken: "2:def" } } } } }, "work"), { token: "2:def", apiRoot: "https://api.telegram.org" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-cred-"));
  fs.writeFileSync(path.join(dir, "token"), "3:ghi\n");
  assert.equal(telegramCredentials({ channels: { telegram: { tokenFile: path.join(dir, "token") } } }).token, "3:ghi");
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(telegramCredentials({ channels: { telegram: {} } }, undefined, { env: { TELEGRAM_BOT_TOKEN: "4:jkl" } }).token, "4:jkl");
  assert.equal(telegramCredentials({ channels: {} }), null);
  assert.deepEqual(telegramChat("telegram:70000001"), { chatId: "70000001" });
  assert.deepEqual(telegramChat("tg:group:-1001234"), { chatId: "-1001234" });
  assert.deepEqual(telegramChat("telegram:-1001234:topic:7"), { chatId: "-1001234", threadId: 7 });
  assert.deepEqual(telegramChat("-1001234:7"), { chatId: "-1001234", threadId: 7 });
  assert.equal(telegramChat("telegram:@someone"), null);
});

test("telegram api: photo card as multipart, text card without a picture, edits, errors", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = url.split("/").pop();
    const multipart = /^multipart\/form-data/u.test(init.headers["content-type"] ?? "");
    const params = multipart
      ? Object.fromEntries([...(await new Response(init.body, { headers: init.headers }).formData()).entries()].map(([k, v]) => [k, typeof v === "string" ? v : { size: v.size, type: v.type }]))
      : JSON.parse(init.body);
    calls.push({ url, method, params });
    if (method === "sendPhoto" && String(params.reply_markup).includes("http://")) return { ok: false, status: 400, json: async () => ({ ok: false, error_code: 400, description: "Bad Request: BUTTON_URL_INVALID" }) };
    if (method === "editMessageCaption" && params.caption === "same") return { ok: false, status: 400, json: async () => ({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  };
  const tg = new TelegramApi({ token: "1:abc", apiRoot: "http://fake", fetchImpl });
  const markup = { inline_keyboard: [[{ text: "接管", url: "https://a.test/" }]] };
  assert.deepEqual(await tg.sendCard({ chatId: "70000001", threadId: 7, photo: Buffer.alloc(3000, 1), caption: "<b>电脑</b>\n\n原因", replyMarkup: markup }), { messageId: 42, kind: "photo" });
  assert.equal(calls[0].url, "http://fake/bot1:abc/sendPhoto");
  assert.deepEqual(calls[0].params.photo, { size: 3000, type: "image/jpeg" });
  assert.equal(calls[0].params.caption, "<b>电脑</b>\n\n原因", "newlines stay \\n (FormData would send \\r\\n)");
  assert.equal(calls[0].params.parse_mode, "HTML");
  assert.equal(calls[0].params.message_thread_id, "7");
  assert.deepEqual(JSON.parse(calls[0].params.reply_markup), markup);
  assert.deepEqual(await tg.sendCard({ chatId: "70000001", photo: null, caption: "c", replyMarkup: markup }), { messageId: 42, kind: "text" });
  assert.equal(calls[1].method, "sendMessage");
  assert.equal(calls[1].params.text, "c");
  await assert.rejects(tg.sendCard({ chatId: "1", photo: Buffer.alloc(10), caption: "c", replyMarkup: { inline_keyboard: [[{ text: "x", url: "http://100.64.0.1/" }]] } }), (error) => /BUTTON_URL_INVALID/u.test(error.description));
  await tg.editCard({ chatId: "1", messageId: 42, kind: "photo", caption: "same", replyMarkup: { inline_keyboard: [] } });
  await tg.editCard({ chatId: "1", messageId: 42, kind: "photo", photo: Buffer.alloc(2000, 2), caption: "new", replyMarkup: { inline_keyboard: [] } });
  const media = calls.at(-1);
  assert.equal(media.method, "editMessageMedia");
  assert.deepEqual(JSON.parse(media.params.media), { type: "photo", media: "attach://photo", caption: "new", parse_mode: "HTML" });
  await tg.editCard({ chatId: "1", messageId: 43, kind: "text", caption: "t", replyMarkup: { inline_keyboard: [] } });
  assert.equal(calls.at(-1).method, "editMessageText");
});
