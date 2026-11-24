import assert from 'node:assert/strict';

// Night Shift cards and other subagent runs keep the Codex native shell (V 2026-11-24).
//
// On V a Night Shift card runs as a Workboard subagent. Subagent runs deny OpenClaw's session and agent
// coordination tools by default (agents_list, session_status, sessions_send, sessions_list/_history/_search,
// sessions_spawn, subagents, conversations_list/_send/_turn; agent-tools.policy SUBAGENT_TOOL_DENY_*). None of
// them was in the Codex harness's safe-deny list, so core marked every such run tool-policy restricted and
// the Codex plugin turned off its native tools: no exec_command/write_stdin, only OpenClaw exec. On
// 2026-11-24 (12:00-) 898 card threads made 0 native shell calls and 30,692 OpenClaw exec calls; the 134 chat
// threads used the native shell (2,381 exec_command). OpenClaw exec runs under the secret egress proxy, so
// nightshiftctl to the local Night Shift service failed there ("fetch failed", 924 of 934 plain calls) while
// the same command works in chat. Agents then searched the disk for the cause (three recursive greps that day).
//
// card-native-shell-v1 (source: vegekyd-sys/openclaw-versa versa/port-card-native-shell-20261124):
// - harness: these OpenClaw-only tools join CODEX_TOOL_POLICY_SAFE_DENY_NAMES. Codex has no native
//   counterpart for them except multi-agent delegation;
// - thread-lifecycle: when sessions_spawn or subagents is safe-denied, the thread config also sets
//   agents.enabled / features.multi_agent / features.multi_agent_v2 to false, and the preflight refuses
//   managed requirements that pin those features on (as it already does for image_generation).
// Every other deny stays fail-closed, so a run denied exec, read, browser etc. still loses the native tools.

export const MARKER = 'card-native-shell-v1';

const NEW_SAFE_DENY = [
  'agents_list',
  'session_status',
  'sessions_list',
  'sessions_history',
  'sessions_search',
  'sessions_send',
  'sessions_spawn',
  'subagents',
  'conversations_list',
  'conversations_send',
  'conversations_turn',
];

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source, name) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to ${name}`);
}

export function patchHarness(source) {
  guard(source, 'harness-DXVZ5II5.js');
  return replaceExactlyOnce(source,
    '	"video_generate",\n	"tts"\n];\n',
    `	"video_generate",
	"tts",
	// ${MARKER}: OpenClaw-only session/agent tools that subagent and Workboard card runs deny by default.
	// Codex has no native counterpart except delegation, which a sessions_spawn/subagents deny turns off.
${NEW_SAFE_DENY.map((name) => `	"${name}"`).join(',\n')}
];
`,
    'CODEX_TOOL_POLICY_SAFE_DENY_NAMES end');
}

export function patchThreadLifecycle(source) {
  guard(source, 'thread-lifecycle-DAcEJ_Om.js');
  let out = replaceExactlyOnce(source,
    'const CODEX_DELEGATION_DISABLED_THREAD_CONFIG = {\n	"agents.enabled": false,\n	"features.multi_agent": false,\n	"features.multi_agent_v2": false\n};\n',
    `const CODEX_DELEGATION_DISABLED_THREAD_CONFIG = {
	"agents.enabled": false,
	"features.multi_agent": false,
	"features.multi_agent_v2": false
};
// ${MARKER}: a safe deny of sessions_spawn or subagents also covers Codex's native delegation.
const CODEX_NATIVE_DELEGATION_TOOL_NAMES = ["sessions_spawn", "subagents"];
const CODEX_NATIVE_DELEGATION_FEATURES = ["multi_agent", "multi_agent_v2"];
function codexNativeDelegationDenied(params) {
	return CODEX_NATIVE_DELEGATION_TOOL_NAMES.some((name) => params.pluginHarnessToolPolicySafeDeniedTools?.includes(name));
}
`,
    'CODEX_DELEGATION_DISABLED_THREAD_CONFIG');
  out = replaceExactlyOnce(out,
    'params.pluginHarnessToolPolicySafeDeniedTools?.includes("image_generate") ? { "features.image_generation": false } : void 0, shouldDisableCodexToolSearchForModel(',
    'params.pluginHarnessToolPolicySafeDeniedTools?.includes("image_generate") ? { "features.image_generation": false } : void 0, codexNativeDelegationDenied(params) ? CODEX_DELEGATION_DISABLED_THREAD_CONFIG : void 0, shouldDisableCodexToolSearchForModel(',
    'thread config image_generation patch');
  out = replaceExactlyOnce(out,
    `	const imageGenerationDenied = params.params.pluginHarnessToolPolicySafeDeniedTools?.includes("image_generate") === true;
`,
    `	const imageGenerationDenied = params.params.pluginHarnessToolPolicySafeDeniedTools?.includes("image_generate") === true;
	const additionalDeniedFeatures = [...imageGenerationDenied ? ["image_generation"] : [], ...codexNativeDelegationDenied(params.params) ? CODEX_NATIVE_DELEGATION_FEATURES : []];
`,
    'preflight imageGenerationDenied');
  out = replaceExactlyOnce(out,
    '	if (restrictedToolSurface || imageGenerationDenied) await lifecycleTiming.measure("tool-policy-config-requirements-read"',
    '	if (restrictedToolSurface || additionalDeniedFeatures.length > 0) await lifecycleTiming.measure("tool-policy-config-requirements-read"',
    'preflight requirements read condition');
  out = replaceExactlyOnce(out,
    '		additionalDeniedFeatures: imageGenerationDenied ? ["image_generation"] : void 0,\n',
    '		additionalDeniedFeatures: additionalDeniedFeatures.length > 0 ? additionalDeniedFeatures : void 0,\n',
    'preflight additionalDeniedFeatures');
  return out;
}

const CODEX = 'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist';

export const FILES = [
  { name: 'harness-DXVZ5II5.js', base: 'lab/release-files/background-work-20261002/vlab-codex-parity', target: CODEX, before: '2903634b801db3ed43e4374a6be6c2770d9745229ef705ef87729a3e83bdcfb2', patch: patchHarness },
  { name: 'thread-lifecycle-DAcEJ_Om.js', base: 'lab/release-files/codex-turn-context-handoff/dist', target: CODEX, before: 'bdb000d570172024f7b4c2b1e6ae74706ec68368aa7d1736e2af94ab39b7f99a', patch: patchThreadLifecycle },
];

export { NEW_SAFE_DENY };
