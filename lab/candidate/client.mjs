import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {vlabSsh} from '../shared/ssh.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
export function buildRequest(root, plan, owner) {
  root = fs.realpathSync(root);
  owner ??= 'agent';
  function file(source) {
    assert(typeof source === 'string');
    const resolved = fs.realpathSync(path.resolve(root, source));
    const relative = path.relative(root, resolved);
    const destination = relative.startsWith('../') || path.isAbsolute(relative) ? 'external/' + hash(resolved).slice(0, 16) + '/' + path.basename(resolved) : relative;
    const content = fs.readFileSync(resolved);
    return {source: destination, originalSource: source, content: content.toString('base64'), sha256: hash(content)};
  }
  assert(plan.command || (Array.isArray(plan.tests) && plan.tests.length > 0), 'Specify tests or command');
  const inputs = [...new Set([...(plan.tests ?? []), ...(plan.support ?? [])])].map(file);
  const files = (plan.files ?? []).map(f => ({...file(f.source), target: f.target, before: f.before}));
  const request = {owner, tests: (plan.tests ?? []).map(t => inputs.find(f => f.originalSource === t).source), inputs, files, databases: plan.databases ?? [],
    timeoutSeconds: plan.timeoutSeconds ?? 0, baseRelease: plan.baseRelease, command: plan.command, env: plan.env ?? {}, cwd: plan.cwd, user: plan.user};
  return {...request, inputSha256: hash(JSON.stringify(request))};
}

export function candidate(opts) {
  const root = path.resolve(opts.repo ?? process.cwd());
  const plan = JSON.parse(fs.readFileSync(path.resolve(opts.plan), 'utf8'));
  const req = buildRequest(root, plan, opts.owner);
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
  const branch = git(['branch', '--show-current']);
  req.branch = branch;
  req.sourceCommit = git(['rev-parse', 'HEAD']);
  req.dirty = Boolean(git(['status', '--porcelain']));
  const runner = fs.readFileSync(new URL('./runner.mjs', import.meta.url));
  // Code and inputs are carried on stdin; no installed server controller changes.
  const bootstrap = 'try {let s=""; for await (const b of process.stdin) s+=b; const w=JSON.parse(s); const m=await import("data:text/javascript;base64,"+w.runner); console.log(JSON.stringify(await m.run(w.request)));} catch(e) {console.error(e.message);process.exitCode=1;}';
  const shellQuote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  const command = 'sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node --input-type=module -e ' + shellQuote(bootstrap);
  const start = performance.now();
  const result = JSON.parse(execFileSync('ssh', [...vlabSsh, command], {
    input: JSON.stringify({runner: runner.toString('base64'), request: {...req, runnerSha256: hash(runner)}}),
    encoding: 'utf8', maxBuffer: Infinity,
  }));
  result.totalClientMs = Math.round(performance.now() - start);
  const output = path.resolve(opts.output ?? path.join(root, 'tmp/candidate', result.id + '.json'));
  fs.mkdirSync(path.dirname(output), {recursive: true, mode: 0o700});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  return {...result, receipt: output};
}
