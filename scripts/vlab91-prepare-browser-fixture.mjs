import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const source = '/srv/vlab-browser/app/broker/tests/live-official-fusion-device.mjs';
const target = '/srv/vlab-browser/tmp/vlab91-browser-pair-only.mjs';
let code = fs.readFileSync(source, 'utf8');
const start = code.indexOf('const leaseResponse = await admin("/v1/leases", {');
const end = code.indexOf('let stopping = false;', start);
assert(start > 0 && end > start);
// Keep the real headless Chrome/CDP and extension-protocol implementation.
// Unlike the older fixture, do not pre-acquire its tab: the tested Agent must
// discover, acquire, operate and release it itself through the native tools.
code = code.slice(0, start) + `
const renewalTimer = null;
fs.writeFileSync(readyFile, JSON.stringify({ready:true, deviceId, pairOnly:true}), {mode:0o600});
console.log(JSON.stringify({ready:true, deviceId, pairOnly:true}));
` + code.slice(end);
const cleanup = '  await admin(`/v1/leases/${lease.leaseId}`, {';
const cleanupStart = code.indexOf(cleanup);
const cleanupEnd = code.indexOf('  extension.close', cleanupStart);
assert(cleanupStart > 0 && cleanupEnd > cleanupStart);
code = code.slice(0, cleanupStart) + code.slice(cleanupEnd);
assert(code.includes('import WebSocket from "ws";'));
code = code.replace('import WebSocket from "ws";', `import WebSocket from ${JSON.stringify(createRequire(source).resolve('ws'))};`);
fs.writeFileSync(target, code, { flag:'wx', mode:0o644 });
console.log('Prepared pair-only real-Chrome fixture; not browser acceptance');
