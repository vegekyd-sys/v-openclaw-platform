// Candidate: the vapp channel plugin (apps/v-experience/app/) in a private 9.1
// Gateway with real model turns on the Worker. A fake V app — a device-signed
// operator.write connection, as the iOS client makes — calls vapp.hello /
// vapp.send / vapp.action and records the plugin.vapp.* events it receives.
//
// Scenarios: a plain reply (one card rewritten in place, final card = answer
// only), an ask_user answered by tapping the card's button, one answered by
// typing, and a message-tool send. Results: <data>/vapp-results.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate, until, sleep} from './bound-task-support.mjs';
import {installVapp} from './vapp-support.mjs';

const results = {scenarios: {}};
const cleanups = [];
const log = (stage, extra = {}) => console.log(JSON.stringify({stage, at: new Date().toISOString(), ...extra}));
let c;
let app;
const events = [];

const cardsFor = (pred = () => true) => events.filter(e => e.event === 'plugin.vapp.card' && pred(e.payload)).map(e => e.payload);
const markdown = card => (card?.body?.elements ?? []).filter(e => e.tag === 'markdown').map(e => e.content).join('\n');
const tagsOf = card => (card?.body?.elements ?? []).map(e => e.tag);

/** Cards of the turn that started after `mark`, grouped by cardId (last version of each). */
function turnSince(mark) {
  const list = events.slice(mark).filter(e => e.event === 'plugin.vapp.card').map(e => e.payload);
  const turnId = list.find(p => !p.cardId.startsWith('q:'))?.turnId;
  const mine = list.filter(p => p.turnId === turnId);
  const byCard = new Map();
  for (const p of mine) byCard.set(p.cardId, p);
  return {turnId, all: mine, last: byCard};
}

async function connectApp() {
  const {GatewayClient} = await import(path.join(c.dist, 'plugin-sdk', 'gateway-runtime.js'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('app connect timeout')), 60_000);
    // deviceIdentity left out: the client signs with this process's device key, like the app does.
    app = new GatewayClient({
      url: `ws://127.0.0.1:${c.port}`, token: c.gatewayToken, clientName: 'openclaw-ios', mode: 'ui', platform: 'ios',
      scopes: ['operator.approvals', 'operator.questions', 'operator.read', 'operator.write'],
      caps: ['tool-events', 'approvals'],
      onEvent: e => { if (/^plugin\.vapp\.|approval/.test(String(e.event))) events.push({at: Date.now(), event: e.event, payload: e.payload}); },
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: e => { clearTimeout(timer); reject(e); },
    });
    app.start();
  });
  cleanups.push(() => app.stop());
}
const call = (method, params, timeoutMs = 30_000) => app.request(method, params, {timeoutMs});

const ONLY = process.env.VAPP_ONLY ? new Set(process.env.VAPP_ONLY.split(',')) : null;
async function scenario(name, fn) {
  if (ONLY && !ONLY.has(name)) return;
  const startedAt = Date.now();
  try {
    results.scenarios[name] = {ok: true, ...(await fn()), ms: Date.now() - startedAt};
  } catch (error) {
    results.scenarios[name] = {ok: false, error: String(error?.stack ?? error).slice(0, 1500), ms: Date.now() - startedAt};
  }
  log('scenario', {name, ok: results.scenarios[name].ok});
}

async function finalOf(mark, {timeoutMs = 240_000, cardSuffix} = {}) {
  let found;
  await until(() => {
    const t = turnSince(mark);
    found = [...t.last.values()].find(p => p.final && !p.cardId.startsWith('q:') && (!cardSuffix || p.cardId.endsWith(cardSuffix)));
    return Boolean(found);
  }, {timeoutMs, intervalMs: 500, label: 'final vapp card'});
  return found;
}

