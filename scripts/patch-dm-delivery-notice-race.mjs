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
const FEISHU_DM_INTERNAL_ONLY = `\t// Feishu direct-message users must not receive an implementation-level\n\t// delivery-uncertainty sentence. Preserve the ambiguity in session state\n\t// for diagnostics, but settle the one-shot debt without external delivery.\n\tif (context.channel === \"feishu\" && context.to.startsWith(\"user:\")) {\n\t\tawait updateSessionEntry({\n\t\t\tsessionKey,\n\t\t\tstorePath\n\t\t}, (current) => current.sessionId === entry.sessionId && current.pendingDeliveryNotice?.intentId === notice.intentId && current.pendingDeliveryNotice.state !== \"acknowledged\" ? {\n\t\t\tpendingDeliveryNotice: {\n\t\t\t\t...current.pendingDeliveryNotice,\n\t\t\t\tstate: \"unresolved\"\n\t\t\t},\n\t\t\tupdatedAt: Date.now()\n\t\t} : null, {\n\t\t\tskipMaintenance: true,\n\t\t\ttakeCacheOwnership: true\n\t\t});\n\t\treturn;\n\t}\n${NOTICE_DELIVERY_ANCHOR}`;

export function patchFeishuDmPendingDeliveryNoticePresentation(source) {
  if (source.includes(FEISHU_DM_INTERNAL_ONLY)) {
    return { changed: false, source };
  }
  const occurrences = source.split(NOTICE_DELIVERY_ANCHOR).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one pending-delivery notice sender, found ${occurrences}`);
  }
  return {
    changed: true,
    source: source.replace(NOTICE_DELIVERY_ANCHOR, FEISHU_DM_INTERNAL_ONLY),
  };
}
