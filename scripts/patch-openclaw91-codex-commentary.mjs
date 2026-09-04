import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const marker = 'vlab91-codex-commentary-v2';

// Display explicit user-facing preambles only; never tool arguments, command
// output, reasoning, or arbitrary Agent events. Final text remains owned by
// the existing native Feishu reply/finalization pipeline.
export function createCommentaryState() {
  const items = new Map();
  let closed = false;
  return {
    close() { closed = true; items.clear(); },
    push(runtime, payload) {
      if (closed || runtime !== 'codex' || payload?.kind !== 'preamble' || typeof payload.progressText !== 'string') return null;
      const text = payload.progressText.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(-8000);
      if (!text) return null;
      const key = typeof payload.itemId === 'string' && payload.itemId ? payload.itemId : 'unkeyed';
      if (items.get(key) === text) return null;
      items.set(key, text);
      while (items.size > 12) items.delete(items.keys().next().value);
      return [...items.values()].join('\n\n').slice(-16000);
    },
  };
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected unique commentary anchor: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}
export function patchCommentary(source) {
  if (source.includes(marker)) return source;
  if (source.includes('vlab91-codex-commentary-v1')) return addQuietLaneGate(source.replace('vlab91-codex-commentary-v1', marker));
  let result = once(source, 'function createFeishuReplyDispatcher(params) {',
    `// ${marker}\n${createCommentaryState.toString()}\nfunction createFeishuReplyDispatcher(params) {`);
  result = once(result, '\tlet lastPartial = "";', '\tlet lastPartial = "";\n\tconst vlab91Commentary = createCommentaryState();');
  result = once(result, '\t\treplyOptions: {\n\t\t\tonModelSelected,', `\t\treplyOptions: {
\t\t\tonModelSelected,
\t\t\tcommentaryProgressEnabled: previewStreamingEnabled,
\t\t\tonItemEvent: previewStreamingEnabled ? (payload) => {
\t\t\t\tconst text = vlab91Commentary.push(responsePrefixContextProvider().agentRuntime, payload);
\t\t\t\tif (!text) return false;
\t\t\t\tstartStreaming();
\t\t\t\tflushStreamingCardUpdate(text);
\t\t\t\treturn false;
\t\t\t} : void 0,`);
  result = once(result, '\t\t\tonPartialReply: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (!payload.text) return false;',
    '\t\t\tonPartialReply: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (!payload.text) return false;\n\t\t\t\tvlab91Commentary.close();');
  result = once(result, '\tconst performStreamingClose = async (disposition) => {', '\tconst performStreamingClose = async (disposition) => {\n\t\tvlab91Commentary.close();');
  return addQuietLaneGate(result);
}
function addQuietLaneGate(source) {
  // This is V's existing dedicated Codex Agent. Do not enable hidden tool
  // progress callbacks for every other Agent. The event handler additionally
  // checks the actual selected runtime before displaying any preamble.
  let result = once(source, '\tconst vlab91Commentary = createCommentaryState();',
    '\tconst vlab91Commentary = createCommentaryState();\n\tconst vlab91OwnsCodexProgress = previewStreamingEnabled && agentId === "v-codex";');
  result = once(result, '\t\t\tcommentaryProgressEnabled: previewStreamingEnabled,',
    '\t\t\tcommentaryProgressEnabled: vlab91OwnsCodexProgress,\n\t\t\tsuppressDefaultToolProgressMessages: vlab91OwnsCodexProgress,');
  return result;
}
async function main() {
  const [core, feishu, mode] = process.argv.slice(2);
  if (!core || !feishu || !['--check', '--apply'].includes(mode)) throw new Error('Usage: core-package feishu-package --check|--apply');
  if (JSON.parse(await fs.readFile(path.join(core, 'package.json'))).version !== '2026.9.1') throw new Error('Unaudited core version');
  const dir = path.join(feishu, 'dist');
  const files = (await fs.readdir(dir)).filter(name => /^monitor\.account-[\w-]+\.js$/.test(name));
  if (files.length !== 1) throw new Error('Ambiguous Feishu bundle');
  const file = path.join(dir, files[0]), before = await fs.readFile(file, 'utf8');
  if (!before.includes('vlab91-runtime-footer-v1')) throw new Error('Requires verified actual-runtime footer metadata');
  const after = patchCommentary(before);
  if (mode === '--apply' && after !== before) {
    await fs.copyFile(file, `${file}.${marker}.bak`, fs.constants.COPYFILE_EXCL);
    const stat = await fs.stat(file), tmp = `${file}.commentary-${process.pid}.tmp`;
    await fs.writeFile(tmp, after, {mode:stat.mode, flag:'wx'});
    await fs.chown(tmp, stat.uid, stat.gid);
    await fs.rename(tmp, file);
  }
  console.log(`${mode} ${after === before ? 'unchanged' : 'patched'} ${file}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {console.error(error.message);process.exitCode=1;});
