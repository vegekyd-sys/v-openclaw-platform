// Run only in an isolated VLab fixture, with a fresh HOME/STATE and no network.
// Real agent tool, signed identity, Gateway handlers, CronService and SQLite.
// Sender ingress is synthetic. No model provider, shared service or live channel.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [core, state, mode = 'fixed'] = process.argv.slice(2);
if (!path.isAbsolute(core ?? '') || !path.isAbsolute(state ?? '') || !['baseline', 'fixed'].includes(mode)) {
  throw new Error('Usage: native-repro.mjs /absolute/core /fresh/test-state baseline|fixed');
}
await fs.mkdir(state); // Refuse reuse of an existing state directory.
process.env.HOME = state;
process.env.OPENCLAW_STATE_DIR = path.join(state, 'state');
process.env.OPENCLAW_CONFIG_PATH = path.join(state, 'openclaw.json');
process.env.OPENCLAW_CRON_SHARED_POLICY = path.join(state, 'cron-shared-policy.json');
process.env.OPENCLAW_SKIP_CRON = '1';
const cfg = { agents: { entries: { makaron: { workspace: path.join(state, 'workspace') } } },
  cron: { enabled: false }, plugins: { enabled: false }, tools: { sessions: { visibility: 'agent' } } };
await fs.writeFile(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(cfg));
const principal = { version: 1, channel: 'feishu', accountId: 'default', senderId: 'employee-a' };
const writePolicy = async (enabled = true) => await fs.writeFile(process.env.OPENCLAW_CRON_SHARED_POLICY,
  JSON.stringify({ version: 1, agents: { makaron: { mode: 'shared', enabled } } }));
await writePolicy();
const dist = path.join(core, 'dist'), names = await fs.readdir(dist);
async function moduleFor(pattern, anchor) {
  const matched = [];
  for (const name of names.filter((n) => pattern.test(n))) {
    if ((await fs.readFile(path.join(dist, name), 'utf8')).includes(anchor)) matched.push(name);
  }
  assert.equal(matched.length, 1, String(pattern));
  return await import(pathToFileURL(path.join(dist, matched[0])).href);
}
const { t: CronService } = await moduleFor(/^service-[\w-]+\.js$/, 'var CronService = class');
const { t: handlers } = await moduleFor(/^cron-[\w-]+\.js$/, 'const cronHandlers = {');
const { t: createCronTool } = await moduleFor(/^cron-tool-[\w-]+\.js$/, 'function createCronTool(');
const { a: withCaller, r: getCaller } = await moduleFor(/^gateway-caller-context-[\w-]+\.js$/, 'function withGatewayToolCallerIdentity(');
const { r: mint, i: verify, t: makeValidator } = await moduleFor(/^agent-runtime-identity-token-[\w-]+\.js$/, 'function prepareAgentRuntimeIdentityTokenPayload(');
const { i: claim, y: release } = await moduleFor(/^agent-run-registry-[\w-]+\.js$/, 'function claimAgentRunDelegatedAuthority(');
const { m: saveStore } = await moduleFor(/^store-[\w-]+\.js$/, 'function saveCronJobsStore(');
const fromTurn = mode === 'fixed' ? (await import(pathToFileURL(path.join(dist, 'versa-cron-shared-management-v1.mjs')).href)).cronManagementPrincipalFromTurn : () => undefined;
const storePath = path.join(state, 'cron', 'jobs.json');
const legacyId = randomUUID();
const now = Date.now();
const legacy = { id: legacyId, name: 'legacy-ownerless', agentId: 'makaron', enabled: false,
  schedule: { kind: 'every', everyMs: 3600000, anchorMs: now }, sessionTarget: 'isolated', wakeMode: 'now',
  payload: { kind: 'agentTurn', message: 'legacy content', timeoutSeconds: 600, toolsAllow: ['exec', 'process', 'message'] },
  delivery: { mode: 'none' }, createdAtMs: now, updatedAtMs: now, state: {} };
await saveStore(storePath, { version: 1, jobs: [legacy] });
const log = { info() {}, warn() {}, error() {}, debug() {} };
const cron = new CronService({ storePath, cronEnabled: false, defaultAgentId: 'makaron',
  cronConfig: { enabled: false }, log, enqueueSystemEvent() {}, requestHeartbeatNow() {},
  runIsolatedAgentJob: async () => { throw new Error('This permissions test must not execute business jobs'); } });
const validator = makeValidator();
const context = { cron, getRuntimeConfig: () => cfg, validateAgentRuntimeApprovalAuthority: validator, logGateway: log };
let lastIdentity;
const evidence = [];
const pass = (label) => { evidence.push(label); console.log(`PASS ${label}`); };

