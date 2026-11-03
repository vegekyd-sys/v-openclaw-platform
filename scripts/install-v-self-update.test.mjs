import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'install-v-self-update.sh');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();

// A fake V home: an origin with dev, and vlab-dev detached at it, as on V today.
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'v-self-update-'));
  const origin = path.join(home, 'origin');
  const dev = path.join(home, 'src/vlab-dev');
  fs.mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'dev');
  git(origin, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'one');
  fs.mkdirSync(path.dirname(dev), { recursive: true });
  execFileSync('git', ['clone', '-q', origin, dev]);
  git(dev, 'switch', '-q', '--detach', 'origin/dev');
  fs.mkdirSync(path.join(home, '.ssh'), { mode: 0o700 });
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(home, '.ssh/id_ed25519')]);
  const run = (...args) => spawnSync('bash', [script, 'local', '--no-verify', ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: home },
  });
  return { home, dev, run, read: (f) => fs.readFileSync(path.join(home, f), 'utf8') };
}

test('adds a loopback-only alias, a dev branch and the registry', () => {
  const { dev, run, read } = fixture();
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(read('.ssh/config'), /Host v\n\s+HostName 127\.0\.0\.1/);
  assert.match(read('.ssh/authorized_keys'), /^from="127\.0\.0\.1,::1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 /);
  assert.equal(git(dev, 'branch', '--show-current'), 'dev');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dev, '.git/vlab-workflow.json'))).dev, dev);
});

test('running twice changes nothing', () => {
  const { run, read } = fixture();
  run();
  const before = [read('.ssh/config'), read('.ssh/authorized_keys')];
  assert.equal(run().status, 0);
  assert.deepEqual([read('.ssh/config'), read('.ssh/authorized_keys')], before);
});

test('a dirty checkout is refused and stays where it is', () => {
  const { dev, run } = fixture();
  fs.writeFileSync(path.join(dev, 'wip'), 'x');
  const head = git(dev, 'rev-parse', 'HEAD');
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /uncommitted/);
  assert.equal(git(dev, 'branch', '--show-current'), '');
  assert.equal(git(dev, 'rev-parse', 'HEAD'), head);
});

test('undo removes only what was added', () => {
  const { home, dev, run, read } = fixture();
  fs.writeFileSync(path.join(home, '.ssh/config'), 'Host other\n  User x\n');
  fs.writeFileSync(path.join(home, '.ssh/authorized_keys'), 'ssh-ed25519 AAAA mine\n');
  run();
  assert.equal(run('--undo').status, 0);
  assert.equal(read('.ssh/config').trim(), 'Host other\n  User x');
  assert.equal(read('.ssh/authorized_keys'), 'ssh-ed25519 AAAA mine\n');
  assert.equal(fs.existsSync(path.join(dev, '.git/vlab-workflow.json')), false);
});