try {
  c = await prepareCandidate({harness: process.env.VAPP_HARNESS ?? 'worker', maxWorkers: 2, registerCleanup: fn => cleanups.push(fn)});

  installVapp(c);

  const ready = await c.start({timeoutMs: 300_000});
  log('gateway-ready', {readyMs: ready.readyMs, harness: c.harness, model: c.model});
  results.gateway = {readyMs: ready.readyMs, harness: c.harness, model: c.model};
  results.pluginLoadErrors = c.lines.filter(l => /vapp/i.test(l.line) && /error|fail/i.test(l.line)).map(l => l.line.slice(0, 300)).slice(0, 20);

  await connectApp();
  const hello = await call('vapp.hello', {});
  log('hello', hello);
  results.hello = hello;
  assert.equal(hello.userId, 'tianyi');
  assert.match(hello.sessionKey, /vapp/);

  await scenario('plain-reply', async () => {
    const mark = events.length;
    const sent = await call('vapp.send', {text: '先用 update_plan 列一个三步计划（理解问题、计算、回答），然后回答：17 乘以 3 等于多少？', clientMessageId: 'cand-plain'});
    const fin = await finalOf(mark);
    const t = turnSince(mark);
    const versions = t.all.filter(p => p.cardId === fin.cardId);
    const text = markdown(fin.card);
    assert.match(text, /51/, 'the answer is in the final card');
    assert.ok(!tagsOf(fin.card).includes('hr'), 'no work view in the final card');
    assert.match(text, /Runtime: /, 'the runtime footer, as on Feishu');
    assert.equal(markdown(versions[0].card), '💭 正在思考', 'the card opens with thinking');
    const sawPlan = versions.some(p => /[☑️▶️◻️]/u.test(markdown(p.card)) && tagsOf(p.card).includes('hr'));
    const seqOrdered = versions.every((p, i) => i === 0 || p.seq > versions[i - 1].seq);
    assert.ok(seqOrdered, 'seq increases');
    return {sessionKey: sent.sessionKey, versions: versions.length, cards: t.last.size, sawPlan, final: text.slice(0, 300)};
  });

  await scenario('ask-tap', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '请调用 ask_user 工具问我「周六还是周日出发？」，两个选项：周六、周日。拿到回答后只回复一句确认，包含我选的那天。', clientMessageId: 'cand-ask-tap'});
    let qCard;
    await until(() => { qCard = cardsFor(p => p.cardId.startsWith('q:') && p.seq !== undefined).filter(p => events.indexOf(events.find(e => e.payload === p)) >= mark).at(-1); return Boolean(qCard); }, {timeoutMs: 240_000, intervalMs: 500, label: 'question card'});
    const buttons = qCard.card.body.elements.filter(e => e.tag === 'button');
    const sunday = buttons.find(b => b.text.content.includes('周日'));
    assert.ok(sunday, `a 周日 button: ${buttons.map(b => b.text.content).join(',')}`);
    const waiting = turnSince(mark).last.get(`${qCard.turnId}:0`);
    const waitingText = markdown(waiting?.card);
    const tap = await call('vapp.action', {value: sunday.behaviors[0].value});
    assert.equal(tap.ok, true, JSON.stringify(tap));
    const fin = await finalOf(mark, {cardSuffix: ':1'});
    const answered = turnSince(mark).last.get(qCard.cardId);
    assert.equal(answered.card.header.template, 'grey', 'the question card shows it was answered');
    assert.match(markdown(fin.card), /周日/);
    return {buttons: buttons.map(b => b.text.content), waitingText: waitingText.slice(0, 200), answered: markdown(answered.card), final: markdown(fin.card).slice(0, 200)};
  });

  await scenario('ask-typed', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '请调用 ask_user 工具问我「喝咖啡还是喝茶？」，两个选项：咖啡、茶。拿到回答后只回复一句确认，包含我的选择。', clientMessageId: 'cand-ask-typed'});
    let qCard;
    await until(() => { qCard = turnSince(mark).all.find(p => p.cardId.startsWith('q:')); return Boolean(qCard); }, {timeoutMs: 240_000, intervalMs: 500, label: 'question card'});
    const typed = await call('vapp.send', {text: '茶', clientMessageId: 'cand-ask-typed-answer'});
    assert.equal(typed.answeredQuestion, true, JSON.stringify(typed));
    const fin = await finalOf(mark, {cardSuffix: ':1'});
    assert.match(markdown(fin.card), /茶/);
    return {typed, final: markdown(fin.card).slice(0, 200)};
  });

  await scenario('message-tool', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '请用 message 工具（action=send，不要填 target）给我发一条单独的消息，内容是「vapp 测试消息」，然后回复「已发送」。', clientMessageId: 'cand-message'});
    await finalOf(mark);
    await sleep(2_000);
    const messages = events.slice(mark).filter(e => e.event === 'plugin.vapp.message').map(e => e.payload);
    assert.ok(messages.some(m => /vapp 测试消息/.test(m.text ?? '')), `message event: ${JSON.stringify(messages).slice(0, 400)}`);
    return {messages: messages.map(m => ({text: m.text, sessionKey: m.sessionKey}))};
  });

  await scenario('stop', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '用 exec 工具执行 sleep 90，结束后回复「睡醒了」。', clientMessageId: 'cand-stop'});
    await until(() => turnSince(mark).all.some(p => /⚙|sleep|命令/.test(markdown(p.card))), {timeoutMs: 180_000, intervalMs: 200, label: 'tool running'});
    const during = await call('vapp.history', {});
    assert.ok(during.live.length >= 1, 'the card is live');
    const stopAt = Date.now();
    const stopped = await call('vapp.stop', {});
    assert.equal(stopped.stopped, true);
    await until(() => turnSince(mark).all.at(-1)?.live === false, {timeoutMs: 60_000, intervalMs: 100, label: 'settled'});
    const stopMs = Date.now() - stopAt;
    const last = turnSince(mark).all.at(-1);
    await sleep(3_000);
    assert.equal(turnSince(mark).all.at(-1).seq, last.seq, 'nothing more after the stop');
    assert.ok(!markdown(last.card).includes('睡醒了'));
    assert.equal((await call('vapp.history', {})).live.length, 0);
    return {stopMs, text: markdown(last.card).slice(-60)};
  });

  await scenario('steer', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '用 exec 工具执行 sleep 25，结束后回复「任务一完成」，并加上我后来补充的任何要求。', clientMessageId: 'cand-steer-1'});
    await until(() => turnSince(mark).all.some(p => /exec|命令|sleep|⚙/.test(markdown(p.card))), {timeoutMs: 180_000, intervalMs: 300, label: 'tool running'});
    await call('vapp.send', {text: '补充：回复里带上暗号 BLUEBIRD。', clientMessageId: 'cand-steer-2'});
    await sleep(60_000);
    await until(() => events.slice(mark).filter(e => e.event === 'plugin.vapp.card').every(e => e.payload.live === false || events.slice(mark).some(x => x.payload.cardId === e.payload.cardId && x.payload.live === false)), {timeoutMs: 240_000, intervalMs: 1000, label: 'all settled'});
    const texts = [...new Map(events.slice(mark).filter(e => e.event === 'plugin.vapp.card').map(e => [e.payload.cardId, e.payload])).values()].map(p => markdown(p.card));
    assert.ok(texts.join('\n').includes('BLUEBIRD'), texts.join(' / ').slice(0, 500));
    return {cards: texts.length, texts: texts.map(t => t.slice(0, 160))};
  });

  await scenario('model-switch', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '/model', clientMessageId: 'cand-model'});
    const fin = await finalOf(mark, {timeoutMs: 60_000});
    const text = markdown(fin.card);
    assert.ok(!/not authorized|未授权|unauthorized/i.test(text), text.slice(0, 300));
    return {reply: text.slice(0, 300), tags: tagsOf(fin.card)};
  });

  await scenario('react', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '请用 message 工具 action=react 给我这条消息加一个 👍 表情，然后回复「好」。', clientMessageId: 'cand-react'});
    await finalOf(mark);
    await sleep(1_000);
    const reaction = events.slice(mark).find(e => e.event === 'plugin.vapp.reaction');
    assert.ok(reaction, 'a reaction event');
    return {reaction: reaction.payload};
  });

  await scenario('image', async () => {
    const mark = events.length;
    const png = (await import('node:zlib')).default;
    const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
    const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
    const size = 64; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((size * 3 + 1) * size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw[y * (size * 3 + 1) + 1 + x * 3] = 255;
    const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', png.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    await call('vapp.send', {text: '这张图是什么颜色？一个词回答。', clientMessageId: 'cand-image', media: [{contentBase64: file.toString('base64'), mimeType: 'image/png', fileName: 'red.png'}]}, 60_000);
    const fin = await finalOf(mark);
    const echo = events.slice(mark).find(e => e.event === 'plugin.vapp.user' && e.payload.id === 'cand-image');
    assert.ok(echo?.payload.media?.[0]?.source, 'the sent picture is echoed with its V path');
    assert.match(markdown(fin.card), /红|red/i);
    return {reply: markdown(fin.card).slice(0, 120), media: echo.payload.media};
  });

  await scenario('secret', async () => {
    const mark = events.length;
    await call('vapp.send', {text: '请用 ask_user 工具向我索取一个凭据：questions 里放一题，isSecret=true，secretStore.name=VAPP_CAND_TOKEN，header 写「测试凭据」。拿到后回复「已保存」，不要复述内容。如果工具不支持就直接说明原因。', clientMessageId: 'cand-secret'});
    let form;
    await until(() => {
      const q = turnSince(mark).all.find(p => p.cardId.startsWith('q:') && p.card?.body?.elements?.some(e => e.tag === 'form'));
      form = q; return Boolean(q) || [...turnSince(mark).last.values()].some(p => p.final && !p.cardId.startsWith('q:'));
    }, {timeoutMs: 240_000, intervalMs: 500, label: 'secret form or a reply'});
    if (!form) return {noForm: true, reply: markdown([...turnSince(mark).last.values()].at(-1).card).slice(0, 300)};
    const button = form.card.body.elements.find(e => e.tag === 'form').elements.find(e => e.tag === 'button');
    const saved = await call('vapp.action', {value: button.behaviors[0].value, form: {secret_value: 'cand-secret-value'}});
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const fin = await finalOf(mark, {cardSuffix: ':1'});
    assert.ok(!JSON.stringify(events.slice(mark)).includes('cand-secret-value'), 'the value never comes back');
    return {reply: markdown(fin.card).slice(0, 200)};
  });

  await scenario('other-run', async () => {
    const mark = events.length;
    const sessionKey = results.hello.sessionKey;
    await call('chat.send', {sessionKey, message: '只回复这句话：后台任务报告 ALPHA', idempotencyKey: 'cand-other', deliver: false});
    await until(() => [...turnSince(mark).last.values()].some(p => p.final), {timeoutMs: 180_000, intervalMs: 300, label: 'card for a run nobody here sent'});
    const fin = [...turnSince(mark).last.values()].find(p => p.final);
    assert.match(markdown(fin.card), /ALPHA/);
    return {cards: turnSince(mark).last.size, final: markdown(fin.card).slice(0, 120)};
  });

  await scenario('plugin-card', async () => {
    const mark = events.length;
    const picture = path.join(process.env.VLAB_CANDIDATE_DATA ?? '/tmp', 'card-picture.jpg');
    fs.writeFileSync(picture, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AVP/Z', 'base64'));
    const presentation = {title: '电脑', blocks: [{type: 'text', text: `需要你接管\n![桌面](file://${picture})`}, {type: 'buttons', buttons: [{label: '我完成了', value: '/status'}]}]};
    const sent = await call('message.action', {channel: 'vapp', action: 'send', params: {to: 'tianyi', message: '需要你接管', presentation}, idempotencyKey: 'cand-card'}).catch(e => ({rpcError: String(e?.message ?? e)}));
    await sleep(1_000);
    const message = events.slice(mark).find(e => e.event === 'plugin.vapp.message')?.payload;
    return {sent: JSON.stringify(sent).slice(0, 300), card: JSON.stringify(message?.card ?? message ?? null).slice(0, 900)};
  });

  await scenario('approval-events', async () => {
    const mark = events.length;
    const {GatewayClient} = await import(path.join(c.dist, 'plugin-sdk', 'gateway-runtime.js'));
    // The Gateway does not show an approval to the connection that asked for it.
    const asker = new GatewayClient({url: `ws://127.0.0.1:${c.port}`, token: c.gatewayToken, clientName: 'cli', mode: 'cli', scopes: ['operator.admin', 'operator.approvals'], deviceIdentity: null, onConnectError: e => log('asker', {error: String(e)})});
    asker.start();
    cleanups.push(() => asker.stop());
    await sleep(4_000);
    const asked = asker.request('exec.approval.request', {id: 'cand-approval-1', command: 'ls /tmp', host: 'gateway', sessionKey: results.hello.sessionKey, agentId: 'makaron', timeoutMs: 20_000, twoPhase: true}, {timeoutMs: 30_000}).catch(e => ({rpcError: String(e?.message ?? e)}));
    await sleep(1_500);
    const requested = events.slice(mark).find(e => e.event === 'exec.approval.requested')?.payload;
    const resolved = requested ? await call('exec.approval.resolve', {id: requested.id, decision: 'deny'}).catch(e => ({rpcError: String(e?.message ?? e)})) : null;
    await sleep(500);
    return {asked: JSON.stringify(await Promise.race([asked, sleep(200)])).slice(0, 200), requested: JSON.stringify(requested ?? null).slice(0, 600), resolved: JSON.stringify(resolved).slice(0, 200), resolvedEvent: JSON.stringify(events.slice(mark).find(e => e.event === 'exec.approval.resolved')?.payload ?? null).slice(0, 300), names: events.slice(mark).map(e => e.event)};
  });

  await scenario('history', async () => {
    const page = await call('vapp.history', {limit: 200});
    const kinds = page.items.reduce((acc, e) => ({...acc, [e.kind]: (acc[e.kind] ?? 0) + 1}), {});
    assert.ok(kinds.user >= 5 && kinds.card >= 5, JSON.stringify(kinds));
    assert.ok(page.items.some(e => e.id === 'cand-image' && e.media?.length), 'the picture is in the log');
    return {kinds, live: page.live.length};
  });

  results.eventCounts = events.reduce((acc, e) => ({...acc, [e.event]: (acc[e.event] ?? 0) + 1}), {});
  results.gatewayVappLines = c.lines.filter(l => /\[vapp\]|queue|steer/i.test(l.line)).map(l => l.line.slice(0, 300)).slice(-40);
} catch (error) {
  results.fatal = String(error?.stack ?? error).slice(0, 3000);
  results.gatewayTail = c?.lines.slice(-80).map(l => l.line.slice(0, 300));
} finally {
  fs.writeFileSync(path.join(process.env.VLAB_CANDIDATE_DATA ?? '/tmp', 'vapp-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({stage: 'results', ...results}));
  for (const fn of cleanups.reverse()) await Promise.resolve().then(fn).catch(() => {});
  await c?.stop();
}
const failed = !results.fatal && Object.values(results.scenarios).every(s => s.ok) ? 0 : 1;
process.exit(failed);
