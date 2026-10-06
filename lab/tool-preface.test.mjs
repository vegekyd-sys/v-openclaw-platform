import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PREFACE_LINES, patchSystemPromptParams } from './patch-tool-preface.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const original = read('./fixtures/tool-preface/system-prompt-params-B645JcX8.js');
const released = read('./release-files/tool-preface/system-prompt-params-B645JcX8.js');

test('the release file is V\'s system prompt module with only the tool call style change', () => {
  assert.equal(patchSystemPromptParams(original), released);
  assert.throws(() => patchSystemPromptParams(released), /tool call style lines/);
  const removed = original.split('\n').filter((line) => !released.includes(line));
  assert.deepEqual(removed, ['\t\t\t\t\t"Routine low-risk: call silently.",', '\t\t\t\t\t"Narrate only complex, sensitive/destructive, or requested steps.",']);
});

test('full prompts get the preface rule, minimal (subagent) prompts keep silent calls', () => {
  const fn = released.slice(released.indexOf('function buildAgentSystemPrompt(params)'), released.indexOf('function buildConfiguredAgentSystemPrompt('));
  const defined = fn.indexOf('const isMinimal = promptMode === "minimal";');
  const used = fn.indexOf('...isMinimal ? ["Routine low-risk: call silently."');
  assert.ok(defined > 0 && used > defined, 'isMinimal is in scope where the rule is chosen');
  const branch = fn.slice(used, fn.indexOf('"First-class tool exists', used));
  for (const line of PREFACE_LINES) assert.ok(branch.includes(JSON.stringify(line)));
  // the provider override still replaces the whole section
  assert.match(fn, /override: providerSectionOverrides\.tool_call_style,\n\t\t\t\tfallback: \[\n\t\t\t\t\t"## Tool Call Style",\n\t\t\t\t\t\/\/ tool-preface/);
});

test('the rule is one short sentence before the first tool call only', () => {
  assert.match(PREFACE_LINES[0], /one short sentence/);
  assert.match(PREFACE_LINES[0], /Once per turn/);
  assert.match(PREFACE_LINES[0], /no preface when no tool is needed or the reply will be silent/);
});
