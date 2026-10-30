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
import {prepareCandidate, AGENT, until, sleep} from './bound-task-support.mjs';

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
      onEvent: e => { if (String(e.event).startsWith('plugin.vapp.')) events.push({at: Date.now(), event: e.event, payload: e.payload}); },
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: e => { clearTimeout(timer); reject(e); },
    });
    app.start();
  });
  cleanups.push(() => app.stop());
}
const call = (method, params, timeoutMs = 30_000) => app.request(method, params, {timeoutMs});

async function scenario(name, fn) {
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

  // ---- vapp: plugin, channel config, binding, owner
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  const pluginDir = path.join(runtime, 'extensions', 'vapp');
  assert(fs.existsSync(path.join(pluginDir, 'v-experience.mjs')), 'vapp plugin installed with v-experience.mjs');
  const vappChannel = {enabled: true, defaultUser: 'tianyi', users: {tianyi: {name: '天懿', owner: true}}};
  const addVapp = (config, {channel = true} = {}) => {
    config.plugins.load.paths.push(pluginDir);
    config.plugins.entries.vapp = {enabled: true};
    if (Array.isArray(config.plugins.allow)) config.plugins.allow.push('vapp');
    if (channel) config.channels = {...(config.channels ?? {}), vapp: vappChannel};
    config.bindings = [...(config.bindings ?? []), {agentId: AGENT, match: {channel: 'vapp'}}];
    config.commands = {...(config.commands ?? {}), ownerAllowFrom: [...(config.commands?.ownerAllowFrom ?? []), 'vapp:tianyi']};
  };
  const config = JSON.parse(fs.readFileSync(c.configPath, 'utf8'));
  addVapp(config);
  fs.writeFileSync(c.configPath, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
  // The Worker resolves message-tool targets itself: it needs the channel too.
  const workerConfigPath = config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
  const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, 'utf8'));
  addVapp(workerConfig);
  fs.writeFileSync(workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, {mode: 0o600});

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

  results.eventCounts = events.reduce((acc, e) => ({...acc, [e.event]: (acc[e.event] ?? 0) + 1}), {});
  results.gatewayVappLines = c.lines.filter(l => /\[vapp\]/.test(l.line)).map(l => l.line.slice(0, 300)).slice(-40);
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
