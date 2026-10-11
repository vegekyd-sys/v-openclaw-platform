import { n as prewarmReplyRunRuntimes, prewarmReplyFirstMessage, t as getReplyFromConfig } from "./get-reply-CqW1y05D.js";
//#region src/auto-reply/reply/get-reply-from-config.runtime.ts
/** Runtime facade for config-driven reply resolution. */
async function prewarmConfigDrivenReplyRuntime() {
	await prewarmReplyRunRuntimes();
}
/** First-message preparation for the post-ready idle prewarm (gateway-first-message). */
async function prewarmConfigDrivenReplyFirstMessage(params) {
	return await prewarmReplyFirstMessage(params);
}
//#endregion
export { getReplyFromConfig, prewarmConfigDrivenReplyFirstMessage, prewarmConfigDrivenReplyRuntime };
