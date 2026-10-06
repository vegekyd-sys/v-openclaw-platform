#!/usr/bin/env node
// Canonical H5 only. Gateway code/configuration are deployed by the VLab workflow.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const H5_PATHS = [
  'lab/gpt-live-h5/access.mjs',
  'lab/gpt-live-h5/avatar.mjs', 'lab/gpt-live-h5/avatar-state.mjs',
  ...['idle','memory','web','calendar','background'].map(state => `lab/gpt-live-h5/assets/v-signal-${state}-20261006${state === 'idle' ? '' : '-r2'}.png`),
  'lab/gpt-live-h5/personal-session.mjs',
  'lab/gpt-live-h5/persona.mjs',
  'lab/gpt-live-h5/server.mjs', 'lab/gpt-live-h5/events.mjs', 'lab/gpt-live-h5/duplex-playback.mjs',
  'lab/gpt-live-h5/index.html', 'lab/gpt-live-h5/app.js', 'lab/gpt-live-h5/styles.css',
  'lab/gpt-live-h5/microphone-capture.mjs', 'lab/gpt-live-h5/microphone-session.mjs', 'lab/gpt-live-h5/transcript-presentation.mjs',
  'lab/gpt-live-h5/call-sounds.mjs', 'lab/rtc-h5/assets/v-idle-nohat-20260922.png',
  'lab/gpt-live-h5/relay-audio.mjs', 'lab/realtime-direct-tools/session.mjs',
  'lab/realtime-direct-tools/tool-start-audio.mjs',
  'lab/realtime-direct-tools/assets/tool-start-provenance.json',
  'lab/realtime-direct-tools/assets/tool-start-memory.pcm',
  'lab/realtime-direct-tools/assets/tool-start-web.pcm',
  'lab/realtime-direct-tools/assets/tool-start-other.pcm',
  'lab/realtime-direct-tools/backend.mjs', 'lab/gpt-live-consult-progress.mjs',
  'lab/realtime-direct-tools/tools.mjs', 'lab/realtime-direct-tools/grok-provider.mjs',
  'lab/seeduplex-realtime-provider.mjs',
  'lab/rtc-h5/assets/v-tool-busy-20260922.png',
];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateIdentity(value) {
  assert(['vlab', 'v'].includes(value.target), 'Target must be vlab or v');
  assert(/^[a-f0-9]{40}$/u.test(value.commit), 'An exact full commit SHA is required');
  for (const key of ['release', 'owner']) assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value[key] ?? ''), `Invalid ${key}`);
}
export function fileIdentity(files) {
  assert.equal(files.length, H5_PATHS.length, 'The complete frozen H5 file set is required');
  return files.map((file, index) => {
    assert.equal(file.name, H5_PATHS[index], 'H5 file list or order changed');
    assert(/^[a-f0-9]{64}$/u.test(file.sha), 'Invalid H5 file hash');
    if ('content' in file) assert.equal(digest(Buffer.from(file.content, 'base64')), file.sha, 'H5 content hash mismatch');
    return { name: file.name, sha: file.sha };
  });
}
export function validateSharedProof(proof, request) {
  assert.equal(proof?.schema, 'gpt-live-h5-accepted-v1');
  assert.equal(proof.release, request.release, 'Shared accepted release differs');
  assert.equal(proof.sourceCommit, request.commit, 'Shared accepted commit differs');
  assert.equal(proof.h5Only === true, request.h5Only === true, 'Shared H5-only release mode differs');
  assert.equal(proof.h5FilesSha, digest(JSON.stringify(fileIdentity(request.files))), 'Shared accepted H5 bytes differ');
  assert(/^[a-f0-9]{64}$/u.test(proof.artifactSha), 'Shared artifact identity is unavailable');
  assert(/^[a-f0-9]{64}$/u.test(proof.h5AcceptanceSha), 'Shared H5 acceptance is unavailable');
  assert(Array.isArray(proof.runtimeFiles) && proof.runtimeFiles.length > 0, 'Shared runtime identity is unavailable');
  for (const file of proof.runtimeFiles) {
    assert(/^(openclaw|production-worker)\/[A-Za-z0-9._/-]+$/u.test(file.target) && !file.target.split('/').includes('..'), 'Unsupported production runtime target');
    assert(/^[a-f0-9]{64}$/u.test(file.after), 'Shared runtime hash is unavailable');
  }
}
// A presentation release has its own commit and acceptance. It borrows the
// accepted, aligned Gateway baseline without restaging or restarting it.
export function assertH5Baseline(current, manifest, lease, request) {
  assert.equal(current.release, request.release, 'Shared Gateway release changed');
  assert.equal(current.accepted, true, 'Gateway baseline is not accepted');
  assert.equal(current.v?.aligned, true, 'Align the Gateway baseline first');
  assert.equal(manifest.sourceCommit, current.sourceCommit, 'Gateway baseline commit differs');
  assert.equal(manifest.artifactSha, current.artifactSha, 'Gateway baseline artifact differs');
  assert.equal(lease?.owner, request.owner, 'Shared H5 requires this integration lease');
}
export function assertRollbackIdentity(receipt, request, observed) {
  assert.equal(receipt.schema, 'gpt-live-h5-installed-v1');
  for (const key of ['target', 'commit', 'release', 'owner']) assert.equal(receipt[key], request[key], `H5 ${key} changed`);
  assert.equal(receipt.filesSha, digest(JSON.stringify(fileIdentity(request.files))), 'H5 rollback source differs');
  assert.equal(observed.pointer, receipt.dir, 'H5 current pointer belongs to another release');
  const collected = receipt.target === 'vlab' && observed.pid === 0 && observed.listener === ''
    && observed.unitSha === null && observed.unitMissingCollected === true;
  if (!collected) assert.equal(observed.unitSha, receipt.unitSha, 'H5 unit was modified');
  if (observed.pid > 0) {
    assert.equal(observed.processMatches, true, 'H5 process belongs to another source');
    assert.equal(observed.activeCall, false, 'A call is active or its state is unavailable; do not stop H5');
    assert.equal(observed.creatingSession, false, 'A call is starting or its state is unavailable; do not stop H5');
  } else assert.equal(observed.listener, '', 'H5 port belongs to another process');
}
export function freezeSource(root, options, git = (...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 ** 2 })) {
  validateIdentity(options);
  assert.equal(String(git('status', '--porcelain')).trim(), '', 'Commit the tested source before installing H5');
  assert.equal(String(git('rev-parse', 'HEAD')).trim(), options.commit, 'HEAD differs from the requested H5 commit');
  const files = H5_PATHS.map(name => {
    const bytes = Buffer.from(git('show', `${options.commit}:${name}`));
    return { name, sha: digest(bytes), content: bytes.toString('base64') };
  });
  return { ...options, files, filesSha: digest(JSON.stringify(fileIdentity(files))) };
}

