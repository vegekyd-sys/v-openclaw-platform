'use strict';

function jsonSlices(text) {
  const source = String(text || '');
  const slices = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{' && source[start] !== '[') continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack.pop() !== expected) break;
        if (stack.length === 0) {
          slices.push(source.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return slices;
}

function parseJsonLoose(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return {};
  const candidates = [text, ...jsonSlices(text).reverse()];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  throw new SyntaxError('No valid JSON object found in command output');
}

module.exports = {parseJsonLoose};
