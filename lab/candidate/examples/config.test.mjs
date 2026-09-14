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

test('snapshot database is readable and privately writable without live state access', () => {
  const db = new DatabaseSync('/data/state/agents/openclaw/agent/openclaw-agent.sqlite');
  assert(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n > 0);
  db.exec('CREATE TABLE candidate_isolation_proof (value TEXT)');
  db.prepare('INSERT INTO candidate_isolation_proof VALUES (?)').run(process.env.VLAB_CANDIDATE_ID);
  assert.equal(db.prepare('SELECT value FROM candidate_isolation_proof').get().value, process.env.VLAB_CANDIDATE_ID);
  db.close();
  assert.throws(() => fs.readFileSync('/srv/vlab-production-mirror/labs/instances/db91-parity/state/agents/openclaw/agent/openclaw-agent.sqlite'));
  assert.throws(() => fs.writeFileSync('/fixture/shared-config.json', '{}'));
  assert.throws(() => fs.writeFileSync('/runtime/openclaw/dist/plugin-sdk/config-runtime.js', 'bad'));
  assert.throws(() => execFileSync('/usr/bin/python3', ['-c', 'import socket; socket.create_connection(("127.0.0.1",24993),timeout=1)'], {stdio: 'pipe'}));
});