// Self-contained remote body: only code/assets and sanitized acceptance metadata
// enter stdin. Config and token references are read on the target into RAM.
async function remoteMain(req) {
  const fs = await import('node:fs'); const path = await import('node:path');
  const { execFileSync } = await import('node:child_process'); const os = await import('node:os');
  const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 ** 2 }).trim();
  const exists = file => { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const hash = file => digest(fs.readFileSync(file));
  const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const home = '/srv/vlab-production-mirror/labs/shared-workflow';
  const shared = () => {
    assert(!exists(home + '/pending.json'), 'Shared Gateway has an unresolved deployment');
    const current = read(home + '/current.json');
    assert.equal(current.release, req.release, 'Shared release changed');
    if (!req.h5Only) assert.equal(current.sourceCommit, req.commit, 'Shared commit changed');
    const dir = home + '/releases/' + req.release, manifest = read(dir + '/manifest.json');
    assert.equal(manifest.branch, 'dev', 'H5 installs require a canonical merged dev release');
    if (req.h5Only) assertH5Baseline(current, manifest, read(path.dirname(home) + '/control/integration.json'), req);
    else assert.equal(manifest.sourceCommit, req.commit);
    assert.equal(hash(dir + '/artifact.json'), manifest.artifactSha);
    return { current, manifest, dir };
  };
  validateIdentity(req); assert.equal(req.filesSha, digest(JSON.stringify(fileIdentity(req.files)))); assert.equal(process.getuid(), 0);
  if (req.target === 'vlab') assert.equal(os.hostname(), 'VM-0-4-ubuntu');
  if (req.command === 'proof') {
    assert.equal(req.target, 'vlab');
    const { current, manifest, dir } = shared(); assert.equal(current.accepted, true, 'Shared release is not accepted');
    assert.equal(current.artifactSha, manifest.artifactSha, 'Shared acceptance artifact changed');
    const acceptedPath = req.h5Only ? home + '/h5-presentation/releases/' + req.commit + '/accepted.json' : dir + '/h5-accepted.json';
    const accepted = read(acceptedPath);
    assert.equal(accepted.schema, 'gpt-live-h5-acceptance-v1'); assert.equal(accepted.commit, req.commit);
    assert.equal(accepted.release, req.release); assert.equal(accepted.artifactSha, current.artifactSha);
    assert.equal(accepted.dir, home + (req.h5Only ? '/h5-presentation' : '/h5') + '/releases/' + req.commit, 'Shared H5 acceptance directory changed');
    assert.equal(accepted.filesSha, req.filesSha, 'Shared H5 acceptance bytes changed');
    for (const file of req.files) assert.equal(hash(path.join(accepted.dir, file.name)), file.sha, 'Shared accepted H5 file changed');
    return { schema: 'gpt-live-h5-accepted-v1', release: req.release, sourceCommit: req.commit,
      ...(req.h5Only ? { h5Only: true, gatewaySourceCommit: current.sourceCommit } : {}),
      artifactSha: current.artifactSha, h5FilesSha: accepted.filesSha, h5AcceptanceSha: hash(acceptedPath),
      runtimeFiles: manifest.files.map(file => ({ target: file.target, after: file.after })) };
  }
  let sharedState;
  if (req.target === 'vlab') {
    assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner, req.owner, 'Shared integration lease belongs to another task');
    sharedState = shared();
  } else validateSharedProof(req.sharedProof, req);
  const gatewayUnit = req.target === 'v' ? 'openclaw-gateway.service' : 'openclaw-vlab-production-mirror-v8.service';
  const properties = unit => {
    let text;
    try { text = run('systemctl', ['show', unit, '-p', 'MainPID,LoadState,FragmentPath,User,Group,ActiveState,SubState,InvocationID']); }
    catch (error) { text = String(error.stdout ?? ''); }
    return Object.fromEntries(text.split('\n').filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  };
  const gatewayPid = Number(properties(gatewayUnit).MainPID); assert(gatewayPid > 1, 'Live Gateway is unavailable');
  const env = Object.fromEntries(fs.readFileSync(`/proc/${gatewayPid}/environ`, 'utf8').split('\0').filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  const argv = fs.readFileSync(`/proc/${gatewayPid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  const entry = argv.find(value => value.endsWith('/dist/index.js')); assert(entry && argv.includes('gateway'), 'Live Gateway source identity is unavailable');
  const runtime = path.dirname(path.dirname(entry)), node = fs.readlinkSync(`/proc/${gatewayPid}/exe`);
  assert(/^\/[A-Za-z0-9._/-]+$/u.test(runtime) && /^\/[A-Za-z0-9._/-]+$/u.test(node), 'Unsafe Gateway source path');
  const procStatus = fs.readFileSync(`/proc/${gatewayPid}/status`, 'utf8');
  const uid = Number(/^Uid:\s+(\d+)/mu.exec(procStatus)?.[1]), gid = Number(/^Gid:\s+(\d+)/mu.exec(procStatus)?.[1]);
  assert(Number.isSafeInteger(uid) && uid >= 0 && Number.isSafeInteger(gid) && gid >= 0, 'Gateway service identity is unavailable');
  assert(path.isAbsolute(env.OPENCLAW_CONFIG_PATH ?? ''), 'Gateway configuration path is unavailable');
  const config = read(env.OPENCLAW_CONFIG_PATH);
  assert(Number.isInteger(config.gateway?.port) && config.gateway.port > 0 && config.gateway.port < 65536);
  if (req.target === 'vlab') assert.equal(config.gateway.port, 24993);
  else {
    assert(runtime.startsWith('/opt/') && !env.OPENCLAW_CONFIG_PATH.startsWith('/srv/vlab'), 'Production Gateway is not production V');
    for (const file of req.sharedProof.runtimeFiles) {
      const target = file.target.startsWith('openclaw/') ? path.join(runtime, file.target.slice('openclaw/'.length))
        : path.join(runtime.replace(/\/core$/u, '/worker'), file.target.slice('production-worker/'.length));
      assert.equal(hash(target), file.after, 'Production runtime is not the shared accepted artifact');
    }
  }
  const base = req.target === 'v' ? '/opt/openclaw-gpt-live-h5' : home + (req.h5Only ? '/h5-presentation' : '/h5');
  const dir = base + '/releases/' + req.commit, pointer = base + '/current';
  const service = req.target === 'v' ? 'gpt-live-call-h5.service' : (req.h5Only ? 'gpt-live-presentation-' : 'gpt-live-call-h5-') + req.commit.slice(0, 12) + '.service';
  const unitPath = req.target === 'v' ? '/etc/systemd/system/' + service : '/run/systemd/transient/' + service;
  const listener = () => run('ss', ['-H', '-lntp', 'sport = :26244']);
  const pointerTarget = () => { if (!exists(pointer)) return null; assert(fs.lstatSync(pointer).isSymbolicLink(), 'H5 pointer is not a symlink'); return fs.readlinkSync(pointer); };
  const publicPlan = { target: req.target, commit: req.commit, release: req.release, owner: req.owner, dir, service,
    ...(req.h5Only ? { h5Only: true } : {}),
    gatewayPid, gatewayRuntime: runtime, serviceUid: uid, serviceGid: gid, files: fileIdentity(req.files), filesSha: req.filesSha,
    artifactSha: req.target === 'v' ? req.sharedProof.artifactSha : sharedState.manifest.artifactSha, url: 'http://127.0.0.1:26244/' };
  const getStatus = async () => {
    const index = await fetch(publicPlan.url, { signal: AbortSignal.timeout(3000) });
    const cookie = index.headers.get('set-cookie')?.split(';')[0]; assert(index.ok && cookie, 'H5 status cookie unavailable');
    const response = await fetch(publicPlan.url + 'api/status', { headers: { cookie }, signal: AbortSignal.timeout(3000) });
    assert(response.ok, 'H5 status unavailable'); return response.json();
  };
  const inspectOwned = async receipt => {
    const state = properties(service), pid = Number(state.MainPID ?? 0);
    let processMatches = false, status = {};
    if (pid > 0) {
      const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
      const processStatus = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      processMatches = command[0] === receipt.node && command.includes(dir + '/lab/gpt-live-h5/server.mjs')
        && Number(/^Uid:\s+(\d+)/mu.exec(processStatus)?.[1]) === receipt.serviceUid
        && Number(/^Gid:\s+(\d+)/mu.exec(processStatus)?.[1]) === receipt.serviceGid;
      assert(processMatches && listener().includes(`pid=${pid},`), 'H5 listener/process is not this installed source');
      status = await getStatus();
    }
    return { pointer: pointerTarget(), unitSha: exists(unitPath) ? hash(unitPath) : null, pid, listener: listener(), processMatches,
      unitMissingCollected: !exists(unitPath) && state.LoadState === 'not-found',
      activeCall: status.activeCall, creatingSession: status.creatingSession, ready: status.ready };
  };
  if (req.command === 'plan') return { ...publicPlan, readOnly: true, existingDirectory: exists(dir), existingUnit: properties(service), currentPointer: pointerTarget(), listener: listener() };
  if (['accept', 'rollback'].includes(req.command)) {
    const receipt = read(dir + '/installed.json');
    for (const file of req.files) assert.equal(hash(path.join(dir, file.name)), file.sha, 'Installed H5 code changed');
    const observed = await inspectOwned(receipt);
    assertRollbackIdentity(receipt, req, observed);
    if (req.command === 'accept') {
      assert.equal(req.target, 'vlab', 'H5 acceptance is recorded on shared VLab');
      assert.equal(observed.ready, true); assert.equal(sharedState.current.accepted, true);
      assert.equal(sharedState.current.artifactSha, receipt.artifactSha, 'Shared accepted artifact changed');
      assert(typeof req.evidence === 'string' && req.evidence.trim().length >= 20, 'Provide the functional H5 evidence reference');
      const accepted = { schema: 'gpt-live-h5-acceptance-v1', target: req.target, commit: req.commit, release: req.release, owner: req.owner,
        artifactSha: receipt.artifactSha, dir, filesSha: receipt.filesSha, evidenceSha: digest(req.evidence), at: new Date().toISOString() };
      save(req.h5Only ? dir + '/accepted.json' : sharedState.dir + '/h5-accepted.json', accepted); return accepted;
    }
    assert.equal(receipt.beforeUnit.exists, false, 'An existing service requires a reviewed upgrade rollback');
    assert.equal(receipt.beforePointer.exists, false, 'An existing pointer requires a reviewed upgrade rollback');
    if (observed.pid > 0) run('systemctl', ['stop', service]);
    assert.equal(Number(properties(service).MainPID ?? 0), 0); assert.equal(listener(), '', 'H5 listener did not stop');
    assert.equal(pointerTarget(), dir); fs.unlinkSync(pointer);
    if (req.target === 'v') {
      assert.equal(hash(unitPath), receipt.unitSha); run('systemctl', ['disable', service]); fs.unlinkSync(unitPath); run('systemctl', ['daemon-reload']);
    }
    const result = { ...publicPlan, rolledBack: true, restoredPointer: null, restoredUnit: 'absent', at: new Date().toISOString() };
    save(dir + '/rolled-back.json', result); return result;
  }
  assert.equal(req.command, 'install');
  assert.equal(listener(), '', 'Port 26244 already has a listener; do not replace it');
  assert(!exists(dir), 'H5 release directory already exists; inspect its identity, do not overwrite');
  assert(!exists(pointer), 'H5 current pointer already exists; a reviewed upgrade is required');
  assert(!exists(unitPath) && properties(service).LoadState === 'not-found', 'H5 service already exists; do not overwrite');
  for (const parent of [base, base + '/releases'])
    if (exists(parent)) assert(fs.lstatSync(parent).isDirectory() && fs.realpathSync(parent) === parent, 'H5 base must be a canonical directory');
  run('sudo', ['-u', '#' + uid, '-g', '#' + gid, 'test', '-r', env.OPENCLAW_CONFIG_PATH]);
  run('sudo', ['-u', '#' + uid, '-g', '#' + gid, 'test', '-r', runtime + '/dist/plugin-sdk/gateway-runtime.js']);
  run('sudo', ['-u', '#' + uid, '-g', '#' + gid, 'test', '-x', req.target === 'v' ? '/opt' : home]);
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  for (const parent of [base, base + '/releases', dir]) fs.chmodSync(parent, 0o755);
  const beforeUnit = { exists: false, path: unitPath }, beforePointer = { exists: false, path: pointer, target: null };
  save(dir + '/before-unit.json', beforeUnit); save(dir + '/before-pointer.json', beforePointer);
  for (const file of req.files) {
    const destination = path.join(dir, file.name); fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    fs.writeFileSync(destination, Buffer.from(file.content, 'base64'), { mode: 0o644, flag: 'wx' }); fs.chmodSync(destination, 0o644);
    for (let parent = path.dirname(destination); parent !== dir; parent = path.dirname(parent)) fs.chmodSync(parent, 0o755);
  }
  const childEnv = { OPENCLAW_CONFIG_PATH: env.OPENCLAW_CONFIG_PATH, GPT_LIVE_H5_RUNTIME_ROOT: runtime, GPT_LIVE_H5_PORT: '26244' };
  // Native voice credentials stay in the existing private service environment.
  // They are never included in the public release receipt or H5 responses.
  for (const key of ['VOLCENGINE_REALTIME_API_KEY', 'DOUBAO_SPEECH_API_KEY', 'XAI_API_KEY']) if (env[key]) childEnv[key] = env[key];
  for (const match of String(config.gateway.auth.token).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)) {
    assert(env[match[1]], 'Gateway token reference is unavailable'); childEnv[match[1]] = env[match[1]];
  }
  const escape = value => { assert(!/[\r\n\0]/u.test(value), 'Unsafe environment value'); return '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'; };
  const envFile = dir + '/server.env'; fs.writeFileSync(envFile, Object.entries(childEnv).map(([key, value]) => key + '=' + escape(value)).join('\n') + '\n', { mode: 0o600, flag: 'wx' }); fs.chownSync(envFile, uid, gid); fs.chmodSync(envFile, 0o600);
  if (req.target === 'v') {
    const bytes = `[Unit]\nDescription=GPT Live H5 ${req.commit} ${req.release} ${req.owner}\nAfter=${gatewayUnit}\nRequires=${gatewayUnit}\n\n[Service]\nType=exec\nUser=${uid}\nGroup=${gid}\nWorkingDirectory=${dir}\nEnvironmentFile=${envFile}\nExecStart=${node} ${dir}/lab/gpt-live-h5/server.mjs\nRestart=on-failure\nRestartSec=5\nKillMode=control-group\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n`;
    fs.writeFileSync(unitPath, bytes, { mode: 0o644, flag: 'wx' }); run('systemctl', ['daemon-reload']);
  }
  fs.symlinkSync(dir, pointer);
  const receipt = { schema: 'gpt-live-h5-installed-v1', ...publicPlan, node, beforeUnit, beforePointer, unitSha: exists(unitPath) ? hash(unitPath) : null,
    expirySeconds: req.target === 'vlab' ? 14400 : null, persistent: req.target === 'v', at: new Date().toISOString() };
  save(dir + '/prepared.json', receipt);
  if (req.target === 'v') {
    save(dir + '/installed.json', receipt); run('systemctl', ['enable', service]); run('systemctl', ['start', service]);
  } else {
    try { run('systemd-run', ['--unit=' + service, '--collect', '--property=Type=exec', '--property=User=' + uid, '--property=Group=' + gid,
      '--property=WorkingDirectory=' + dir, '--property=EnvironmentFile=' + envFile, '--property=RuntimeMaxSec=14400', '--property=KillMode=control-group', '--property=UMask=0077', node, dir + '/lab/gpt-live-h5/server.mjs']); }
    finally { receipt.unitSha = exists(unitPath) ? hash(unitPath) : null; save(dir + '/installed.json', receipt); }
  }
  let status;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { status = await getStatus(); if (status.ready === true) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(status?.ready, true, 'H5 installed but not ready; inspect installed.json before rollback');
  const observed = await inspectOwned(receipt); assert.equal(observed.ready, true);
  return { ...receipt, h5Pid: observed.pid, ready: true, acceptance: 'HTTP/Gateway readiness only; functional acceptance required' };
}

export function remoteSource() {
  return `import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const H5_PATHS=${JSON.stringify(H5_PATHS)};const digest=${digest.toString()};\n`
    + [validateIdentity, fileIdentity, validateSharedProof, assertH5Baseline, assertRollbackIdentity, remoteMain].map(fn => fn.toString()).join('\n')
    + `\nlet input='';for await(const chunk of process.stdin){input+=chunk;assert(input.length<32*1024**2)}try{console.log(JSON.stringify(await remoteMain(JSON.parse(input))))}catch(error){console.error(error.message);process.exitCode=1}`;
}
async function main(argv) {
  let command = 'plan'; if (argv[0] && !argv[0].startsWith('--')) command = argv.shift();
  assert(['plan', 'install', 'accept', 'rollback', 'proof'].includes(command), 'Use plan, install, accept, rollback or proof');
  const options = { command };
  for (let i = 0; i < argv.length; i += 2) { assert(['--target', '--commit', '--release', '--owner', '--evidence', '--h5-only'].includes(argv[i]) && argv[i + 1], 'Unknown or incomplete option'); const key = argv[i].slice(2); assert(!(key in options), 'Duplicate option'); options[key] = argv[i + 1]; }
  if ('h5-only' in options) { assert.equal(options['h5-only'], 'true'); options.h5Only = true; delete options['h5-only']; }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), request = freezeSource(root, options);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const remote = (target, value) => {
    const args = target === 'v' ? ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'v']
      : ['-F', '/Users/tianyicai/v-upgrade-private/20260904/ssh-config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'vlab91'];
    const node = target === 'v' ? '/opt/node-v22.23.1/bin/node' : '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
    return JSON.parse(execFileSync('ssh', [...args, 'sudo ' + node + ' --input-type=module -e ' + quote(remoteSource())], { input: JSON.stringify(value), encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 ** 2 }));
  };
  if (request.target === 'v') {
    request.sharedProof = remote('vlab', { ...request, target: 'vlab', command: 'proof' }); validateSharedProof(request.sharedProof, request);
  }
  console.log(JSON.stringify(remote(request.target, request), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
