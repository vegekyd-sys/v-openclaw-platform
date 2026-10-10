import assert from 'node:assert/strict';

// Worker prewarm validates the canonical session keys itself (worker-prewarm-session-keys),
// on top of the worker-prewarm-secrets agent-command chunk (V's live bytes, #254).
//
// Prewarm already opens the agent database and resolves one session read-only, and that read
// normally runs the one-time canonical session-key scan on the process's writable handle.
// Private VLab candidate 2026-10-08 (5 Workers, 8 concurrent cold turns, Worker CPU profiles):
// four Workers scanned once in prewarm; the fifth did not, and its cold turn scanned twice on
// fresh read-only connections (4.2 s + 1.1 s CPU after worker-command-enter, command->model
// 10.2 s, the slowest turn of the run). This step makes the scan explicit and independent of
// resolveSession and of the writable open (which can fail on its lease): it validates the
// database on a read-only connection before that open, and with canonical-scan-path-cache
// (same PR) the validated file then covers the writable handle and every later read-only
// connection in this process. Errors are reported and never fail prewarm.
// OPENCLAW_WORKER_EAGER_PREPARE_SESSION_KEYS=0 turns it off.

export const MARKER = '/* OPENCLAW_WORKER_PREWARM_SESSION_KEYS_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const ORIGINAL_OPEN = `	openOpenClawAgentDatabase({ agentId: normalizeAgentId(params.agentId) });
	resolveSession({`;
export const PATCHED_OPEN = `	const sessionKeys = process.env.OPENCLAW_WORKER_EAGER_PREPARE_SESSION_KEYS === "0" ? {} : await prewarmCanonicalSessionKeys(normalizeAgentId(params.agentId));
	openOpenClawAgentDatabase({ agentId: normalizeAgentId(params.agentId) });
	resolveSession({`;
export const ORIGINAL_SECRETS_FN = `/** Activate the secrets runtime snapshot a first turn's resolveAgentRuntimeConfig builds`;
export const SESSION_KEYS_FN = `${MARKER}
/** Run the canonical session-key scan for this agent's database now, on a read-only
 * connection, so no turn pays it. Runs before the writable open, so a failed open or lease
 * does not skip it. Read-only. */
async function prewarmCanonicalSessionKeys(agentId) {
	try {
		const [{ p: assertCanonicalSqliteSessionKeysCurrent }, { n: withOpenClawAgentDatabaseReadOnly }] = await Promise.all([import("./session-accessor.sqlite-transcript-state-Cz9g7S9v.js"), import("./openclaw-agent-db-readonly-wb-jdztx.js")]);
		const started = performance.now();
		const read = withOpenClawAgentDatabaseReadOnly((database) => assertCanonicalSqliteSessionKeysCurrent(database), { agentId });
		return { sessionKeysPrepared: read.found, sessionKeysMs: Math.round(performance.now() - started), ...read.found ? {} : { sessionKeysReason: read.reason } };
	} catch (error) {
		return { sessionKeysPrepared: false, sessionKeysError: String(error?.message ?? error).slice(0, 200) };
	}
}
`;

export function patchAgentCommandChunk(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(source, ORIGINAL_OPEN, PATCHED_OPEN, 'prewarm database open');
  out = replaceExactlyOnce(
    out,
    `	if (process.env.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0") return { sessionStorePrepared: true, ...secrets };
	return {
		sessionStorePrepared: true,
		...secrets,`,
    `	if (process.env.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0") return { sessionStorePrepared: true, ...sessionKeys, ...secrets };
	return {
		sessionStorePrepared: true,
		...sessionKeys,
		...secrets,`,
    'prewarm returns',
  );
  out = replaceExactlyOnce(out, ORIGINAL_SECRETS_FN, `${SESSION_KEYS_FN}${ORIGINAL_SECRETS_FN}`, 'secrets helper');
  return out;
}
