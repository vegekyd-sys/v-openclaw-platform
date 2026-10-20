#!/usr/bin/env node
// Read-only Gateway queries for v-self-restart (installed beside it on V as
// /opt/v-sentinel/self-restart-gateway.mjs). Prints one JSON line:
//
//   {"workers": <vlab.workers.status, trimmed> | {"error": ...},
//    "cron":    {"jobs": [{id, name, enabled, kind, runningAtMs, streamStatus}]} | {"error": ...},
//    "relay":   {"counts": {running, queued, awaiting}, "items": [{phase, target}]} | {"error": ...}}
//
// relay is vrelay.list({active: true}) of the v-session-relay plugin (inter-session
// collaboration, docs/inter-session/design.md §2.b); without the plugin it is an error
// that v-self-restart reads as "no collaboration turns".
//
//   node self-restart-gateway.mjs --core <dir with dist/> --port <n> --pid <gateway pid> --config <openclaw.json>
//
// It uses the running Gateway's own client library and connects as an operator
// with read scope only. The token is the config's gateway.auth.token, whose
// ${VAR} references are expanded from the Gateway process environment, the same
// way the Gateway resolved them (that is why it reads /proc/<pid>/environ).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/u, '')] = process.argv[i + 1];
const {core, port, pid, config} = args;
if (!core || !port || !config) {
  console.error('usage: self-restart-gateway.mjs --core DIR --port N --pid PID --config FILE');
  process.exit(2);
}

function gatewayEnv() {
  try {
    return Object.fromEntries(fs.readFileSync(`/proc/${Number(pid)}/environ`, 'utf8').split('\0').filter(Boolean)
      .map((s) => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
  } catch {
    return {};
  }
}

function credentials() {
  const auth = JSON.parse(fs.readFileSync(config, 'utf8')).gateway?.auth ?? {};
  const env = {...process.env, ...gatewayEnv()};
  const expand = (v) => (typeof v === 'string' ? v.replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? '') : undefined);
  const out = {};
  const token = expand(auth.token) || env.OPENCLAW_GATEWAY_TOKEN;
  const password = expand(auth.password) || env.OPENCLAW_GATEWAY_PASSWORD;
  if (token) out.token = token;
  if (password) out.password = password;
  return out;
}

const errorText = (e) => String(e?.message ?? e).slice(0, 300);

async function main() {
  const {GatewayClient} = await import(pathToFileURL(path.join(core, 'dist', 'plugin-sdk', 'gateway-runtime.js')).href);
  const client = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 20000);
    const c = new GatewayClient({
      url: `ws://127.0.0.1:${Number(port)}`, ...credentials(), deviceIdentity: null,
      clientName: 'cli', mode: 'cli', scopes: ['operator.read'],
      onHelloOk: () => { clearTimeout(timer); resolve(c); },
      onConnectError: (e) => { clearTimeout(timer); reject(e); },
    });
    c.start();
  });
  const out = {};
  try {
    const w = await client.request('vlab.workers.status', {}, {timeoutMs: 20000});
    out.workers = {
      minWorkers: w.minWorkers, pending: w.pending ?? 0, closing: Boolean(w.closing),
      workers: (w.workers ?? []).map((x) => ({
        slot: x.slot, ready: Boolean(x.ready), retiring: Boolean(x.retiring),
        activeCount: x.activeCount ?? 0, queued: x.queued ?? 0,
        active: (x.active ?? []).map((a) => ({sessionKey: a.sessionKey, kind: a.kind})),
      })),
    };
  } catch (e) {
    out.workers = {error: errorText(e)};
  }
  try {
    const jobs = [];
    let offset = 0;
    for (let page = 0; page < 50; page += 1) {
      const r = await client.request('cron.list', {includeDisabled: true, limit: 200, offset}, {timeoutMs: 20000});
      for (const j of r.jobs ?? []) {
        jobs.push({id: j.id, name: j.name, enabled: j.enabled !== false, kind: j.schedule?.kind,
          runningAtMs: j.state?.runningAtMs ?? null, streamStatus: j.state?.streamStatus ?? null});
      }
      if (!r.hasMore) break;
      offset = r.nextOffset ?? offset + (r.jobs?.length ?? 0);
    }
    out.cron = {jobs};
  } catch (e) {
    out.cron = {error: errorText(e)};
  }
  try {
    const r = await client.request('vrelay.list', {active: true, limit: 100}, {timeoutMs: 20000});
    const counts = {};
    for (const k of ['running', 'queued', 'awaiting']) if (Number.isSafeInteger(r?.counts?.[k])) counts[k] = r.counts[k];
    out.relay = {
      counts,
      // the target's session key only: labels and message text stay in the Gateway
      items: (Array.isArray(r?.items) ? r.items : []).map((i) => ({
        phase: typeof i?.phase === 'string' ? i.phase : null,
        target: typeof i?.target === 'string' ? i.target : (typeof i?.target?.sessionKey === 'string' ? i.target.sessionKey : null),
      })),
    };
  } catch (e) {
    out.relay = {error: errorText(e)};
  }
  client.stop();
  return out;
}

main().then((out) => {
  console.log(JSON.stringify(out));
  process.exit(0);
}, (e) => {
  console.log(JSON.stringify({error: errorText(e)}));
  process.exit(1);
});
