import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBridge, resolveAccountModel, AccountLogin, linuxPeerUid } from '../apps/gemini-account-bridge/bridge.mjs';

const KEY = 'k'.repeat(40);

function loginHome(t, { expiresInMs = 3_600_000, mode = 0o600 } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.gemini/antigravity-cli'), { recursive: true });
  fs.mkdirSync(path.join(home, 'work'));
  const write = (token, ms) => {
    const file = path.join(home, '.gemini/antigravity-cli/antigravity-oauth-token');
    fs.writeFileSync(file, JSON.stringify({ token: { access_token: token, expiry: new Date(Date.now() + ms).toISOString() } }));
    fs.chmodSync(file, mode);
  };
  write('tok-1', expiresInMs);
  return { home, write };
}

function fakeUpstream(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.authorization, body });
    const method = url.split(':').at(-1).split('?')[0];
    if (method === 'loadCodeAssist') return Response.json({ cloudaicompanionProject: 'proj-1', paidTier: { id: 'g1-pro-tier' } });
    return handler(method, body, url);
  };
  return { calls, fetchImpl };
}

async function serve(t, bridge) {
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  t.after(() => bridge.close());
  return `http://127.0.0.1:${bridge.address().port}`;
}

const sse = (chunks) => new Response(new ReadableStream({
  start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(x)}\r\n\r\n`)); c.close(); },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } });

test('effort comes from thinkingLevel and the thinking knobs are stripped', () => {
  const opts = { allowed: ['gemini-4-neon'], defaultEffort: 'medium' };
  const req = { contents: [], generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' }, temperature: 1 } };
  const out = resolveAccountModel('gemini-4-neon', req, opts);
  assert.equal(out.accountModel, 'gemini-4-neon-high');
  assert.deepEqual(out.request.generationConfig, { thinkingConfig: { includeThoughts: true }, temperature: 1 });
  assert.equal(req.generationConfig.thinkingConfig.thinkingLevel, 'HIGH', 'input is not mutated');
  assert.equal(resolveAccountModel('gemini-4-neon', {}, opts).accountModel, 'gemini-4-neon-medium');
  assert.equal(resolveAccountModel('gemini-4-neon', { generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } }, opts).accountModel, 'gemini-4-neon-low');
  assert.equal(resolveAccountModel('gemini-4-neon', { generationConfig: { thinkingConfig: { thinkingLevel: 'max' } } }, opts).accountModel, 'gemini-4-neon-xhigh');
  assert.equal(resolveAccountModel('gemini-4-neon-low', { generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } }, opts).accountModel, 'gemini-4-neon-low');
  const budgetOnly = resolveAccountModel('gemini-4-neon', { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } }, opts);
  assert.equal(budgetOnly.request.generationConfig.thinkingConfig, undefined);
  assert.equal(resolveAccountModel('gemini-4-carbon', {}, opts), null);
});

test('streams Gemini API chunks unwrapped from the account envelope', async (t) => {
  const { home } = loginHome(t);
  const { calls, fetchImpl } = fakeUpstream(() => sse([
    { response: { candidates: [{ content: { role: 'model', parts: [{ text: 'NE' }] } }] }, traceId: 'x' },
    { response: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'exec', args: { command: 'hostname' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5 } } },
  ]));
  const url = await serve(t, createBridge({ key: KEY, login: new AccountLogin({ home }), fetchImpl }));
  const body = { contents: [{ role: 'user', parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }], tools: [{ functionDeclarations: [{ name: 'exec' }] }], generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' } } };
  const res = await fetch(`${url}/v1beta/models/gemini-4-neon:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  const events = (await res.text()).split('\n\n').filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, '')));
  assert.equal(events.length, 2);
  assert.equal(events[0].candidates[0].content.parts[0].text, 'NE');
  assert.equal(events[1].candidates[0].content.parts[0].functionCall.name, 'exec');
  assert.equal(events[0].traceId, undefined);
  const gen = calls.find((c) => c.url.includes('streamGenerateContent'));
  assert.match(gen.url, /:streamGenerateContent\?alt=sse$/);
  assert.equal(gen.auth, 'Bearer tok-1');
  assert.equal(gen.body.project, 'proj-1');
  assert.equal(gen.body.model, 'gemini-4-neon-low');
  assert.deepEqual(gen.body.request.contents, body.contents, 'images and tools pass through untouched');
  assert.deepEqual(gen.body.request.tools, body.tools);
  assert.deepEqual(gen.body.request.generationConfig.thinkingConfig, { includeThoughts: true });
});

