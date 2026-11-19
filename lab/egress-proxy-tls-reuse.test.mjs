import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CA_MARKER, FILES, MARKER } from './patch-egress-proxy-tls-reuse.mjs';
import { OUTPUT_DIR, PLAN } from './build-egress-proxy-tls-reuse.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const harness = path.join(repo, 'lab/egress-proxy-tls-reuse-harness.mjs');

test('plan lists every patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  for (const file of FILES) assert.equal(plan.files.find((f) => f.target.endsWith(`/${file.name}`)).before, file.before);
});

test('release file carries the marker, parses, and refuses a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    const marker = file.marker ?? MARKER;
    assert(out.includes(marker), `${file.name} lacks ${marker}`);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.name} does not parse: ${r.stderr}`);
  }
});

test('upstream agent gets one SecureContext; leaves come from the per-proxy cache', () => {
  const src = read('runtime-Cy2RRq4n.js');
  assert(src.includes('new Agent({ secureContext: createSecureContext({ ca: [...rootCertificates, caPem] }) })'));
  assert(!src.includes('new Agent({ ca:'), 'the per-connection ca option is gone');
  assert(!/keepAlive/u.test(src), 'connection reuse is not part of this change');
  // The only remaining direct mint is inside leafFor; tlsServerFor goes through the cache.
  assert.equal(src.split('generateLocalProxyLeaf({').length, 2);
  assert(src.includes('server = leafFor(target.hostname).then((leaf) => {'));
  assert(src.includes('leafCache.clear();'));
});

// ------------------------------------------------------------------ behaviour with stub imports
// runtime-Cy2RRq4n.js imports seven dist chunks. The stubs below keep the proxy itself real and
// mint certificates with the system openssl the way ca-DsWeiCkK.js does (CA, shared leaf key,
// req + x509 per leaf), through child_process.spawn so the harness can count the processes.
const STUBS = {
  'paths-Dx1CjxA5.js': 'export const w = () => process.env.OPENCLAW_STATE_DIR;\n',
  'subsystem-bfHYmnCE.js': 'export const t = () => ({ info() {}, warn() {}, error() {}, debug() {} });\n',
  'exact-hostname-B5MIU7_E.js': 'export const t = (raw) => raw.trim().toLowerCase().replace(/\\.+$/u, "").replace(/^\\[(.*)\\]$/u, "$1");\n',
  'registry-AG1Awcc4.js': 'let active;\nexport const r = (p) => { if (active) throw new Error("already active"); active = p; };\nexport const t = (p) => { if (active === p) active = undefined; };\n',
  'sentinel-ZgmfESkJ.js': `const values = new Map();
