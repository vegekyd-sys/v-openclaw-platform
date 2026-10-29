const PRESENTATION = Symbol.for("openclaw.v.boundTaskPresentation.v1");

// Called only after the handoff service has verified this Gateway's origin and
// atomically claimed the page handback. This observes the existing execution;
// the unified manager owns routing, streaming, delivery ACKs and retries.
export async function runHandbackWithPresentation(handoff, run, { manager = globalThis[PRESENTATION], logger } = {}) {
  const runId = `v-desktop-handoff-wake-${handoff.id}-${handoff.pageHandBackAt}`;
  const sessionKey = handoff.sessionKey;
  const agentId = /^agent:([^:]+):/u.exec(sessionKey ?? "")?.[1];
  let handle;
  try {
    if (manager && agentId) {
      handle = await manager.open({
        source: "desktop-handback", agentId, sessionKey, runId, taskId: runId,
        text: "电脑已交还，正在准备继续处理原任务。",
      }, { trusted: true });
    }
  } catch (error) {
    logger?.warn?.(`desktop handoff ${handoff.id}: progress unavailable: ${error.message}`);
  }
  try {
    // Gateway agent RPC uses its idempotency key as the admitted run identity.
    // Bind before dispatch so even the first progress event is observed.
    return await run({
      sessionKey,
      message: `用户在接管页点了「交还给 V」：电脑已经交还给你（${handoff.id}）。直接继续刚才的任务，不用再问。`,
      deliver: true,
      idempotencyKey: runId,
    });
  } catch (error) {
    // Rejected admission has no model result to pass through native delivery.
    // A caller's acceptance timeout stays outside this promise: it must not
    // mark a run failed when the Gateway may still be admitting it.
    try { await handle?.finish(null, error); } catch {}
    throw error;
  }
}
