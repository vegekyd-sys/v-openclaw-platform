// Explicitly scoped synchronous SQLite load injection; synthetic fixture only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
export default {id: 'lab-db91-isolation-probe', register(api) {
  assert.equal(os.hostname(), 'VM-0-4-ubuntu');
  assert(process.env.OPENCLAW_CONFIG_PATH?.startsWith(root + '/state/'), 'never load outside the owned Lab');
  api.registerTool(ctx => ({name: 'lab_db91_integrity_probe',
    description: 'Lab-only acceptance tool: run repeated real SQLite integrity checks on a fixed synthetic database for roughly three seconds. No business data or writes. Use only when explicitly asked to run the isolation probe.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
    async execute() {
      const fixture = root + '/tmp/native-bench-1/synthetic.sqlite';
      assert.equal(fs.realpathSync(fixture), fixture);
      const stat = fs.statSync(fixture);
      assert(stat.isFile() && stat.size < 100 * 1024 ** 2);
      const eventFile = root + '/tmp/isolation-probe-events.jsonl';
      const event = (phase, extra = {}) => fs.appendFileSync(eventFile, JSON.stringify({phase, pid: process.pid, at: Date.now(), sessionKey: ctx.sessionKey, ...extra}) + '\n', {mode: 0o600});
      const db = new DatabaseSync(fixture, {readOnly: true});
      const started = performance.now();
      let checks = 0;
      event('begin');
      try {
        const check = db.prepare('PRAGMA integrity_check');
        do {
          assert.deepEqual(check.all().map(r => r.integrity_check), ['ok']);
          checks++;
        } while (performance.now() - started < 3000 && checks < 1000);
      } finally {db.close(); event('end', {checks, elapsedMs: Math.round(performance.now() - started)});}
      const result = {marker: 'DB91_ISOLATION_PROBE_OK', pid: process.pid, checks, elapsedMs: Math.round(performance.now() - started), syntheticReadOnly: true};
      return {content: [{type: 'text', text: JSON.stringify(result)}], details: result};
    }
  }), {name: 'lab_db91_integrity_probe'});
}};