export const r = "oc-sent-v2.";
export const i = ".end";
export const n = /oc-sent-v2\\.[A-Za-z0-9_-]+\\.end/g;
export const a = (value) => value.includes(r);
export const o = (value) => /^oc-sent-v2\\.[A-Za-z0-9_-]+\\.end$/u.test(value);
export const l = (value) => { const s = r + Buffer.from(value).toString("base64url") + i; values.set(s, value); return s; };
export const c = (sentinel) => values.get(sentinel);
`,
  'ca-DsWeiCkK.js': `import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const openssl = (args) => new Promise((resolve, reject) => {
	const child = cp.spawn("openssl", args, { stdio: ["ignore", "ignore", "pipe"] });
	let err = "";
	child.stderr.on("data", (c) => { err += c; });
	child.on("error", reject);
	child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("openssl " + args[0] + ": " + err)));
});
let queue = Promise.resolve();
export async function n(certDir) {
	const certPath = path.join(certDir, "root-ca.pem");
	const keyPath = path.join(certDir, "root-ca-key.pem");
	const cnf = path.join(certDir, "ca.cnf");
	fs.writeFileSync(cnf, "[req]\\ndistinguished_name = subject\\nprompt = no\\n\\n[subject]\\nCN = Stub Egress CA\\n\\n[v3_ca]\\nbasicConstraints = critical, CA:TRUE\\nkeyUsage = critical, keyCertSign, cRLSign\\n");
	await openssl(["req", "-config", cnf, "-extensions", "v3_ca", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "1", "-nodes", "-keyout", keyPath, "-out", certPath]);
	return { certPath, keyPath };
}
export function r(params) {
	const job = queue.then(async () => {
		const stub = globalThis.__egressStub ?? {};
		if (stub.failNext) { stub.failNext = false; throw new Error("stub mint failure"); }
		const keyPath = path.join(params.certDir, "leaf-key.pem");
		if (!fs.existsSync(keyPath)) await openssl(["genrsa", "-out", keyPath, "2048"]);
		const dir = fs.mkdtempSync(path.join(params.certDir, ".leaf-"));
		try {
			const ext = path.join(dir, "ext");
			const san = /^[0-9.]+$/u.test(params.hostname) ? "IP" : "DNS";
			fs.writeFileSync(ext, "subjectAltName=" + san + ":" + params.hostname + "\\nextendedKeyUsage=serverAuth\\n");
			await openssl(["req", "-new", "-key", keyPath, "-subj", "/CN=" + params.hostname, "-out", path.join(dir, "csr")]);
			await openssl(["x509", "-req", "-in", path.join(dir, "csr"), "-CA", params.ca.certPath, "-CAkey", params.ca.keyPath, "-set_serial", "0x" + Date.now().toString(16), "-out", path.join(dir, "leaf.pem"), "-days", String(stub.leafDays ?? 1), "-sha256", "-extfile", ext]);
			return { cert: fs.readFileSync(path.join(dir, "leaf.pem")), key: fs.readFileSync(keyPath) };
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
	queue = job.catch(() => {});
	return job;
}
export const t = n;
`,
};

function stubDist() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-tls-reuse-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  for (const [name, body] of Object.entries(STUBS)) fs.writeFileSync(path.join(dist, name), body);
  fs.copyFileSync(path.join(repo, OUTPUT_DIR, 'runtime-Cy2RRq4n.js'), path.join(dist, 'runtime-Cy2RRq4n.js'));
  fs.mkdirSync(path.join(root, 'state'));
  return root;
}

function runHarness(root, args, prelude = '') {
  // A prelude module sets the stub knobs before the harness imports the runtime.
  const pre = path.join(root, 'prelude.mjs');
  fs.writeFileSync(pre, `globalThis.__egressStub = {};\n${prelude}\n`);
  const r = spawnSync(process.execPath, ['--import', pre, harness, '--dist', path.join(root, 'dist'), '--profile', '0', ...args], {
    encoding: 'utf8',
    env: { ...process.env, OPENCLAW_STATE_DIR: path.join(root, 'state'), HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' },
    timeout: 120_000,
  });
  assert.equal(r.status, 0, `harness failed: ${r.stderr}\n${r.stdout}`);
  return JSON.parse(r.stdout);
}

const toolsPresent = ['openssl', 'curl'].every((tool) => spawnSync(tool, ['--version'], { encoding: 'utf8' }).status === 0);

test('the proxy forwards, substitutes and refuses as before, and mints each leaf once', { skip: !toolsPresent && !process.env.CI && 'openssl and curl are required (CI ubuntu-latest has both)' }, () => {
  const root = stubDist();
  try {
    const out = runHarness(root, ['--runs', '6', '--requests', '3', '--concurrency', '3']);
    assert.equal(out.load.requests, 6 * 2 * 3);
    assert.equal(out.load.ok200, out.load.requests, JSON.stringify(out.load));
    assert.equal(out.load.curlFailures, 0);
    // Six registrations x two hosts: before the patch 12 leaves (24 openssl + the leaf key),
    // now one leaf per hostname: genrsa + 2 x (req + x509).
    assert.equal(out.load.opensslSpawns, 5, JSON.stringify(out.load));
    assert.equal(out.checks.headerSubstituted, true);
    assert.equal(out.checks.bodySubstituted, true);
    assert.equal(out.checks.unboundHostRefused, true);
    assert.equal(out.checks.plainForwarded, true);
    // The CA file changed: the first new registration re-mints (req + x509), the next reuses.
    assert.deepEqual(out.checks.afterCaChange, [{ code: 200, openssl: 2 }, { code: 200, openssl: 0 }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a leaf close to expiry is not reused', { skip: !toolsPresent && !process.env.CI && 'openssl and curl are required' }, () => {
  const root = stubDist();
  try {
    // -days 0: notAfter == notBefore, so every registration has to mint again.
    const out = runHarness(root, ['--runs', '3', '--requests', '1', '--concurrency', '1', '--hosts', 'localhost'], 'globalThis.__egressStub.leafDays = 0;');
    assert.equal(out.load.opensslSpawns, 1 + 3 * 2, JSON.stringify(out.load));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a failed mint is not cached', { skip: !toolsPresent && !process.env.CI && 'openssl and curl are required' }, () => {
  const root = stubDist();
  try {
    const out = runHarness(root, ['--runs', '3', '--requests', '1', '--concurrency', '1', '--hosts', 'localhost'], 'globalThis.__egressStub.failNext = true;');
    // Registration 0's CONNECT gets 502 from the failed mint; registrations 1 and 2 share the
    // leaf minted for registration 1.
    assert.equal(out.load.ok200, 2, JSON.stringify(out.load));
    assert.equal(out.load.opensslSpawns, 3, JSON.stringify(out.load));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ the CA module itself
// ca-DsWeiCkK.js runs as patched, with its six imports stubbed (openssl is the real binary).
const CA_STUBS = {
  'resolve-system-bin-CzPVYNl7.js': 'export const t = (name) => name;\n',
  'ip-BkT2Is0E.js': 'import net from "node:net";\nexport const _ = (value) => (net.isIP(value) ? value : undefined);\n',
  'keyed-async-queue-CTreGrmR.js': 'export class t { constructor() { this.tails = new Map(); } enqueue(key, task) { const run = (this.tails.get(key) ?? Promise.resolve()).then(task, task); this.tails.set(key, run.catch(() => {})); return run; } }\n',
  'file-lock-BBkXFzlE.js': 'export const s = async (_path, _options, task) => await task();\n',
  'file-lock-D_h5coVv.js': '',
  'exec-D7bZ8DC6.js': 'import { execFile } from "node:child_process";\nexport const n = (file, args, options) => new Promise((resolve, reject) => execFile(file, args, { timeout: options?.timeoutMs }, (error, stdout, stderr) => (error ? reject(error) : resolve({ stdout, stderr }))));\n',
};

test('the secret egress CA is valid for 30 days; the debug CA and leaves are unchanged', { skip: !toolsPresent && !process.env.CI && 'openssl is required' }, async () => {
  const src = read('ca-DsWeiCkK.js');
  assert(src.includes(CA_MARKER));
  assert.match(src, /purpose: "secret egress proxy",\n\t\tvalidityDays: 30\n/u);
  assert.match(src, /purpose: "debug proxy",\n\t\tvalidityDays: 7\n/u);
  assert(src.includes('"-days",\n\t\t\t"1",'), 'leaves stay at one day');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-ca-30d-'));
  try {
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist);
    for (const [name, body] of Object.entries(CA_STUBS)) fs.writeFileSync(path.join(dist, name), body);
    fs.writeFileSync(path.join(dist, 'ca-DsWeiCkK.js'), src);
    const caModule = await import(pathToFileURL(path.join(dist, 'ca-DsWeiCkK.js')).href);
    const dayMs = 24 * 60 * 60 * 1000;

    const egressDir = path.join(root, 'egress');
    const ca = await caModule.n(egressDir);
    const caCert = new X509Certificate(fs.readFileSync(ca.certPath));
    assert(caCert.ca);
    assert(Date.parse(caCert.validTo) - Date.now() >= 29 * dayMs, `CA notAfter ${caCert.validTo}`);
    assert(Date.parse(caCert.validTo) - Date.now() <= 31 * dayMs, `CA notAfter ${caCert.validTo}`);

    for (const hostname of ['api.example.com', '127.0.0.1']) {
      const leaf = await caModule.r({ certDir: egressDir, ca, hostname });
      const leafCert = new X509Certificate(leaf.cert);
      assert.equal(leafCert.verify(caCert.publicKey), true, `${hostname} leaf is signed by the CA`);
      assert.equal(leafCert.checkIssued(caCert), true);
      assert.equal(hostname === '127.0.0.1' ? leafCert.checkIP(hostname) : leafCert.checkHost(hostname), hostname);
      const leafLeft = Date.parse(leafCert.validTo) - Date.now();
      assert(leafLeft > 23 * 60 * 60 * 1000 && leafLeft <= dayMs + 60_000, `leaf notAfter ${leafCert.validTo}`);
    }

    const debug = await caModule.t(path.join(root, 'debug'));
    const debugLeft = Date.parse(new X509Certificate(fs.readFileSync(debug.certPath)).validTo) - Date.now();
    assert(debugLeft > 6 * dayMs && debugLeft <= 7 * dayMs + 60_000, 'debug proxy CA stays at 7 days');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
