// Gateway-owned Cron management. This module never reads model-authored identity.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const requestStorage = new AsyncLocalStorage();
const atom = (value, max = 256) => typeof value === 'string' && value.length > 0 &&
  value.length <= max && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
const namespace = (value) => atom(value, 128) && /^[a-z0-9][a-z0-9_-]*$/.test(value);

export function normalizeCronManagementPrincipal(value) {
  if (!value || value.version !== 1 || !namespace(value.channel) ||
      !namespace(value.accountId) || !atom(value.senderId)) return undefined;
  return Object.freeze({ version: 1, channel: value.channel,
    accountId: value.accountId, senderId: value.senderId });
}

/** Native tool construction / original Gateway admission only, never tool args. */
export function cronManagementPrincipalFromTurn(options = {}) {
  if (options.senderIsOwner !== true || options.sandboxed || options.gatewayCallerLocal ||
      options.gatewayCallerScheduled || options.cronSelfRemoveOnlyJobId ||
      options.selfRemoveOnlyJobId || options.trigger === 'cron' || options.trigger === 'heartbeat') return undefined;
  const sessionKey = options.runSessionKey ?? options.agentSessionKey ?? options.sessionKey;
  if (typeof sessionKey !== 'string' || /:(cron|subagent):/.test(sessionKey)) return undefined;
  const channel = options.gatewayCallerChannel ?? options.agentChannel ??
    options.messageChannel ?? options.messageProvider;
  if (['webchat', 'internal', 'cli', 'heartbeat'].includes(channel)) return undefined;
  return normalizeCronManagementPrincipal({ version: 1, channel,
    accountId: options.gatewayCallerAccountId ?? options.agentAccountId ?? 'default',
    senderId: options.requesterSenderId ?? options.senderId });
}

// An explicit operator-owned policy makes the managed agent namespace unambiguous.
// Unconfigured installations retain upstream behavior. Empty owners revokes access.
export function readCronManagementPolicy() {
  const file = process.env.OPENCLAW_CRON_OWNER_POLICY;
  if (!file) return undefined;
  if (!path.isAbsolute(file)) throw new TypeError('Cron owner policy must use an absolute path');
  if (statSync(file).size > 65536) throw new TypeError('Cron owner policy is too large');
  const policy = JSON.parse(readFileSync(file, 'utf8'));
  if (policy?.version !== 1 || !policy.agents || Array.isArray(policy.agents) ||
      typeof policy.agents !== 'object' || Object.keys(policy.agents).length > 64) {
    throw new TypeError('Invalid Cron owner policy');
  }
  for (const [agentId, entry] of Object.entries(policy.agents)) {
    if (!namespace(agentId) || !Array.isArray(entry?.owners) || entry.owners.length > 32 ||
        entry.owners.some((p) => !normalizeCronManagementPrincipal(p))) {
      throw new TypeError('Invalid Cron owner namespace or principal');
    }
  }
  return policy;
}

/** Undefined = upstream policy. False = protected namespace, unauthorized caller. */
export function cronManagementNamespaceDecision(scope) {
  if (!scope) return undefined; // Native operator RPC remains the upstream admin surface.
  const entry = readCronManagementPolicy()?.agents[scope.agentId];
  if (!entry) return undefined;
  const principal = normalizeCronManagementPrincipal(scope.cronManagementPrincipal);
  if (!principal || scope.accountId !== principal.accountId ||
      scope.cronManagementChannel !== principal.channel || !scope.sessionKey) return false;
  const authorized = entry.owners.some((p) => p.channel === principal.channel &&
    p.accountId === principal.accountId && p.senderId === principal.senderId);
  if (authorized) {
    // Membership is checked again during the locked commit, not cached at admission.
    requestStorage.getStore()?.assertActive();
  }
  return authorized;
}

export function cronManagementNamespaceIsProtected(scope) {
  return Boolean(scope && readCronManagementPolicy()?.agents[scope.agentId]);
}

