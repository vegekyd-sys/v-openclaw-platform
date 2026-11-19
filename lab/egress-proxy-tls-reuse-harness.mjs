// Drive the secret egress proxy (runtime-Cy2RRq4n.js) end to end and measure its main thread
// (egress-proxy-tls-reuse).
//
//   node lab/egress-proxy-tls-reuse-harness.mjs --dist <dir> [--runs 30] [--hosts localhost,127.0.0.1]
//        [--requests 4] [--concurrency 4] [--ballast-mb 0] [--external https://a/,https://b/] [--out result.json]
//
// <dir> is a dist directory holding runtime-Cy2RRq4n.js and its imports: the candidate runtime's
// openclaw/dist (real modules), or the stub directory lab/egress-proxy-tls-reuse.test.mjs writes.
// OPENCLAW_STATE_DIR must point at a disposable state directory; the proxy writes its CA there.
//
// This process only runs the proxy, as the Gateway does. A driver child process hosts the upstream
// HTTPS server (certificate signed by the proxy CA, which the proxy's upstream agent trusts) and
// runs curl through the proxy, one registration per simulated exec run, so the forks the clients
// cost stay out of the measured process. Measured here: event-loop utilisation and a CPU profile
// over the load, the time inside createSecureContext and child_process spawn, and how many openssl
// processes the proxy started. Then function checks: secret substitution for the bound host, the
// refusal for an unbound host, and leaf re-minting after the CA file changes.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Session } from 'node:inspector/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RUNTIME = 'runtime-Cy2RRq4n.js';
const SENTINEL_MODULE = 'sentinel-ZgmfESkJ.js';
const SECRET_VALUE = 'harness-secret-value-7f3c';

function arg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

// ---------------------------------------------------------------- openssl accounting
const spawned = [];
function hookSpawn() {
  const original = cp.spawn;
  cp.spawn = function hookedSpawn(file, ...rest) {
    const started = performance.now();
    const child = original.call(this, file, ...rest);
    spawned.push({ file: path.basename(String(file)), args: Array.isArray(rest[0]) ? rest[0].slice(0, 2) : [], ms: performance.now() - started });
    return child;
  };
  module.syncBuiltinESMExports();
}
const opensslCount = () => spawned.filter((s) => s.file === 'openssl').length;

// ---------------------------------------------------------------- profile attribution
function attribute(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const out = { totalMs: 0, idleMs: 0, busyMs: 0, createSecureContextMs: {}, spawnMs: 0, leafMintMs: 0 };
  for (const [id, us] of selfUs) {
    const ms = us / 1000;
    out.totalMs += ms;
    const node = byId.get(id);
    const fn = node.callFrame.functionName;
    if (fn === '(idle)' || fn === '(program)') { out.idleMs += ms; continue; }
    out.busyMs += ms;
    let cursor = id;
    let attributed = false;
    while (cursor !== undefined) {
      const frame = byId.get(cursor).callFrame;
      if (!attributed && frame.functionName === 'createSecureContext') {
        const caller = byId.get(parent.get(cursor))?.callFrame.functionName || '(anonymous)';
        out.createSecureContextMs[caller] = (out.createSecureContextMs[caller] ?? 0) + ms;
        attributed = true;
      }
      if (!attributed && frame.functionName === 'spawn' && frame.url.includes('child_process')) {
        out.spawnMs += ms;
        attributed = true;
      }
      if (frame.functionName === 'generateLocalProxyLeafQueued' || frame.functionName === 'generateLocalProxyLeaf') { out.leafMintMs += ms; break; }
      cursor = parent.get(cursor);
    }
  }
  const round = (v) => Math.round(v * 10) / 10;
  for (const key of Object.keys(out.createSecureContextMs)) out.createSecureContextMs[key] = round(out.createSecureContextMs[key]);
  for (const key of ['totalMs', 'idleMs', 'busyMs', 'spawnMs', 'leafMintMs']) out[key] = round(out[key]);
  return out;
}

