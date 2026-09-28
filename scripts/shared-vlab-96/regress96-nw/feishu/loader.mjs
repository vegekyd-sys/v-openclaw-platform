// Off-thread module load hook: appends harness-only exports to the installed
// Feishu reply chunk and the core progress-card chunk, in memory only. Chunks
// are recognised by their rolldown region markers, never by hashed file names.
const EXPORTS = {
  "//#region extensions/feishu/src/reply-dispatcher.ts": [
    "createFeishuReplyDispatcher",
    "resolveFeishuSenderName",
    "createSequentialQueue",
    "DEFAULT_TASK_TIMEOUT_MS",
    "createFeishuMessageReceiveHandler",
    "streamingStartBackoffUntilByAccount",
    "parseSecretEntrySubmission",
  ],
  "//#region src/session-cards/progress-card-changed.ts": ["notifyProgressCardChanged"],
};

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (
    result.format !== "module" ||
    !url.startsWith("file:") ||
    !url.includes("/dist/") ||
    !url.endsWith(".mjs") ||
    result.source == null
  ) {
    return result;
  }
  const source =
    typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
  for (const [marker, names] of Object.entries(EXPORTS)) {
    if (source.includes(marker)) {
      const exportLine = `export { ${names.map((name) => `${name} as __h_${name}`).join(", ")} };`;
      return { ...result, source: `${source}\n${exportLine}\n` };
    }
  }
  return result;
}
