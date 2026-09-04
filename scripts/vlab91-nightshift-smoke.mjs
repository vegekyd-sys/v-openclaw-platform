import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const candidate = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const release = '/srv/vlab/releases/nightshift-workboard/bbc2ead-openclaw81-statefix1';
const base = 'http://127.0.0.1:24980';
const id = 'NS-V91-RELAY-20260904';
const db = new DatabaseSync(`${candidate}/nightshift/data/nightshift.sqlite`, { readOnly: true });
async function api(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  assert(response.ok, `${path}: ${response.status}: ${JSON.stringify(result).slice(0, 800)}`);
  return result;
}
const health = await api('/api/health');
assert.equal(health.board, 'nightshift-mirror-81');
assert.equal(health.schedulerMode, 'external');
assert.equal(health.notificationsEnabled, false);
if (!db.prepare('SELECT id FROM instances WHERE id=?').get(id)) {
  const imported = await api('/api/workflows/import', {
    sourceMarkdown: fs.readFileSync(`${release}/examples/workflows/vlab-native-dispatch-smoke.workflow.md`, 'utf8'),
  });
  const sha = imported.release?.metadata?.workflowSha256 ?? imported.release?.workflowSha256;
  assert.equal(typeof sha, 'string', `No workflow SHA: ${Object.keys(imported.release ?? {})}`);
  const created = await api('/api/instances', {
    id, name: 'OpenClaw 9.1 isolated three-stage acceptance', status: 'active',
    workflowSha256: sha, agentBindings: { operator: 'makaron' },
    inputs: { runTag: 'VLAB91_NIGHTSHIFT_ONLY_TEST_NO_BUSINESS' }, dispatch: true,
  });
  assert(!created.initialScheduleError, created.initialScheduleError);
  console.log(JSON.stringify({ at: new Date().toISOString(), id, created: true, schedule: created.initialSchedule }));
}
for (let attempt = 0; attempt < 24; attempt++) {
  const runs = db.prepare('SELECT stage_id,status,card_id,updated_at FROM stage_runs WHERE instance_id=? ORDER BY stage_id,attempt').all(id);
  console.log(JSON.stringify({ at: new Date().toISOString(), id, runs }));
  if (['a', 'b', 'c'].every(stage => runs.some(run => run.stage_id === stage && run.status === 'done'))) {
    console.log('VLAB91_NIGHTSHIFT_RELAY_OK');
    process.exit(0);
  }
  assert(!runs.some(run => ['failed', 'blocked'].includes(run.status)), 'Night Shift stage failed or blocked');
  await api(`/api/instances/${id}/tick`, { dispatch: true, dryRun: false });
  await new Promise(resolve => setTimeout(resolve, 20000));
}
throw new Error('Night Shift acceptance deadline exceeded; do not mark passed');
