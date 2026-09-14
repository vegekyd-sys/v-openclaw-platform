import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';

test('real VLab config can be changed and independently read back by candidate OpenClaw', async () => {
  const runtime = await import(process.env.VLAB_CANDIDATE_RUNTIME + '/openclaw/dist/plugin-sdk/config-runtime.js');
  const snapshot = JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_FIXTURE));
  const configFile = process.env.OPENCLAW_CONFIG_PATH;
  const cfg = JSON.parse(fs.readFileSync(configFile));
  assert.equal(cfg.agents.defaults.maxConcurrent, snapshot.agents.defaults.maxConcurrent);
  const original = cfg.agents.defaults.maxConcurrent;
  cfg.agents.defaults.maxConcurrent = original === 3 ? 4 : 3;
  await runtime.writeConfigFile(cfg);
  runtime.clearConfigCache();
  assert.equal(runtime.loadConfig().agents.defaults.maxConcurrent, cfg.agents.defaults.maxConcurrent);
  assert.equal(JSON.parse(fs.readFileSync(configFile)).agents.defaults.maxConcurrent, cfg.agents.defaults.maxConcurrent);
  cfg.agents.defaults.maxConcurrent = original;
  await runtime.writeConfigFile(cfg);
  runtime.clearConfigCache();
  assert.equal(runtime.loadConfig().agents.defaults.maxConcurrent, original);
});

test('snapshot database writes remain private while host resources are available', () => {
  const db = new DatabaseSync(process.env.OPENCLAW_STATE_DIR + '/agents/openclaw/agent/openclaw-agent.sqlite');
  assert(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n > 0);
  db.exec('CREATE TABLE candidate_isolation_proof (value TEXT)');
  db.prepare('INSERT INTO candidate_isolation_proof VALUES (?)').run(process.env.VLAB_CANDIDATE_ID);
  assert.equal(db.prepare('SELECT value FROM candidate_isolation_proof').get().value, process.env.VLAB_CANDIDATE_ID);
  db.close();
  assert(fs.existsSync(process.env.VLAB_SHARED_CONFIG_PATH));
  const proof = process.env.VLAB_CANDIDATE_RUNTIME + '/candidate-write-proof.txt';
  fs.writeFileSync(proof, process.env.VLAB_CANDIDATE_ID);
  assert.equal(fs.readFileSync(proof, 'utf8'), process.env.VLAB_CANDIDATE_ID);
  fs.unlinkSync(proof);
  execFileSync('/usr/bin/python3', ['-c', 'import socket; s=socket.create_connection(("127.0.0.1",24993),timeout=5); s.close()'], {stdio: 'pipe'});
});

test('candidate has real outbound HTTPS connectivity', async () => {
  const response = await fetch('https://example.com', {signal: AbortSignal.timeout(20000)});
  assert(response.ok);
  assert((await response.text()).includes('Example Domain'));
});

test('runner does not impose process, CPU, memory or duration caps', () => {
  const settings = execFileSync('systemctl', ['show', process.env.VLAB_CANDIDATE_UNIT,
    '-p', 'CPUQuotaPerSecUSec', '-p', 'MemoryMax', '-p', 'TasksMax', '-p', 'RuntimeMaxUSec'], {encoding: 'utf8'});
  for (const name of ['CPUQuotaPerSecUSec', 'MemoryMax', 'TasksMax', 'RuntimeMaxUSec']) {
    assert(settings.includes(name + '=infinity'), name);
  }
});
