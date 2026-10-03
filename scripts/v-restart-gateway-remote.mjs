// Runs ON V as the Gateway's service user (openclaw), fed over ssh stdin by
// scripts/v-restart-gateway.mjs. Self-contained: no imports from this repo.
//
//   node --input-type=module - status  <unit>
//   node --input-type=module - trigger <unit> <expectedPid> <waitMs> <reason>
//
// status : read-only. MainPID, the Gateway's own restart preflight
//          (gateway.restart.preflight) and the Worker pool (vlab.workers.status).
// trigger: writes a native restart intent {waitMs} for exactly <expectedPid>
//          and sends it SIGUSR1. The Gateway then drains active work for at most
//          waitMs, exits, and systemd (Restart=always) starts it again. It never
//          touches systemd and never requests a forced (0 ms) drain.
// Prints one line `RESULT <json>`; never prints the Gateway token.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [mode, unit, ...rest] = process.argv.slice(2);
const show = (prop) => execFileSync('systemctl', ['show', unit, '-p', prop, '--value'], { encoding: 'utf8' }).trim();
const result = (value) => { process.stdout.write('RESULT ' + JSON.stringify(value) + '\n'); };
const fail = (message) => { result({ ok: false, error: message }); process.exit(1); };

if (!['status', 'trigger'].includes(mode) || !/^[\w.@-]+\.service$/.test(unit ?? '')) fail('usage: status|trigger <unit.service> ...');

const pid = Number(show('MainPID'));
const activeState = show('ActiveState');
const core = /(\/\S+)\/dist\/index\.js/.exec(show('ExecStart'))?.[1];
if (!core) fail('cannot find the Gateway core from ExecStart');
if (!(pid > 1) || activeState !== 'active') {
  result({ ok: true, pid, activeState, core, running: false });
  process.exit(0);
}
if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) fail('run as the Gateway service user');

// The live process environment decides the state dir, config path and token refs.
const liveEnv = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean)
  .map((entry) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
Object.assign(process.env, liveEnv);

if (mode === 'status') {
  const configPath = liveEnv.OPENCLAW_CONFIG_PATH ?? path.join(liveEnv.HOME ?? process.env.HOME, '.openclaw', 'openclaw.json');
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const port = Number(liveEnv.OPENCLAW_GATEWAY_PORT ?? cfg.gateway?.port);
  const rawToken = cfg.gateway?.auth?.token;
  if (typeof rawToken !== 'string' || !(port > 0)) fail('cannot resolve the Gateway port or auth token reference');
  let unresolved = false;
  const token = rawToken.replace(/\$\{([^}]+)\}/g, (_, key) => { if (!liveEnv[key]) unresolved = true; return liveEnv[key] ?? ''; });
  if (unresolved || !token) fail('Gateway auth token reference does not resolve in the live environment');
  const { GatewayClient } = await import(core + '/dist/plugin-sdk/gateway-runtime.js');
  let client;
  const deadline = setTimeout(() => fail('Gateway RPC deadline (30s)'), 30_000);
  try {
    await new Promise((resolve, reject) => {
      client = new GatewayClient({
        url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
        // Only read methods are called; the Worker plugin's status method is not
        // read-classified in 9.1, so the client also carries admin scope.
        scopes: ['operator.read', 'operator.admin'], onHelloOk: resolve, onConnectError: reject,
      });
      client.start();
    });
    const preflight = await client.request('gateway.restart.preflight', {}, { timeoutMs: 15_000 });
    let workers = null;
    try {
      const w = await client.request('vlab.workers.status', {}, { timeoutMs: 15_000 });
      const list = Array.isArray(w?.workers) ? w.workers : [];
      workers = {
        count: list.length,
        active: list.reduce((n, x) => n + (Number(x.activeCount) || 0), 0),
        queued: list.reduce((n, x) => n + (Number(x.queued) || 0), 0) + (Number(w?.pending) || 0),
        runs: list.flatMap((x) => (Array.isArray(x.active) ? x.active : []).map((r) => ({ runId: r.runId, sessionKey: r.sessionKey }))).slice(0, 20),
      };
    } catch { /* the Worker plugin is optional */ }
    result({
      ok: true, running: true, pid, activeState, core,
      activeEnterTimestamp: show('ActiveEnterTimestamp'), nRestarts: Number(show('NRestarts')),
      startedAtEpoch: Number(execFileSync('systemctl', ['show', unit, '-p', 'ActiveEnterTimestamp', '--value', '--timestamp=unix'], { encoding: 'utf8' }).trim().replace(/^@/, '')) || null,
      preflight: {
        safe: preflight?.safe === true,
        counts: preflight?.counts ?? {},
        blockers: (preflight?.blockers ?? []).slice(0, 20).map((b) => ({ message: String(b?.message ?? b).slice(0, 300) })),
      },
      workers,
    });
  } catch (error) {
    fail(`Gateway RPC failed: ${String(error?.message ?? error).slice(0, 300)}`);
  } finally {
    clearTimeout(deadline);
    client?.stop();
  }
  process.exit(0);
}

// ---- trigger ----------------------------------------------------------------
const [expectedPidRaw, waitMsRaw, reason] = rest;
const expectedPid = Number(expectedPidRaw);
const waitMs = Number(waitMsRaw);
if (pid !== expectedPid) fail(`MainPID is ${pid}, expected ${expectedPid}; the Gateway changed since the decision`);
if (!Number.isSafeInteger(waitMs) || waitMs < 10_000 || waitMs > 600_000) fail('waitMs must be 10000..600000');
if (!reason || reason.length > 200) fail('reason must be 1..200 characters');

const dist = path.join(core, 'dist');
const writers = [];
for (const name of fs.readdirSync(dist).filter((n) => /^restart-intent-[\w-]+\.js$/.test(n))) {
  const source = fs.readFileSync(path.join(dist, name), 'utf8');
  if (!/function writeGatewayRestartIntentSync\s*\(/.test(source)) continue;
  const alias = /export\s*\{[^}]*\bwriteGatewayRestartIntentSync\s+as\s+([A-Za-z_$][\w$]*)/.exec(source)?.[1] ?? 'writeGatewayRestartIntentSync';
  writers.push({ file: path.join(dist, name), alias });
}
if (writers.length !== 1) fail(`expected exactly one restart-intent chunk with writeGatewayRestartIntentSync in ${dist}, found ${writers.length}`);
const mod = await import(writers[0].file);
const writeIntent = mod[writers[0].alias];
if (typeof writeIntent !== 'function') fail(`${writers[0].file} does not export ${writers[0].alias}`);
if (writeIntent({ targetPid: pid, reason, intent: { waitMs }, env: process.env }) !== true) fail('native restart intent was not written');
// The intent is valid for 60 s and only for this pid; signal right away.
process.kill(pid, 'SIGUSR1');
result({ ok: true, intentWritten: true, signalled: 'SIGUSR1', pid, waitMs, writer: path.basename(writers[0].file), at: new Date().toISOString() });
process.exit(0);
