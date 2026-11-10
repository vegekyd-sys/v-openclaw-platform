import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-skill-review-bounded.mjs';
import { OUTPUT_DIR, PLAN } from './build-skill-review-bounded.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const PROMPT = 'experience-review-prompt-D7yNaj4l.js';
const REVIEW = 'experience-review-default-Dr4f0pMZ.js';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const truncateUtf16Safe = (text, max) => text.slice(0, max);

function regionFunctions(source, startMarker, endMarker, names) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `region ${startMarker}`);
  return new Function('isRecord', 'truncateUtf16Safe', `${source.slice(start, end)}\nreturn { ${names.join(', ')} };`)(isRecord, truncateUtf16Safe);
}

const evidence = regionFunctions(read(PROMPT), '//#region src/skills/workshop/experience-review-evidence.ts', '//#endregion\nexport {', ['shortenSkillReviewEvidence', 'measureSkillReviewEvidence']);

test('plan lists every patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
  for (const f of plan.files) assert.equal(f.source, `${OUTPUT_DIR}/${path.basename(f.target)}`);
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), file.name);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(sha(out), file.before);
  }
});

test('evidence shortening keeps one entry per event and drops bulk', () => {
  const image = { type: 'image', data: 'A'.repeat(200_000), mimeType: 'image/png' };
  const entries = [
    { type: 'session', id: 's' },
    { type: 'message', id: 'u', message: { role: 'user', content: [{ type: 'text', text: 'go' }, image] } },
    { type: 'message', id: 'a', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 't'.repeat(9_000) }, { type: 'toolCall', id: 'c', name: 'write', arguments: { path: '/x', content: 'c'.repeat(40_000) } }] } },
    { type: 'message', id: 'r', message: { role: 'toolResult', toolCallId: 'c', content: [{ type: 'text', text: 'r'.repeat(120_000) }], details: { big: 'd'.repeat(50_000) } } },
    { type: 'compaction', id: 'k', summary: 's'.repeat(20_000) },
  ];
  const out = evidence.shortenSkillReviewEvidence(entries);
  assert.equal(out.length, entries.length);
  assert.equal(out[1].message.content[1].text, '[image omitted from review evidence]');
  assert.deepEqual(out[2].message.content.map((b) => b.type), ['toolCall']);
  assert(out[2].message.content[0].arguments.content.length < 700);
  assert(out[3].message.content[0].text.length < 900);
  assert(!('details' in out[3].message));
  assert(out[4].summary.length < 4_100);
  const measured = evidence.measureSkillReviewEvidence(out);
  assert.equal(measured.events, 4);
  assert(measured.totalBytes < 8_000, String(measured.totalBytes));
});

test('evidence budget keeps only the newest events within 32 KiB', () => {
  const entries = Array.from({ length: 64 }, (_, i) => ({ type: 'message', id: `m${i}`, message: { role: 'user', content: `${i}:${'x'.repeat(3_000)}` } }));
  const measured = evidence.measureSkillReviewEvidence(evidence.shortenSkillReviewEvidence(entries));
  assert.equal(measured.events, 64);
  assert(measured.fittingEvents >= 8 && measured.fittingEvents < 64, String(measured.fittingEvents));
  assert(measured.fittingBytes <= 32_768);
});

test('writable skill list shows every skill (up to 400) with size-cap tags', () => {
  const src = read(PROMPT);
  const start = src.indexOf('const EXPERIENCE_REVIEW_MAX_WRITABLE_SKILL_ENTRIES');
  const end = src.indexOf('function compareRunSkillUsage', start);
  const render = new Function('truncateUtf16Safe', `${src.slice(start, end)}\nreturn renderExistingSkillsSection;`)(truncateUtf16Safe);
  const lines = render(Array.from({ length: 450 }, (_, i) => ({ name: `skill-${i}`, description: 'd'.repeat(500), userAuthored: i === 0, atSizeCap: i === 1 })));
  assert(lines.some((l) => l.startsWith('- skill-0 (user-authored) — ')));
  assert(lines.some((l) => l.startsWith('- skill-1 (at size cap) — ')));
  assert(lines.some((l) => l.startsWith('- skill-399 — ')));
  assert(!lines.some((l) => l.startsWith('- skill-400 ')));
  assert(lines.includes('(+50 more not shown)'));
  assert(lines.filter((l) => l.startsWith('- skill-')).every((l) => l.length <= 120));
});

test('the review runs bounded: evidence, params, yield and cooldown are wired', () => {
  const src = read(REVIEW);
  assert(!src.includes('SessionManager.openModelContext(foregroundSessionTarget, { cwd: workspaceDir })'), 'whole-session read is gone');
  assert.match(src, /const evidence = openSkillReviewEvidence\(foregroundSessionTarget, workspaceDir\);/u);
  for (const param of ['toolsAllow: ["skill_workshop"],', 'promptMode: "minimal",', 'bootstrapContextMode: "lightweight",', 'skillsSnapshot: void 0,', 'extraSystemPrompt: void 0,', 'thinkLevel: "low",', 'streamParams: { maxTokens: EXPERIENCE_REVIEW_MAX_OUTPUT_TOKENS },', 'abortSignal: yieldController.signal,']) {
    assert(src.includes(param), param);
  }
  assert.match(src, /const EXPERIENCE_REVIEW_SESSION_COOLDOWN_MS = 864e5;/u);
  assert.match(src, /reason=session-cooldown/u);
  assert.match(src, /expireStaleAutonomousSkillProposals\(\{/u);
  // The yield never abandons a spent mutation.
  assert.match(src, /if \(yieldController\.signal\.aborted \|\| proposalMutationBudget\.remaining < 1\) return;/u);
  assert.match(src, /if \(yieldController\.signal\.aborted && proposalMutationBudget\.remaining >= 1\) throw new SkillExperienceReviewYieldedError\(\);/u);
});
