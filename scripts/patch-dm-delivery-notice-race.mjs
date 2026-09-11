const BEFORE =
  'const owedNotice = settled === "unknown" && (current === "queued" || current === "unknown") && pending.context';
const AFTER =
  'const owedNotice = settled === "unknown" && current === "unknown" && pending.context';

export function patchPendingDeliveryNoticeRace(source) {
  if (source.includes(AFTER)) {
    return { changed: false, source };
  }
  const occurrences = source.split(BEFORE).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one pending-delivery notice predicate, found ${occurrences}`);
  }
  return { changed: true, source: source.replace(BEFORE, AFTER) };
}

const NOTICE_DELIVERY_ANCHOR =
  "\tconst idempotencyKey = noticeId(notice.intentId);\n\tlet delivered;";
const FEISHU_DM_INTERNAL_ONLY = `\t// Feishu direct-message users must not receive an implementation-level
\t// delivery-uncertainty sentence. Preserve the ambiguity in session state
\t// for diagnostics, but settle the one-shot debt without external delivery.
\tif (context.channel === "feishu" && context.to.startsWith("user:")) {
\t\tawait updateSessionEntry({
\t\t\tsessionKey,
\t\t\tstorePath
\t\t}, (current) => current.sessionId === entry.sessionId && current.pendingDeliveryNotice?.intentId === notice.intentId && current.pendingDeliveryNotice.state !== "acknowledged" ? {
\t\t\tpendingDeliveryNotice: {
\t\t\t\t...current.pendingDeliveryNotice,
\t\t\t\tstate: "unresolved"
\t\t\t},
\t\t\tupdatedAt: Date.now()
\t\t} : null, {
\t\t\tskipMaintenance: true,
\t\t\ttakeCacheOwnership: true
\t\t});
\t\treturn;
\t}
${NOTICE_DELIVERY_ANCHOR}`;
const FEISHU_INTERNAL_ONLY = `\t// Feishu users in direct messages and groups must not receive an
\t// implementation-level delivery-uncertainty sentence. Preserve the
\t// ambiguity in session state for diagnostics, but settle the one-shot debt
\t// without external delivery.
\tif (context.channel === "feishu") {
\t\tawait updateSessionEntry({
\t\t\tsessionKey,
\t\t\tstorePath
\t\t}, (current) => current.sessionId === entry.sessionId && current.pendingDeliveryNotice?.intentId === notice.intentId && current.pendingDeliveryNotice.state !== "acknowledged" ? {
\t\t\tpendingDeliveryNotice: {
\t\t\t\t...current.pendingDeliveryNotice,
\t\t\t\tstate: "unresolved"
\t\t\t},
\t\t\tupdatedAt: Date.now()
\t\t} : null, {
\t\t\tskipMaintenance: true,
\t\t\ttakeCacheOwnership: true
\t\t});
\t\treturn;
\t}
${NOTICE_DELIVERY_ANCHOR}`;

export function patchFeishuPendingDeliveryNoticePresentation(source) {
  if (source.includes(FEISHU_INTERNAL_ONLY)) {
    return { changed: false, source };
  }
  const oldOccurrences = source.split(FEISHU_DM_INTERNAL_ONLY).length - 1;
  if (oldOccurrences === 1) {
    return {
      changed: true,
      source: source.replace(FEISHU_DM_INTERNAL_ONLY, FEISHU_INTERNAL_ONLY),
    };
  }
  if (oldOccurrences !== 0) {
    throw new Error(`expected at most one Feishu-DM pending-delivery patch, found ${oldOccurrences}`);
  }
  const occurrences = source.split(NOTICE_DELIVERY_ANCHOR).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one pending-delivery notice sender, found ${occurrences}`);
  }
  return {
    changed: true,
    source: source.replace(NOTICE_DELIVERY_ANCHOR, FEISHU_INTERNAL_ONLY),
  };
}
