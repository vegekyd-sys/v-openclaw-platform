import { createHash } from 'node:crypto';

export const FILE = 'server-session-key-ZtX3Ble7.js';
export const MARKER = 'v-run-session-exact-read';
export const OLD = 'loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId })';
export const NEW = 'loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId, match: { sessionIds: [runId] } })';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export function patch(source) {
  if (source.includes(MARKER)) throw new Error('already patched');
  if (source.split(OLD).length !== 2) throw new Error('expected one run lookup anchor');
  // The following filter already requires entry.sessionId === runId. Use the deployed
  // indexed candidate reader before parsing entries; retain scope, alias selection,
  // incognito handling, context ownership and positive/negative cache semantics.
  return source.replace(OLD, NEW).replace('\tconst { store } = '+NEW,
    '\t// '+MARKER+': missing event context must not parse the entire agent store.\n\tconst { store } = '+NEW);
}
export function unpatch(source) {
  return source.replace('\t// '+MARKER+': missing event context must not parse the entire agent store.\n', '').replace(NEW, OLD);
}
