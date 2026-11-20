import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import os from 'node:os';
import {publishVerificationProof} from './db91-integrity-gate.mjs';
import {beginLifecycle, carryVerifications} from './db91-restart-carry.mjs';

export function isGatewayServer(argv) {
  const args = argv.slice(2);
  let index = 0;
  for (; index < args.length; index++) {
    if (['--profile', '--config', '--log-level'].includes(args[index])) {index++; continue;}
    if (args[index].startsWith('-')) continue;
    break;
  }
  if (args[index] !== 'gateway') return false;
  const takesValue = new Set(['--port', '--bind', '--auth', '--token', '--password', '--tailscale', '--ws-log', '--raw-stream-path']);
  const commands = [];
  for (let i = index + 1; i < args.length; i++) {
    if (takesValue.has(args[i])) {i++; continue;}
    if (args[i].startsWith('-')) continue;
    commands.push(args[i]);
  }
  return commands.length === 0 || (commands.length === 1 && commands[0] === 'run');
}

export function collectAgentTargets(stateRoot, configFile) {
  assert(path.isAbsolute(stateRoot) && path.isAbsolute(configFile));
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const filenames = new Set();
  const agents = path.join(stateRoot, 'agents');
  if (fs.existsSync(agents)) {
    const entries = fs.readdirSync(agents, {withFileTypes: true});
    assert(entries.length <= 1024, 'unexpected agent directory size');
    for (const entry of entries) if (entry.isDirectory()) filenames.add(path.join(agents, entry.name, 'agent', 'openclaw-agent.sqlite'));
  }
  for (const entry of Object.values(config.agents?.entries ?? {})) if (typeof entry.agentDir === 'string') {
    assert(path.isAbsolute(entry.agentDir), 'preflight requires explicit absolute agentDir');
    filenames.add(path.join(entry.agentDir, 'openclaw-agent.sqlite'));
  }
  return [...filenames].filter(filename => fs.existsSync(filename)).sort().map(filename => {
    const stat = fs.lstatSync(filename);
    assert(stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(filename) === filename, 'preflight target must be an explicit regular database');
    return {kind: 'agent', label: 'OpenClaw agent database', path: filename};
  });
}

// The preflight budget is a property of the host: V verifies its agent databases
// well inside five minutes, shared VLab (4 cores, CPU quota, 7 GB makaron db)
// does not. Default unchanged; a host that needs more sets the variable.
export async function runPreflight(workerFile, targets, {env = process.env, timeoutMs = Number(env.OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS) || 300000} = {}) {
  if (targets.length === 0) return [];
  assert(fs.existsSync(workerFile));
  return new Promise((resolve, reject) => {
    const worker = fork(workerFile, ['--openclaw-database-verify-child'], {env, execArgv: ['--max-old-space-size=256'], stdio: ['ignore', 'ignore', env.OPENCLAW_DB91_PHASE_TRACE==='1'?'inherit':'ignore', 'ipc']});
    try {os.setPriority(worker.pid, 10);} catch {}
    let results, failed, ended = false, timeout, forceKill;
    const finish = error => {
      if (ended) return; ended = true;
      clearTimeout(timeout); clearTimeout(forceKill);
      if (error) reject(error); else resolve(results);
    };
    timeout = setTimeout(() => {
      failed = new Error('DB91 preflight timed out before Gateway admission');
      worker.kill('SIGTERM');
      forceKill = setTimeout(() => worker.kill('SIGKILL'), 5000);
    }, timeoutMs);
    worker.once('message', message => {
      const expected = new Set(targets.map(t => t.path));
      if (!Array.isArray(message) || message.length !== expected.size || message.some(r => !r || typeof r.path !== 'string' || typeof r.ok !== 'boolean' || !expected.delete(r.path)) || expected.size) {
        failed = new Error('DB91 preflight returned incomplete or unexpected results'); worker.kill('SIGTERM'); return;
      }
      results = message;
    });
    worker.once('error', error => {failed = error; worker.kill('SIGTERM'); finish(error);});
    worker.once('exit', (code, signal) => {
      if (failed || code !== 0 || signal || !results) return finish(failed ?? new Error('DB91 verification child did not finish successfully'));
      const failures = results.filter(r => !r.ok);
      if (failures.length) return finish(new Error(`DB91 preflight rejected ${failures.length} database(s); Gateway was not admitted`));
      try {
        for (const result of results) publishVerificationProof(result.db91Verification, result.path, {env});
        finish();
      } catch (error) {finish(error);}
    });
    worker.send(targets, error => {if (error) {failed = error; worker.kill('SIGTERM');}});
  });
}

export async function bootstrapGatewayIntegrity({argv = process.argv, env = process.env, distDir} = {}) {
  if (env.OPENCLAW_DB91_INTEGRITY_ENABLE !== '1' || !isGatewayServer(argv)) return {enabled: false};
  const stateRoot = env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT;
  const configFile = env.OPENCLAW_CONFIG_PATH;
  assert(stateRoot && path.isAbsolute(stateRoot) && configFile && path.isAbsolute(configFile), 'enabled DB91 preflight requires explicit state and config paths');
  assert.equal(fs.realpathSync(stateRoot), stateRoot, 'explicit canonical state root required');
  const base = path.join(stateRoot, '.db91-integrity');
  fs.mkdirSync(base, {mode: 0o700, recursive: true});
  const stat = fs.lstatSync(base);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && (!process.getuid || stat.uid === process.getuid()), 'private integrity state required');
  const epoch = randomUUID();
  const directory = path.join(base, epoch);
  fs.mkdirSync(directory, {mode: 0o700});
  env.OPENCLAW_DB91_INTEGRITY_EPOCH = epoch;
  env.OPENCLAW_DB91_INTEGRITY_DIR = directory;
  const targets = collectAgentTargets(stateRoot, configFile);
  const started = Date.now();
  console.error(`[db91-integrity] preflight start: ${targets.length} agent databases; Gateway not yet admitted`);
  let previousEpoch = null;
  try {({previousEpoch} = beginLifecycle({base, epoch, directory}));} catch (error) {console.error(`[db91-integrity] lifecycle record failed (${error?.code ?? error?.name}); full check for every database`);}
  const carry = carryVerifications({base, previousEpoch, targets, env});
  const remaining = targets.filter(target => !carry.carried.has(target.path));
  console.error(`[db91-integrity] clean-restart carry: ${carry.carried.size}/${targets.length} databases reuse the previous lifecycle's full check (${previousEpoch ?? 'none'}); full check for ${remaining.length}; ${JSON.stringify(Object.fromEntries(Object.entries(carry.reasons).map(([key, reason]) => [key === '*' ? key : path.basename(path.dirname(path.dirname(key))), reason])))}`);
  await runPreflight(path.join(distDir, 'state/openclaw-database-verify.worker.js'), remaining, {env});
  console.error(`[db91-integrity] preflight passed in ${Date.now() - started}ms; full native checks retained`);
  return {enabled: true, targets: targets.length, carried: carry.carried.size, elapsedMs: Date.now() - started};
}
