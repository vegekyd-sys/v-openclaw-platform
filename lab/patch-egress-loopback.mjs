import assert from 'node:assert/strict';

// OpenClaw exec children reach loopback services directly, not through the secret egress proxy (V 2026-11-24).
//
// V runs with secrets.egressProxy.enabled. Every OpenClaw exec on the Gateway host gets HTTP_PROXY/HTTPS_PROXY
// pointing at the proxy plus NODE_USE_ENV_PROXY=1, and no NO_PROXY. The proxy only handles HTTPS: Node tunnels
// plain HTTP through CONNECT and the proxy answers every tunnel as TLS, so `fetch("http://127.0.0.1:...")`
// from an exec child always fails with "fetch failed". nightshiftctl reaches Night Shift's ledger on
// 127.0.0.1:24879 this way; on 2026-11-24, 924 of 934 plain nightshiftctl calls from OpenClaw exec failed,
// while a native harness shell (no proxy) reaches it. Agents then searched V's disk for the cause.
//
// egress-loopback-v1 (source: vegekyd-sys/openclaw-versa versa/port-egress-loopback-20261124): the run env
// also sets NO_PROXY/no_proxy to localhost,127.0.0.1,::1. Loopback services carry no secrets to substitute;
// remote traffic still goes through the proxy unchanged.

export const MARKER = 'egress-loopback-v1';
export const LOOPBACK = 'localhost,127.0.0.1,::1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchRuntime(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to runtime-Cy2RRq4n.js`);
  return replaceExactlyOnce(source,
    '				HTTP_PROXY: proxyUrl,\n				NODE_USE_ENV_PROXY: "1",\n',
    `				HTTP_PROXY: proxyUrl,
				// ${MARKER}: the proxy only handles HTTPS; loopback services carry no secrets, so go direct.
				NO_PROXY: "${LOOPBACK}",
				no_proxy: "${LOOPBACK}",
				NODE_USE_ENV_PROXY: "1",
`,
    'registerRun proxy env');
}

export const FILES = [
  { name: 'runtime-Cy2RRq4n.js', base: 'lab/release-files/egress-proxy-tls-reuse', target: 'openclaw/dist', before: 'e4690957affecbac32d049d778152850a0d69dca4d593145803a4b1e4e583a16', patch: patchRuntime },
];
