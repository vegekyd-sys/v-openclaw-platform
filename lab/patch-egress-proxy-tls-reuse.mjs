import assert from 'node:assert/strict';

// Stop the secret egress proxy from rebuilding TLS material on the Gateway main thread
// (egress-proxy-tls-reuse, V 2026-11-19).
//
// With secrets.egressProxy.enabled (V: true) every Gateway exec gets HTTPS_PROXY pointing at a
// process-local proxy (src/secrets/egress-proxy/proxy-server.ts). The proxy answers CONNECT with a
// TLS server holding a per-hostname leaf signed by its own CA, reads the plaintext request,
// substitutes secret sentinels and re-sends it upstream with https.request. A 60 s main-thread
// profile of V at 14:33 CST (27 night-shift /vds cards running, main thread busy 39.4 s/60 s)
// charged it with about 1.4 s/min:
//
//   upstream  `new Agent({ ca: [...rootCertificates, caPem] })` has no keepAlive, so each forwarded
//             request opens a TLS connection and tls.connect() calls createSecureContext() with the
//             ~150-certificate bundle again: 125 times in 60 s, ~7.4 ms each, 0.94 s.
//   leaves    The leaf map lives on the run registration (registered.tlsServers), so every new
//             exec run that talks to a host mints a new leaf: `openssl req` + `openssl x509` through
//             execa, each a fork of the 6 GB Gateway (~53 ms of main-thread stall per fork), ~0.5 s
//             in 60 s. The leaf only depends on the hostname, the CA and the shared leaf key.
//
// egress-proxy-tls-reuse-v1:
//   - Build the upstream SecureContext once per proxy and hand it to the Agent (`secureContext`),
//     so tls.connect() reuses it. Same trust anchors, same verification, same per-request
//     connection (no keepAlive: a pooled socket the upstream closed would surface as a 502).
//   - Keep minted leaves per proxy, keyed by hostname, shared by all registrations. A cached leaf
//     is reused while the CA certificate file is unchanged (mtime+size) and it stays valid for
//     more than an hour; a failed mint is dropped so the next CONNECT retries. The TLS server
//     itself stays per registration, since its request handler carries that run's authorization.

export const MARKER = 'egress-proxy-tls-reuse-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// core/dist/runtime-Cy2RRq4n.js
export function patchRuntime(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(
    source,
    'import { randomBytes, timingSafeEqual } from "node:crypto";\n',
    'import { X509Certificate, randomBytes, timingSafeEqual } from "node:crypto";\n',
    'node:crypto import',
  );
  out = replaceExactlyOnce(
    out,
    'import { rootCertificates } from "node:tls";\n',
    'import { createSecureContext, rootCertificates } from "node:tls";\n',
    'node:tls import',
  );
  out = replaceExactlyOnce(
    out,
    '	const upstreamTlsAgent = new Agent({ ca: [...rootCertificates, caPem] });\n',
    `	// ${MARKER}: one upstream SecureContext per proxy instead of one per forwarded request.
	const upstreamTlsAgent = new Agent({ secureContext: createSecureContext({ ca: [...rootCertificates, caPem] }) });
	// ${MARKER}: leaves depend only on hostname + CA + the shared leaf key; mint once per proxy.
	const leafCache = /* @__PURE__ */ new Map();
	const LEAF_CACHE_MAX = 512;
	const LEAF_REUSE_MARGIN_MS = 60 * 60 * 1e3;
	const caFileStamp = () => {
		try {
			const stat = fs.statSync(ca.certPath);
			return \`\${stat.mtimeMs}:\${stat.size}\`;
		} catch {
			return "missing";
		}
	};
	const leafFor = (hostname) => {
		const caStamp = caFileStamp();
		const cached = leafCache.get(hostname);
		if (cached && cached.caStamp === caStamp && (cached.notAfterMs === void 0 || cached.notAfterMs - Date.now() > LEAF_REUSE_MARGIN_MS)) return cached.promise;
		if (cached) leafCache.delete(hostname);
		const entry = {
			caStamp,
			notAfterMs: void 0,
			promise: void 0
		};
		entry.promise = generateLocalProxyLeaf({
			certDir: params.caDir,
			ca,
			hostname
		}).then((leaf) => {
			let notAfterMs = 0;
			try {
				notAfterMs = Date.parse(new X509Certificate(leaf.cert).validTo) || 0;
			} catch {}
			entry.notAfterMs = notAfterMs;
			return leaf;
		}, (error) => {
			if (leafCache.get(hostname) === entry) leafCache.delete(hostname);
			throw error;
		});
		leafCache.set(hostname, entry);
		if (leafCache.size > LEAF_CACHE_MAX) leafCache.delete(leafCache.keys().next().value);
		return entry.promise;
	};
`,
    'upstream agent',
  );
  out = replaceExactlyOnce(
    out,
    `			server = generateLocalProxyLeaf({
				certDir: params.caDir,
				ca,
				hostname: target.hostname
			}).then((leaf) => {
`,
    `			server = leafFor(target.hostname).then((leaf) => {
`,
    'per-registration leaf mint',
  );
  out = replaceExactlyOnce(
    out,
    `			upstreamTlsAgent.destroy();
`,
    `			upstreamTlsAgent.destroy();
			leafCache.clear();
`,
    'stop',
  );
  return out;
}

export const FILES = [
  { name: 'runtime-Cy2RRq4n.js', base: 'core/dist', target: 'openclaw/dist', before: 'f39ed2a440713fa141d58c61ae3f96c32e119501accb8f663c68bf5d1d57ed1f', patch: patchRuntime },
];
