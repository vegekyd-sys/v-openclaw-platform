// Candidate: a private Gateway for developing the V iOS client (v-voice
// client/) against real 9.1 behaviour, without touching shared VLab or V.
//
// Real model turns (the configured worker harness), synthetic Feishu
// transport. Two Feishu-bound sessions (a DM and a group) are seeded with one
// real exchange each, then a mobile setup code is issued for the loopback
// URL. The Mac reaches the Gateway through `ssh -L <port>:127.0.0.1:<port>`,
// so the setup code's ws://127.0.0.1 URL is valid on both ends.
//
// While it runs, /tmp/vclient-gateway/info.json holds the port and setup code
// (mode 0600, server side only). Create /tmp/vclient-gateway/stop, or wait
// VCLIENT_HOLD_MINUTES, to shut it down. Optional commands can be queued as
// /tmp/vclient-gateway/inject-<n>.json ({chat:"dm"|"group", text}) to post a
// Feishu message as the owner while the client watches. With VCLIENT_VAPP=1
// the plan also installs the vapp channel plugin (vapp-support.mjs).
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate, OWNER, DM_CHAT, GROUP_B, dmKey, groupKey, until, sleep} from './bound-task-support.mjs';

// A teammate: not the owner, with their own Feishu private chat with V.
const MEMBER = 'ou_00000000000000000000000000000009', MEMBER_DM = 'oc_00000000000000000000000000000009';
import {installVapp} from './vapp-support.mjs';

const dir = '/tmp/vclient-gateway';
const holdMs = Number(process.env.VCLIENT_HOLD_MINUTES ?? 120) * 60_000;
fs.rmSync(dir, {recursive: true, force: true});
fs.mkdirSync(dir, {recursive: true, mode: 0o700});

const cleanups = [];
let c;
const log = (stage, extra = {}) => console.log(JSON.stringify({stage, at: new Date().toISOString(), ...extra}));
const chats = {dm: [DM_CHAT, 'p2p'], group: [GROUP_B, 'group']};
async function post(chat, text) {
  const [chatId, chatType] = chats[chat];
  const seed = c.fake.post({receive_id: chatId, msg_type: 'text', content: JSON.stringify({text: 'candidate initialization'})});
  return c.inject({chatId, chatType, sender: OWNER, messageId: seed.message_id, mentionBot: chatType === 'group', text});
}

