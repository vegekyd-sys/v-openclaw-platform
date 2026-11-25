import assert from 'node:assert/strict';

// Binary attachments stay binary instead of being inlined as text (V 2026-11-25).
//
// classifyAttachmentBytes (attachment-classify-1K-kUuWK.js) sniffs bytes of an unrecognized MIME family as
// text. On 2026-11-25 10:36 a Feishu group member uploaded nine AlibabaPuHuiTi .otf fonts. file-type named
// them font/otf (class "binary"), so they reached the sniff, and the BOM-less UTF-16 heuristic accepted
// them: an OpenType table directory is ~30% zero bytes, over its 20% gate, spread over both byte parities.
// The whole font was decoded as UTF-16BE, its first "line" held U+0009, and it was inlined as
// <file mime="text/tab-separated-values"> - 200k chars (~370k DeepSeek tokens) of garbage per font in
// upstreamUserText, re-injected on every later group turn. The session reached 5.9-6.3M tokens against
// DeepSeek's 1M, compaction failed with invalid_request_error, and V gave 0 replies to 30+ messages over 4 hours.
//
// binary-attachment-text-v1 (source: vegekyd-sys/openclaw-versa versa/port-binary-attachment-text-20261125):
// - bytes with a signature the sniffer recognizes (font/otf, wasm, sqlite, ...) stay binary;
// - BOM-less UTF-16 needs its zeros in one byte parity and no U+0000 code unit in the sample;
// - the sniff reads 4 KB but the whole buffer is inlined, so a NUL (aligned NUL code unit for UTF-16)
//   anywhere keeps it binary.
// A binary attachment then renders as "Unsupported document format: font/otf" with the approved local
// path, and the agent reads the file with its tools.

export const MARKER = 'binary-attachment-text-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchClassify(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to attachment-classify-1K-kUuWK.js`);
  let out = replaceExactlyOnce(source,
    'const WORDISH_CHAR = /[\\p{L}\\p{N}]/u;\n',
    'const WORDISH_CHAR = /[\\p{L}\\p{N}]/u;\nconst ZERO_CODE_UNIT = Buffer.alloc(2);\n',
    'WORDISH_CHAR');
  out = replaceExactlyOnce(out,
    '	if ((zeroEven + zeroOdd) / sampleLength <= .2) return;\n	return zeroOdd >= zeroEven ? "utf-16le" : "utf-16be";\n}\n',
    `	if ((zeroEven + zeroOdd) / sampleLength <= .2) return;
	// ${MARKER}: BOM-less UTF-16 text keeps its zeros in one byte parity (the high byte of Latin code units);
	// binary tables (an OpenType directory) scatter them over both, and must not decode as UTF-16 text.
	if (Math.min(zeroEven, zeroOdd) * 4 > Math.max(zeroEven, zeroOdd)) return;
	const charset = zeroOdd >= zeroEven ? "utf-16le" : "utf-16be";
	return hasNulCodeUnit(buffer.subarray(0, sampleLength), charset) ? void 0 : charset;
}
/** ${MARKER}: true when the bytes hold U+0000, which text never contains but binary formats do. */
function hasNulCodeUnit(buffer, charset) {
	if (charset !== "utf-16le" && charset !== "utf-16be") return buffer.includes(0);
	for (let index = buffer.indexOf(ZERO_CODE_UNIT); index !== -1;) {
		if (index % 2 === 0) return true;
		index = buffer.indexOf(ZERO_CODE_UNIT, index + 1);
	}
	return false;
}
`,
    'resolveUtf16Charset tail');
  out = replaceExactlyOnce(out,
    '	const charset = resolveUtf16Charset(params.buffer) ?? sniffTextCharset(params.buffer);\n	if (!charset) return {\n',
    `	// ${MARKER}: a byte signature the sniffer recognizes (font/otf, wasm, ...) is not text; only unrecognized bytes are sniffed.
	const signatureMime = await detectMime({ buffer: params.buffer });
	if (signatureMime && attachmentClassFromMime(signatureMime) !== "text") return {
		mime,
		class: "binary"
	};
	const charset = resolveUtf16Charset(params.buffer) ?? sniffTextCharset(params.buffer);
	// ${MARKER}: the sniff reads 4 KB but the whole buffer is inlined; a NUL anywhere keeps it binary.
	if (!charset || hasNulCodeUnit(params.buffer, charset)) return {
`,
    'sniff charset');
  return out;
}

export const FILES = [
  { name: 'attachment-classify-1K-kUuWK.js', base: 'lab/release-files/binary-attachment-text/base', target: 'openclaw/dist', before: '60734dc70c4e3a0f1a9e32736f244c85d6544cbb234ecbef77ee9e7c56946439', patch: patchClassify },
];
