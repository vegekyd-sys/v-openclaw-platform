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
// Feishu message as the owner while the client watches.
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate, OWNER, DM_CHAT, GROUP_B, dmKey, groupKey, until, sleep} from './bound-task-support.mjs';

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

try {
  c = await prepareCandidate({harness: process.env.VCLIENT_HARNESS ?? 'worker', maxWorkers: 2, registerCleanup: fn => cleanups.push(fn)});
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

  const end = Date.now() + holdMs;
  while (Date.now() < end && !fs.existsSync(path.join(dir, 'stop'))) {
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
  await c?.stop();
  for (const fn of cleanups) await Promise.resolve().then(fn).catch(() => {});
  fs.rmSync(dir, {recursive: true, force: true});
}
