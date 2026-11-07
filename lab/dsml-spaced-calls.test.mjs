import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, PREFACE_MARKER } from './patch-dsml-spaced-calls.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = 'lab/release-files/dsml-spaced-calls';
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/dsml-spaced-calls.plan.json'), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const [file] = FILES;
const out = read(file.name);

test('plan lists the patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [`${file.target}/${file.name}`]);
  assert.equal(plan.files[0].before, file.before);
});

test('release file carries both markers, parses, and refuses a second patch', () => {
  assert(out.includes(MARKER) && out.includes(PREFACE_MARKER));
  assert.throws(() => file.patch(out), /already patched/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

// The grammar and text-filter regions are self-contained; run them on the tags V actually saw.
const grammar = (() => {
  const start = out.indexOf('const DEEPSEEK_DSML_MARKERS = [');
  const end = out.indexOf('const MAX_OPEN_TOKEN_LEN');
  return new Function(`${out.slice(start, end)}\nreturn { DEEPSEEK_DSML_MARKERS, DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS, DSML_OPEN_TOKENS, DEEPSEEK_DSML_MARKER_PATTERN };`)();
})();

test('the spaced doubled-bar form and the calls wrapper are recognised by recovery and filtering', () => {
  for (const tag of ['<｜｜DSML｜｜ calls>', '<｜｜DSML｜｜calls>', '<｜｜DSML｜｜ tool_calls>', '<|DSML|tool_calls>', '<｜DSML｜function_calls>']) {
    assert(grammar.DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS.includes(tag), tag);
    assert(grammar.DSML_OPEN_TOKENS.includes(tag), `filter: ${tag}`);
  }
  assert(grammar.DSML_OPEN_TOKENS.includes('<｜｜DSML｜｜ tool_use_error>'));
  const invoke = new RegExp(`^<${grammar.DEEPSEEK_DSML_MARKER_PATTERN}invoke\\b[^<>]*>$`);
  assert(invoke.test('<｜｜DSML｜｜ invoke name="exec">'), 'spaced invoke');
  assert(invoke.test('<｜｜DSML｜｜invoke name="exec">'), 'compact invoke (unchanged)');
  const param = new RegExp(`<${grammar.DEEPSEEK_DSML_MARKER_PATTERN}parameter\\b([^>]*)>([\\s\\S]*?)</\\1parameter>`, 'g');
  const m = param.exec('<｜｜DSML｜｜ parameter name="command" string="true">ls</｜｜DSML｜｜ parameter>');
  assert(m && m[3] === 'ls', 'spaced parameter closes on the spaced closer');
});

test('the recoverer and the filter share one wrapper list; direct calls filter but never recover', () => {
  assert(out.includes('const DEEPSEEK_DSML_TOOL_OPEN_TOKENS = DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS;'));
  assert(out.includes('const shouldFilterDeepSeekDsmlText = compat.thinkingFormat === "deepseek";'));
  assert(out.includes('const deepSeekToolCallRecoverer = !directMode && shouldFilterDeepSeekDsmlText ? createDsmlRecoverer() : null;'));
});

test('only recovered DSML calls with nothing visible after them are promoted past a preface', () => {
  const at = out.indexOf(`// ${PREFACE_MARKER}: a closed DSML call after a preface sentence is a tool turn`);
  assert(at > 0 && at < out.indexOf('finalizeOpenAICompletionsToolCalls(output, {', at));
  const block = out.slice(at, out.indexOf('finalizeOpenAICompletionsToolCalls(output, {', at));
  assert(block.includes('output.stopReason === "stop" && finishReason === "stop"'));
  assert(block.includes('recoveredDsmlToolCalls.has(block)'));
  assert(block.includes('.slice(lastToolCallIndex + 1).some((block) => block.type === "text" && block.text.trim().length > 0)'));
  assert(out.includes(`recoveredDsmlToolCalls.add(block); // ${PREFACE_MARKER}`));
});
