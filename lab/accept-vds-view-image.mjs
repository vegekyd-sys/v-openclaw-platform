// Production acceptance for v-vds-view-image-v1 (run on V as root after the restart):
//   sudo /opt/node-v22.23.1/bin/node accept-vds-view-image.mjs
// A dedicated /vds session (deliver:false, no channel) looks at two 1080x1920 PNGs
// with code words through view_image. Pass: both codes in the reply, the Codex
// thread stores JPEG (OpenClaw view_image) rather than the PNG, provider deepseek.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const CORE = process.env.V_CORE ?? '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const WORKSPACE = '/home/openclaw/makaron-openclaw/.openclaw-local/workspace';
const CODEX_HOME = '/home/openclaw/.openclaw/agents/makaron/agent/codex-home';
const CODES = ['ORCHID-3170', 'BASALT-8642'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pid = Number(execFileSync('systemctl', ['show', 'openclaw-gateway', '-p', 'MainPID', '--value'], { encoding: 'utf8' }));
assert(pid > 1, 'Gateway is not running');
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const cfg = JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/openclaw.json', 'utf8').replace(/\$\{([^}]+)\}/g, (all, key) => (env[key] === undefined ? all : JSON.stringify(env[key]).slice(1, -1))));
const port = cfg.gateway.port;
const token = cfg.gateway.auth?.token || env.OPENCLAW_GATEWAY_TOKEN;
assert.equal(typeof token, 'string');

const dir = path.join(WORKSPACE, 'tmp', `vds-accept-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
execFileSync('python3', ['-c', `
import random,sys
from PIL import Image,ImageDraw,ImageFont
for i,code in enumerate(sys.argv[2:]):
  random.seed(100+i); W,H=1080,1920
  im=Image.frombytes("RGB",(W,H),random.randbytes(W*H*3))
  im=Image.blend(Image.new("RGB",(W,H),(60+50*i,100,150)),im,0.22)
  d=ImageDraw.Draw(im); f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",96)
  d.rectangle([90,820,990,1100],fill=(250,245,230)); d.text((130,900),code,fill=(20,20,20),font=f)
  im.save(f"{sys.argv[1]}/frame-{i+1}.png")
`, dir, ...CODES]);
execFileSync('chown', ['-R', 'openclaw:openclaw', path.dirname(dir)]);
const files = CODES.map((_, i) => path.join(dir, `frame-${i + 1}.png`));

const { GatewayClient } = await import(`${CORE}/dist/plugin-sdk/gateway-runtime.js`);
const runs = new Map();
const client = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('connect deadline')), 60_000);
  const c = new GatewayClient({
    url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: 'cli', mode: 'cli', caps: ['tool-events'],
    scopes: ['operator.read', 'operator.write', 'operator.admin'],
    onEvent(e) {
      const p = e.payload; const r = runs.get(p?.runId); if (!r) return;
      if (e.event === 'agent' && p.stream === 'assistant' && String(p.data?.text ?? p.data?.delta ?? '').trim() && !r.firstBodyAt) r.firstBodyAt = Date.now();
      if (e.event === 'chat' && ['final', 'error', 'aborted'].includes(p.state)) { r.terminal = p.state; r.final = p; r.endAt = Date.now(); }
    },
    onHelloOk() { clearTimeout(timer); resolve(c); },
    onConnectError(err) { clearTimeout(timer); reject(err); },
  });
  c.start();
});
const key = `agent:makaron:explicit:v-accept-vds-view-image-${Date.now().toString(36)}`;
const call = (m, p) => client.request(m, p, { timeoutMs: 30_000 });
await call('sessions.messages.subscribe', { agentId: 'makaron', key });
async function send(message) {
  const id = randomUUID(); const r = { sentAt: Date.now() }; runs.set(id, r);
  await call('chat.send', { agentId: 'makaron', sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 });
  const deadline = Date.now() + 620_000;
  while (!r.terminal && Date.now() < deadline) await sleep(250);
  return r;
}
const started = Date.now();
let ok = false;
try {
  const sw = await send('/vds');
  const r = await send(`请分别用 view_image 打开这 2 张图（每张单独调用一次），然后逐张告诉我白色方框里的暗号。图片：\n${files.join('\n')}`);
  const text = JSON.stringify(r.final ?? '');
  const rollouts = execFileSync('bash', ['-c', `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(started / 1000)}`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const threads = rollouts.map((f) => {
    const src = fs.readFileSync(f, 'utf8');
    const images = [...src.matchAll(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/g)].map((m) => `${m[1]}:${(m[2].length / 1e6).toFixed(2)}MB`);
    return { thread: path.basename(f).slice(-41, -6), provider: src.match(/"model_provider":"([^"]+)"/)?.[1], viewImageCalls: (src.match(/"name":"view_image"/g) ?? []).length, images, mentionsDir: src.includes(dir) };
  }).filter((t) => t.mentionsDir);
  const codes = CODES.map((c) => text.includes(c));
  const jpegOnly = threads.length > 0 && threads.every((t) => t.images.length > 0 && t.images.every((i) => i.startsWith('image/jpeg')));
  ok = sw.terminal === 'final' && r.terminal === 'final' && codes.every(Boolean) && jpegOnly && threads.every((t) => t.provider === 'deepseek');
  console.log(JSON.stringify({ key, switch: sw.terminal, terminal: r.terminal, firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null, totalMs: r.endAt - r.sentAt, codes, threads, ok }));
} finally {
  client.stop?.();
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
