// v-self-restart's read-only Gateway helper asks the running Gateway, as an
// operator.read client, what is in flight. Since the inter-session design
// (docs/inter-session/design.md §6.6) that includes vrelay.list({active: true})
// of the v-session-relay plugin. These run the helper against a stand-in
// gateway-runtime.js, so no Gateway and no network are involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const helper = fileURLToPath(new URL('../scripts/v-self-restart-gateway.mjs', import.meta.url));

const FAKE_RUNTIME = `
import fs from 'node:fs';
const log = (x) => fs.appendFileSync(process.env.FAKE_GW_LOG, JSON.stringify(x) + '\\n');
export class GatewayClient {
  constructor(opts) { this.opts = opts; }
  start() {
    log({connect: {scopes: this.opts.scopes, hasToken: typeof this.opts.token === 'string' && this.opts.token.length > 0}});
    setImmediate(() => this.opts.onHelloOk());
  }
  async request(method, params) {
    log({method, params});
    const answer = JSON.parse(process.env.FAKE_GW_ANSWERS)[method];
    if (answer === undefined) throw new Error('unknown method: ' + method);
    if (answer.throw) throw new Error(answer.throw);
    return answer;
  }
  stop() {}
}
`;

const WORKERS = {minWorkers: 1, pending: 0, workers: [{slot: 0, ready: true, activeCount: 0, queued: 0, active: []}]};
const CRON = {jobs: [], hasMore: false};

function run(t, answers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-self-restart-gateway-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.mkdirSync(path.join(dir, 'core', 'dist', 'plugin-sdk'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'dist', 'plugin-sdk', 'gateway-runtime.js'), FAKE_RUNTIME);
  fs.writeFileSync(path.join(dir, 'openclaw.json'), JSON.stringify({gateway: {auth: {token: 'fixture-not-a-secret'}}}));
  const logFile = path.join(dir, 'calls.jsonl');
  const stdout = execFileSync(process.execPath, ['--no-warnings', helper, '--core', path.join(dir, 'core'), '--port', '1',
    '--pid', '0', '--config', path.join(dir, 'openclaw.json')], {
    encoding: 'utf8', env: {PATH: process.env.PATH, FAKE_GW_LOG: logFile, FAKE_GW_ANSWERS: JSON.stringify(answers)},
  });
  const calls = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return {stdout, out: JSON.parse(stdout.trim().split('\n').at(-1)), calls};
}

test('collaboration turns in flight come from vrelay.list with read scope only', (t) => {
  const relay = {
    counts: {running: 1, queued: 2, awaiting: 1},
    items: [
      {sendId: 's_1', code: '7F3A', phase: 'running', ageMs: 5000, message: 'private request text',
        requester: {sessionKey: 'agent:makaron:feishu:direct:ou_1', label: 'Tianyi 私聊'},
        target: {sessionKey: 'agent:makaron:feishu:group:oc_1', label: '任务群 a'}},
      {sendId: 's_2', code: '7F3B', phase: 'queued', ageMs: 100, target: 'agent:makaron:feishu:group:oc_2'},
    ],
  };
  const {stdout, out, calls} = run(t, {'vlab.workers.status': WORKERS, 'cron.list': CRON, 'vrelay.list': relay});
  assert.deepEqual(calls[0], {connect: {scopes: ['operator.read'], hasToken: true}});
  assert.deepEqual(calls.find((c) => c.method === 'vrelay.list').params, {active: true, limit: 100});
  assert.deepEqual(out.relay, {
    counts: {running: 1, queued: 2, awaiting: 1},
    items: [{phase: 'running', target: 'agent:makaron:feishu:group:oc_1'}, {phase: 'queued', target: 'agent:makaron:feishu:group:oc_2'}],
  });
  // labels, codes and message text stay in the Gateway
  for (const s of ['private request text', 'Tianyi 私聊', '任务群 a', '7F3A', 'fixture-not-a-secret']) assert(!stdout.includes(s), s);
  // the other two queries are unchanged
  assert.equal(out.workers.workers.length, 1);
  assert.deepEqual(out.cron, {jobs: []});
});

test('a Gateway without the relay plugin answers with an error, the other queries still work', (t) => {
  const {out} = run(t, {'vlab.workers.status': WORKERS, 'cron.list': CRON, 'vrelay.list': {throw: 'missing scope: operator.admin'}});
  assert.deepEqual(out.relay, {error: 'missing scope: operator.admin'});
  assert.equal(out.workers.pending, 0);
  assert.deepEqual(out.cron, {jobs: []});
  const {out: plain} = run(t, {'vlab.workers.status': WORKERS, 'cron.list': CRON});
  assert.deepEqual(plain.relay, {error: 'unknown method: vrelay.list'});
});

test('malformed counts and items are dropped rather than passed on', (t) => {
  const {out} = run(t, {'vlab.workers.status': WORKERS, 'cron.list': CRON,
    'vrelay.list': {counts: {running: '3', queued: -0.5}, items: [null, {phase: 7, target: {label: 'x'}}]}});
  assert.deepEqual(out.relay, {counts: {}, items: [{phase: null, target: null}, {phase: null, target: null}]});
});