async function gateway(method, options, args) {
  const caller = getCaller(); assert.ok(caller?.operationalRunInstance);
  const token = await mint(caller);
  const identity = await verify(token); assert.ok(identity); assert.ok(validator(identity));
  if (mode === 'fixed' && caller.cronManagementPrincipal) assert.deepEqual(identity.cronManagementPrincipal, caller.cronManagementPrincipal);
  lastIdentity = identity;
  const client = { internal: { agentRuntimeIdentity: identity }, connect: { role: 'operator', scopes: ['operator.read', 'operator.write'] } };
  let response;
  await handlers[method]({ params: args, context, client, respond(ok, result, error) { response = { ok, result, error }; } });
  assert.ok(response, method);
  if (!response.ok) throw new Error(response.error?.message ?? JSON.stringify(response.error));
  return response.result;
}
async function turn(group, action, jobId, patch, sender = `employee-${group.toLowerCase()}`) {
  const sessionKey = `agent:makaron:feishu:group:${group}`;
  const operationalRunInstance = { instanceId: randomUUID(), runId: randomUUID() };
  const authority = claim(operationalRunInstance);
  try {
    const tool = createCronTool({ agentSessionKey: sessionKey, agentId: 'makaron', agentAccountId: 'default',
      config: cfg, creatorToolAllowlist: ['exec', 'process', 'message'],
      cronManagementPrincipal: fromTurn({ senderIsOwner: false, requesterSenderId: sender,
        agentChannel: 'feishu', agentAccountId: 'default', agentSessionKey: sessionKey }) }, { callGatewayTool: gateway });
    const args = { action, ...(jobId ? { jobId } : {}), ...(patch ? { job: patch } : {}), includeDisabled: true };
    return await withCaller({ agentId: 'makaron', sessionKey, operationalRunInstance,
      turnSourceChannel: 'feishu', turnSourceAccountId: 'default' }, () => tool.execute(randomUUID(), args));
  } finally { release(authority); }
}
function resultOf(toolResult) {
  if (toolResult.details) return toolResult.details;
  return JSON.parse(toolResult.content.find((c) => c.type === 'text').text);
}

