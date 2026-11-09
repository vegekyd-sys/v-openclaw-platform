import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PATCHES, patchSource } from "../scripts/apply-noop-mutation-nonterminal-patch.mjs";

const T = "\t";
const sessions = [
  `${T.repeat(5)}if (realEdits.length === 0) return {`,
  `${T.repeat(6)}...textResult(\`No changes made to \${path}. The replacement text is identical to the original.\`, { changed: false }),`,
  `${T.repeat(6)}terminate: true`,
  `${T.repeat(5)}};`,
  `${T.repeat(5)}if (normalizedError instanceof EditNoChangeError) return {`,
  `${T.repeat(6)}...textResult(\`No changes made to \${path}. The replacement produced identical content.\`, { changed: false }),`,
  `${T.repeat(6)}terminate: true`,
  `${T.repeat(5)}};`,
  `${T.repeat(4)}if (precheck.state === "same") return {`,
  `${T.repeat(5)}...textResult(\`No changes made to \${path}. The file already has identical content.\`, { changed: false }),`,
  `${T.repeat(5)}terminate: true`,
  `${T.repeat(4)}};`,
  "",
].join("\n");
const codingTools = `${T.repeat(3)}return {\n${T.repeat(4)}details: { summary: result.summary },\n${T.repeat(4)}...result.noOp ? { terminate: true } : {}\n${T.repeat(3)}};\n// apply_patch\n`;

test("no-op edit, edit-no-change and write results stop carrying terminate", () => {
  const { changed, source } = patchSource(sessions, PATCHES.sessions);
  assert.equal(changed, 3);
  assert.equal(source.includes("terminate"), false);
  assert.match(source, /return textResult\(`No changes made to \$\{path\}\. The replacement text is identical to the original\.`, \{ changed: false \}\);/);
  assert.match(source, /return textResult\(`No changes made to \$\{path\}\. The file already has identical content\.`, \{ changed: false \}\);/);
});

test("a no-op apply_patch result stops carrying terminate", () => {
  const { changed, source } = patchSource(codingTools, PATCHES.codingTools);
  assert.equal(changed, 1);
  assert.equal(source.includes("terminate"), false);
  assert.match(source, /details: \{ summary: result\.summary \}\n/);
});

test("patching twice changes nothing and an unknown shape is refused", () => {
  const once = patchSource(sessions, PATCHES.sessions).source;
  assert.equal(patchSource(once, PATCHES.sessions).changed, 0);
  assert.throws(() => patchSource("function other() {}", PATCHES.sessions), /anchor must match exactly once/u);
});

test("the release bytes built from V carry no no-op terminate", () => {
  const dir = new URL("../lab/release-files/noop-mutation-nonterminal/", import.meta.url);
  const s = readFileSync(new URL("sessions-CHgQo4vL.js", dir), "utf8");
  const c = readFileSync(new URL("core-coding-tools-DYAE1EWB.js", dir), "utf8");
  for (const msg of ["The replacement text is identical to the original.", "The replacement produced identical content.`, { changed: false });", "The file already has identical content."]) assert.ok(s.includes(msg), msg);
  assert.equal(/identical[^\n]*\n\t+terminate: true/u.test(s), false);
  assert.equal(c.includes("result.noOp ? { terminate: true }"), false);
});
