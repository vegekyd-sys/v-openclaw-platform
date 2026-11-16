// v-relay: the real Worker module behind a local HTTP adapter with an in-memory
// R2 bucket, driven by the real vrelay CLI. Covers part-object put/get, retry on
// injected faults, resume after interruption, pipelined download while the
// upload runs, sha256 mismatch, signed links, rate limit, fake-IP DNS bypass
// and config permissions. No network, no Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {Readable, PassThrough} from 'node:stream';
import worker, {parseRange, parseTokens, cleanName} from '../apps/v-relay/worker/src/index.js';
import {main, parseRate, parseSize, Limiter, runParallel, Route, isFakeIp} from '../apps/v-relay/cli/vrelay.mjs';
import {buildScript, configFor, TARGETS, main as installMain} from '../apps/v-relay/install.mjs';
import {spawn, spawnSync} from 'node:child_process';

const TOKEN = 'test-token-0123456789abcdefghij';
const LINK_KEY = 'link-key-0123456789abcdefghijklmn';

async function bytesOf(body) {
  if (body == null) return new Uint8Array(0);
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

class FakeBucket {
  constructor() { this.objects = new Map(); this.uploads = new Map(); this.minPart = 1; }
  async createMultipartUpload(key, opts) {
    const uploadId = crypto.randomUUID();
    this.uploads.set(uploadId, {key, opts, parts: new Map()});
    return {uploadId, key};
  }
  resumeMultipartUpload(key, uploadId) {
    const self = this;
    const get = () => { const u = self.uploads.get(uploadId); if (!u || u.key !== key) throw new Error('NoSuchUpload (10024)'); return u; };
    return {
      async uploadPart(n, body) { const u = get(); const data = await bytesOf(body); const etag = crypto.createHash('md5').update(data).digest('hex'); u.parts.set(n, {data, etag}); return {partNumber: n, etag}; },
      async abort() { get(); self.uploads.delete(uploadId); },
      async complete(parts) {
        const u = get();
        const chunks = parts.map(p => { const part = u.parts.get(p.partNumber); if (!part || part.etag !== p.etag) throw new Error('InvalidPart (10025)'); return part.data; });
        for (let i = 0; i < chunks.length - 1; i++) if (chunks[i].length !== chunks[0].length || chunks[i].length < self.minPart) throw new Error('InvalidPart (10025) sizes');
        const data = Buffer.concat(chunks);
        self.uploads.delete(uploadId);
        return self.store(key, data, u.opts);
      },
    };
  }
  store(key, data, opts = {}) {
    const obj = {key, data: Buffer.from(data), size: data.length, customMetadata: {...(opts.customMetadata ?? {})}, uploaded: new Date(), httpEtag: `"${crypto.createHash('md5').update(data).digest('hex')}"`};
    this.objects.set(key, obj);
    return this.view(obj);
  }
  view(obj, body) { return {key: obj.key, size: obj.size, customMetadata: obj.customMetadata, uploaded: obj.uploaded, httpEtag: obj.httpEtag, ...(body !== undefined ? {body} : {})}; }
  async put(key, body, opts = {}) {
    const data = await bytesOf(body);
    if (opts.sha256 && crypto.createHash('sha256').update(data).digest('hex') !== opts.sha256) throw new Error('put: The SHA-256 checksum you specified did not match what we received.');
    return this.store(key, data, opts);
  }
  async head(key) { const o = this.objects.get(key); return o ? this.view(o) : null; }
  async get(key, opts = {}) {
    const o = this.objects.get(key);
    if (!o) return null;
    let slice = o.data;
    const r = opts.range;
    if (r) {
      if (r.suffix != null) slice = o.data.subarray(Math.max(0, o.size - r.suffix));
      else { if (r.offset >= o.size) throw new Error('InvalidRange'); slice = o.data.subarray(r.offset, r.length != null ? r.offset + r.length : undefined); }
    }
    return this.view(o, new Blob([slice]).stream());
  }
  async list({prefix, cursor, limit}) {
    const keys = [...this.objects.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + Math.min(limit, 2));
    const truncated = start + page.length < keys.length;
    return {objects: page.map(k => this.view(this.objects.get(k))), truncated, cursor: truncated ? String(start + page.length) : undefined};
  }
  async delete(keys) { for (const key of [keys].flat()) this.objects.delete(key); }
}

// faults: (req: {method, path, range, attempt}) -> undefined | 'reset' | 'stall' | status number
async function startRelay({faults} = {}) {
  const bucket = new FakeBucket();
  const env = {BUCKET: bucket, RELAY_TOKENS: `mac=${TOKEN},other=another-token-abcdefghijklmnopqrstuv`, RELAY_LINK_KEY: LINK_KEY};
  const seen = [];
  const counts = new Map();
  const server = http.createServer(async (req, res) => {
    const key = `${req.method} ${req.url.split('?')[0]} ${req.headers.range ?? ''}`;
    const attempt = (counts.get(key) ?? 0) + 1;
    counts.set(key, attempt);
    const info = {method: req.method, path: req.url.split('?')[0], range: req.headers.range ?? null, attempt};
    seen.push(info);
    const fault = faults?.(info);
    if (fault === 'reset') { req.socket.destroy(); return; }
    if (fault === 'stall') { req.resume(); return; }
    if (typeof fault === 'number') { req.resume(); res.writeHead(fault, {'content-type': 'application/json'}); res.end(JSON.stringify({error: `injected ${fault}`})); return; }
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(`http://${req.headers.host}${req.url}`, {method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'), body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half'});
    const response = await worker.fetch(request, env);
    const headers = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(response.status, headers);
    if (req.method === 'HEAD' || !response.body) { res.end(); return; }
    if (fault === 'truncate') {
      const reader = response.body.getReader();
      const {value} = await reader.read();
      res.write(Buffer.from(value.subarray(0, Math.max(1, value.length >> 1))));
      req.socket.destroy();
      return;
    }
    for await (const chunk of response.body) res.write(Buffer.from(chunk));
    res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {bucket, env, seen, endpoint, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); })};
}