test('rejects a wrong key, unknown models, and maps upstream failures', async (t) => {
  const { home } = loginHome(t);
  let status = 500;
  const { fetchImpl } = fakeUpstream(() => new Response(JSON.stringify({ error: { message: 'boom' } }), { status }));
  const url = await serve(t, createBridge({ key: KEY, login: new AccountLogin({ home }), fetchImpl }));
  const post = (model, key = KEY) => fetch(`${url}/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key }, body: '{"contents":[]}' });
  assert.equal((await post('gemini-4-neon', 'wrong')).status, 401);
  assert.equal((await post('gemini-4-carbon')).status, 404);
  const five = await post('gemini-4-neon');
  assert.equal(five.status, 503, 'upstream 5xx becomes 503');
  assert.equal((await five.json()).error.status, 'UNAVAILABLE');
  status = 429;
  assert.equal((await post('gemini-4-neon')).status, 429, '429 stays 429 so failover sees rate limits');
  const health = await (await fetch(`${url}/healthz`)).json();
  assert.equal(health.stats.failed, 3, 'unauthenticated requests are refused before counting');
  assert.ok(health.login.expiresInSeconds > 3000);
  assert.equal(JSON.stringify(health).includes('tok-1'), false, 'health never exposes the token');
});

test('refreshes an expiring login through the CLI once, and retries a 401 once', async (t) => {
  const { home, write } = loginHome(t, { expiresInMs: 60_000 });
  let cliRuns = 0;
  const login = new AccountLogin({ home, agyBin: '/bin/true', runCli: async (args, cwd) => {
    cliRuns += 1;
    assert.deepEqual(args, ['--print', '/usage', '--output-format', 'json']);
    assert.ok(cwd.startsWith(path.join(home, 'work')));
    write(`tok-${cliRuns + 1}`, 3_600_000);
  } });
  let first = true;
  const { calls, fetchImpl } = fakeUpstream(() => {
    if (first) { first = false; return new Response('{}', { status: 401 }); }
    return Response.json({ response: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } });
  });
  const url = await serve(t, createBridge({ key: KEY, login, fetchImpl }));
  const res = await fetch(`${url}/v1beta/models/gemini-4-neon:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': KEY }, body: '{"contents":[]}' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).candidates[0].content.parts[0].text, 'ok');
  assert.equal(cliRuns, 2, 'one refresh for the expiring token, one forced by the 401');
  const gens = calls.filter((c) => c.url.includes(':generateContent'));
  assert.deepEqual(gens.map((c) => c.auth), ['Bearer tok-2', 'Bearer tok-3']);
  assert.deepEqual(fs.readdirSync(path.join(home, 'work')), [], 'refresh workspaces are removed');
});

test('refuses a login file other users can read', async (t) => {
  const { home } = loginHome(t, { mode: 0o644 });
  assert.throws(() => new AccountLogin({ home }).read(), /private/);
});

test('caps concurrent generations', async (t) => {
  const { home } = loginHome(t);
  let release;
  const gate = new Promise((r) => { release = r; });
  const { fetchImpl } = fakeUpstream(async () => { await gate; return Response.json({ response: { candidates: [] } }); });
  const url = await serve(t, createBridge({ key: KEY, login: new AccountLogin({ home }), fetchImpl, concurrency: 1 }));
  const post = () => fetch(`${url}/v1beta/models/gemini-4-neon:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': KEY }, body: '{}' });
  const a = post();
  await new Promise((r) => setTimeout(r, 50));
  const b = await post();
  assert.equal(b.status, 429);
  release();
  assert.equal((await a).status, 200);
});

test('admits callers by the uid that owns the loopback connection', async (t) => {
  const { home } = loginHome(t);
  const { fetchImpl } = fakeUpstream(() => Response.json({ response: { candidates: [] } }));
  let uid = 1001;
  const url = await serve(t, createBridge({ allowUids: [1001], peerUid: () => uid, login: new AccountLogin({ home }), fetchImpl }));
  const post = () => fetch(`${url}/v1beta/models/gemini-4-neon:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': 'loopback-uid-auth' }, body: '{}' });
  assert.equal((await post()).status, 200);
  uid = 1002;
  assert.equal((await post()).status, 401, 'another local user is refused even with the marker key');
  uid = undefined;
  assert.equal((await post()).status, 401, 'unknown peers are refused');
  assert.throws(() => createBridge({ login: new AccountLogin({ home }) }), /ALLOW_USERS/);
});

test('reads the client socket owner from /proc/net/tcp', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'net'));
  // client 127.0.0.1:40000 -> server 127.0.0.1:25990 owned by uid 997; server side line owned by 993
  fs.writeFileSync(path.join(root, 'net/tcp'), [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:6586 0100007F:9C40 01 00000000:00000000 00:00000000 00000000   993        0 1 1',
    '   1: 0100007F:9C40 0100007F:6586 01 00000000:00000000 00:00000000 00000000   997        0 2 1',
    '   2: 0A00000F:9C41 0100007F:6586 01 00000000:00000000 00:00000000 00000000   0          0 3 1',
  ].join('\n'));
  assert.equal(linuxPeerUid({ remotePort: 40000, localPort: 25990 }, root), 997);
  assert.equal(linuxPeerUid({ remotePort: 40001, localPort: 25990 }, root), undefined, 'non-loopback client address is ignored');
  assert.equal(linuxPeerUid({ remotePort: 1, localPort: 25990 }, root), undefined);
});
