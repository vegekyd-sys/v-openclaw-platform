import assert from 'node:assert/strict';

export const MARKER = 'v-feishu-card-images-v1';

// CardKit markdown image destinations are Feishu image keys, not HTTP URLs.
// Keep external images reachable as links. Do not fetch model-authored URLs.
export function cardImageLinks(text) {
  let out = '', i = 0;
  while (i < text.length) {
    if (text[i] === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
    // Preserve fenced/inline code, including incomplete streamed code spans.
    if (text[i] === '`' || (text[i] === '~' && /^(?:~){3,}/.test(text.slice(i)))) {
      const char = text[i]; let end = i;
      while (text[end] === char) end++;
      const delimiter = text.slice(i, end), close = text.indexOf(delimiter, end);
      const stop = close < 0 ? text.length : close + delimiter.length;
      out += text.slice(i, stop); i = stop; continue;
    }
    if (text.startsWith('![', i)) {
      let j = i + 2, depth = 1;
      for (; j < text.length && depth; j++) {
        if (text[j] === '\\') { j++; continue; }
        if (text[j] === '[') depth++;
        if (text[j] === ']') depth--;
      }
      if (!depth && /^\(\s*<?https?:\/\//i.test(text.slice(j))) {
        out += text.slice(i + 2, j - 1).trim() ? text.slice(i + 1, j) : '[图片]'; i = j; continue;
      }
    }
    out += text[i++];
  }
  return out;
}

export function patchFeishuCardImages(source) {
  assert(!source.includes(MARKER), 'already patched');
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 80)}`);
    source = source.replace(before, after);
  }
  replace('var FeishuStreamingSession = class {', `// ${MARKER}\n${cardImageLinks.toString()}\nvar FeishuStreamingSession = class {`);
  // Store exactly the text accepted by CardKit, so restart checkpoints and
  // finalization receipts agree with the provider-visible content.
  replace('\tasync update(text) {\n', '\tasync update(text) {\n\t\ttext = cardImageLinks(text);\n');
  replace('const vInitialText = VFEISHU_CARD_PRECREATE_ENABLED && typeof options?.initialText === "function" ? options.initialText() : "";', 'const vInitialText = cardImageLinks(VFEISHU_CARD_PRECREATE_ENABLED && typeof options?.initialText === "function" ? options.initialText() : "");');
  replace('const text = finalText ?? this.pendingText ?? this.state.currentText;', 'const text = cardImageLinks(finalText ?? this.pendingText ?? this.state.currentText);');
  // Recovered cards may already be closed remotely. A full element replacement
  // does not depend on streaming_mode; final bodies are complete snapshots.
  const before = `const sent = text.startsWith(this.state.sentText) ? await this.updateCardContent(text, (e) => {
\t\t\t\tfinalWriteError = e;
\t\t\t\tthis.log?.(\`Final update failed: \${String(e)}\`);
\t\t\t}) : await this.replaceCardContent(text, (e) => {`;
  replace(before, 'const sent = await this.replaceCardContent(text, (e) => {');
  return source;
}

// v-feishu-task-presentation.mjs retried a rejected record once a minute for ever
// (2026-11-01..04: one card, 4,686 attempts). Stop after RETRIES_PER_PROCESS failures in
// one process and log once; the record stays undelivered, so the next Gateway start tries
// again. Same change as openclaw-versa cedaa9bf713.
export const RETRY_MARKER = 'const RETRIES_PER_PROCESS = 20;';

export function patchTaskPresentationRetryCap(source) {
  assert(!source.includes(RETRY_MARKER), 'already patched');
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 80)}`);
    source = source.replace(before, after);
  }
  replace("const copy = value => JSON.parse(JSON.stringify(value));\n", `const copy = value => JSON.parse(JSON.stringify(value));\n${RETRY_MARKER}\n`);
  const skip = "      if(h.record.delivered||h.record.phase==='retired'||!h.record.error||h.retrying||this.now()<(h.record.retryAfter??0))continue;\n";
  replace(skip, skip + `      // A write Feishu rejects the same way every time would otherwise be retried every minute
      // forever (2026-11-01..04: one card, 4,686 attempts). Stop after RETRIES_PER_PROCESS failures
      // in this process; the record stays undelivered, so the next Gateway start (which usually
      // brings the fix) tries again.
      if((h.failures??0)>=RETRIES_PER_PROCESS){if(!h.gaveUp){h.gaveUp=true;this.logger.warn?.(\`Feishu task presentation: giving up on \${h.record.id} after \${h.failures} failures in this process: \${h.record.error}\`);}continue;}
`);
  const count = 'this.record.deliveryAttempts=(this.record.deliveryAttempts??0)+1;';
  replace(count, count + 'this.failures=(this.failures??0)+1;');
  return source;
}

const FEISHU_DIST = 'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist';

// What V runs today (lab/release-files/desktop-handback-progress/, captured 2026-10-30, = V on 2026-11-04).
export const FILES = [
  { name: 'monitor.account-WFdlCDhR.js', before: 'faa1062883b3052d9803455762a35ba8bc8abfc8bd3a20d3875084f4f87a8f1f', target: FEISHU_DIST, patch: patchFeishuCardImages },
  { name: 'v-feishu-task-presentation.mjs', before: '070801aa1b7ec41aa5b7cd02110f7d67e01e2becfe4a0c59efa3b023f5c55de4', target: FEISHU_DIST, patch: patchTaskPresentationRetryCap },
];
