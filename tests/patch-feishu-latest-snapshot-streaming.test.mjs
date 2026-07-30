import assert from "node:assert/strict";
import test from "node:test";

import { patchFeishuStreamingBundle } from "../scripts/patch-feishu-latest-snapshot-streaming.mjs";

const officialFixture = `
function createReplyDispatcher() {
\tlet partialUpdateQueue = Promise.resolve();
\tlet streamingStartPromise = null;
\tconst flushStreamingCardUpdate = (combined) => {
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\tif (streaming?.isActive()) await streaming.update(combined);
\t\t});
\t};
\tconst queueStreamingUpdate = (nextText, options) => {
\t\tif ((options?.mode ?? "snapshot") === "delta") streamText = \`\${streamText}\${nextText}\`;
\t};
\tconst resetStreamingState = () => {
\t\tpartialUpdateQueue = Promise.resolve();
\t\tstreamText = "";
\t};
}
`;

test("patch keeps only the latest pending Feishu streaming snapshot", () => {
  const result = patchFeishuStreamingBundle(officialFixture);

  assert.equal(result.changed, true);
  assert.match(result.source, /let latestStreamingCombined = null;/);
  assert.match(result.source, /while \(latestStreamingCombined !== null\)/);
  assert.match(
    result.source,
    /streamText = mergeStreamingText\(streamText, nextText\);/,
  );
  assert.doesNotMatch(
    result.source,
    /streamText = `\$\{streamText\}\$\{nextText\}`;/,
  );
});

test("patch is idempotent", () => {
  const first = patchFeishuStreamingBundle(officialFixture);
  const second = patchFeishuStreamingBundle(first.source);

  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
});

test("patch rejects a partially modified bundle", () => {
  const partial = officialFixture.replace(
    "\tlet streamingStartPromise = null;",
    "\tlet streamingFlushScheduled = false;\n\tlet latestStreamingCombined = null;\n\tlet streamingStartPromise = null;",
  );

  assert.throws(
    () => patchFeishuStreamingBundle(partial),
    /partially patched/,
  );
});
