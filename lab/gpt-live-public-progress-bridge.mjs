import assert from "node:assert/strict";

const marker = "// gpt-live-public-progress-bridge-v1: classified public preambles only.";
const beforeFilter = "    if (!publicStreams.has(event?.stream) || !event.data || typeof event.data !== 'object') continue;";
const afterFilter = `    ${marker}
    const data = event?.data;
    if (!data || typeof data !== 'object') continue;
    const publicPreamble = event.stream === 'item' && data.kind === 'preamble' &&
      (data.phase === 'update' || data.phase === 'end') && !data.isReasoning &&
      typeof data.progressText === 'string' && data.progressText.trim().length > 0;
    if (!publicStreams.has(event?.stream) && !publicPreamble) continue;
    // Only the public text projection crosses this new item boundary.
    // Gateway-issued routing below still replaces all child ownership fields.
    const publishedData = publicPreamble ? {
      kind: 'preamble', phase: data.phase, progressText: data.progressText,
      ...(typeof data.itemId === 'string' ? { itemId: data.itemId } : {}),
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
    } : data;`;
const beforeData = "      data: event.data,";
const afterData = "      data: publishedData,";

/** Patch the real Worker callback-to-Gateway bus bridge, without new transport. */
export function patchGptLivePublicProgressBridge(source) {
  assert.equal(typeof source, "string", "Worker public stream source must be text");
  if (source.includes(marker)) {
    assert.equal(source.split(afterFilter).length - 1, 1, "Worker public preamble patch is partial or ambiguous");
    assert.equal(source.split(afterData).length - 1, 1, "Worker public preamble data patch is partial or ambiguous");
    return source;
  }
  assert.equal(source.split(beforeFilter).length - 1, 1, "Worker public stream filter anchor drifted");
  assert.equal(source.split(beforeData).length - 1, 1, "Worker public stream data anchor drifted");
  return source.replace(beforeFilter, afterFilter).replace(beforeData, afterData);
}
