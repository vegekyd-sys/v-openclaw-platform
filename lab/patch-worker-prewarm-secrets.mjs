import assert from 'node:assert/strict';

// Worker first-turn preparation, third step (worker-prewarm-secrets), on top of the
// worker-prewarm2-v agent command chunk.
//
// A Worker's first turn builds the secrets runtime snapshot inside resolveAgentRuntimeConfig:
// with no active snapshot it reads the config file for write, runs
// prepareSecretsRuntimeSnapshot and activates the result. That is synchronous CPU work on
// the turn's path before the model request. Shared VLab 2026-10-06 (gap marks round 3,
// cold 8-parallel): all 8 cold runs took the cold path, cmd-prep:config-resolved 780-1477 ms
// at 99-100% event loop busy; all 16 warm runs found the snapshot active, ~0 ms. Two cold
// runs that landed together on one Worker both saw no snapshot and both built it.
//
// This activates the same snapshot during the Worker's bounded, fail-open preparation,
// before `ready`, by calling resolveAgentRuntimeConfig the way a turn does. It is in memory
// only: the config file is read, nothing is written, and a turn later finds the snapshot
// active and skips the build. An already active snapshot is left alone.
// OPENCLAW_WORKER_EAGER_PREPARE=0 still turns all preparation off;
// OPENCLAW_WORKER_EAGER_PREPARE_SECRETS=0 turns off only this step.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchAgentCommandChunk(source) {
  let out = replaceExactlyOnce(
    source,
    `	if (process.env.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0") return { sessionStorePrepared: true };
	return {
		sessionStorePrepared: true,
		...prewarmWorkspaceSkillSnapshot(params, skillsRuntime, execDefaultsRuntime),`,
    `	const secrets = process.env.OPENCLAW_WORKER_EAGER_PREPARE_SECRETS === "0" ? {} : await prewarmSecretsRuntimeSnapshot();
	if (process.env.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0") return { sessionStorePrepared: true, ...secrets };
	return {
		sessionStorePrepared: true,
		...secrets,
		...prewarmWorkspaceSkillSnapshot(params, skillsRuntime, execDefaultsRuntime),`,
    'prewarm skills step',
  );
  out = replaceExactlyOnce(
    out,
    `/** Build the workspace skill snapshot a turn of a session without its own skill state`,
    `/** Activate the secrets runtime snapshot a first turn's resolveAgentRuntimeConfig builds
 * when none is active, so that turn finds it. In memory only. */
async function prewarmSecretsRuntimeSnapshot() {
	if (getActiveSecretsRuntimeConfigSnapshot()) return { secretsPrepared: true };
	try {
		await resolveAgentRuntimeConfig(defaultRuntime);
		return { secretsPrepared: Boolean(getActiveSecretsRuntimeConfigSnapshot()) };
	} catch (error) {
		return { secretsPrepared: false, secretsError: String(error?.message ?? error).slice(0, 200) };
	}
}
/** Build the workspace skill snapshot a turn of a session without its own skill state`,
    'skill snapshot prewarm doc',
  );
  return out;
}