export function cronManagementJobDecision({ job, callerScope, defaultAgentId }) {
  const allowed = cronManagementNamespaceDecision(callerScope);
  if (allowed !== true) return allowed;
  const agentFromSession = (key) => typeof key === 'string' ? /^agent:([^:]+):/.exec(key)?.[1] : undefined;
  const agentId = job.agentId || agentFromSession(job.sessionKey) || defaultAgentId;
  const ownerAgentId = job.owner?.agentId || agentFromSession(job.owner?.sessionKey);
  if (agentId !== callerScope.agentId || (ownerAgentId && ownerAgentId !== callerScope.agentId)) return false;
  if (job.owner?.accountId && job.owner.accountId !== callerScope.accountId) return false;
  const sourceChannel = /^agent:[^:]+:([^:]+):(group|direct):/.exec(job.owner?.sessionKey ?? '')?.[1];
  if (sourceChannel && sourceChannel !== callerScope.cronManagementPrincipal.channel) return false;
  // System monitors and operator shell jobs are not agent-managed Cron jobs.
  return ['agentTurn', 'script', 'systemEvent'].includes(job.payload?.kind) &&
    !['on-exit', 'stream'].includes(job.schedule?.kind);
}

/** Only the verified Gateway handler can establish this private mutation context. */
export async function withCronManagementRequest(request, run) {
  return await requestStorage.run(Object.freeze(request), run);
}

export function assertCronManagementCommit() {
  const request = requestStorage.getStore();
  if (!request?.protectedAtAdmission) return;
  request.assertActive();
  // Preserve the upstream narrow, signed current-job self-remove capability.
  if (request.method === 'cron.remove' && request.callerScope.currentJobId === request.jobId) return;
  if (cronManagementNamespaceDecision(request.callerScope) !== true) {
    throw new TypeError('Cron owner management authorization was revoked');
  }
}

/** Runs on staged job copies in both native validation and the locked update. */
export function prepareCronManagementPolicy(params) {
  const request = requestStorage.getStore();
  if (!request || request.method !== 'cron.update' || request.jobId !== params.job.id ||
      cronManagementNamespaceDecision(request.callerScope) !== true) return params;
  request.assertActive();
  const original = request.getJob();
  if (!original || cronManagementJobDecision({ job: original, callerScope: request.callerScope,
      defaultAgentId: request.defaultAgentId }) !== true) {
    throw new TypeError('Cron owner authority changed before update');
  }
  if (!params.explicitlyMutatesToolsAllow && params.previouslyUsedToolRuntime) return params;
  const previousCap = original.payload?.toolsAllow;
  const nextCap = params.job.payload?.toolsAllow;
  // Cross-group management must not turn into a larger execution grant. The native
  // tool cap, account policy, sandbox and host exec checks remain in force too.
  if (Array.isArray(previousCap) && (!Array.isArray(nextCap) ||
      nextCap.some((tool) => !previousCap.includes(tool)))) {
    throw new TypeError('Cron owner update cannot expand the existing toolsAllow cap; explicit operator reauthorization required');
  }
  if (!['agentTurn', 'script'].includes(params.job.payload?.kind) && !params.job.trigger) return params;
  if (nextCap === undefined) return params;
  const owner = { ...original.owner,
    agentId: original.owner?.agentId ?? request.callerScope.agentId,
    sessionKey: original.owner?.sessionKey ?? request.callerScope.sessionKey,
    accountId: original.owner?.accountId ?? request.callerScope.accountId };
  params.job.owner = owner;
  // Keep the original execution origin, including an existing group's policy.
  // Legacy missing ownership is adopted here, inside native validated persistence.
  // No public owner field, raw database edits, trusted-policy promotion or re-keying.
  return { ...params, scheduledToolPolicy: { version: 1, mode: 'account',
    ownerSessionKey: owner.sessionKey, ownerAccountId: owner.accountId } };
}