function makeIo(env) {
  const stdout = new PassThrough(), stderr = new PassThrough();
  let out = '', err = '';
  stdout.on('data', d => { out += d; }); stderr.on('data', d => { err += d; });
  return {io: {stdout, stderr, stdin: Readable.from([]), env}, out: () => out, err: () => err};
}

async function tmpdir() { return fsp.mkdtemp(path.join(os.tmpdir(), 'v-relay-test-')); }

function cliEnv(home, endpoint, extra = {}) {
  return {HOME: home, VRELAY_ENDPOINT: endpoint, VRELAY_TOKEN: TOKEN, VRELAY_PART_SIZE: '64K', VRELAY_CHUNK_SIZE: '64K', VRELAY_IDLE_TIMEOUT_MS: '1500', VRELAY_RETRIES: '4', ...extra};
}

async function run(argv, env) {
  const t = makeIo(env);
  let code, error;
  try { code = await main(argv, t.io); } catch (e) { error = e; }
  return {code, error, out: t.out().trim(), err: t.err()};
}

async function makeFile(dir, size, name = 'data.bin') {
  const file = path.join(dir, name);
  await fsp.writeFile(file, crypto.randomBytes(size));
  return {file, sha256: crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex')};
}

const sha = async file => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');

test('worker parsing helpers', () => {
  assert.deepEqual(parseRange('bytes=0-99'), {offset: 0, length: 100});
  assert.deepEqual(parseRange('bytes=100-'), {offset: 100});
  assert.deepEqual(parseRange('bytes=-5'), {suffix: 5});
  assert.equal(parseRange(null), null);
  assert.equal(parseRange('bytes=1-2,4-5'), null);
  assert.throws(() => parseRange('bytes=9-1'));
  assert.deepEqual(parseTokens('a=' + TOKEN + ', short, ' + TOKEN), [{label: 'a', token: TOKEN}, {label: 'default', token: TOKEN}]);
  assert.equal(cleanName('../../etc/passwd'), 'passwd');
  assert.equal(cleanName('..'), 'file');
  assert.equal(cleanName('a\u0000b.txt'), 'ab.txt');
  assert.equal(parseSize('16M'), 16 * 1024 * 1024);
  assert.equal(parseRate('30mbit'), 3750000);
  assert.equal(parseRate('4M'), 4 * 1024 * 1024);
  assert.equal(parseRate('off'), 0);
});

test('worker requires a relay token except for health and signed links', async () => {
  const env = {BUCKET: new FakeBucket(), RELAY_TOKENS: `mac=${TOKEN}`, RELAY_LINK_KEY: LINK_KEY};
  const call = (p, init = {}) => worker.fetch(new Request(`https://relay.test${p}`, init), env);
  assert.equal((await call('/v1/health')).status, 200);
  assert.equal((await call('/v1/objects')).status, 401);
  assert.equal((await call('/v1/objects', {headers: {authorization: 'Bearer wrong-token-0123456789abcdefgh'}})).status, 401);
  assert.equal((await call('/v1/objects', {headers: {authorization: `Bearer ${TOKEN}`}})).status, 200);
  assert.equal((await call('/v1/objects/abcdefgh?exp=9999999999&sig=' + '0'.repeat(64))).status, 403);
  // Parts below 64 KiB are refused.
  const res = await call('/v1/uploads', {method: 'POST', headers: {authorization: `Bearer ${TOKEN}`}, body: JSON.stringify({name: 'x', size: 10 * 1024 * 1024, sha256: 'a'.repeat(64), partSize: 1024})});
  assert.equal(res.status, 400);
  const tooMany = await call('/v1/uploads', {method: 'POST', headers: {authorization: `Bearer ${TOKEN}`}, body: JSON.stringify({name: 'x', size: 6 * 1024 * 1024 * 10001, sha256: 'a'.repeat(64), partSize: 6 * 1024 * 1024})});
  assert.equal(tooMany.status, 400);
});

test('part-object put and get round-trip with retries on injected faults', async () => {
  const dir = await tmpdir();
  const relay = await startRelay({faults: ({method, path: p, range, attempt}) => {
    if (method === 'PUT' && p.endsWith('/parts/2') && attempt === 1) return 500;
    if (method === 'PUT' && p.endsWith('/parts/5') && attempt === 1) return 'reset';
    if (method === 'GET' && range === 'bytes=131072-196607' && attempt === 1) return 'truncate';
    if (method === 'GET' && range === 'bytes=262144-327679' && attempt === 1) return 'stall';
    return undefined;
  }});
  try {
    const {file, sha256} = await makeFile(dir, 600 * 1024 + 123);
    const env = cliEnv(dir, relay.endpoint);
    const put = await run(['put', file, '--json', '-q', '--concurrency', '4'], env);
    assert.equal(put.error, undefined, put.error?.stack);
    const r = JSON.parse(put.out);
    assert.equal(r.sha256, sha256);
    assert.equal(r.parts, 10);
    assert.ok(r.retries >= 2, `retries ${r.retries}`);
    assert.equal(r.by, 'mac');
    const outFile = path.join(dir, 'out.bin');
    const got = await run(['get', r.id, outFile, '--json', '-q'], env);
    assert.equal(got.error, undefined, got.error?.stack);
    const g = JSON.parse(got.out);
    assert.equal(g.verified, true);
    assert.ok(g.retries >= 2, `get retries ${g.retries}`);
    assert.equal(await sha(outFile), sha256);
    assert.ok(!fs.existsSync(`${outFile}.vrelay-part`) && !fs.existsSync(`${outFile}.vrelay-state.json`));
    // Refuse to overwrite without --force.
    const again = await run(['get', r.id, outFile, '-q'], env);
    assert.match(again.error.message, /exists/);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('put resumes after an interruption and uploads only missing parts', async () => {
  const dir = await tmpdir();
  let failPart7 = true;
  const relay = await startRelay({faults: ({method, path: p}) => (failPart7 && method === 'PUT' && p.endsWith('/parts/7') ? 403 : undefined)});
  try {
    const {file, sha256} = await makeFile(dir, 640 * 1024);
    const env = cliEnv(dir, relay.endpoint);
    const first = await run(['put', file, '-q', '--concurrency', '2'], env);
    assert.match(first.error?.message ?? '', /HTTP 403/);
    const statefiles = await fsp.readdir(path.join(dir, '.cache', 'vrelay', 'put'));
    assert.equal(statefiles.length, 1);
    failPart7 = false;
    const before = relay.seen.length;
    const second = await run(['put', file, '--json'], env);
    assert.equal(second.error, undefined, second.error?.stack);
    assert.match(second.err, /resuming/);
    const putsSecond = relay.seen.slice(before).filter(s => s.method === 'PUT').map(s => Number(s.path.split('/').pop()));
    assert.ok(putsSecond.includes(7) && putsSecond.length < 10, `second run uploaded ${putsSecond}`);
    const r = JSON.parse(second.out);
    assert.equal(r.sha256, sha256);
    assert.equal((await fsp.readdir(path.join(dir, '.cache', 'vrelay', 'put'))).length, 0);
    const outFile = path.join(dir, 'o.bin');
    assert.equal((await run(['get', r.id, outFile, '-q'], env)).error, undefined);
    assert.equal(await sha(outFile), sha256);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('put restarts cleanly when the relay no longer knows the upload', async () => {
  const dir = await tmpdir();
  let fail = true;
  const relay = await startRelay({faults: ({method, path: p}) => (fail && method === 'PUT' && p.endsWith('/parts/3') ? 403 : undefined)});
  try {
    const {file} = await makeFile(dir, 300 * 1024);
    const env = cliEnv(dir, relay.endpoint);
    assert.ok((await run(['put', file, '-q', '--concurrency', '1'], env)).error);
    relay.bucket.objects.clear(); // lifecycle expiry, for example
    fail = false;
    const second = await run(['put', file, '-q'], env);
    assert.match(second.error?.message ?? '', /no longer exists/);
    const third = await run(['put', file, '-q'], env);
    assert.equal(third.error, undefined, third.error?.stack);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('get resumes and fetches only missing chunks', async () => {
  const dir = await tmpdir();
  let failChunk = true;
  const relay = await startRelay({faults: ({method, range}) => (failChunk && method === 'GET' && range === 'bytes=327680-393215' ? 403 : undefined)});
  try {
    const {file, sha256} = await makeFile(dir, 512 * 1024);
    const env = cliEnv(dir, relay.endpoint, {VRELAY_GET_CONCURRENCY: '2'});
    const id = (await run(['put', file, '-q'], env)).out;
    const outFile = path.join(dir, 'r.bin');
    const first = await run(['get', id, outFile, '-q'], env);
    assert.match(first.error?.message ?? '', /HTTP 403/);
    assert.ok(fs.existsSync(`${outFile}.vrelay-state.json`));
    failChunk = false;
    const before = relay.seen.length;
    const second = await run(['get', id, outFile], env);
    assert.equal(second.error, undefined, second.error?.stack);
    assert.match(second.err, /resuming/);
    const gets = relay.seen.slice(before).filter(s => s.method === 'GET');
    assert.ok(gets.length < 8, `refetched ${gets.length} chunks`);
    assert.equal(await sha(outFile), sha256);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('get rejects a sha256 mismatch and removes the partial file', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const {file} = await makeFile(dir, 200 * 1024);
    const env = cliEnv(dir, relay.endpoint);
    const id = (await run(['put', file, '-q'], env)).out;
    const obj = relay.bucket.objects.get(`p/${id}/00002`);
    obj.data[1000] ^= 0xff;
    const outFile = path.join(dir, 'bad.bin');
    const r = await run(['get', id, outFile, '-q'], env);
    assert.match(r.error?.message ?? '', /sha256 mismatch/);
    assert.ok(!fs.existsSync(outFile) && !fs.existsSync(`${outFile}.vrelay-part`));
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('small and empty files go single-shot; ls, stat, rm and signed links work', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const env = cliEnv(dir, relay.endpoint);
    const small = await makeFile(dir, 1000, 'small.txt');
    const empty = path.join(dir, 'empty'); await fsp.writeFile(empty, '');
    const s = JSON.parse((await run(['put', small.file, '--json', '-q'], env)).out);
    assert.equal(s.parts, 1);
    const e = JSON.parse((await run(['put', empty, '--json', '-q'], env)).out);
    assert.equal(e.size, 0);
    const big = JSON.parse((await run(['put', (await makeFile(dir, 200 * 1024, 'big.bin')).file, '--json', '-q'], env)).out);
    const list = JSON.parse((await run(['ls', '--json'], env)).out);
    assert.deepEqual(new Set(list.map(o => o.id)), new Set([s.id, e.id, big.id])); // paged (fake page size 2)
    assert.equal(list.find(o => o.id === s.id).name, 'small.txt');
    const stat = JSON.parse((await run(['stat', s.id, '--json'], env)).out);
    assert.equal(stat.sha256, small.sha256);
    // Signed link: download without any token.
    const link = (await run(['link', s.id, '--hours', '1'], env)).out;
    assert.match(link, /\/v1\/objects\/[a-z0-9]+\?exp=\d+&sig=[a-f0-9]{64}$/);
    const noTokenEnv = {HOME: dir};
    const viaLink = await run(['get', link, path.join(dir, 'vialink.txt'), '-q'], noTokenEnv);
    assert.equal(viaLink.error, undefined, viaLink.error?.stack);
    assert.equal(await sha(path.join(dir, 'vialink.txt')), small.sha256);
    const tampered = link.replace(/sig=./, m => m.endsWith('0') ? 'sig=1' : 'sig=0');
    assert.match((await run(['get', tampered, path.join(dir, 't.txt'), '-q'], noTokenEnv)).error?.message ?? '', /403/);
    const emptyOut = path.join(dir, 'empty.out');
    assert.equal((await run(['get', e.id, emptyOut, '-q'], env)).error, undefined);
    assert.equal((await fsp.stat(emptyOut)).size, 0);
    assert.equal((await run(['rm', s.id], env)).out, `deleted ${s.id}`);
    assert.ok([...relay.bucket.objects.keys()].some(k => k.startsWith(`p/${big.id}/`)));
    assert.equal((await run(['rm', big.id], env)).error, undefined);
    assert.ok(![...relay.bucket.objects.keys()].some(k => k.includes(big.id)), 'rm removes every part');
    assert.match((await run(['stat', s.id], env)).error?.message ?? '', /404/);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('upload rate limit is honoured', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const {file} = await makeFile(dir, 768 * 1024);
    const env = cliEnv(dir, relay.endpoint, {VRELAY_UPLOAD_LIMIT: '1M'});
    const started = performance.now();
    const r = await run(['put', file, '-q', '--concurrency', '4'], env);
    assert.equal(r.error, undefined, r.error?.stack);
    const secs = (performance.now() - started) / 1000;
    // 768 KiB at 1 MiB/s with a 256 KiB burst: at least ~0.5 s.
    assert.ok(secs >= 0.4, `took ${secs}s`);
    const lim = new Limiter(0);
    await lim.take(1e9); // unlimited never waits
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('login writes a 0600 config and group-readable configs are refused', async () => {
  const dir = await tmpdir();
  try {
    const env = {HOME: dir};
    const t = makeIo(env);
    t.io.stdin = Readable.from([Buffer.from(`${TOKEN}\n`)]);
    assert.equal(await main(['login', '--endpoint', 'https://relay.example.test/', '--limit', '30mbit'], t.io), 0);
    const p = path.join(dir, '.config', 'vrelay', 'config.json');
    assert.equal((await fsp.stat(p)).mode & 0o777, 0o600);
    const cfg = JSON.parse(await fsp.readFile(p, 'utf8'));
    assert.deepEqual(cfg, {endpoint: 'https://relay.example.test', token: TOKEN, uploadLimit: '30mbit'});
    await fsp.chmod(p, 0o644);
    assert.match((await run(['ls'], env)).error?.message ?? '', /chmod 600/);
  } finally { await fsp.rm(dir, {recursive: true, force: true}); }
});

test('a part far slower than the median is restarted on a new connection', async () => {
  let firstSlow = true;
  const retried = [];
  const results = await runParallel({
    tasks: Array.from({length: 8}, (_, n) => ({n})), concurrency: 3,
    cfg: {endpoint: 'http://127.0.0.1:1', family: '4', retries: 3, slowMinMs: 150},
    onRetry: (task, error) => retried.push([task.n, error.message]),
    run: (task, conn, register) => new Promise((resolve, reject) => {
      if (task.n === 2 && firstSlow) { firstSlow = false; register(reason => reject(new Error(reason))); return; }
      setTimeout(() => resolve(task.n * 10), 10);
    }),
  });
  assert.equal(results.size, 8);
  assert.equal(results.get(2), 20);
  assert.deepEqual(retried.map(r => r[0]), [2]);
  assert.match(retried[0][1], /^slow:/);
});

test('route probes every address and pins transfers to a healthy one', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const port = new URL(relay.endpoint).port;
    // Prefer IPv6, but nothing listens on ::1 for this port: the probe must
    // drop it and fall back to 127.0.0.1 (stand-in for a GFW-reset anycast IP).
    const route = new Route({family: '6', resolve: ['::1', '127.0.0.1']});
    const entry = await route.prepare(`http://relay-host.test:${port}`, {timeoutMs: 2000});
    assert.deepEqual(entry.healthy.map(a => a.address), ['127.0.0.1']);
    assert.ok(entry.probes.find(p => p.address === '::1').error);
    const {file, sha256} = await makeFile(dir, 200 * 1024);
    const env = cliEnv(dir, `http://relay-host.test:${port}`, {VRELAY_RESOLVE: '::1,127.0.0.1', VRELAY_FAMILY: '6'});
    const r = await run(['put', file, '--json', '-q', '--route'], env);
    assert.equal(r.error, undefined, r.error?.stack);
    assert.match(r.err, /route: .*127\.0\.0\.1 \d+ms/);
    const outFile = path.join(dir, 'via-route.bin');
    assert.equal((await run(['get', JSON.parse(r.out).id, outFile, '-q'], env)).error, undefined);
    assert.equal(await sha(outFile), sha256);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('get downloads while the upload is still running (pipelined)', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const {file, sha256} = await makeFile(dir, 640 * 1024 + 7);
    // ~1 s upload; the receiver starts as soon as the id is known.
    const putIo = makeIo(cliEnv(dir, relay.endpoint, {VRELAY_UPLOAD_LIMIT: '512K'}));
    const idKnown = new Promise(resolve => { putIo.io.onId = resolve; });
    const putDone = main(['put', file, '--json'], putIo.io);
    const id = await idKnown;
    assert.match(putIo.err(), new RegExp(`id ${id} \\(receivers can start now`));
    const outFile = path.join(dir, 'piped.bin');
    const got = await run(['get', id, outFile, '--json'], cliEnv(dir, relay.endpoint, {VRELAY_POLL_MS: '50'}));
    assert.equal(got.error, undefined, got.error?.stack);
    assert.equal(await putDone, 0);
    const g = JSON.parse(got.out);
    assert.equal(g.pipelined, true);
    assert.equal(g.verified, true);
    assert.match(got.err, /still uploading/);
    assert.equal(await sha(outFile), sha256);
    const firstRanged = relay.seen.findIndex(r => r.method === 'GET' && r.range);
    const completed = relay.seen.findIndex(r => r.path.endsWith('/complete'));
    assert.ok(firstRanged >= 0 && firstRanged < completed, `first chunk at ${firstRanged}, complete at ${completed}`);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('a pipelined get gives up on a stalled sender and resumes once it is back', async () => {
  const dir = await tmpdir();
  let failPart6 = true;
  const relay = await startRelay({faults: ({method, path: p}) => (failPart6 && method === 'PUT' && p.endsWith('/parts/6') ? 403 : undefined)});
  try {
    const {file, sha256} = await makeFile(dir, 512 * 1024);
    const putEnv = cliEnv(dir, relay.endpoint);
    const first = await run(['put', file, '-q', '--concurrency', '1'], putEnv);
    assert.match(first.error?.message ?? '', /HTTP 403/);
    const id = JSON.parse(await fsp.readFile(path.join(dir, '.cache', 'vrelay', 'put', (await fsp.readdir(path.join(dir, '.cache', 'vrelay', 'put')))[0]), 'utf8')).id;
    const getEnv = cliEnv(dir, relay.endpoint, {VRELAY_POLL_MS: '20', VRELAY_FOLLOW_TIMEOUT_MS: '300'});
    const outFile = path.join(dir, 'stalled.bin');
    const stalled = await run(['get', id, outFile, '-q'], getEnv);
    assert.match(stalled.error?.message ?? '', /no new parts/);
    const partial = JSON.parse(await fsp.readFile(`${outFile}.vrelay-state.json`, 'utf8'));
    assert.equal(partial.done.length, 5, 'the five landed parts were kept');
    failPart6 = false;
    assert.equal((await run(['put', file, '-q'], putEnv)).error, undefined);
    const before = relay.seen.length;
    const resumed = await run(['get', id, outFile], getEnv);
    assert.equal(resumed.error, undefined, resumed.error?.stack);
    assert.match(resumed.err, /resuming/);
    assert.equal(relay.seen.slice(before).filter(r => r.method === 'GET' && r.range).length, 3);
    assert.equal(await sha(outFile), sha256);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('proxy fake-IPs from the system resolver are bypassed through public DNS', async () => {
  const relay = await startRelay();
  try {
    assert.equal(isFakeIp('198.18.0.7'), true);
    assert.equal(isFakeIp('198.19.255.1'), true);
    assert.equal(isFakeIp('172.67.1.1'), false);
    const port = new URL(relay.endpoint).port;
    const lookup = async () => [{address: '198.18.0.7', family: 4}];
    const resolvePublic = async () => [{address: '127.0.0.1', family: 4}];
    const auto = await new Route({family: '4', dns: 'auto', dnsServers: ['192.0.2.1']}, {lookup, resolvePublic}).prepare(`http://relay-host.test:${port}`, {timeoutMs: 2000});
    assert.deepEqual(auto.healthy.map(a => a.address), ['127.0.0.1']);
    assert.match(auto.via, /public-dns/);
    const system = await new Route({family: '4', dns: 'system'}, {lookup, resolvePublic}).prepare(`http://relay-host.test:${port}`, {timeoutMs: 200});
    assert.deepEqual(system.probes.map(a => a.address), ['198.18.0.7']);
    // Real addresses from the system resolver are used as they are.
    const plain = await new Route({family: '4', dns: 'auto'}, {lookup: async () => [{address: '127.0.0.1', family: 4}], resolvePublic: async () => { throw new Error('must not be called'); }}).prepare(`http://relay-host.test:${port}`, {timeoutMs: 2000});
    assert.equal(plain.via, 'system');
  } finally { await relay.close(); }
});

test('download work stealing: a stalled range is taken over, large ranges are split', async () => {
  const dir = await tmpdir();
  const relay = await startRelay({faults: ({method, range, attempt}) => (method === 'GET' && range === 'bytes=196608-262143' && attempt === 1 ? 'stall' : undefined)});
  try {
    const {file, sha256} = await makeFile(dir, 512 * 1024);
    const env = cliEnv(dir, relay.endpoint, {VRELAY_IDLE_TIMEOUT_MS: '30000', VRELAY_STALL_MS: '200', VRELAY_GET_CONCURRENCY: '4'});
    const id = (await run(['put', file, '-q'], env)).out;
    const outFile = path.join(dir, 'stolen.bin');
    const started = performance.now();
    const got = await run(['get', id, outFile, '--json', '-q'], env);
    assert.equal(got.error, undefined, got.error?.stack);
    const g = JSON.parse(got.out);
    assert.ok(g.steals >= 1, `steals ${g.steals}`);
    assert.equal(g.retries, 0);
    assert.ok(performance.now() - started < 10000, 'did not wait for the 30 s idle timeout');
    assert.equal(await sha(outFile), sha256);
    // One 512 KiB chunk, 4 connections, 64 KiB minimum piece: idle connections
    // split it, so several distinct ranges are requested and the bytes still match.
    const before = relay.seen.length;
    const split = await run(['get', id, path.join(dir, 'split.bin'), '--json', '-q'], {...env, VRELAY_CHUNK_SIZE: '512K', VRELAY_STEAL_MIN: '64K'});
    assert.equal(split.error, undefined, split.error?.stack);
    const ranges = new Set(relay.seen.slice(before).filter(r => r.method === 'GET' && r.range).map(r => r.range));
    assert.ok(ranges.size >= 2, `ranges ${[...ranges]}`);
    assert.equal(await sha(path.join(dir, 'split.bin')), sha256);
    // Stealing can be turned off.
    const off = await run(['get', id, path.join(dir, 'plain.bin'), '--json', '-q'], {...env, VRELAY_STEAL: 'off'});
    assert.equal(off.error, undefined, off.error?.stack);
    assert.equal(JSON.parse(off.out).steals, 0);
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});

test('installer: dry run writes nothing, install is idempotent, token never printed', async () => {
  const dir = await tmpdir();
  const relay = await startRelay();
  try {
    const target = {label: 'mac', mode: 'user', cmd: ['bash', '-s'], bin: path.join(dir, 'bin', 'vrelay'), lib: '$HOME/.local/share/vrelay/vrelay.mjs'};
    const secrets = {endpoint: relay.endpoint, tokens: {mac: TOKEN}};
    const files = {cli: await fsp.readFile('apps/v-relay/cli/vrelay.mjs'), skill: await fsp.readFile('apps/v-relay/skill/large-file-transfer/SKILL.md'), config: configFor(target, secrets)};
    // Async: the fake relay lives in this process, so a blocking spawn would deadlock.
    const install = dryRun => new Promise((resolve, reject) => {
      const child = spawn('bash', ['-s'], {env: {...process.env, HOME: dir}});
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
      child.on('error', reject);
      child.on('close', status => resolve({status, stdout, stderr}));
      child.stdin.end(buildScript(target, {...files, dryRun}));
    });
    const cfgPath = path.join(dir, '.config', 'vrelay', 'config.json');

    const dry = await install(true);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /would write .*config\.json/);
    assert.ok(!fs.existsSync(cfgPath) && !fs.existsSync(target.bin), 'dry run wrote files');
    assert.ok(!buildScript(target, {...files, dryRun: true}).includes(TOKEN), 'dry-run script carries the token');

    const first = await install(false);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /auth\s+ok/);
    assert.match(first.stdout, /done\s+updated/);
    assert.equal((await fsp.stat(cfgPath)).mode & 0o777, 0o600);
    assert.equal((await fsp.stat(path.dirname(cfgPath))).mode & 0o777, 0o700);
    assert.deepEqual(JSON.parse(await fsp.readFile(cfgPath, 'utf8')), {endpoint: relay.endpoint, token: TOKEN});
    const v = spawnSync(target.bin, ['--version'], {env: {...process.env, HOME: dir, PATH: '/usr/bin:/bin'}, encoding: 'utf8'});
    assert.equal(v.stdout.trim(), '0.2.0', 'wrapper works without node on PATH');

    const again = await install(false);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /done\s+no changes/);
    assert.doesNotMatch(again.stdout, /wrote/);
    for (const out of [dry.stdout, dry.stderr, first.stdout, first.stderr, again.stdout]) assert.ok(!out.includes(TOKEN), 'token printed');

    assert.throws(() => configFor(TARGETS.air, secrets), /no token for "air"/);
    // Only the cross-border ends: Shanghai home (mac, air) and Singapore (v).
    assert.deepEqual(Object.keys(TARGETS).sort(), ['air', 'mac', 'v']);
    assert.throws(() => installMain(['--dry-run', '--only', 'portal']), /not a vrelay target.*scp\/rsync/);
    assert.equal(JSON.parse(configFor(TARGETS.v, {endpoint: 'https://r.test', tokens: {v: TOKEN}})).uploadLimit, '45mbit');
  } finally { await relay.close(); await fsp.rm(dir, {recursive: true, force: true}); }
});