try {
  if (mode === 'baseline') {
    await assert.rejects(turn('B', 'update', legacyId, { payload: { kind: 'agentTurn', message: 'new', toolsAllow: ['exec'] } }),
      /scheduled account policy must match the persisted job owner/);
    pass('baseline reproduces legacy-ownerless toolsAllow failure');
  } else {
    await turn('B', 'update', legacyId, { payload: { kind: 'agentTurn', message: 'new', toolsAllow: ['exec'] } });
    const persisted = await cron.readJob(legacyId);
    assert.equal(persisted.payload.message, 'new');
    assert.equal(persisted.owner.sessionKey, 'agent:makaron:feishu:group:B');
    assert.equal(persisted.scheduledToolPolicy.mode, 'account');
    assert.equal(persisted.delivery.mode, 'none');
    pass('legacy owner adoption and cap narrowing persist through native update');
  }
  const added = resultOf(await turn('A', 'add', undefined, { name: 'cross-group-owner', agentId: 'makaron', enabled: false,
    schedule: { kind: 'every', everyMs: 3600000 }, sessionTarget: 'isolated', wakeMode: 'now',
    payload: { kind: 'agentTurn', message: 'created in A', toolsAllow: ['exec', 'process'] }, delivery: { mode: 'none' } }));
  const id = added.id ?? added.job?.id; assert.ok(id);
  if (mode === 'baseline') {
    await assert.rejects(turn('B', 'update', id, { name: 'edited in B' }), /unknown cron job|not found/i);
    pass('baseline reproduces shared-job cross-group denial');
  } else {
    await turn('B', 'update', id, { name: 'edited in B', schedule: { kind: 'every', everyMs: 7200000 } });
    await turn('C', 'update', id, { enabled: false, payload: { kind: 'agentTurn', message: 'edited in C', toolsAllow: ['exec'] } });
    const persisted = await cron.readJob(id);
    assert.equal(persisted.name, 'edited in B'); assert.equal(persisted.payload.message, 'edited in C');
    assert.equal(persisted.schedule.everyMs, 7200000);
    assert.equal(persisted.owner.sessionKey, 'agent:makaron:feishu:group:A');
    assert.equal(persisted.scheduledToolPolicy.ownerSessionKey, persisted.owner.sessionKey);
    pass('employee A creates, employee B reschedules, employee C edits/pauses across groups; execution origin retained');
    const listing = resultOf(await turn('C', 'list'));
    assert.ok(listing.jobs.some((j) => j.id === id));
    pass('another ordinary employee lists the shared task across groups');
    for (const group of ['A', 'B', 'C']) await assert.rejects(turn(group, 'update', id, { name: 'intruder' }, ''));
    assert.equal((await cron.readJob(id)).name, 'edited in B');
    await assert.rejects(turn('A', 'remove', id, undefined, ''));
    const otherList = resultOf(await turn('A', 'list', undefined, undefined, ''));
    assert.ok(!otherList.jobs.some((j) => j.id === id));
    await assert.rejects(turn('A', 'add', undefined, { name: 'intruder-created', agentId: 'makaron',
      enabled: false, schedule: { kind: 'every', everyMs: 3600000 }, sessionTarget: 'isolated', wakeMode: 'now',
      payload: { kind: 'agentTurn', message: 'intruder', toolsAllow: ['exec'] }, delivery: { mode: 'none' } }, ''));
    pass('missing authenticated sender cannot list, create, update or remove shared jobs');
    await assert.rejects(turn('C', 'update', id, { owner: { agentId: 'makaron' } }), /unexpected property 'owner'/);
    await assert.rejects(turn('C', 'update', id, { payload: { kind: 'agentTurn', toolsAllow: ['exec', 'message'] } }), /cannot expand/);
    pass('forged owner parameter and tool-cap expansion rejected');
    await writePolicy(false);
    await assert.rejects(turn('C', 'update', id, { name: 'revoked' }));
    await writePolicy();
    pass('disabled shared access denies subsequent request');
    const updateOriginal = cron.updateWithPrecondition.bind(cron);
    cron.updateWithPrecondition = async (...args) => {
      await writePolicy(false);
      return await updateOriginal(...args);
    };
    await assert.rejects(turn('B', 'update', id, { name: 'raced revocation' }));
    cron.updateWithPrecondition = updateOriginal;
    await writePolicy();
    assert.equal((await cron.readJob(id)).name, 'edited in B');
    pass('disabling shared access between preflight and locked commit prevents mutation');
    assert.equal(validator(lastIdentity), false);
    await assert.rejects(handlers['cron.update']({ params: { id, patch: { name: 'stale replay' } },
      context, client: { internal: { agentRuntimeIdentity: lastIdentity } }, respond() {} }), /active authenticated/);
    pass('retired signed run cannot replay a mutation');
    const reopened = new CronService({ storePath, cronEnabled: false, defaultAgentId: 'makaron',
      cronConfig: { enabled: false }, log, enqueueSystemEvent() {}, requestHeartbeatNow() {},
      runIsolatedAgentJob: async () => { throw new Error('No execution allowed'); } });
    try {
      const fromDisk = await reopened.readJob(id);
      assert.equal(fromDisk.name, 'edited in B');
      assert.equal(fromDisk.owner.sessionKey, 'agent:makaron:feishu:group:A');
      assert.deepEqual(fromDisk.payload.toolsAllow, ['exec']);
    } finally { reopened.stop(); }
    pass('fresh CronService reload confirms persisted data and denied mutations');
    await turn('B', 'remove', id);
    assert.equal(await cron.readJob(id), undefined);
    pass('employee B deletes employee A shared task from another group');
  }
  if (mode === 'fixed') {
    const { a: prepareAdmission } = await moduleFor(/^admitted-run-context-[\w-]+\.js$/, 'function prepareAgentRunAdmission(');
    const { t: createHost } = await moduleFor(/^host-capability-[\w-]+\.js$/, 'function createAgentHarnessHostCapabilities(');
    const runId = randomUUID();
    const admission = prepareAdmission({ cfg, operationalRunInstance: { instanceId: randomUUID(), runId },
      facts: { runId, agentId: 'makaron', ingress: { kind: 'channel', boundary: 'test', state: 'present' } } });
    const admittedRunContext = await admission.admit('test');
    const host = createHost({ pluginId: 'test-worker', requiredNodeCommands: [], attempt: {
      config: cfg, agentId: 'makaron', agentAccountId: 'default',
      sessionKey: 'agent:makaron:feishu:group:B', sessionId: randomUUID(), runId,
      senderId: principal.senderId, senderIsOwner: false, messageChannel: 'feishu',
      admittedRunContext, cwd: state, workspaceDir: state } });
    try {
      const token = await host.capabilities.vlabResolveGatewayIdentity({ method: 'cron.update', required: true,
        senderId: 'forged-worker-sender', cronManagementPrincipal: { ...principal, senderId: 'forged' } });
      const identity = await verify(token);
      assert.deepEqual(identity.cronManagementPrincipal, principal);
      const [payload, signature] = token.split('.');
      const changed = JSON.parse(Buffer.from(payload, 'base64url'));
      changed.cronManagementPrincipal.senderId = 'forged';
      assert.equal(await verify(Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signature), undefined);
      pass('original Gateway host accepts non-admin employee; Worker cannot forge source identity');
      host.close();
      await assert.rejects(host.capabilities.vlabResolveGatewayIdentity({ method: 'cron.update', required: true }), /no longer active/);
      pass('closed host capability cannot mint another employee token');
    } finally { host.close(); admission.close(); }
  }
} finally { cron.stop(); }
await fs.writeFile(path.join(state, 'evidence.json'), JSON.stringify({ mode, evidence, liveChannel: false, modelExecution: false }, null, 2));
console.log(JSON.stringify({ mode, passed: evidence.length, state }));