/** Sends /app from someone in a chat and returns V's reply text (or what came instead). */
async function askForLink(chatId, chatType, sender) {
  const seed = c.fake.post({receive_id: chatId, msg_type: 'text', content: JSON.stringify({text: 'candidate initialization'})});
  const before = c.fake.list(chatId).length;
  const linesBefore = c.lines.length;
  await c.inject({chatId, chatType, sender, messageId: seed.message_id, mentionBot: chatType === 'group', text: '/app'});
  let reply;
  try {
    await until(() => {
      reply = c.fake.list(chatId).slice(before).map(m => JSON.stringify(m)).find(text => /vapp\/login#|私聊|没能|没有配置|认不出/u.test(text));
      return Boolean(reply);
    }, {timeoutMs: 90_000, intervalMs: 500, label: `/app reply in ${chatId}`});
    return reply;
  } catch {
    // What V said instead, and what the Gateway logged about it, for the report.
    const said = c.fake.list(chatId).slice(before).map(m => JSON.stringify(m).replace(/vapp\/login#[\w-]+/gu, 'vapp/login#<code>').slice(0, 400));
    const logged = c.lines.slice(linesBefore).map(l => l.line).filter(l => /command|\/app|vapp|plugin/iu.test(l)).slice(-20).map(l => l.slice(0, 300));
    log('app-no-reply', {chatId, said, logged});
    return `NO_REPLY ${JSON.stringify(said).slice(0, 300)}`;
  }
}

const linkCode = (reply) => /vapp\/login#([A-Za-z0-9_-]+)/u.exec(reply ?? '')?.[1];
const decode = (code) => JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));

/** The three /app cases, and the member endpoint checked from outside like a phone would. */
async function appLinks() {
  const base = `http://127.0.0.1:${c.port}`;
  const owner = linkCode(await askForLink(DM_CHAT, 'p2p', OWNER));
  const group = await askForLink(GROUP_B, 'group', OWNER);
  const first = linkCode(await askForLink(MEMBER_DM, 'p2p', MEMBER));
  if (!first) return {report: {ownerLink: Boolean(owner), memberLink: false, group: String(group).slice(0, 200)}, links: {owner}};
  const report = {
    ownerIsPairing: Boolean(owner && decode(owner).bootstrapToken && !decode(owner).invite),
    groupRefused: !linkCode(group) && /私聊/u.test(group),
    memberIsInvite: Boolean(first && decode(first).invite && !decode(first).bootstrapToken),
  };
  // Claim the first member link here, as a phone would, and probe what it can reach.
  const claim = await fetch(`${base}/vapp/member/claim`, {method: 'POST', body: JSON.stringify({invite: decode(first).invite, deviceName: 'candidate'})});
  const {credential, userId} = await claim.json();
  report.claimed = claim.status === 200 && userId === `feishu:${MEMBER}`;
  report.reuseRefused = (await fetch(`${base}/vapp/member/claim`, {method: 'POST', body: JSON.stringify({invite: decode(first).invite})})).status === 403;
  const rpc = async (method, params = {}) => (await fetch(`${base}/vapp/member/rpc`, {method: 'POST', headers: {authorization: `Bearer ${credential}`}, body: JSON.stringify({method, params})})).json();
  const hello = await rpc('vapp.hello');
  report.hello = {userId: hello.payload?.userId, owner: hello.payload?.owner, sessionKey: hello.payload?.sessionKey};
  report.refused = {};
  for (const method of ['sessions.list', 'chat.history', 'chat.send', 'device.pair.setupCode']) report.refused[method] = (await rpc(method)).error?.code;
  report.memberSessions = (await rpc('vapp.sessions')).payload?.sessions?.length;
  report.noAuth = (await fetch(`${base}/vapp/member/rpc`, {method: 'POST', body: '{"method":"vapp.hello"}'})).status;
  // The Gateway's own API refuses the member credential outright.
  report.gatewayRefusesCredential = (await fetch(`${base}/__openclaw__/assistant-media?source=%2Fetc%2Fhostname`, {headers: {authorization: `Bearer ${credential}`}})).status;
  // A second member link, untouched, for the simulator.
  const second = linkCode(await askForLink(MEMBER_DM, 'p2p', MEMBER));
  return {report, links: {owner, member: second}};
}

try {
  c = await prepareCandidate({harness: process.env.VCLIENT_HARNESS ?? 'worker', maxWorkers: 2, registerCleanup: fn => cleanups.push(fn)});
  // VCLIENT_VAPP=1: also the vapp channel, so the app gets its own chat with V cards.
  if (process.env.VCLIENT_VAPP === '1') installVapp(c, {publicUrl: `http://127.0.0.1:${c.port}`});
  // The shared harness sets session.agentToAgent for inter-session tests; releases from
  // 2026-11-10 reject that key and this test does not use it.
  for (const file of [c.configPath, JSON.parse(fs.readFileSync(c.configPath, 'utf8')).plugins?.entries?.['vlab-agent-worker-isolation']?.config?.workerConfigPath].filter(Boolean)) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (config.session?.agentToAgent) {
      delete config.session.agentToAgent;
      fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
    }
  }
  const ready = await c.start({timeoutMs: 240_000});
  log('gateway-ready', {port: c.port, readyMs: ready.readyMs, harness: c.harness, model: c.model});

  await post('dm', '你好，用两句话介绍一下你自己。');
  await post('group', '大家好！用一句话说说今天适合做什么。');
  await until(() => [DM_CHAT, GROUP_B].every(id => c.fake.list(id).some(m => m.msg_type === 'interactive')),
    {timeoutMs: 240_000, label: 'seed replies in both chats'});
  log('seeded', {sessions: [dmKey(), groupKey(GROUP_B)]});

  const setup = await c.rpc('device.pair.setupCode', {publicUrl: `ws://127.0.0.1:${c.port}`});
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({
    port: c.port, setupCode: setup.setupCode, expiresAtMs: setup.expiresAtMs,
    sessions: {dm: dmKey(), group: groupKey(GROUP_B)},
  }), {mode: 0o600});
  log('setup-code-issued', {expiresAtMs: setup.expiresAtMs});

  // /app: the owner gets a Gateway pairing link, a teammate a member login, a group nothing.
  let login = {};
  if (process.env.VCLIENT_VAPP === '1') {
    login = await appLinks();
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({...JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')), login: login.links, loginReport: login.report}), {mode: 0o600});
    log('app-links', login.report);
  }

  const end = Date.now() + holdMs;
  while (Date.now() < end && !fs.existsSync(path.join(dir, 'stop'))) {
    // newlink-owner / newlink-member: a fresh /app link, as if that person asked again.
    for (const name of fs.readdirSync(dir).filter(n => /^newlink-(owner|member)$/u.test(n))) {
      fs.rmSync(path.join(dir, name), {force: true});
      const member = name.endsWith('member');
      const code = linkCode(await askForLink(member ? MEMBER_DM : DM_CHAT, 'p2p', member ? MEMBER : OWNER));
      const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
      info.login = {...info.login, [member ? 'member' : 'owner']: code};
      fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info), {mode: 0o600});
      log('new-link', {who: member ? 'member' : 'owner', ok: Boolean(code)});
    }
    for (const name of fs.readdirSync(dir).filter(n => /^inject-.+\.json$/u.test(n)).sort()) {
      const file = path.join(dir, name);
      try {
        const {chat, text} = JSON.parse(fs.readFileSync(file, 'utf8'));
        await post(chat, text);
        log('injected', {chat});
      } catch (error) {
        log('inject-failed', {name, error: String(error?.message ?? error)});
      }
      fs.rmSync(file, {force: true});
    }
    await sleep(1_000);
  }
  const devices = await c.rpc('device.pair.list', {}).catch(error => ({error: String(error?.message ?? error)}));
  log('stopping', {paired: (devices.paired ?? []).map(d => ({clientId: d.clientId, platform: d.platform, roles: d.roles, scopes: d.scopes})),
    pending: (devices.pending ?? []).length});
} finally {
  await c?.stop?.();
  for (const fn of cleanups) await Promise.resolve().then(fn).catch(() => {});
  fs.rmSync(dir, {recursive: true, force: true});
}
