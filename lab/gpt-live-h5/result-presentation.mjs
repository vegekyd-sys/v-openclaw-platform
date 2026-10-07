// One host-owned policy for backend documents; provider captions remain captions.
export const LONG_RESULT_NOTICE = '结果回来了，详细内容和方案已经放在屏幕上。你可以先看，也可以让我整理成一份文档发给你。';
export function presentBackendResult(result) {
  if (result?.cancelled || result?.error) return null;
  const text = typeof result === 'string' ? result : result?.result ?? result?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  const long = [...text].length > 300 || text.split('\n').filter(line => line.trim()).length >= 8 ||
    /^\s*```/mu.test(text) || /^\s*\|?.*\|.*\n\s*\|?\s*:?-{3,}/mu.test(text);
  return { text, long, spokenText: long ? LONG_RESULT_NOTICE : text };
}
