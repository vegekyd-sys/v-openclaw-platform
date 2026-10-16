// A Worker's runtime config resolves agent-runtime SecretRefs through the Gateway's
// secrets.resolve before every turn (command-secret-gateway, timeout 30 s). The Gateway answers
// only once it is ready, and it is ready only after its Worker pool is: the first message after
// a restart sat in the Worker for 8-18 s (V 2026-10-13 08:30/08:48, worker-command-enter ->
// prompt start). On time-out OpenClaw already resolves the same refs locally, from the process
// environment and secret files that a Worker shares with the Gateway (V: env and file
// providers). In a Worker process only (VLAB_WORKER_CHILD=1) the call now waits at most 3 s
// (OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_MS) before that fallback; a ready Gateway answers in
// well under that. Gateway and CLI processes keep 30 s.
import assert from 'node:assert/strict';

export const MARKER = '/* OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_V1 */';
const BEFORE = '\t\ttimeoutMs: 3e4,\n\t\tclientName: GATEWAY_CLIENT_NAMES.CLI,\n';
const AFTER = `\t\ttimeoutMs: ${MARKER} process.env.VLAB_WORKER_CHILD === "1" ? Number(process.env.OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_MS) || 3e3 : 3e4,\n\t\tclientName: GATEWAY_CLIENT_NAMES.CLI,\n`;

export function patchCommandSecretGateway(source) {
  assert(!source.includes(MARKER), 'already patched');
  assert.equal(source.split(BEFORE).length, 2, 'Expected exactly one secrets.resolve request timeout');
  assert(source.includes('method: "secrets.resolve"'), 'not the secrets.resolve caller');
  return source.replace(BEFORE, AFTER);
}
