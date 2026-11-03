import assert from 'node:assert/strict';

// Switching a session's model must not overwrite its thinking level (V 2026-10-28).
//
// On 9.1, when the newly selected model does not support the session's thinking level, three
// places write the clamped level back into the session entry:
//   - directive-only messages ("/Grok" alone): directive-handling.impl
//   - inline directives and the /model picker: apply-session-model-selection
//   - Gateway sessions.patch with a model change (Control UI, Feishu model card): sessions-patch
// 9.1 registers xai/grok-4.7 with thinking levels [off] only, so every switch to Grok stores
// thinkingLevel=off. Switching back to DeepSeek keeps that off and DeepSeek answers without
// reasoning (V 2026-10-28 22:19 worker test group: S1 effort=low with thinking events, S3 after
// /Grok -> /deepseek no effort and no thinking events).
//
// A fourth write-back sits on the vlab-worker path: the Gateway forwards its per-turn level to the
// Worker's agentCommand as `thinking` (harness-event-contract.mjs FORWARDED_HARNESS_OPTIONS), which
// is the persistent override (`openclaw agent --thinking`). Every Worker turn therefore stores its
// effective level (V: 310 makaron channel sessions hold "high"), and a Grok turn stores "off"
// (V 2026-10-28 /vcodex test group: unset before, "off" after a Grok turn, no notice). It is now
// forwarded as `thinkingOnce`; agentCommand resolves thinkOnce ?? thinkOverride ?? stored, so the
// turn runs at the same level and nothing is stored.
//
// thinking-preserve-on-switch-v1 backports the core of upstream openclaw b22f886cdc9 (#169435,
// "fix: preserve thinking preferences when switching models"): the session keeps the level the
// user asked for, and only the run clamps it. 9.1 already clamps turn-locally in run admission
// (get-reply: "Execution fallbacks are turn-local") and per fallback candidate, so removing the
// write-back is sufficient. The "Thinking level set to X (Y not supported ...)" notice stays: it
// is still true for the model just selected.

export const MARKER = 'thinking-preserve-on-switch-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// dist/directive-handling.impl-CoR1-5xR.js
export function patchDirectiveHandling(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `	if (shouldRemapUnsupportedThinkLevel && !touchedSessionFields.includes("thinkingLevel")) touchedSessionFields.push("thinkingLevel");
`,
    `	// ${MARKER}: a model switch keeps the stored thinking level; runs clamp it per turn.
`,
    'directive remap touched field');
  out = replaceExactlyOnce(out,
    `		if (shouldRemapUnsupportedThinkLevel && remappedUnsupportedThinkLevel) sessionEntry.thinkingLevel = remappedUnsupportedThinkLevel;
`,
    '',
    'directive remap write-back');
  return out;
}

// dist/apply-session-model-selection-CJtWmAQJ.js
export function patchApplySessionModelSelection(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `		if (remapped !== currentThinkingLevel) {
			nextEntry.thinkingLevel = remapped;
			thinkingRemap = {`,
    `		if (remapped !== currentThinkingLevel) {
			// ${MARKER}: report the clamp for this model, keep the stored level.
			thinkingRemap = {`,
    'model selection remap write-back');
  out = replaceExactlyOnce(out,
    `	const changed = applied.changed || thinkingRemap !== void 0;`,
    `	const changed = applied.changed;`,
    'model selection changed flag');
  return out;
}

// dist/sessions-patch-iR7MNInU.js
export function patchSessionsPatch(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `				if ("thinkingLevel" in patch) return invalid(\`thinkingLevel "\${thinkingLevel}" is not supported for \${effectiveProvider}/\${effectiveModel} (use \${formatThinkingLevels(effectiveProvider, effectiveModel, "|", thinkingCatalog, thinkingRuntime)})\`);
				next.thinkingLevel = resolveSupportedThinkingLevel({
					provider: effectiveProvider,
					model: effectiveModel,
					level: thinkingLevel,
					catalog: thinkingCatalog,
					agentRuntime: thinkingRuntime
				});
`,
    `				if ("thinkingLevel" in patch) return invalid(\`thinkingLevel "\${thinkingLevel}" is not supported for \${effectiveProvider}/\${effectiveModel} (use \${formatThinkingLevels(effectiveProvider, effectiveModel, "|", thinkingCatalog, thinkingRuntime)})\`);
				// ${MARKER}: a model-only patch keeps the stored level; runs clamp it per turn.
`,
    'sessions.patch model remap');
}

// production-worker/harness-event-contract.mjs (same bytes as experiments/agent-worker-isolation-v1/)
export function patchHarnessEventContract(source) {
  return replaceExactlyOnce(source,
    `  thinkLevel: "thinking",
`,
    `  // The Gateway's per-turn level (clamped to the turn's model), not a session setting to store.
  thinkLevel: "thinkingOnce",
`,
    'forwarded thinkLevel');
}

export const FILES = [
  { name: 'directive-handling.impl-CoR1-5xR.js', before: 'd0759e8925b33031661502017d0be04972168bd4b17da6254112b86ab719175a', patch: patchDirectiveHandling },
  { name: 'apply-session-model-selection-CJtWmAQJ.js', before: 'b83769d1e23f0a1f4f3ca9ab0eeb8f4ff9697f337469abdafb493095d4acfcd0', patch: patchApplySessionModelSelection },
  { name: 'sessions-patch-iR7MNInU.js', before: '78264539e088ae8bf356265db624c73ed5085b63c419a77ea6852d067ed9b36a', patch: patchSessionsPatch },
].map((file) => ({ ...file, base: 'core/dist', target: 'openclaw/dist' })).concat([
  { name: 'harness-event-contract.mjs', base: 'worker', target: 'production-worker', before: 'a25315d7fc782c2e7ac2c85739e281a42e8f39ad51e2eb1ee84bd24ee8fd1e4c', patch: patchHarnessEventContract },
]);
