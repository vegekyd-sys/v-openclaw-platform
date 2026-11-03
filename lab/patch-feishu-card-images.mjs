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