// ---------------------------------------------------------------- driver (child process)
function run(cmd, args, options = {}) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.error}`);
  return r.stdout;
}

function curlArgs(job, urls, { output = '/dev/null', headers = [], data } = {}) {
  const args = ['-sS', '--noproxy', '', '-x', job.proxyUrl, '--cacert', job.trustBundle, '-w', '%{http_code} %{time_total}\\n'];
  for (const h of headers) args.push('-H', h);
  if (data !== undefined) args.push('--data-binary', data);
  for (const url of urls) args.push('-o', output, url);
  return args;
}

async function driver(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-upstream-'));
  try {
    const key = path.join(dir, 'k.pem');
    const csr = path.join(dir, 'c.csr');
    const crt = path.join(dir, 'c.pem');
    const ext = path.join(dir, 'ext');
    fs.writeFileSync(ext, 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
    run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-subj', '/CN=localhost', '-out', csr]);
    run('openssl', ['x509', '-req', '-in', csr, '-CA', spec.caCertPath, '-CAkey', spec.caKeyPath, '-set_serial', '0x01', '-days', '1', '-sha256', '-extfile', ext, '-out', crt]);
    const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ path: req.url, secret: req.headers['x-secret'] ?? null, body }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const url = (host, p) => `https://${host}:${port}${p}`;
    const exec = (args) => new Promise((resolve) => {
      cp.execFile('curl', args, { encoding: 'utf8', maxBuffer: 16 << 20 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
    });
    const parseStatus = (stdout) => stdout.trim().split('\n').filter(Boolean).map((line) => { const [code, t] = line.split(' '); return { code: Number(code), seconds: Number(t) }; });

    const send = (msg) => process.send(msg);
    const waitFor = (type) => new Promise((resolve) => {
      const on = (msg) => { if (msg?.type === type) { process.off('message', on); resolve(msg); } };
      process.on('message', on);
    });

    // Load: each run registration talks to every host, requestsPerHost requests over one tunnel.
    send({ type: 'load-start' });
    const started = performance.now();
    const statuses = [];
    let curlFailures = 0;
    let next = 0;
    const worker = async () => {
      while (next < spec.jobs.length) {
        const job = spec.jobs[next++];
        for (const host of spec.hosts) {
          const urls = Array.from({ length: spec.requestsPerHost }, (_, k) => url(host, `/load/${job.index}/${k}`));
          const r = await exec(curlArgs(job, urls));
          if (r.code !== 0) curlFailures++;
          statuses.push(...parseStatus(r.stdout));
        }
      }
    };
    await Promise.all(Array.from({ length: spec.concurrency }, worker));
    const loadMs = performance.now() - started;
    send({ type: 'load-end' });

    // Function checks on the first registration (bound to SECRET_SENTINEL for localhost only).
    const job0 = spec.jobs[0];
    const bodyFile = path.join(dir, 'body.json');
    const fetchJson = async (job, target, opts) => {
      const r = await exec(curlArgs(job, [target], { ...opts, output: bodyFile }));
      let json;
      try { json = JSON.parse(fs.readFileSync(bodyFile, 'utf8')); } catch { json = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : undefined; }
      fs.rmSync(bodyFile, { force: true });
      return { code: parseStatus(r.stdout)[0]?.code, json };
    };
    const checks = {};
    checks.headerSubstituted = await fetchJson(job0, url('localhost', '/verify/header'), { headers: [`x-secret: ${spec.sentinel}`] });
    checks.bodySubstituted = await fetchJson(job0, url('localhost', '/verify/body'), { data: `{"token":"${spec.sentinel}"}` });
    checks.unboundHostRefused = await fetchJson(job0, url('127.0.0.1', '/verify/unbound'), { headers: [`x-secret: ${spec.sentinel}`] });
    checks.plain = await fetchJson(job0, url('127.0.0.1', '/verify/plain'));
    // Public upstreams verify against the bundled roots through the same upstream agent.
    checks.external = [];
    for (const target of spec.externalUrls) {
      const r = await exec(curlArgs(job0, [target]));
      checks.external.push({ url: target, code: parseStatus(r.stdout)[0]?.code });
    }

    // CA file changes: the next registration must mint a fresh leaf, the one after must not.
    send({ type: 'rotate-ca' });
    const rotated = await waitFor('ca-rotated');
    const afterRotate = [];
    for (const job of rotated.jobs) {
      send({ type: 'mark' });
      await waitFor('marked');
      const r = await exec(curlArgs(job, [url('localhost', '/after-rotate')]));
      send({ type: 'measure' });
      const { openssl } = await waitFor('measured');
      afterRotate.push({ code: parseStatus(r.stdout)[0]?.code, openssl });
    }
    server.close();
    send({ type: 'done', result: { port, loadMs, statuses, curlFailures, checks, afterRotate } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- proxy side (measured process)
export async function measure({ distDir, externalUrls = [], runs = 30, hosts = ['localhost', '127.0.0.1'], requestsPerHost = 4, concurrency = 4, ballastMb = 0, profile = true }) {
  assert(process.env.OPENCLAW_STATE_DIR, 'OPENCLAW_STATE_DIR must point at a disposable state dir');
  hookSpawn();
  const ballast = [];
  for (let i = 0; i < ballastMb; i += 64) ballast.push(Buffer.alloc(64 << 20, 1));
  const runtime = await import(pathToFileURL(path.join(distDir, RUNTIME)).href);
  const sentinels = await import(pathToFileURL(path.join(distDir, SENTINEL_MODULE)).href);
  const sentinel = sentinels.l(SECRET_VALUE, { label: 'HARNESS_SECRET' });

  const startMs = performance.now();
  const proxy = await runtime.startGatewaySecretEgressProxy({});
  const proxyStartMs = performance.now() - startMs;
  const caDir = path.dirname(proxy.caCertPath);
  const opensslAtStart = opensslCount();
  const register = (index) => {
    const env = proxy.registerRun({ runId: `harness-run-${index}`, instanceId: `i${index}` }, [{ sentinel, allowedHosts: ['localhost'], name: 'HARNESS_SECRET' }]);
    return { index, proxyUrl: env.HTTPS_PROXY, trustBundle: env.SSL_CERT_FILE };
  };
  const jobs = Array.from({ length: runs }, (_, i) => register(i));
  const specPath = path.join(caDir, '..', `harness-spec-${process.pid}.json`);
  fs.writeFileSync(specPath, JSON.stringify({ caCertPath: proxy.caCertPath, caKeyPath: path.join(caDir, 'root-ca-key.pem'), jobs, hosts, requestsPerHost, concurrency, sentinel, externalUrls }));

  const session = new Session();
  session.connect();
  const child = cp.fork(fileURLToPath(import.meta.url), ['--driver', specPath], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  let elu0;
  let eluDelta;
  let opensslBefore = 0;
  let opensslLoad = 0;
  let cpuProfile;
  let mark = 0;
  let nextRun = runs;
  const delay = monitorEventLoopDelay({ resolution: 5 });
  const result = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => { if (code) reject(new Error(`driver exited ${code}`)); });
    child.on('message', async (msg) => {
      try {
        if (msg.type === 'load-start') {
          opensslBefore = opensslCount();
          if (profile) {
            await session.post('Profiler.enable');
            await session.post('Profiler.setSamplingInterval', { interval: 200 });
            await session.post('Profiler.start');
          }
          delay.enable();
          elu0 = performance.eventLoopUtilization();
        } else if (msg.type === 'load-end') {
          eluDelta = performance.eventLoopUtilization(elu0);
          delay.disable();
          opensslLoad = opensslCount() - opensslBefore;
          if (profile) cpuProfile = (await session.post('Profiler.stop')).profile;
        } else if (msg.type === 'rotate-ca') {
          const later = new Date(Date.now() + 5000);
          fs.utimesSync(proxy.caCertPath, later, later);
          child.send({ type: 'ca-rotated', jobs: [register(nextRun++), register(nextRun++)] });
        } else if (msg.type === 'mark') {
          mark = opensslCount();
          child.send({ type: 'marked' });
        } else if (msg.type === 'measure') {
          child.send({ type: 'measured', openssl: opensslCount() - mark });
        } else if (msg.type === 'done') resolve(msg.result);
      } catch (error) {
        reject(error);
      }
    });
  });
  session.disconnect();
  await proxy.stop();
  fs.rmSync(specPath, { force: true });
  ballast.length = 0;
  const expected = runs * hosts.length * requestsPerHost;
  const ok = result.statuses.filter((s) => s.code === 200).length;
  const secs = result.statuses.map((s) => s.seconds).sort((a, b) => a - b);
  return {
    node: process.version,
    params: { runs, hosts, requestsPerHost, concurrency, ballastMb },
    proxyStartMs: Math.round(proxyStartMs),
    opensslAtStart,
    load: {
      wallMs: Math.round(result.loadMs),
      requests: result.statuses.length,
      expected,
      ok200: ok,
      curlFailures: result.curlFailures,
      curlSecondsP50: secs[Math.floor(secs.length / 2)],
      curlSecondsP95: secs[Math.floor(secs.length * 0.95)],
      opensslSpawns: opensslLoad,
      eluActiveMs: Math.round(eluDelta.active),
      eluUtilization: Math.round(eluDelta.utilization * 1000) / 1000,
      loopDelayMaxMs: Math.round(delay.max / 1e6),
      loopDelayP99Ms: Math.round(delay.percentile(99) / 1e6),
      profile: cpuProfile ? attribute(cpuProfile) : undefined,
      spawnCallMsTotal: Math.round(spawned.reduce((sum, s) => sum + s.ms, 0)),
    },
    checks: {
      headerSubstituted: result.checks.headerSubstituted.code === 200 && result.checks.headerSubstituted.json?.secret === SECRET_VALUE,
      bodySubstituted: result.checks.bodySubstituted.code === 200 && result.checks.bodySubstituted.json?.body === `{"token":"${SECRET_VALUE}"}`,
      unboundHostRefused: result.checks.unboundHostRefused.code === 502 && !JSON.stringify(result.checks.unboundHostRefused.json ?? '').includes(SECRET_VALUE),
      plainForwarded: result.checks.plain.code === 200 && result.checks.plain.json?.path === '/verify/plain',
      external: result.checks.external,
      afterCaChange: result.afterRotate,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--driver') {
    await driver(argv[1]);
    process.exit(0);
  }
  const distDir = arg(argv, 'dist');
  if (!distDir) throw new Error('usage: egress-proxy-tls-reuse-harness.mjs --dist <dir> [--runs N] [--out file]');
  const out = await measure({
    distDir: path.resolve(distDir),
    runs: Number(arg(argv, 'runs', 30)),
    hosts: arg(argv, 'hosts', 'localhost,127.0.0.1').split(','),
    requestsPerHost: Number(arg(argv, 'requests', 4)),
    concurrency: Number(arg(argv, 'concurrency', 4)),
    ballastMb: Number(arg(argv, 'ballast-mb', 0)),
    profile: arg(argv, 'profile', '1') !== '0',
    externalUrls: (arg(argv, 'external', '') || '').split(',').filter(Boolean),
  });
  const text = JSON.stringify(out, null, 2);
  const file = arg(argv, 'out');
  if (file) fs.writeFileSync(file, `${text}\n`);
  console.log(text);
}
