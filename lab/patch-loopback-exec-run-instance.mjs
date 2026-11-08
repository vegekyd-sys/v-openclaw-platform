import assert from 'node:assert/strict';

// /vcc (claude-cli) cron in group oc_fab91abe (十二家, V 2026-11-08 08:00 and 09:09 CST): every
// `mcp__openclaw__exec` call, even `echo ok`, failed with "Secret egress proxy requires an admitted
// agent run instance", so the daily brief never read the calendar or the family mailbox.
//
// A CLI backend whose grant carries an explicit tool list (the cron's toolsAllow) gets OpenClaw's
// own exec over the MCP loopback ("mediated" coding tools). With the secret egress proxy active,
// exec registers the subprocess against the run's operational instance; the loopback built that
// exec without one, although the grant is bound to exactly one admitted run. CLI turns with a `*`
// tool list use the CLI's native shell and are unaffected.
//
// loopback-exec-run-instance-v1:
// - mcp-http: pass the bound grant's admitted operationalRunInstance into tool resolution and key
//   the loopback tool cache by it (unbound requests pass none and still fail closed);
// - tool-resolution: hand it to createOpenClawCodingTools for the mediated coding tools.
//
// Source: openclaw-versa versa/fix-loopback-exec-run-instance-20261108 (647f1203f38), on
// versa/port-cron-native-creator-20261107 (595ee2bf4aa).

export const MARKER = 'loopback-exec-run-instance-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/mcp-http-BL3X6y4w.js
export function patchMcpHttp(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `			params.sessionId ?? "",
			params.runId ?? "",
			params.workspaceDir ?? "",`,
    `			params.sessionId ?? "",
			params.runId ?? "",
			// ${MARKER}: a cached row must never hand one run's exec to another run.
			params.operationalRunInstance ? \`\${params.operationalRunInstance.instanceId}/\${params.operationalRunInstance.runId}\` : "",
			params.workspaceDir ?? "",`,
    'cache key');
  out = replaceExactlyOnce(out,
    `					sessionId: requestContext.sessionId,
					runId: requestContext.runId,
					workspaceDir: requestContext.workspaceDir,
					cwd: requestContext.cwd,`,
    `					sessionId: requestContext.sessionId,
					runId: requestContext.runId,
					...boundClientGrant ? { operationalRunInstance: boundClientGrant.admittedRunContext.operationalRunInstance } : {},
					workspaceDir: requestContext.workspaceDir,
					cwd: requestContext.cwd,`,
    'tool cache resolve');
  return out;
}

// core/dist/tool-resolution-Con11qMn.js
export function patchToolResolution(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `		runSessionKey: params.sessionKey,
		sessionId: params.sessionId,
		runId: params.runId,
		workspaceDir,
		cwd: params.cwd?.trim() || workspaceDir,`,
    `		runSessionKey: params.sessionKey,
		sessionId: params.sessionId,
		runId: params.runId,
		// ${MARKER}: mediated exec registers secret egress against the grant's admitted run.
		operationalRunInstance: params.operationalRunInstance,
		workspaceDir,
		cwd: params.cwd?.trim() || workspaceDir,`,
    'mediated coding tools');
}

export const FILES = [
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'mcp-http-BL3X6y4w.js',
    before: '6a1e20fca020096809a48fc2882e147084144c620004c2ebca23697c563d0371',
    patch: patchMcpHttp,
  },
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'tool-resolution-Con11qMn.js',
    before: 'aa63296c842b933f1c50fc8f879b3e82446766b4549758e60ef297b42b8d33a8',
    patch: patchToolResolution,
  },
];
