// Stops re-encoding history images that the model never receives.
//
// Every embedded turn runs sanitizeSessionHistory() over the whole active session
// before the first model call. Its image pass decodes each history image and, when the
// image is over the 1200 px default edge, resizes and re-encodes it (photon, WASM) on
// the Worker main thread. Since #322 (V, 2026-10-10 23:03) view_image stores images at
// up to 2048 px, so every stored view_image result is over that edge and costs about
// 0.45 s per image on every later turn. The result is thrown away: the history image
// prune transform replaces images older than the last three completed turns with
// "[image data removed - already processed by model]" before any model request.
// On V on 2026-10-12, warm-turn command-enter -> first stream-send went from P90 2.0 s
// (10/10) to 4.4 s, climbing to 7-12 s in long image sessions and dropping after
// compaction.
//
// The fix: for the embedded attempt history only, images before the prune boundary
// (with one extra completed turn of margin) keep their stored bytes. They still pass the
// same checks (missing data, invalid base64, over 10 MB input), only the resize is
// skipped, so the model input after the prune transform is unchanged. Compaction and
// every other caller of sanitizeSessionHistory() keep the old behaviour.
// OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0 turns it off.
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const RESIZE_SKIP_MARKER = 'v-history-image-resize-skip-v1';

const HELPERS_LIMITS_BEFORE = `	const imageSanitization = {
		maxDimensionPx: options?.maxDimensionPx,
		maxBytes: options?.maxBytes
	};`;

const HELPERS_LIMITS_AFTER = `${HELPERS_LIMITS_BEFORE}
	// ${RESIZE_SKIP_MARKER}: messages before this index are pruned to a marker before any
	// model request, so their images are validated but never resized.
	const keepImageBytesBefore = Number.isInteger(options?.keepImageBytesBeforeIndex) ? options.keepImageBytesBeforeIndex : -1;
	const keptImageSanitization = {
		maxDimensionPx: Number.MAX_SAFE_INTEGER,
		maxBytes: Number.MAX_SAFE_INTEGER
	};`;

const HELPERS_LOOP_BEFORE = `	const out = [];
	for (const msg of sanitizedIds) {
		if (!msg || typeof msg !== "object") {
			out.push(msg);
			continue;
		}
		const role = msg.role;
		if (role === "toolResult") {
			const toolMsg = msg;
			const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
			const nextContent = await sanitizeContentBlocksImages(content, label, imageSanitization);`;

const HELPERS_LOOP_AFTER = `	const out = [];
	const keepImageBytes = sanitizedIds === messages ? keepImageBytesBefore : -1;
	let messageIndex = -1;
	for (const msg of sanitizedIds) {
		messageIndex++;
		const historyImageSanitization = messageIndex < keepImageBytes ? keptImageSanitization : imageSanitization;
		if (!msg || typeof msg !== "object") {
			out.push(msg);
			continue;
		}
		const role = msg.role;
		if (role === "toolResult") {
			const toolMsg = msg;
			const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
			const nextContent = await sanitizeContentBlocksImages(content, label, historyImageSanitization);`;

const HELPERS_USER_BEFORE = `			if (Array.isArray(content)) {
				const nextContent = await sanitizeContentBlocksImages(content, label, imageSanitization);
				out.push({
					...userMsg,`;

const HELPERS_USER_AFTER = `			if (Array.isArray(content)) {
				const nextContent = await sanitizeContentBlocksImages(content, label, historyImageSanitization);
				out.push({
					...userMsg,`;

export function patchEmbeddedAgentHelpers(source) {
  if (source.includes(RESIZE_SKIP_MARKER)) throw new Error('already patched');
  let next = once(source, HELPERS_LIMITS_BEFORE, HELPERS_LIMITS_AFTER, 'image limits');
  next = once(next, HELPERS_LOOP_BEFORE, HELPERS_LOOP_AFTER, 'message loop');
  next = once(next, HELPERS_USER_BEFORE, HELPERS_USER_AFTER, 'user images');
  return next;
}

const PRUNE_CALL_BEFORE = `	const sanitizedImages = await sanitizeSessionMessagesImages(normalizedAssistantReplay, "session:history", {
		sanitizeMode: policy.sanitizeMode,`;

const PRUNE_CALL_AFTER = `	const sanitizedImages = await sanitizeSessionMessagesImages(normalizedAssistantReplay, "session:history", {
		// ${RESIZE_SKIP_MARKER}: only the embedded attempt asks; its prune transform drops these images
		keepImageBytesBeforeIndex: params.skipPrunedImageResize === true && process.env.OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP !== "0" ? resolveImageResizeSkipBeforeIndex(normalizedAssistantReplay) : -1,
		sanitizeMode: policy.sanitizeMode,`;

const ATTEMPT_CALL_BEFORE = `		const prior = await sanitizeSessionHistory({
			messages: activeSession.messages,`;

const ATTEMPT_CALL_AFTER = `		const prior = await sanitizeSessionHistory({
			skipPrunedImageResize: true,
			messages: activeSession.messages,`;

const BOUNDARY_BEFORE = `function resolveMessageMediaFacts(message) {`;

const BOUNDARY_AFTER = `// ${RESIZE_SKIP_MARKER}: resolvePruneBeforeIndex keeps the last
// PRESERVE_RECENT_COMPLETED_TURNS completed turns; one more turn of margin covers a
// recent turn that later history repair turns back into an incomplete one.
function resolveImageResizeSkipBeforeIndex(messages) {
	const completedTurnStarts = [];
	let currentTurnStart = -1;
	let currentTurnHasAssistantReply = false;
	for (let i = 0; i < messages.length; i++) {
		const role = messages[i]?.role;
		if (role === "user") {
			if (currentTurnStart >= 0 && currentTurnHasAssistantReply) completedTurnStarts.push(currentTurnStart);
			currentTurnStart = i;
			currentTurnHasAssistantReply = false;
			continue;
		}
		if (role === "toolResult") {
			if (currentTurnStart < 0) currentTurnStart = i;
			continue;
		}
		if (role === "assistant" && currentTurnStart >= 0) currentTurnHasAssistantReply = true;
	}
	if (currentTurnStart >= 0 && currentTurnHasAssistantReply) completedTurnStarts.push(currentTurnStart);
	if (completedTurnStarts.length <= PRESERVE_RECENT_COMPLETED_TURNS + 1) return -1;
	return completedTurnStarts.at(-(PRESERVE_RECENT_COMPLETED_TURNS + 1)) ?? -1;
}
${BOUNDARY_BEFORE}`;

export function patchHistoryImagePrune(source) {
  if (source.includes(RESIZE_SKIP_MARKER)) throw new Error('already patched');
  let next = once(source, PRUNE_CALL_BEFORE, PRUNE_CALL_AFTER, 'history image call');
  next = once(next, ATTEMPT_CALL_BEFORE, ATTEMPT_CALL_AFTER, 'attempt history call');
  next = once(next, BOUNDARY_BEFORE, BOUNDARY_AFTER, 'skip boundary');
  return next;
}
