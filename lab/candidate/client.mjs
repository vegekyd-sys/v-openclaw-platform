import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const hash = b => createHash('sha256').update(b).digest('hex');
export function buildRequest(root, plan, owner) {
  root = fs.realpathSync(root);
  assert(/^[\w-]{1,100}$/.test(owner ?? ''), 'Owner required');
  function file(source) {
    assert(typeof source === 'string' && !path.isAbsolute(source));
    const resolved = fs.realpathSync(path.resolve(root, source));
    assert(resolved.startsWith(root + '/'), 'Candidate inputs must be inside the task worktree');
    assert(!/(^|\/)(\.env[^/]*|credentials|state|sessions|node_modules)(\/|$)/.test(source));
    const content = fs.readFileSync(resolved);
    assert(content.length <= 16 * 1024 ** 2, 'Candidate input exceeds 16 MiB');
    return {source, content: content.toString('base64'), sha256: hash(content)};
  }
  assert(Array.isArray(plan.tests) && plan.tests.length > 0, 'Specify test entrypoints');
  const inputs = [...new Set([...plan.tests, ...(plan.support ?? [])])].map(file);
  const files = (plan.files ?? []).map(f => ({...file(f.source), target: f.target, before: f.before}));
  const request = {owner, tests: plan.tests, inputs, files, databases: plan.databases ?? [],
    timeoutSeconds: plan.timeoutSeconds ?? 120, baseRelease: plan.baseRelease};
  assert(Buffer.byteLength(JSON.stringify(request)) < 48 * 1024 ** 2, 'Candidate payload exceeds 48 MiB');
  return {...request, inputSha256: hash(JSON.stringify(request))};
}

export function candidate(opts) {
  const root = path.resolve(opts.repo ?? process.cwd());
  const plan = JSON.parse(fs.readFileSync(path.resolve(opts.plan), 'utf8'));
  const req = buildRequest(root, plan, opts.owner);
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
  const branch = git(['branch', '--show-current']);
  assert(branch.startsWith('codex/'), 'Run candidate tests from the task worktree');
  req.branch = branch;
  req.sourceCommit = git(['rev-parse', 'HEAD']);
  req.dirty = Boolean(git(['status', '--porcelain']));
  const runner = fs.readFileSync(new URL('./runner.mjs', import.meta.url));
  // Code and inputs are carried on stdin; no installed server controller changes.
  const bootstrap = 'try {let s=""; for await (const b of process.stdin) s+=b; const w=JSON.parse(s); const m=await import("data:text/javascript;base64,"+w.runner); console.log(JSON.stringify(await m.run(w.request)));} catch(e) {console.error(e.message);process.exitCode=1;}';
  const shellQuote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  const command = 'sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node --input-type=module -e ' + shellQuote(bootstrap);
  const start = performance.now();
  const result = JSON.parse(execFileSync('ssh', ['-F', '/Users/tianyicai/v-upgrade-private/20260904/ssh-config',
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'vlab91', command], {
    input: JSON.stringify({runner: runner.toString('base64'), request: {...req, runnerSha256: hash(runner)}}),
    encoding: 'utf8', maxBuffer: 8 * 1024 ** 2, timeout: (req.timeoutSeconds + 180) * 1000,
  }));
  result.totalClientMs = Math.round(performance.now() - start);
  const output = path.resolve(opts.output ?? path.join(root, 'tmp/candidate', result.id + '.json'));
  fs.mkdirSync(path.dirname(output), {recursive: true, mode: 0o700});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  return {...result, receipt: output};
}
