import assert from 'node:assert/strict';

// Tool preface (tool-preface), on V's 2026.9.1 bytes (system-prompt-params-B645JcX8.js is
// unmodified upstream on V).
//
// When V has to call a tool before it can answer, the Feishu card shows no answer text until
// the tool round is over: production V 2026-10-04..06, model call that produced the first
// answer text started after a tool round P50 5.8 s, max 24.6 s after the first model call.
// The built-in Tool Call Style section tells the model to make routine tool calls silently,
// so the first visible text waits for the tools.
//
// Change (full prompt only; subagents keep the original): when replying to a user message
// and a tool is needed first, open with one short sentence saying what V is about to do,
// once per turn, then call the tool. Later routine calls stay silent. No preface when no
// tool is needed or when the reply will be silent. A provider tool_call_style override
// still replaces the whole section, as before.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const PREFACE_LINES = [
  "Replying to a user message and a tool is needed first: open with one short sentence in the user's language saying what you're about to do, then call the tool. Once per turn; no preface when no tool is needed or the reply will be silent.",
  'Later routine low-risk calls: call silently. Narrate only complex, sensitive/destructive, or requested steps.',
];

export function patchSystemPromptParams(source) {
  return replaceExactlyOnce(
    source,
    `					"## Tool Call Style",
					"Routine low-risk: call silently.",
					"Narrate only complex, sensitive/destructive, or requested steps.",
`,
    `					"## Tool Call Style",
					// tool-preface: say one short sentence before the first tool call so the first
					// answer text does not wait for the tool round
					...isMinimal ? ["Routine low-risk: call silently.", "Narrate only complex, sensitive/destructive, or requested steps."] : [
						${JSON.stringify(PREFACE_LINES[0])},
						${JSON.stringify(PREFACE_LINES[1])}
					],
`,
    'tool call style lines',
  );
}
