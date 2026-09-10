import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cronManagementPrincipalFromTurn, normalizeCronManagementPrincipal,
  cronManagementNamespaceDecision, cronManagementJobDecision, withCronManagementRequest,
  prepareCronManagementPolicy, assertCronManagementCommit,
} from '../../patches/cron-shared-management/runtime.mjs';

const principal = { version: 1, channel: 'feishu', accountId: 'default', senderId: 'employee-a' };
const scope = (group = 'A', overrides = {}) => ({ kind: 'agentTool', agentId: 'makaron',
  sessionKey: `agent:makaron:feishu:group:${group}`, accountId: 'default',
  cronManagementChannel: 'feishu', cronManagementPrincipal: principal, ...overrides });
const job = (overrides = {}) => ({ id: 'job-one', agentId: 'makaron', enabled: true,
  schedule: { kind: 'every', everyMs: 60000 }, sessionTarget: 'isolated',
  payload: { kind: 'agentTurn', message: 'old', toolsAllow: ['exec', 'process'] },
  owner: { agentId: 'makaron', sessionKey: scope('A').sessionKey, accountId: 'default' },
  ...overrides });

test('shared policy and staged migration', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-owner-unit-'));
  const previousEnv = process.env.OPENCLAW_CRON_SHARED_POLICY;
  const file = path.join(root, 'policy.json');
  process.env.OPENCLAW_CRON_SHARED_POLICY = file;
  const writePolicy = (enabled = true) => fs.writeFileSync(file, JSON.stringify({ version: 1,
    agents: { makaron: { mode: 'shared', enabled } } }));
  writePolicy();
  t.after(() => {
    if (previousEnv === undefined) delete process.env.OPENCLAW_CRON_SHARED_POLICY;
    else process.env.OPENCLAW_CRON_SHARED_POLICY = previousEnv;
    fs.rmSync(root, { recursive: true, force: true });
  });
    await t.test('ordinary admitted employee supplies identity without administrator flag', () => {
      assert.deepEqual(cronManagementPrincipalFromTurn({ senderIsOwner: false,
        requesterSenderId: 'employee-a', agentChannel: 'feishu', agentAccountId: 'default',
        agentSessionKey: scope('B').sessionKey }), principal);
      for (const extra of [{ requesterSenderId: undefined }, { sandboxed: true }, { gatewayCallerScheduled: true },
        { gatewayCallerLocal: true }, { trigger: 'cron' }, { agentSessionKey: 'agent:makaron:cron:x' }]) {
        assert.equal(cronManagementPrincipalFromTurn({ senderIsOwner: false,
          requesterSenderId: 'employee-a', agentChannel: 'feishu', agentAccountId: 'default',
          agentSessionKey: scope('B').sessionKey, ...extra }), undefined);
      }
    });
    await t.test('different employees can manage shared jobs from A/B/C groups', () => {
      for (const group of ['A', 'B', 'C']) {
        assert.equal(cronManagementJobDecision({ job: job(), callerScope: scope(group) }), true);
        assert.equal(cronManagementJobDecision({ job: job(), callerScope: scope(group,
          { cronManagementPrincipal: { ...principal, senderId: 'employee-b' } }) }), true);
      }
    });
    await t.test('account/channel mismatch, other agent, shell jobs and monitors denied', () => {
      assert.equal(cronManagementNamespaceDecision(scope('B', { accountId: 'other' })), false);
      assert.equal(cronManagementNamespaceDecision(scope('B', { cronManagementChannel: 'telegram' })), false);
      for (const extra of [{ agentId: 'other' }, { owner: { agentId: 'other' } },
        { payload: { kind: 'command' } },
        { payload: { kind: 'heartbeat' } }, { schedule: { kind: 'stream' } }]) {
        assert.equal(cronManagementJobDecision({ job: job(extra), callerScope: scope('B') }), false);
      }
      assert.equal(cronManagementJobDecision({ job: job({ owner: { agentId: 'makaron',
        accountId: 'another-bot', sessionKey: 'agent:makaron:telegram:group:X' } }), callerScope: scope('B') }), true);
      assert.equal(cronManagementNamespaceDecision(scope('B', { sessionKey: 'agent:makaron:cron:x' })), false);
      assert.equal(cronManagementNamespaceDecision(scope('B', { sessionKey: 'agent:makaron:subagent:x' })), false);
      assert.equal(cronManagementNamespaceDecision(scope('B', { currentJobId: 'scheduled-job' })), false);
      assert.equal(cronManagementNamespaceDecision(undefined), undefined);
      assert.equal(cronManagementNamespaceDecision(scope('B', { agentId: 'unmanaged' })), undefined);
    });
    await t.test('legacy missing owner adopted only in the guarded matching update', async () => {
      const original = job({ owner: undefined }), staged = structuredClone(original);
      staged.payload.toolsAllow = ['exec'];
      const params = { job: staged, previouslyUsedToolRuntime: true, explicitlyMutatesToolsAllow: true };
      assert.equal(prepareCronManagementPolicy(params), params);
      let activeChecks = 0;
      const result = await withCronManagementRequest({ method: 'cron.update', jobId: original.id,
        callerScope: scope('B'), protectedAtAdmission: true, defaultAgentId: 'makaron',
        assertActive: () => { activeChecks++; }, getJob: () => original }, () => prepareCronManagementPolicy(params));
      assert.deepEqual(result.job.owner, { agentId: 'makaron', sessionKey: scope('B').sessionKey, accountId: 'default' });
      assert.equal(result.scheduledToolPolicy.mode, 'account');
      assert.equal(original.owner, undefined);
      assert.ok(activeChecks > 0);
    });
    await t.test('cross-group update retains original execution owner and refuses cap expansion', async () => {
      const original = job();
      const request = { method: 'cron.update', jobId: original.id, callerScope: scope('C'),
        protectedAtAdmission: true, defaultAgentId: 'makaron', assertActive() {}, getJob: () => original };
      await withCronManagementRequest(request, () => {
        const reduced = structuredClone(original); reduced.payload.toolsAllow = ['exec'];
        const result = prepareCronManagementPolicy({ job: reduced, previouslyUsedToolRuntime: true, explicitlyMutatesToolsAllow: true });
        assert.equal(result.scheduledToolPolicy.ownerSessionKey, scope('A').sessionKey);
        assert.deepEqual(result.job.owner, original.owner);
        const expanded = structuredClone(original); expanded.payload.toolsAllow.push('browser');
        assert.throws(() => prepareCronManagementPolicy({ job: expanded, previouslyUsedToolRuntime: true,
          explicitlyMutatesToolsAllow: true }), /cannot expand/);
      });
    });
    await t.test('revocation checked again at commit, retired run fails', async () => {
      const request = { method: 'cron.update', jobId: 'job-one', callerScope: scope('C'), protectedAtAdmission: true,
        assertActive() {}, getJob: () => job() };
      await withCronManagementRequest(request, () => {
        assertCronManagementCommit(); writePolicy(false);
        assert.throws(assertCronManagementCommit, /revoked/);
      });
      writePolicy();
      await withCronManagementRequest({ ...request, assertActive() { throw new Error('retired'); } }, () => {
        assert.throws(assertCronManagementCommit, /retired/);
      });
    });
    await t.test('configured invalid/missing policy fails closed, unset policy keeps upstream behavior', () => {
      fs.writeFileSync(file, '{bad json'); assert.throws(() => cronManagementNamespaceDecision(scope()));
      fs.unlinkSync(file); assert.throws(() => cronManagementNamespaceDecision(scope()));
      delete process.env.OPENCLAW_CRON_SHARED_POLICY;
      assert.equal(cronManagementNamespaceDecision(scope()), undefined);
      process.env.OPENCLAW_CRON_SHARED_POLICY = file; writePolicy();
      assert.equal(normalizeCronManagementPrincipal({ ...principal, senderId: '\nemployee-a' }), undefined);
    });
});
